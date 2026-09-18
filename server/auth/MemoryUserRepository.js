// Bellek içi kullanıcı deposu: PostgreSQL/Prisma olmadan da tüm auth
// akışının çalışmasını sağlar (geliştirme, demo ve testler).
//
// ATOMİK DAVRANIŞ BURADA DA KORUNUR: trySpend/take tek bir senkron blok
// içinde "kontrol et ve düş" yapar. Node tek iş parçacıklı olduğundan ve bu
// bloklar arasında await yoktur, dolayısıyla araya başka istek giremez —
// yani koşullu UPDATE ile aynı garantiyi verir.
const crypto = require('crypto');
const ROLE_DEFAULT = 'player';

class MemoryUserRepository {
  constructor() {
    this.usersById = new Map();
    this.idByEmail = new Map();
    this.idByUsername = new Map();
    this.inventory = new Map(); // userId -> Map(itemId -> { itemId, itemType, count })
    this.sessions = new Map();
    this.transactions = [];
  }

  _public(user) { return user ? { ...user } : null; }

  async findByEmail(email) {
    const id = this.idByEmail.get(String(email || '').toLowerCase());
    return id ? this._public(this.usersById.get(id)) : null;
  }

  async findByUsername(username) {
    const id = this.idByUsername.get(String(username || '').toLowerCase());
    return id ? this._public(this.usersById.get(id)) : null;
  }

  async findById(id) {
    return this._public(this.usersById.get(String(id || '')));
  }

  async createUser({ email, username, passwordHash, createdIp }) {
    const key = String(email).toLowerCase();
    const nameKey = String(username).toLowerCase();
    if (this.idByEmail.has(key)) throw new Error('unique email');
    if (this.idByUsername.has(nameKey)) throw new Error('unique username');

    const user = {
      id: crypto.randomUUID(),
      email: String(email),
      username: String(username),
      passwordHash,
      role: ROLE_DEFAULT,
      isVerified: false,
      createdIp: createdIp || null,
      createdAt: new Date(),
      lastLogin: null,
      gold: 0,
      gems: 0,
      level: 1,
      xp: 0
    };
    this.usersById.set(user.id, user);
    this.idByEmail.set(key, user.id);
    this.idByUsername.set(nameKey, user.id);
    this.inventory.set(user.id, new Map());
    return this._public(user);
  }

  async updatePassword(id, passwordHash) {
    const user = this.usersById.get(String(id));
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  }

  async touchLogin(id, at) {
    const user = this.usersById.get(String(id));
    if (!user) return false;
    user.lastLogin = at;
    return true;
  }

  async setVerified(id, verified = true) {
    const user = this.usersById.get(String(id));
    if (!user) return false;
    user.isVerified = Boolean(verified);
    return true;
  }

  async setRole(id, role) {
    const user = this.usersById.get(String(id));
    if (!user) return false;
    user.role = role;
    return true;
  }

  // --- Ekonomi ------------------------------------------------------------
  async readAccount(id) {
    const user = this.usersById.get(String(id));
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified,
      gold: user.gold,
      gems: user.gems,
      level: user.level,
      xp: user.xp
    };
  }

  // Atomik: koşul sağlanmazsa bakiye değişmez ve işlem kaydı yazılmaz.
  async trySpend(userId, currency, amount, reason) {
    const user = this.usersById.get(String(userId));
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (!user || !['gold', 'gems'].includes(currency) || cost === 0) return { ok: false, balance: 0 };
    if (user[currency] < cost) return { ok: false, balance: user[currency] };
    user[currency] -= cost;
    this.transactions.push({ userId: user.id, currency, delta: -cost, balance: user[currency], reason, at: new Date() });
    return { ok: true, balance: user[currency] };
  }

  async credit(userId, currency, amount, reason) {
    const user = this.usersById.get(String(userId));
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (!user || !['gold', 'gems'].includes(currency) || gain === 0) return { ok: false, balance: 0 };
    user[currency] += gain;
    this.transactions.push({ userId: user.id, currency, delta: gain, balance: user[currency], reason, at: new Date() });
    return { ok: true, balance: user[currency] };
  }

  async addXp(userId, amount) {
    const user = this.usersById.get(String(userId));
    if (!user) return null;
    user.xp += Math.max(0, Math.floor(Number(amount) || 0));
    return { level: user.level, xp: user.xp };
  }

  // --- Oturumlar ----------------------------------------------------------
  async createSession({ id, userId, ip, userAgent, expiresAt }) {
    this.sessions.set(String(id), { id, userId, ip, userAgent, expiresAt, revokedAt: null });
    return true;
  }

  async revokeSession(id) {
    const session = this.sessions.get(String(id));
    if (!session) return false;
    session.revokedAt = new Date();
    return true;
  }

  async isSessionRevoked(id) {
    const session = this.sessions.get(String(id));
    return Boolean(session && session.revokedAt);
  }

  // --- Envanter -----------------------------------------------------------
  async list(userId) {
    const bag = this.inventory.get(String(userId));
    return bag ? Array.from(bag.values()).map((item) => ({ ...item })) : [];
  }

  async grant(userId, itemId, itemType, count = 1) {
    const key = String(userId);
    if (!this.inventory.has(key)) this.inventory.set(key, new Map());
    const bag = this.inventory.get(key);
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    const entry = bag.get(itemId) || { itemId, itemType: itemType || 'misc', count: 0, acquiredAt: new Date() };
    entry.count += amount;
    bag.set(itemId, entry);
    return { ...entry };
  }

  async take(userId, itemId, count = 1) {
    const bag = this.inventory.get(String(userId));
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    const entry = bag && bag.get(itemId);
    if (!entry || entry.count < amount) return { ok: false, remaining: entry ? entry.count : 0 };
    entry.count -= amount;
    if (entry.count <= 0) bag.delete(itemId);
    return { ok: true, remaining: entry.count };
  }

  // Testlerde durum doğrulamak için.
  transactionLog() { return [...this.transactions]; }
}

module.exports = { MemoryUserRepository };