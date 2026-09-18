// Kullanıcı/ekonomi/envanter deposu — Prisma sürümü.
//
// RACE CONDITION KORUMASI (kritik):
//   Bakiye düşme işlemi tek bir UPDATE cümlesiyle yapılır:
//       UPDATE users SET gold = gold - $amount WHERE id = $id AND gold >= $amount
//   Etkilenen satır 0 ise harcama gerçekleşmemiştir (yarışı başkası kazandı).
//   "Önce oku, sonra yaz" (check-then-act) deseni bilerek kullanılmaz; iki eş
//   zamanlı istek aynı bakiyeyi okuyup iki kez harcayamaz.
//
// Bu dosya Prisma yüklü değilse oyunu durdurmaz: Prisma istemcisi dışarıdan
// enjekte edilir, yoksa MemoryUserRepository kullanılır.
const ROLE_DEFAULT = 'player';
const CURRENCY_COLUMN = { gold: 'gold', gems: 'gems' };

class PrismaUserRepository {
  constructor(prisma) {
    if (!prisma) throw new Error('PrismaUserRepository için prisma istemcisi gerekli.');
    this.db = prisma;
  }

  // --- Kullanıcı ----------------------------------------------------------
  async findByEmail(email) {
    const rows = await this.db.$queryRaw`
      SELECT id, email, username, password_hash AS "passwordHash", role,
             is_verified AS "isVerified", created_at AS "createdAt",
             last_login AS "lastLogin", gold, gems
      FROM users WHERE email = ${email} LIMIT 1`;
    return rows[0] || null;
  }

  async findByUsername(username) {
    const rows = await this.db.$queryRaw`
      SELECT id, email, username, password_hash AS "passwordHash", role,
             is_verified AS "isVerified", gold, gems
      FROM users WHERE username = ${username} LIMIT 1`;
    return rows[0] || null;
  }

  async findById(id) {
    const rows = await this.db.$queryRaw`
      SELECT id, email, username, password_hash AS "passwordHash", role,
             is_verified AS "isVerified", gold, gems
      FROM users WHERE id = ${id}::uuid LIMIT 1`;
    return rows[0] || null;
  }

