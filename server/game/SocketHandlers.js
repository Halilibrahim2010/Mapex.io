const GameData = require('./GameData');
const { ChatStore } = require('./ChatStore');
const { SessionFactory } = require('../auth/SessionFactory');

function attachSocketHandlers(io, fallbackWorld, fallbackStore, fallbackClock, fallbackPlayers, authLayer, roomManager) {
  const chat = new ChatStore();
  const sessions = (authLayer && authLayer.sessions)
    || new SessionFactory({ auth: null, repository: null }).useDefaults();
  const sessionOf = new Map();
  const pendingWrites = new Map();

  function storageKeyOf(socket) {
    const session = sessionOf.get(socket.id);
    return session ? session.storageKey : null;
  }

  function queueWrite(socket, task) {
    const previous = pendingWrites.get(socket.id) || Promise.resolve();
    const next = previous
      .then(task)
      .catch((error) => console.warn('[auth] envanter yazılamadı:', error.message));
    pendingWrites.set(socket.id, next);
    return next;
  }

  async function persistDrops(socket,
                          drops) {
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

  function roomOf(socket) {
    if (roomManager) {
      return roomManager.getRoomOfSocket(socket.id);
    }
    return {
      id: 'global',
      world: fallbackWorld,
      store: fallbackStore,
      clock: fallbackClock,
      players: fallbackPlayers
    };
  }

  io.on('connection', (socket) => {
    let room = roomOf(socket);
    room.players.create(socket.id);
    socket.join(room.id);

    socket.emit('currentPlayers', room.players.all());
    socket.emit('worldState', room.world.snapshot());
    socket.emit('timeState', room.clock.state());
    socket.broadcast.to(room.id).emit('playerJoined', room.players.get(socket.id));

    socket.on('hello', (data) => {
      // Oda değiştirme istegi
      if (roomManager && data && data.roomId) {
        const oldRoom = room;
        socket.leave(oldRoom.id);
        oldRoom.players.remove(socket.id);
        socket.broadcast.to(oldRoom.id).emit('playerLeft', socket.id);

        room = roomManager.assignSocket(socket.id, data.roomId);
        socket.join(room.id);
        room.players.create(socket.id);
        socket.emit('currentPlayers', room.players.all());
        socket.emit('worldState', room.world.snapshot());
        socket.emit('timeState', room.clock.state());
      }

      const player = room.players.setName(socket.id, data) || room.players.get(socket.id);
      room.players.setChar(socket.id, data && data.char);

      if (sessionOf.has(socket.id)) {
        socket.broadcast.to(room.id).emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
        const existing = sessionOf.get(socket.id);
        socket.emit('inventoryState', room.store.snapshot(storageKeyOf(socket)));
        socket.emit('sessionState', {
          ...existing.describe(),
          isAuthenticated: existing.isAuthenticated,
          capabilities: existing.capabilities,
          economy: existing.snapshot()
        });
        return Promise.resolve();
      }

      const resolved = sessions.forConnection({
        token: data && data.sessionToken,
        displayName: player.name,
        onError: (provider, error) => console.warn(`[auth] ${provider} oturumu çözülemedi:`, error.message)
      });
      return resolved.then((session) => {
        sessionOf.set(socket.id, session);
        room.store.stats.assign(socket.id, storageKeyOf(socket));
        socket.broadcast.to(room.id).emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
        socket.emit('inventoryState', room.store.snapshot(storageKeyOf(socket)));
        socket.emit('sessionState', {
          ...session.describe(),
          isAuthenticated: session.isAuthenticated,
          capabilities: session.capabilities,
          economy: session.snapshot()
        });
      });
    });

    socket.on('setName', (data) => {
      const player = room.players.setName(socket.id, data);
      if (!player) return;
      room.players.setChar(socket.id, data && data.char);
      socket.broadcast.to(room.id).emit('playerNameSet', { id: socket.id, name: player.name, char: player.char });
    });

    socket.on('playerMove', (data) => {
      const player = room.players.move(socket.id, data);
      if (player) socket.broadcast.to(room.id).emit('playerMoved', player);
    });

    socket.on('objectRemoved', (data) => {
      if (!data || !room.store.stats.idOf(socket.id)) return;
      if (!room.world.remove(data.kind, data.id)) return;
      socket.broadcast.to(room.id).emit('objectRemoved', { kind: data.kind, id: data.id });
      socket.emit('inventoryState', room.store.snapshot(storageKeyOf(socket)));
    });

    socket.on('harvest', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const result = room.store.chop(socket.id, data.kind, data.id, data.x, data.y);
      if (!result) return;
      socket.broadcast.to(room.id).emit('objectRemoved', { kind: data.kind, id: data.id });
      if (result.drops.length) io.to(room.id).emit('dropsSpawned', { drops: result.drops });
      persistDrops(socket, result.drops);
      const trackerId = room.store.stats.idOf(socket.id);
      if (trackerId) socket.emit('inventoryState', room.store.snapshot(trackerId));
    });

    socket.on('pick', (data) => {
      if (!data || !GameData.isKnownItem(data.itemId)) return;
      const state = room.store.pick(socket.id, data.itemId);
      if (state) {
        persistPickup(socket, data.itemId);
        socket.emit('inventoryState', state);
      }
    });

    socket.on('pickup', (data) => {
      if (!data || typeof data.id !== 'string') return;
      const trackerId = room.store.stats.idOf(socket.id);
      if (!trackerId) return;
      const dropItem = room.world.drops.find((d) => d.id === data.id);
      const state = room.store.takeDrop(socket.id, data.id);
      if (state) {
        if (dropItem) persistPickup(socket, dropItem.itemId);
        socket.emit('inventoryState', state);
      }
      io.to(room.id).emit('dropRemoved', { id: data.id });
    });

    socket.on('drop', (data) => {
      if (!data) return;
      const result = room.store.breakdown(socket.id, data.itemId, data.n, data.x, data.y);
      if (!result) return;
      socket.emit('inventoryState', result.snapshot);
      io.to(room.id).emit('dropsSpawned', { drops: result.drops });
    });

    socket.on('timeSkip', (data) => room.clock.skip(data && data.ms));

    socket.on('chatSend', (data) => {
      const player = room.players.get(socket.id);
      const message = chat.sanitize(data, player);
      if (!message) return;
      if (message.kind !== 'private') {
        io.to(room.id).emit('chatMessage', message);
        return;
      }
      for (const [id, target] of Object.entries(room.players.all())) {
        if (target.name !== message.to) continue;
        io.to(id).emit('chatMessage', message);
      }
    });

    socket.on('chatRequest', () => {
      const player = room.players.get(socket.id);
      if (!player) return;
      socket.emit('chatHistory', chat.historyFor(player));
    });

    socket.on('disconnect', () => {
      if (roomManager) {
        roomManager.removeSocket(socket.id);
      } else {
        fallbackPlayers.remove(socket.id);
        fallbackStore.disconnect(socket.id);
      }
      pendingWrites.delete(socket.id);
      sessionOf.delete(socket.id);
      socket.broadcast.to(room.id).emit('playerLeft', socket.id);
    });
  });
}

module.exports = { attachSocketHandlers };
