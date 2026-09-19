// Hesap paneli tarayıcı testi: gerçek tarayıcıda kayıt/giriş akışı, oturum
// şeridi ve EN ÖNEMLİSİ "misafir olarak devam" yolunun oyunu başlatması.
//   node test/browser-account.mjs        (sunucu 12090'da çalışıyor olmalı)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.BROWSER_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.BASE_URL || 'http://localhost:12090/index.html';
const PORT = 9337;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mapex-acct-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const pending = new Map();
const logs = [];
let ws = null;
let id = 0;
let failedStartup = false;

// --- Aşama izleme: test asılı kalırsa hangi adımda olduğu görünsün ----------
const STAGES = [];
function stage(name) {
  STAGES.push(name);
  console.log(`   · ${name}`);
}

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      // DİKKAT: Edge bir uzantı arka plan sayfası açabilir. İlk "page" tipi
      // hedefi seçmek yanlış sekmeye bağlanmaya yol açar (test sessizce asılı
      // kalırdı). Bu yüzden chrome-extension ve devtools hedefleri elenir.
      const page = list.find((t) => t.type === 'page'
        && !String(t.url || '').startsWith('chrome-extension://')
        && !String(t.url || '').startsWith('devtools://'));
      if (page) return page;
    } catch (error) { /* henüz hazır değil */ }
    await sleep(250);
  }
  throw new Error('Tarayıcı açılamadı');
}

async function goto(url) {
  // Yeni sekme açıp oraya gitmek yerine mevcut hedefi kullanır: CDP bağlantısı
  // zaten o hedefe bağlıdır.
  await send('Page.navigate', { url });
}

function send(method, params = {}) {
  return new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res?.exceptionDetails) {
    return 'SAYFA HATASI: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res?.result?.value;
}

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

// DOM elemanına metin yazar ve olayı tetikler (framework yok, değer atamak yeter).
async function fill(selector, value) {
  return evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return 'yok';
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
}

