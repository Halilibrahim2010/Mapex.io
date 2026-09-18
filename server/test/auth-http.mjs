// Auth HTTP uçlarının sözleşmesi: sunucu 3019'da çalışıyor olmalı.
// Asıl doğrulanan: jeton geçersizse oyunun KİLİTLENMEDİĞİ (misafir döner).
// Çalıştır:  node test/auth-http.mjs
const BASE = 'http://localhost:3019/auth';

// Hız sınırı test kancası: sunucu MAPEX_ALLOW_TEST_HOOKS=1 ile açılmalı.
// Yoksa bu çağrı sessizce yok sayılır ve testler limiti aşarsa görünür şekilde
// başarısız olur (sessizce geçen bir test yanıltıcı olurdu).
async function layerLimiterReset(kind) {
  try {
    await fetch(`${BASE}/__reset-limits?kind=${kind}`);
  } catch (error) {
    /* sunucu yoksa testler zaten başarısız olur */
  }
}

let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail));
    failed++;
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = { parseError: true };
  }
  return { status: response.status, body: payload };
}

async function main() {
  const stamp = Date.now();
  const email = `http-test-${stamp}@example.com`;
  const username = `HttpT${String(stamp).slice(-9)}`;

  // Test kendi hız sınırını aşmasın: sayaçlar baştan temizlenir.
  await layerLimiterReset();

  // --- Misafir oturumu (jetonsuz) ----------------------------------------
  const guest = await call('/session');
  check('jetonsuz oturum 200 döner (401 DEĞİL)', guest.status === 200, guest.status);
  check('jetonsuz oturum misafirdir', guest.body.session && guest.body.session.isGuest === true);
  check('misafir de ekonomi alanı taşır', guest.body.session.economy && guest.body.session.economy.gold === 0);
  check('misafir ticaret yapamaz', guest.body.session.capabilities.trade === false);
  check('misafir envanter kullanabilir (oyun çalışsın)', guest.body.session.capabilities.inventory === true);
  check('misafir oturumu istemciye storageKey verir', typeof guest.body.session.storageKey === 'string');

  // --- Bozuk jeton: oyun kilitlenmemeli ----------------------------------
  const broken = await call('/session', { token: 'tamamen.bozuk.jeton' });
  check('bozuk jeton 200 + misafir döner (oyun kilitlenmez)', broken.status === 200 && broken.body.session.isGuest === true, broken.status);

  // --- Kayıt --------------------------------------------------------------
  const registered = await call('/register', { method: 'POST', body: { email, username, password: 'gizli12345' } });
  check('kayıt 201 döner', registered.status === 201, registered.status);
  check('kayıt jeton döndürür', typeof registered.body.token === 'string');
  check('kayıtta rol player', registered.body.user.role === 'player');
  check('kayıtta is_verified false', registered.body.user.isVerified === false);
  check('kayıt yanıtında şifre özeti yok', registered.body.user.passwordHash === undefined);
  const token = registered.body.token;
  const userId = registered.body.user.id;

  // --- Kayıtlı oturum -----------------------------------------------------
  const account = await call('/session', { token });
  check('jetonlu oturum hesaptır', account.body.session.isGuest === false && account.body.session.isAuthenticated === true);
  check('hesap kalıcıdır', account.body.session.capabilities.persist === true);
  check('hesap ticaret yapabilir', account.body.session.capabilities.trade === true);
  check('hesap storageKey kullanıcı kimliği', account.body.session.storageKey === 'user:' + userId);

  // --- /me ----------------------------------------------------------------
  const me = await call('/me', { token });
  check('/me hesap bilgisi verir', me.body.user && me.body.user.email === email, me.body);
  check('/me jetonsuz 401 verir', (await call('/me')).status === 401);

  // --- Çift kayıt ---------------------------------------------------------
  const duplicate = await call('/register', { method: 'POST', body: { email, username: 'Baska1', password: 'gizli12345' } });
  check('aynı e-posta 409 döner', duplicate.status === 409, duplicate.status);
  check('aynı kullanıcı adı reddedilir', (await call('/register', { method: 'POST', body: { email: `x${stamp}@e.com`, username, password: 'gizli12345' } })).status === 409);

  // --- Giriş --------------------------------------------------------------
  const login = await call('/login', { method: 'POST', body: { email, password: 'gizli12345' } });
  check('giriş başarılı', login.status === 200 && typeof login.body.token === 'string', login.body);
  check('yanlış şifre 401', (await call('/login', { method: 'POST', body: { email, password: 'yanlis' } })).status === 401);
  check('kısa şifre kayıt olamaz', (await call('/register', { method: 'POST', body: { email: `y${stamp}@e.com`, username: 'Yy' + String(stamp).slice(-6), password: '123' } })).status === 400);

  // --- Kullanıcı adı sorgusu ---------------------------------------------
  await layerLimiterReset();
  const taken = await call(`/check-username?name=${username}`);
  check('alınmış kullanıcı adı müsait değil', taken.body.available === false, taken.body);
  const free = await call('/check-username?name=Yeni' + String(stamp).slice(-6));
  check('yeni kullanıcı adı müsait', free.body.available === true, free.body);

  // --- Şifre değişimi -----------------------------------------------------
  // Not: şifre denemeleri hız sınırına tabidir (kaba kuvvet koruması). Test
  // kendi limitini aşmasın diye sayaç burada sıfırlanır.
  layerLimiterReset('login');
  const wrongOld = await call('/change-password', { method: 'POST', token, body: { oldPassword: 'yanlis', newPassword: 'yeniSifre123' } });
  check('yanlış eski şifre reddedilir', wrongOld.body.ok === false, wrongOld.body);
  layerLimiterReset('login');
  const changed = await call('/change-password', { method: 'POST', token, body: { oldPassword: 'gizli12345', newPassword: 'yeniSifre123' } });
  check('şifre değişti', changed.body.ok === true, changed.body);
  check('eski şifreyle giriş yapılamaz', (await call('/login', { method: 'POST', body: { email, password: 'gizli12345' } })).status === 401);
  check('yeni şifreyle giriş yapılır', (await call('/login', { method: 'POST', body: { email, password: 'yeniSifre123' } })).status === 200);

  // --- Çıkış ve jeton iptali ---------------------------------------------
  const freshLogin = (await call('/login', { method: 'POST', body: { email, password: 'yeniSifre123' } })).body.token;
  const logout = await call('/logout', { method: 'POST', token: freshLogin });
  check('çıkış iptal etti', logout.body.revoked === true, logout.body);
  const afterLogout = await call('/session', { token: freshLogin });
  check('çıkıştan sonra jeton misafire düşer (oyun devam eder)', afterLogout.body.session.isGuest === true);

  console.log(`\n${failed === 0 ? 'Auth HTTP testleri geçti' : 'Auth HTTP testleri BAŞARISIZ: ' + failed + ' hata'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log('  ✗ test çalıştırılamadı (sunucu 3019 açık mı?):', error.message);
  process.exit(1);
});