const { GameWorld } = require('./GameWorld');
const { GameClock, PlayerRegistry } = require('./GameClock');
const { InventoryStore } = require('./InventoryStore');
const { hashPassword, verifyPassword } = require('../auth/Password');

function generateRoomCode(existingMembers) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXY23456789'; // karışmasqm diye O, I, 1, 0 çıkarıldı
  let code = '';
  for (let tries = 0; tries < 100; tries++) {
    code = '';
    for (let i = 0; i < 7; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingMembers.has(code)) return code;
  }
  return `ROOM${Date.now() % 10000}`;
}

class GameRoom {
  constructor({ id, name, passwordHash = null, maxPlayers = 8, friendlyFire = false, isPublic = false, io }) {
    this.id = id;
    this.name = name || 'Lobby';
    this.passwordHash = passwordHash;
    this.maxPlayers = Math.max(2, Math.min(100, Number(maxPlayers) || 8));
    this.friendlyFire = Boolean(friendlyFire);
    this.isPublic = Boolean(isPublic);
    this.createdAt = Date.now();

    this.world = new GameWorld();
    this.store = new InventoryStore(this.world);
    this.players = new PlayerRegistry();

    // Oda saati: yalnızca bu odaya yayınlar
    const roomIo = {
      emit: (event, data) => {
        if (io) io.to(this.id).emit(event, data);
      }
    };
    this.clock = new GameClock(roomIo);
    this.clock.start();
  }

  isFull() {
    return Object.keys(this.players.all()).length >= this.maxPlayers;
  }

  async verifyPassword(plain) {
    if (!this.passwordHash) return true;
    if (typeof plain !== 'string') return false;
    return verifyPassword(plain, this.passwordHash);
  }

  destroy() {
    if (this.clock) this.clock.stop();
  }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.socketRoom = new Map(); // socketId -> roomId

    // Sabit Public Odalar
    this._initPublicRooms();
  }


  _initPublicRooms() {
    this.rooms.set('public_ff_on', new GameRoom({
      id: 'public_ff_on',
      name: 'Vah��i Doğa (PvP)',
      friendlyFire: true,
      maxPlayers: 100,
      isPublic: true,
      io: this.io
    }));

    this.rooms.set('public_ff_off', new GameRoom({
      id: 'public_ff_off',
      name: 'Huzurlu Vadi (Co-op)',
      friendlyFire: false,
      maxPlayers: 100,
      isPublic: true,
      io: this.io
    }));
  }


  getRoom(roomId) {
    if (!roomId) return this.rooms.get('public_ff_off');
    return this.rooms.get(roomId) || this.rooms.get('public_ff_off');
  }


  async createLobby({ name, password, maxPlayers = 8, friendlyFire = false }) {
    const code = generateRoomCode(this.rooms);
    let passwordHash = null;
    if (password && password.trim().length > 0) {
      passwordHash = await hashPassword(password.trim());
    }

    const room = new GameRoom({
      id: code,
      name: String(name || 'Ozel Lobby').trim().slice(0, 24),
      passwordHash,
      maxPlayers: Math.max(2, Math.min(16, Number(maxPlayers) || 8)),
      friendlyFire: Boolean(friendlyFire),
      isPublic: false,
      io: this.io
    });

    this.rooms.set(code, room);
    return {
      ok: true,
      code,
      roomId: code,
      name: room.name,
      friendlyFire: room.friendlyFire,
      maxPlayers: room.maxPlayers,
      hasPassword: Boolean(passwordHash)
    };
  }


  async joinLobby({ code, password }) {
    const upperCode = String(code || '').trim().toUpperCase();
    const room = this.rooms.get(upperCode);

    if (!room) {
      throw new Error('Bïyle bir lobby bulunamadı');
    }

    if (room.isFull()) {
      throw new Error('Lobby dolu (maksimum oyuncu sınırına ulaşmld�)');
    }

    if (room.passwordHash) {
      const valid = await room.verifyPassword(password);
      if (!valid) throw new Error('Lobby şifresi hatalı');
    }

    return {
      ok: true,
      roomId: room.id,
      code: room.id,
      name: room.name,
      friendlyFire: room.friendlyFire
    };
  }


  assignSocket(socketId, roomId) {
    const room = this.getRoom(roomId);
    this.socketRoom.set(socketId, room.id);
    return room;
  }


  getRoomOfSocket(socketId) {
    const roomId = this.socketRoom.get(socketId);
    return this.getRoom(roomId);
  }


  removeSocket(socketId) {
    const roomId = this.socketRoom.get(socketId);
    this.socketRoom.delete(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.players.remove(socketId);
      room.store.disconnect(socketId);
      // Özel lobby boş kalırsa ve public değilse temizle
      if (!room.isPublic && room.players.count === 0) {
        room.destroy();
        this.rooms.delete(roomId);
      }
    }
  }
}

module.exports = { RoomManager, GameRoom, generateRoomCode };