async function click(selector) {
  return evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return 'yok';
    el.click();
    return 'ok';
  })()`);
}

async function text(selector) {
  return evaluate(`(document.querySelector('${selector}') || {}).textContent || ''`);
}

async function visible(selector) {
  return evaluate(`(() => {
    const el = document.querySelector('${selector}');
    if (!el) return false;
    return getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  })()`);
}

async function main() {
  stage('tarayıcı hedefi aranıyor');
  const page = await findPage();
  stage('hedef bulundu: ' + page.id);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('websocket açılamadı'));
  });
  stage('websocket bağlandı');

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push((msg.params.args || []).map((a) => a.value).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('HATA: ' + (msg.params.exceptionDetails?.exception?.description || ''));
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // Önceki testlerden kalan oturum olmasın.
  await send('Page.navigate', { url: PAGE });
  await sleep(2500);
  await evaluate('localStorage.clear()');
  await send('Page.navigate', { url: PAGE });
  await sleep(3000);

  const stamp = Date.now();
  const email = `br-${stamp}@example.com`;
  const username = `Br${String(stamp).slice(-8)}`;

  // --- Panel varlığı ve varsayılan durum ---------------------------------
  check('hesap sekmeleri görünür', await visible('.account-tabs'));
  check('giriş paneli başlangıçta açık', await visible('#panel-login'));
  check('kayıt paneli başlangıçta gizli', !(await visible('#panel-register')));
  check('oturum şeridi görünür', await visible('#session-bar'));
  check('başlangıçta MİSAFİR etiketi', (await text('#session-badge')).includes('MİSAFİR'), await text('#session-badge'));

  // --- Sekme geçişi -------------------------------------------------------
  await click('#tab-register');
  await sleep(250);
  check('kayıt sekmesi açıldı', await visible('#panel-register'));
  check('giriş paneli kapandı', !(await visible('#panel-login')));
  check('misafir olarak devam düğmesi var', await visible('#guest-continue'));

  // --- İstemci doğrulaması (sunucuya gitmeden hata) ---------------------
  await fill('#register-username', 'ab');
  await fill('#register-email', 'gecersiz');
  await fill('#register-password', '123');
  await click('#register-submit');
  await sleep(300);
  check('kısa kullanıcı adı istemcide yakalandı', (await text('#account-message')).includes('3-15'), await text('#account-message'));

  await fill('#register-username', username);
  await click('#register-submit');
  await sleep(300);
  check('geçersiz e-posta yakalandı', (await text('#account-message')).includes('e-posta'), await text('#account-message'));

  // --- Gerçek kayıt ------------------------------------------------------
  await fill('#register-email', email);
  await fill('#register-password', 'gizli12345');
  await click('#register-submit');
  await sleep(2000);
  const afterRegister = await text('#account-message');
  check('kayıt başarılı mesajı', afterRegister.includes('oluşturuldu') || afterRegister.includes('İyi oyunlar'), afterRegister);
  check('şerit KAYITLI oldu', (await text('#session-badge')).includes('KAYITLI'), await text('#session-badge'));
  check('şeritte kullanıcı adı göründü', (await text('#session-name')).includes(username), await text('#session-name'));
  check('isim alanı hesap adıyla doldu', (await evaluate("document.getElementById('name-input').value")) === username);

  // --- Jeton saklandı mı (sayfa yenilenince oturum sürsün) --------------
  const storedToken = await evaluate("localStorage.getItem('mapex.session.token') || ''");
  check('jeton localStorage içinde', storedToken.length > 20, storedToken.slice(0, 12));

  // --- Sayfa yenileme: oturum geri gelmeli ------------------------------
  await send('Page.navigate', { url: PAGE });
  await sleep(3200);
  check('yenileme sonrası oturum KAYITLI kaldı', (await text('#session-badge')).includes('KAYITLI'), await text('#session-badge'));

  // --- Çıkış -------------------------------------------------------------
  await click('#account-signout');
  await sleep(1500);
  check('çıkış sonrası MİSAFİR', (await text('#session-badge')).includes('MİSAFİR'), await text('#session-badge'));
  check('jeton temizlendi', (await evaluate("localStorage.getItem('mapex.session.token') || ''")).length === 0);

  // --- MİSAFİR OLARAK DEVAM: oyunu başlatmalı (kritik bağımsızlık kanıtı) -
  await fill('#name-input', 'MisafirTest');
  await click('#guest-continue');
  await sleep(3000);
  check('misafir olarak devam menüyü kapattı', !(await visible('#menu-overlay')));
  const started = await evaluate(`(() => {
    const scene = window.__mapexGame && window.__mapexGame.scene.keys.MainScene;
    return scene && scene.isStarted ? 'basladi' : 'bekliyor';
  })()`);
  check('oyun misafirle başladı (hesap engel değil)', started === 'basladi', started);

  const gameSession = await evaluate(`(() => {
    const scene = window.__mapexGame && window.__mapexGame.scene.keys.MainScene;
    if (!scene || !scene.session) return 'oturum yok';
    return JSON.stringify({ kind: scene.session.kind, guest: scene.session.isGuest });
  })()`);
  check('sahne oturumu misafir tipinde', String(gameSession).includes('guest'), gameSession);

  // --- Konsol temizliği --------------------------------------------------
  const errors = logs.filter((line) => line.includes('HATA:') || line.includes('Uncaught'));
  check('konsol hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '));
}

async function finish() {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} hesap tarayıcı kontrolü geçti`);
  process.exit(passed === results.length ? 0 : 1);
}

main()
  .catch((error) => {
    console.log('  ✗ test çalıştırılamadı:', error.message);
    failedStartup = true;
  })
  .finally(() => {
    if (ws) ws.close();
    browser.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (error) { /* profil silinemezse önemli değil */ }
    // finish() process.exit çağırır; başlangıç hatasında da sonucu bildir.
    if (failedStartup) {
      console.log('\nHesap tarayıcı testi BAŞARISIZ (başlatılamadı)');
      process.exit(1);
    }
    finish();
  });