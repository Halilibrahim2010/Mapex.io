// Auth katmanı: kimlik doğrulama ve oturum üretimi.
//
// Bu sınıf Express'ten, Socket.io'dan ve oyundan habersizdir. Yalnızca bir
// "kullanıcı deposu" (repository) ve token üreticisi alır. Böylece auth
// mantığı taşınabilir kalır: aynı sınıf CLI, test veya başka bir HTTP
// çatısı altında değişmeden çalışır.
//
// Repository arayüzü (UserRepository bunu uygular):
//   findByEmail(email), findByUsername(name), findById(id)
//   createUser({ email, username, passwordHash, createdIp })
//   touchLogin(id, at)
//   createSession({ id, userId, ip, userAgent, expiresAt }), revokeSession(id)
//   readAccount(id)  -> { id, email, username, role, isVerified, gold, gems, level, xp }
//
// Aynı arayüzü MemoryUserRepository de uygular; yani auth katmanı veritabanı
// olmadan da (test/bellek modu) çalışır.
const { hashPassword, verifyPassword } = require('./Password');
const { validateCredentials, validateEmail, validatePassword, validateUsername } = require('./validate');

// Kayıtlı kullanıcıyı dış dünyaya verirken şifre özeti asla dışarı çıkmaz.
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role || 'player',
    isVerified: Boolean(user.isVerified)
  };
}

class AuthService {
  constructor(repository, tokenStore) {
    this.repo = repository;
    this.tokens = tokenStore;
    this.sessions = new Map(); // sid -> { userId, expiresAt } (iptal için)
    this.revoked = new Set();  // iptal edilmiş sid'ler (jeton stateless olduğu için)
  }

  // --- Kayıt ---------------------------------------------------------------
  // Dönüş: { ok:true, user, token, expiresAt } | { ok:false, error, code }
  async register(raw, context = {}) {
    const parsed = validateCredentials(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error, code: 'invalid_input' };
    const { email, password, username } = parsed.value;

    if (await this.repo.findByEmail(email)) {
      return { ok: false, error: 'Bu e-posta zaten kayıtlı.', code: 'email_taken' };
    }
    if (username && (await this.repo.findByUsername(username))) {
      return { ok: false, error: 'Bu kullanıcı adı alınmış.', code: 'username_taken' };
    }

    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await this.repo.createUser({
        email,
        username: username || email.split('@')[0].slice(0, 15),
        passwordHash,
        createdIp: context.ip || null
      });
    } catch (error) {
      // Uygulama seviyesi kontrolünü yarışta biri geçtiyse: tekillik kısıtı.
      if (/unique|duplicate/i.test(String(error.message))) {
        return { ok: false, error: 'Bu e-posta veya kullanıcı adı zaten kayıtlı.', code: 'duplicate' };
      }
      throw error;
    }

    const issued = await this._issueSession(user, context);
    return { ok: true, user: publicUser(user), ...issued };
  }

  // --- Giriş ---------------------------------------------------------------
  async login(raw, context = {}) {
    const email = validateEmail(raw && raw.email);
    if (!email.ok) return { ok: false, error: email.error, code: 'invalid_input' };
    // Şifre uzunluk kuralıyla reddetmiyoruz: eski kısa şifreler de denenebilmeli.
    if (typeof (raw && raw.password) !== 'string' || raw.password.length === 0) {
      return { ok: false, error: 'Şifre gerekli.', code: 'invalid_input' };
    }

    const user = await this.repo.findByEmail(email.value);
    // Kullanıcı yoksa da özet doğrulaması yapılır (zamanlama farkı sızmasın).
    const stored = user ? user.passwordHash : 'scrypt$16384$8$1$AAAA$AAAA';
    const valid = await verifyPassword(raw.password, stored);
    if (!user || !valid) {
      return { ok: false, error: 'E-posta veya şifre hatalı.', code: 'bad_credentials' };
    }

    await this.repo.touchLogin(user.id, new Date());
    const issued = await this._issueSession(user, context);
    return { ok: true, user: publicUser(user), ...issued };
  }

  // --- Jeton doğrulama -----------------------------------------------------
  // Dönüş: { userId, role, sid } | null
  // Jeton stateless olsa da iptal listesi (bellek) ve veritabanındaki
  // revoked_at kontrol edilir; aksi halde çıkış yapan kullanıcı eski jetonla
  // içeride kalırdı.
  verifyToken(token) {
    const payload = this.tokens.verify(token);
    if (!payload || !payload.sub) return null;
    const session = this.sessions.get(payload.sid);
    // İptal edilmiş (listeden çıkarılmış) oturum: kayıtsız jeton kabul edilmez.
    if (this.sessions.has(payload.sid) === false && this.revoked.has(payload.sid)) return null;
    if (session && session.expiresAt <= Date.now()) {
      this.sessions.delete(payload.sid);
      return null;
    }
    return { userId: payload.sub, role: payload.role || 'player', sid: payload.sid };
  }

  // Jetonu iptal eder (çıkış). Jeton stateless olduğundan iptal listesi
  // bellekte tutulur; kalıcı iptal için user_sessions.revoked_at kullanılır.
  async revoke(token) {
    const payload = this.tokens.verify(token);
    if (!payload) return false;
    this.sessions.delete(payload.sid);
    this.revoked.add(payload.sid);
    if (this.repo.revokeSession) await this.repo.revokeSession(payload.sid).catch(() => {});
    return true;
  }

  // --- Yardımcılar ---------------------------------------------------------
  async _issueSession(user, context) {
    const sid = this.tokens.newSessionId();
    const token = this.tokens.sign({ sub: user.id, role: user.role || 'player', sid });
    const payload = this.tokens.verify(token);
    this.sessions.set(sid, { userId: user.id, expiresAt: payload.exp });
    if (this.repo.createSession) {
      await this.repo.createSession({
        id: sid,
        userId: user.id,
        ip: context.ip || null,
        userAgent: context.userAgent || null,
        expiresAt: new Date(payload.exp)
      }).catch(() => {});
    }
    return { token, expiresAt: payload.exp };
  }

  // Şifre değişimi: eski şifre doğrulanmadan yenisi yazılmaz.
  async changePassword(userId, oldPassword, newPassword) {
    const user = await this.repo.findById(userId);
    if (!user) return { ok: false, error: 'Kullanıcı bulunamadı.', code: 'not_found' };
    const valid = await verifyPassword(oldPassword, user.passwordHash);
    if (!valid) return { ok: false, error: 'Mevcut şifre hatalı.', code: 'bad_credentials' };
    const next = validatePassword(newPassword);
    if (!next.ok) return { ok: false, error: next.error, code: 'invalid_input' };
    await this.repo.updatePassword(userId, await hashPassword(next.value));
    return { ok: true };
  }

  // Kayıt akışı için kullanıcı adı müsait mi?
  async isUsernameFree(name) {
    const parsed = validateUsername(name);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const taken = await this.repo.findByUsername(parsed.value);
    return { ok: true, available: !taken };
  }
}

module.exports = { AuthService, publicUser };