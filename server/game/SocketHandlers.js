// Soket olay yönlendirmesi: tüm oyun mantığı Game* sınıflarında, burada sadece
// olayları bağlar ve yayınlar. İstemci ile sunucu aynı shared/objectDefs.json'u
// kullanır; sunucu yalnızca değişiklikleri (removed + drops) tutar.
//
// HESAP SİSTEMİ İLE İLİŞKİ (önemli):
//   Bu dosya "kullanıcı giriş yaptı mı?" sorusunu SORMAZ. Yalnızca oturum
//   nesnesini (UserSession arayüzü) tutar ve ondan iki şey okur:
//     session.storageKey → envanter/istatistik anahtarı
//     session.can(...)   → yetenek sorgusu
//   Giriş yapmış oyuncu ile misafir arasındaki tüm fark Auth adaptörlerinde
//   (AccountSession / GuestSession) yaşar. Yeni bir oturum türü eklendiğinde
//   bu dosya değişmez.
const GameData = require('./GameData');
const { ChatStore } = require('./ChatStore');
const { SessionFactory } = require('../auth/SessionFactory');

function attachSocketHandlers(io, world, store, clock, players, authLayer) {
  // Sohbet tek bir depoda tutulur: sunucu geçmişin ve doğrulamanın sahibidir.
  const chat = new ChatStore();
  // Auth katmanı verilmediyse (eski testler) misafir oturumlarıyla devam et.
  const sessions = (authLayer && authLayer.sessions)
    || new SessionFactory({ auth: null, repository: null }).useDefaults();
  // socket.id -> UserSession
  const sessionOf = new Map();

  // Envanter anahtarı artık IP değil, oturumun storageKey'i: aynı ağdaki iki
  // misafir birbirinin eşyalarını görmez, giriş yapan oyuncu ise nereden
  // bağlanırsa bağlansın kendi envanterini bulur.
  function storageKeyOf(socket) {
    const session = sessionOf.get(socket.id);
    return session ? session.storageKey : null;
  }

  // --- Kalıcılık köprüsü ---------------------------------------------------
  // Oyun döngüsü bellekteki InventoryStore ile çalışır (hızlı, sunucu yetkili).
  // Kayıtlı oyuncu için aynı eşya veritabanına da yazılır. Yazma işlemleri
  // "ateşle ve unut" (fire-and-forget) DEĞİL, sıralı tutulur: böylece önceki
  // yazma bitmeden yenisi başlamaz ve sayaç kayması olmaz.
  const pendingWrites = new Map(); // socket.id -> Promise zinciri

  function queueWrite(socket, task) {
    const previous = pendingWrites.get(socket.id) || Promise.resolve();
    const next = previous
      .then(task)
      .catch((error) => console.warn('[auth] envanter yazılamadı:', error.message));
    pendingWrites.set(socket.id, next);
    return next;
  }

  // Düşen eşyalar veritabanı envanterine eklenir (kayıtlı oyuncuysa).
  async function persistDrops(socket, drops) {
    const session = sessionOf.get(socket.id);
    if (!session || !session.grantItem || session.isGuest) return;
    const counts = new Map();
    for (const drop of drops || []) {
      counts.set(drop.itemId, (counts.get(drop.itemId) || 0) + 1);
    }
    for (const [itemId, count] of counts) {
      await queueWrite(socket, () => session.grantItem(itemId, GameData.typeOfItem(itemId), count));
    }
  }

  async function persistPickup(socket, itemId) {
    const session = sessionOf.get(socket.id);
    if (!session || !session.grantItem || session.isGuest) return;
    await queueWrite(socket, () => session.grantItem(itemId, GameData.typeOfItem(itemId), 1));
  }

  io.on('connection', (socket) => {
    players.create(socket.id);
    socket.emit('currentPlayers', players.all());
    socket.emit('worldState', world.snapshot());
    socket.emit('timeState', clock.state());
    socket.broadcast.emit('playerJoined', players.get(socket.id));

    socket.on('hello', (data) => {
      const player = players.setName(socket.id, data) || players.get(socket.id);
      players.setChar(socket.id, data && data.char);

      // Oturum bir bağlantıda BİR KEZ çözülür. Aynı soket tekrar hello
      // gönderirse (istemci yeniden adlandırma, yeniden bağlanma denemesi)
      // mevcut oturum korunur; aksi halde misafir oyuncu envanterini ve
      // ilerlemesini her hello'da kaybederdi.
      if (sessionOf.has(socket.id)) {
        socket.broadcast.emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
        const existing = sessionOf.get(socket.id);
        socket.emit('inventoryState', store.snapshot(storageKeyOf(socket)));
        socket.emit('sessionState', {
          ...existing.describe(),
          isAuthenticated: existing.isAuthenticated,
          capabilities: existing.capabilities,
          economy: existing.snapshot()
        });
        return Promise.resolve();
      }

      // Oturum burada çözülür: jeton varsa kayıtlı hesap, yoksa misafir.
      // İstemci oyuna girerken jetonu bu olayla birlikte gönderir.
      const resolved = sessions.forConnection({
        token: data && data.sessionToken,
        displayName: player.name,
        onError: (provider, error) => console.warn(`[auth] ${provider} oturumu çözülemedi:`, error.message)
      });
      return resolved.then((session) => {
        sessionOf.set(socket.id, session);
        store.stats.assign(socket.id, storageKeyOf(socket));
        socket.broadcast.emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
        socket.emit('inventoryState', store.snapshot(storageKeyOf(socket)));
        // İstemci HUD'u bu olaydan gold/gems/level okur (oyun kodu tip ayrımı yapmaz).
        socket.emit('sessionState', {
          ...session.describe(),
          isAuthenticated: session.isAuthenticated,
          capabilities: session.capabilities,
          economy: session.snapshot()
        });
      });
    });

    socket.on('setName', (data) => {
      const player = players.setName(socket.id, data);
      if (!player) return;
      players.setChar(socket.id, data && data.char);
      socket.broadcast.emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
    });

    socket.on('playerMove', (data) => {
      const player = players.move(socket.id, data);
      if (player) socket.broadcast.emit('playerMoved', player);
    });

    // İstemci yerel olarak kaldırılan nesneyi bildirir (kesme tamamlanmadan
    // veya yerel mod uyumu için). Sunucu dünya durumunu günceller.
    socket.on('objectRemoved', (data) => {
      if (!data || !store.stats.idOf(socket.id)) return;
      if (!world.remove(data.kind, data.id)) return;
      socket.broadcast.emit('objectRemoved', { kind: data.kind, id: data.id });
      socket.emit('inventoryState', store.snapshot(storageKeyOf(socket)));
    });

    // Kesme tamamlandı: nesne dünyadan düşer, tanımındaki drop eşyası yere
    // serilir ve herkese yayınlanır.
    socket.on('harvest', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const result = store.chop(socket.id, data.kind, data.id, data.x, data.y);
      if (!result) return;
      socket.broadcast.emit('objectRemoved', { kind: data.kind, id: data.id });
      if (result.drops.length) io.emit('dropsSpawned', { drops: result.drops });
      const storageKey = storageKeyOf(socket);
      if (storageKey) {
        socket.emit('inventoryState', store.snapshot(storageKey));
        // Kayıtlı oyuncu: düşen eşyalar veritabanı envanterine de yazılır.
        void persistDrops(socket, result.drops);
      }
    });

    // Toplama: sunucu envanteri tek sahiptir; istemci yalnızca bildirir.
    socket.on('pick', (data) => {
      if (!data || !GameData.isKnownItem(data.itemId)) return;
      const state = store.pick(socket.id, data.itemId);
      if (state) {
        socket.emit('inventoryState', state);
        void persistPickup(socket, data.itemId);
      }
    });

    socket.on('pickup', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const storageKey = storageKeyOf(socket);
      if (!storageKey) return;
      const state = store.takeDrop(socket.id, data.id);
      if (state) socket.emit('inventoryState', state);
      io.emit('dropRemoved', { id: data.id });
    });

    // Yerdeki eşyalar herkes görsün.
    socket.on('drop', (data) => {
      if (!data) return;
      const result = store.breakdown(socket.id, data.itemId, data.n, data.x, data.y);
      if (!result) return;
      socket.emit('inventoryState', result.snapshot);
      io.emit('dropsSpawned', { drops: result.drops });
    });

    socket.on('timeSkip', (data) => clock.skip(data && data.ms));

    // Sohbet: mesaj doğrulanır (boş/uzun/spam reddedilir), sonra yayılır.
    // Genel mesaj herkese, özel mesaj yalnızca hedef oyuncuya gider.
    socket.on('chatSend', (data) => {
      const player = players.get(socket.id);
      const message = chat.sanitize(data, player);
      if (!message) return;
      if (message.kind !== 'private') {
        io.emit('chatMessage', message);
        return;
      }
      for (const [id, target] of Object.entries(players.all())) {
        if (target.name !== message.to) continue;
        io.to(id).emit('chatMessage', message);
      }
    });

    // Yeniden bağlanan istemci son mesajları ister: sohbet boş görünmesin.
    socket.on('chatRequest', () => {
      const player = players.get(socket.id);
      if (!player) return;
      socket.emit('chatHistory', chat.historyFor(player));
    });

    socket.on('disconnect', () => {
      players.remove(socket.id);
      store.disconnect(socket.id);
      sessionOf.delete(socket.id);
      io.emit('playerLeft', socket.id);
    });
  });
}

module.exports = { attachSocketHandlers };