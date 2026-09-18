// Auth HTTP uçları. Tüm iş mantığı AuthService'te; burada yalnızca HTTP
// sözleşmesi (durum kodları, gövde biçimi) vardır. Böylece aynı auth katmanı
// HTTP olmadan da (ör. soket veya CLI) kullanılabilir.
const express = require('express');
const { attachSession, requireAccount, rateLimit, clientContext } = require('./middleware');

// Yanıt biçimi her uçta aynı: { ok, ... } veya { ok:false, error, code }.
function fail(res, status, result) {
  return res.status(status).json({ ok: false, error: result.error, code: result.code || 'error' });
}

function createAuthRouter(layer) {
  const router = express.Router();

  // JSON gövdesi burada okunur (sunucu genelinde body-parser'a gerek kalmadan).
  router.use(express.json({ limit: '16kb' }));

  // --- Kayıt --------------------------------------------------------------
  router.post('/register', rateLimit(layer.limiters.register), async (req, res) => {
    const result = await layer.auth.register(req.body, clientContext(req));
    if (!result.ok) {
      // "Aynı e-posta/kullanıcı adı" bir çakışmadır: 409 daha doğru bir sinyal.
      const conflict = result.code === 'duplicate' || result.code === 'email_taken' || result.code === 'username_taken';
      return fail(res, conflict ? 409 : 400, result);
    }
    res.status(201).json({ ok: true, user: result.user, token: result.token, expiresAt: result.expiresAt });
  });

  // --- Giriş --------------------------------------------------------------
  router.post('/login', rateLimit(layer.limiters.login), async (req, res) => {
    const result = await layer.auth.login(req.body, clientContext(req));
    if (!result.ok) return fail(res, 401, result);
    res.json({ ok: true, user: result.user, token: result.token, expiresAt: result.expiresAt });
  });

  // --- Çıkış --------------------------------------------------------------
  router.post('/logout', async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '').trim();
    const revoked = token ? await layer.auth.revoke(token) : false;
    res.json({ ok: true, revoked });
  });

  // --- Kullanıcı adı müsait mi? ------------------------------------------
  router.get('/check-username', (req, res) => {
    layer.auth.isUsernameFree(req.query.name).then((result) => {
      if (!result.ok) return fail(res, 400, result);
      res.json({ ok: true, available: result.available });
    });
  });

  // --- Mevcut oturum: oyun istemcisinin açılışta çağırdığı uç ------------
  // Kritik: jeton geçersizse 401 DEĞİL, misafir oturumu döner. İstemci her
  // koşulda oyuna girebilir; "hesap var mı" bilgisi sadece bir alandır.
  router.get('/session', rateLimit(layer.limiters.session), attachSession(layer), async (req, res) => {
    const session = req.session;
    res.json({
      ok: true,
      session: {
        ...session.describe(),
        isAuthenticated: session.isAuthenticated,
        persistent: session.isPersistent,
        capabilities: session.capabilities,
        economy: session.snapshot()
      }
    });
  });

  // --- Hesap bilgisi (kayıtlı kullanıcı) ---------------------------------
  router.get('/me', attachSession(layer), requireAccount(), async (req, res) => {
    await req.session.refresh();
    res.json({ ok: true, user: { id: req.session.id, email: req.session.email, username: req.session.displayName, role: req.session.role }, economy: req.session.snapshot() });
  });

  // --- Şifre değiştir -----------------------------------------------------
  router.post('/change-password', attachSession(layer), requireAccount(), rateLimit(layer.limiters.login), async (req, res) => {
    const body = req.body || {};
    const result = await layer.auth.changePassword(req.session.id, body.oldPassword, body.newPassword);
    if (!result.ok) return fail(res, 400, result);
    res.json({ ok: true });
  });

  return router;
}

// Hız sınırı sayacını sıfırlar (yalnızca test/teşhis amaçlı).
// MAPEX_ALLOW_TEST_HOOKS=1 değilse 404 döner: üretimde asla açık olmaz.
function limiterResetRoute(layer) {
  return function resetRoute(req, res) {
    if (process.env.MAPEX_ALLOW_TEST_HOOKS !== '1') {
      return res.status(404).json({ ok: false, error: 'Bulunamadı.', code: 'not_found' });
    }
    // Tüm sayaçlar temizlenir: test hangi IP'den geldiğini bilmek zorunda kalmasın.
    for (const limiter of Object.values(layer.limiters)) limiter.hits.clear();
    res.json({ ok: true });
  };
}

module.exports = { createAuthRouter, limiterResetRoute };