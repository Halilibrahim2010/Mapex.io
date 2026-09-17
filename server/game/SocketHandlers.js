// Soket olay yönlendirmesi: tüm oyun mantığı Game* sınıflarında, burada sadece
// olayları bağlar ve yayınlar. İstemci ile sunucu aynı shared/objectDefs.json'u
// kullanır; sunucu yalnızca değişiklikleri (removed + drops) tutar.
const GameData = require('./GameData');
const { ChatStore } = require('./ChatStore');

// Oyuncu kimliği: envanter ve istatistikler bu anahtarla saklanır. Şimdilik
// geçici olarak IP adresi kullanılır (aynı isimde iki oyuncu birbirinin
// eşyalarına erişemesin). İleride kalıcı hesap sistemiyle değiştirilecek.
function trackerIdOf(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return 'ip:' + forwarded.split(',')[0].trim();
  }
  const address = socket.handshake.address || socket.conn.remoteAddress || '';
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) biçimini sadeleştir.
  return 'ip:' + String(address).replace(/^::ffff:/, '');
}

function attachSocketHandlers(io, world, store, clock, players) {
  // Sohbet tek bir depoda tutulur: sunucu geçmişin ve doğrulamanın sahibidir.
  const chat = new ChatStore();

  io.on('connection', (socket) => {
    players.create(socket.id);
    socket.emit('currentPlayers', players.all());
    socket.emit('worldState', world.snapshot());
    socket.emit('timeState', clock.state());
    socket.broadcast.emit('playerJoined', players.get(socket.id));

    socket.on('hello', (data) => {
      const player = players.setName(socket.id, data) || players.get(socket.id);
      players.setChar(socket.id, data && data.char);
      const trackerId = trackerIdOf(socket);
      store.stats.assign(socket.id, trackerId);
      socket.broadcast.emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
      socket.emit('inventoryState', store.snapshot(trackerId));
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
      const trackerId = store.stats.idOf(socket.id);
      socket.emit('inventoryState', store.snapshot(trackerId));
    });

    // Kesme tamamlandı: nesne dünyadan düşer, tanımındaki drop eşyası yere
    // serilir ve herkese yayınlanır.
    socket.on('harvest', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const result = store.chop(socket.id, data.kind, data.id, data.x, data.y);
      if (!result) return;
      socket.broadcast.emit('objectRemoved', { kind: data.kind, id: data.id });
      if (result.drops.length) io.emit('dropsSpawned', { drops: result.drops });
      const trackerId = store.stats.idOf(socket.id);
      if (trackerId) socket.emit('inventoryState', store.snapshot(trackerId));
    });

    // Toplama: sunucu envanteri tek sahiptir; istemci yalnızca bildirir.
    socket.on('pick', (data) => {
      if (!data || !GameData.isKnownItem(data.itemId)) return;
      const state = store.pick(socket.id, data.itemId);
      if (state) socket.emit('inventoryState', state);
    });

    socket.on('pickup', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const trackerId = store.stats.idOf(socket.id);
      if (!trackerId) return;
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
      io.emit('playerLeft', socket.id);
    });
  });
}

module.exports = { attachSocketHandlers };