// Deterministik oyun saati: tüm istemciler aynı saati görür (server authority).
const GameData = require('./GameData');

const DAY_LENGTH_MS = 15 * 60 * 1000;
const START_HOUR = 10;
const SYNC_INTERVAL_MS = 5000;
const MAX_SKIP_MS = 30000;

class GameClock {
  constructor(io) {
    this.io = io;
    this.startedAt = Date.now();
    this.skipMs = 0;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.broadcast(), SYNC_INTERVAL_MS);
  }

  now() {
    return (Date.now() - this.startedAt) + (START_HOUR / 24) * DAY_LENGTH_MS + this.skipMs;
  }

  state() {
    return { serverNow: Math.floor(this.now()), dayLength: DAY_LENGTH_MS };
  }

  broadcast() {
    this.io.emit('timeState', this.state());
  }

  // Shift ile hızlandırma: sunucu saati herkes için ilerler.
  skip(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return;
    this.skipMs += Math.min(value, MAX_SKIP_MS);
    this.broadcast();
  }
}

const PLAYER_DEFAULTS = { x: 0, y: 0, facingLeft: false, name: 'Oyuncu', char: 1, anim: 0, hold: null };
const MAX_CHAR_ID = 18;

class PlayerRegistry {
  constructor() {
    this.players = {};
  }

  create(socketId) {
    this.players[socketId] = { id: socketId, ...PLAYER_DEFAULTS };
    return this.players[socketId];
  }

  get(socketId) {
    return this.players[socketId] || null;
  }

  all() {
    return this.players;
  }

  setName(socketId, value) {
    const player = this.get(socketId);
    if (!player) return null;
    const name = typeof value === 'string' ? value : (value && value.name);
    if (typeof name === 'string' && name.trim()) player.name = name.trim();
    return player;
  }

  setChar(socketId, value) {
    const player = this.get(socketId);
    if (!player) return null;
    const char = Number.isInteger(value) ? value : null;
    if (char !== null && char >= 1 && char <= MAX_CHAR_ID) player.char = char;
    return player;
  }

  move(socketId, data) {
    const player = this.get(socketId);
    if (!player || !data) return null;
    player.x = Number(data.x) || 0;
    player.y = Number(data.y) || 0;
    player.facingLeft = Boolean(data.facingLeft);
    // Animasyon durumu (0 idle, 1 walk, 2 chop): karşı istemci aynı animasyonu
    // oynatsın diye taşınır; geçersiz değerde eski durum korunur.
    const anim = Number(data.anim);
    if (Number.isInteger(anim) && anim >= 0 && anim <= 2) player.anim = anim;
    // Kesme barı bilgisi: { id, progress, x, y }. Uzak tarafta sarı bar çizilir.
    if (data.hold) player.hold = this.sanitizeHold(data.hold);
    return player;
  }

  // Kesme bilgisini güvenli aralıklara sıkıştırır (istemci verisi doğrulanır).
  sanitizeHold(hold) {
    const progress = Number(hold.progress);
    return {
      id: hold.id === null || hold.id === undefined ? null : String(hold.id).slice(0, 64),
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
      x: Number(hold.x) || 0,
      y: Number(hold.y) || 0
    };
  }

  remove(socketId) {
    delete this.players[socketId];
  }
}

module.exports = { GameClock, PlayerRegistry, GameData };