  // Yeni kullanıcı + ilerleme satırı aynı işlemde oluşturulur.
  async createUser({ email, username, passwordHash, createdIp }) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO users (email, username, password_hash, role, is_verified, created_ip, gold, gems)
        VALUES (${email}, ${username}, ${passwordHash}, ${ROLE_DEFAULT}, false, ${createdIp}, 0, 0)
        RETURNING id, email, username, role, is_verified AS "isVerified", gold, gems,
                  password_hash AS "passwordHash"`;
      const user = rows[0];
      await tx.$executeRaw`
        INSERT INTO user_progress (user_id, level, xp) VALUES (${user.id}::uuid, 1, 0)`;
      return user;
    });
  }

  async updatePassword(id, passwordHash) {
    await this.db.$executeRaw`
      UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}::uuid`;
    return true;
  }

  async touchLogin(id, at) {
    await this.db.$executeRaw`
      UPDATE users SET last_login = ${at} WHERE id = ${id}::uuid`;
    return true;
  }

  async setVerified(id, verified = true) {
    await this.db.$executeRaw`
      UPDATE users SET is_verified = ${verified} WHERE id = ${id}::uuid`;
    return true;
  }

  async setRole(id, role) {
    await this.db.$executeRaw`
      UPDATE users SET role = ${role}::"Role" WHERE id = ${id}::uuid`;
    return true;
  }

  // --- Ekonomi ve ilerleme ------------------------------------------------
  async readAccount(id) {
    const rows = await this.db.$queryRaw`
      SELECT u.id, u.email, u.username, u.role, u.is_verified AS "isVerified",
             u.gold, u.gems, p.level, p.xp
      FROM users u LEFT JOIN user_progress p ON p.user_id = u.id
      WHERE u.id = ${id}::uuid LIMIT 1`;
    return rows[0] ? normalizeAccount(rows[0]) : null;
  }

  // ATOMİK harcama: koşul SQL'de. Yetersiz bakiyede satır etkilenmez.
  // Sütun adı parametre olamadığı için yalnızca beyaz listeden gelir.
  async trySpend(userId, currency, amount, reason) {
    const column = CURRENCY_COLUMN[currency];
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (!column || cost === 0) return { ok: false, balance: 0 };

    return this.db.$transaction(async (tx) => {
      const updated = await tx.$queryRawUnsafe(
        `UPDATE users SET ${column} = ${column} - $1
         WHERE id = $2::uuid AND ${column} >= $1
         RETURNING ${column} AS balance`,
        cost, userId
      );
      // Etkilenen satır yok: bakiye yetmedi veya eş zamanlı işlem önce düştü.
      if (!updated[0]) return { ok: false, balance: 0 };
      const balance = Number(updated[0].balance);
      await tx.$executeRaw`
        INSERT INTO wallet_transactions (user_id, currency, delta, balance, reason)
        VALUES (${userId}::uuid, ${currency}, ${-cost}, ${balance}, ${reason})`;
      return { ok: true, balance };
    });
  }

  async credit(userId, currency, amount, reason) {
    const column = CURRENCY_COLUMN[currency];
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (!column || gain === 0) return { ok: false, balance: 0 };

    return this.db.$transaction(async (tx) => {
      const updated = await tx.$queryRawUnsafe(
        `UPDATE users SET ${column} = ${column} + $1
         WHERE id = $2::uuid RETURNING ${column} AS balance`,
        gain, userId
      );
      if (!updated[0]) return { ok: false, balance: 0 };
      const balance = Number(updated[0].balance);
      await tx.$executeRaw`
        INSERT INTO wallet_transactions (user_id, currency, delta, balance, reason)
        VALUES (${userId}::uuid, ${currency}, ${gain}, ${balance}, ${reason})`;
      return { ok: true, balance };
    });
  }

  async addXp(userId, amount) {
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    const rows = await this.db.$queryRaw`
      UPDATE user_progress SET xp = xp + ${gain}, updated_at = now()
      WHERE user_id = ${userId}::uuid RETURNING level, xp`;
    return rows[0] ? { level: Number(rows[0].level), xp: Number(rows[0].xp) } : null;
  }

  // --- Oturum kaydı (denetim; kalıcı iptal listesi için) ------------------
  async createSession({ id, userId, ip, userAgent, expiresAt }) {
    await this.db.$executeRaw`
      INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at)
      VALUES (${id}::uuid, ${userId}::uuid, ${ip}, ${userAgent}, ${expiresAt})`;
    return true;
  }

  async revokeSession(id) {
    await this.db.$executeRaw`
      UPDATE user_sessions SET revoked_at = now() WHERE id = ${id}::uuid`;
    return true;
  }

  async isSessionRevoked(id) {
    const rows = await this.db.$queryRaw`
      SELECT revoked_at AS "revokedAt" FROM user_sessions WHERE id = ${id}::uuid LIMIT 1`;
    return Boolean(rows[0] && rows[0].revokedAt);
  }

  // --- Envanter (aynı sınıfta toplandı: tek bağlantı, tek işlem sınırı) ---
  async list(userId) {
    const rows = await this.db.$queryRaw`
      SELECT item_id AS "itemId", item_type AS "itemType", count,
             acquired_at AS "acquiredAt"
      FROM user_inventory WHERE user_id = ${userId}::uuid ORDER BY acquired_at ASC`;
    return rows.map((row) => ({ ...row, count: Number(row.count || 0) }));
  }

  // (user_id, item_id) tekil: yarışta iki istek gelse bile satır ikiye katlanmaz.
  async grant(userId, itemId, itemType, count = 1) {
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    const rows = await this.db.$queryRaw`
      INSERT INTO user_inventory (user_id, item_id, item_type, count)
      VALUES (${userId}::uuid, ${itemId}, ${itemType}, ${amount})
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET count = user_inventory.count + ${amount}
      RETURNING item_id AS "itemId", item_type AS "itemType", count`;
    return rows[0] ? { ...rows[0], count: Number(rows[0].count) } : null;
  }

  // Atomik düşme: yeterli adet yoksa hiçbir şey silinmez/azaltılmaz.
  async take(userId, itemId, count = 1) {
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    return this.db.$transaction(async (tx) => {
      const updated = await tx.$queryRaw`
        UPDATE user_inventory SET count = count - ${amount}
        WHERE user_id = ${userId}::uuid AND item_id = ${itemId} AND count >= ${amount}
        RETURNING count`;
      if (!updated[0]) return { ok: false, remaining: 0 };
      const remaining = Number(updated[0].count);
      if (remaining <= 0) {
        await tx.$executeRaw`
          DELETE FROM user_inventory WHERE user_id = ${userId}::uuid AND item_id = ${itemId} AND count <= 0`;
      }
      return { ok: true, remaining };
    });
  }
}

// BigInt alanlarını JS number'a çevirir (istemciye giden veri saf JSON olsun).
function normalizeAccount(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    isVerified: Boolean(row.isVerified),
    gold: Number(row.gold || 0),
    gems: Number(row.gems || 0),
    level: Number(row.level || 1),
    xp: Number(row.xp || 0)
  };
}

module.exports = { PrismaUserRepository, normalizeAccount, CURRENCY_COLUMN };