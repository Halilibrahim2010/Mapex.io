// Express auth ara yazılımları. Kural: ara yazılım KİMLİK çözer, yetkilendirme
// kararı vermez. Oyun uçları asla 401 ile kilitlenmez; kayıtlı değilse
// "misafir" oturumu atanır ve oyun devam eder.
const { GuestSession } = require('./GuestSession');
const { AccountSession } = require('./AccountSession');

// İstekten IP adresi (proxy arkasında x-forwarded-for'a güvenilir).
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || '0.0.0.0';
}

// Jetonu Authorization: Bearer veya ?token= üzerinden okur (socket.io için).
function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.query && typeof req.query.token === 'string') return req.query.token;
  return null;
}

// Oturumu çözer ve req.session'a koyar. Jeton yoksa/geçersizse misafir atanır.
function attachSession(layer) {
  return async function sessionMiddleware(req, res, next) {
    const token = bearerToken(req);
    try {
      const identity = token ? layer.auth.verifyToken(token) : null;
      if (identity) {
        const account = await layer.repository.readAccount(identity.userId);
        if (account) {
          req.session = new AccountSession({
            userId: account.id,
            username: account.username,
            email: account.email,
            role: account.role,
            isVerified: account.isVerified,
            gold: account.gold,
            gems: account.gems,
            level: account.level,
            xp: account.xp,
            provider: { economy: layer.repository, inventory: layer.repository }
          });
          req.authToken = token;
          req.authIdentity = identity;
          return next();
        }
      }
    } catch (error) {
      // Kimlik çözülemedi: oyunu durdurma, misafir olarak devam et.
      req.authError = error.message;
    }
    req.session = new GuestSession({ displayName: (req.body && req.body.name) || 'Misafir' });
    next();
  };
}

// Yalnızca kayıtlı kullanıcı geçer (hesap gerektiren uçlar için).
// Bu, OPSİYONEL bir katmandır: oyun uçlarında kullanılmaz.
function requireAccount() {
  return function requireAccountMiddleware(req, res, next) {
    if (req.session && !req.session.isGuest) return next();
    res.status(401).json({ ok: false, error: 'Bu işlem için giriş yapmalısın.', code: 'auth_required' });
  };
}

// Rol kontrolü (ör. admin paneli). capability tabanlı değil, rol tabanlıdır:
// yönetim işleri oyun mekaniklerinden ayrıdır.
function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    const role = req.session && req.session.role;
    if (role && roles.includes(role)) return next();
    res.status(403).json({ ok: false, error: 'Bu işlem için yetkin yok.', code: 'forbidden' });
  };
}

// Hız sınırı ara yazılımı: IP başına. Aşılırsa 429.
function rateLimit(limiter, keyOf = clientIp) {
  return function rateLimitMiddleware(req, res, next) {
    const result = limiter.check(keyOf(req));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (result.allowed) return next();
    res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    res.status(429).json({ ok: false, error: 'Çok fazla deneme. Lütfen biraz bekle.', code: 'rate_limited' });
  };
}

// İstek gövdesinden istemci bilgisi (oturum kaydı ve şifre işlemleri için).
function clientContext(req) {
  return {
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 255)
  };
}

module.exports = { attachSession, requireAccount, requireRole, rateLimit, clientIp, clientContext, bearerToken };