// Soket olay yönlendirmesi: tüm oyun mantığı Game* sınıflarında, burada sadece
// olayları bağlar ve yayınlar. İstemci ile sunucu aynı shared/objectDefs.json'u
// kullanır; sunucu yalnızca değişiklikleri (removed + drops) tutar.
const GameData = require('./GameData');

function attachSocketHandlers(io, world, store, clock, players) {
  io.on('connection', (socket) => {
    players.create(socket.id);
    socket.emit('currentPlayers', players.all());
    socket.emit('worldState', world.snapshot());
    socket.emit('timeState', clock.state());
    socket.broadcast.emit('playerJoined', players.get(socket.id));

    socket.on('hello', (data) => {
      const player = players.setName(socket.id, data) || players.get(socket.id);
      players.setChar(socket.id, data && data.char);
      store.stats.assign(socket.id, data && data.trackerId);
      socket.broadcast.emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
      socket.emit('inventoryState', store.snapshot(data && data.trackerId));
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

    // Kesme tamamlandı: nesne dünyadan düşer, herkese yayınlanır.
    socket.on('harvest', (data) => {
      if (!data || typeof data.id !== 'string') return;
      store.chop(socket.id, data.kind, data.id);
      socket.broadcast.emit('objectRemoved', { kind: data.kind, id: data.id });
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

    socket.on('disconnect', () => {
      players.remove(socket.id);
      store.disconnect(socket.id);
      io.emit('playerLeft', socket.id);
    });
  });
}

module.exports = { attachSocketHandlers };