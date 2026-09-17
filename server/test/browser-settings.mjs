// Ayarlar paneli tarayıcı testi: panel gerçekten açılıyor mu, kaydırıcı gerçek
// fare sürüklemesiyle çalışıyor mu, tuş ataması kaydediliyor mu ve ESC pause
// menüsüyle çakışmıyor mu? Edge/Chrome CDP ile çalışır:
//   node test/browser-settings.mjs        (sunucu 3019'da çalışıyor olmalı)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.BROWSER_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.BASE_URL || 'http://localhost:3019/index.html';
const PORT = 9335;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mapex-sets-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const pending = new Map();
const logs = [];
let ws = null;
let id = 0;

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (error) { /* henüz hazır değil */ }
    await sleep(250);
  }
  throw new Error('Tarayıcı açılamadı');
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
  if (res?.exceptionDetails) return 'SAYFA HATASI: ' + res.exceptionDetails.text;
  return res?.result?.value;
}

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

async function press(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
}

async function release(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

async function click(x, y) {
  await press(x, y);
  await release(x, y);
}

// Basılı tutarak sürükleme: Phaser sürüklemeyi pointermove ile izler, bu yüzden
// aradaki hareketler bırakılmadan gönderilir.
async function dragTo(from, to, steps = 6) {
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(40);
  }
}

async function pressKey(key, code, vk) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

// Paneli aç: PauseMenu'nün "Settings" akışıyla aynı yol izlenir.
async function openPanelViaMenu() {
  return evaluate(`(() => {
    const scene = window.__mapexGame.scene.keys.MainScene;
    scene.settingsPanel.openPanel(() => scene.pauseMenu.toggle());
    const s = scene.settingsPanel;
    return JSON.stringify({
      open: s.open,
      settingsOpen: scene.settingsOpen,
      keyRows: Object.keys(s.keyButtons).length
    });
  })()`);
}

const page = await findPage();
ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push('[HATA] ' + (d.exception?.description || d.text));
  }
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: PAGE });
await sleep(7000);

// Önceki oturumdan kalan ayar olmasın: varsayılanlarla başla.
await evaluate("localStorage.removeItem('mapex.settings.v1'); 'temizlendi'");
await evaluate("document.getElementById('name-submit').click(); 'tiklandi'");
await sleep(2500);

const opened = await openPanelViaMenu();
check('panel aciliyor', String(opened).includes('"open":true'), String(opened));
check('oyun durduruluyor (settingsOpen)', String(opened).includes('"settingsOpen":true'), String(opened));
check('alti tus satiri var (4 oyun + 2 sohbet)', String(opened).includes('"keyRows":6'), String(opened));

// Panel ölçüleri MainScene tuvaline göre istemci koordinatına çevrilir.
const geom = JSON.parse(await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const cw = scene.cameras.main.width, ch = scene.cameras.main.height;
  const b = scene.scale.canvasBounds;
  return JSON.stringify({ cw, ch, bx: b.x, by: b.y, bw: b.width, bh: b.height });
})()`));
const toClient = (gx, gy) => ({
  x: geom.bx + gx * (geom.bw / geom.cw),
  y: geom.by + gy * (geom.bh / geom.ch)
});

// Kaydırıcı yeri: panel üstü + 84 satırı, ray panel ortasının 20px sağında.
const trackLeft = geom.cw / 2 - 90;
const trackY = geom.ch / 2 - 143;
const start = toClient(trackLeft + 220 * 0.5, trackY);
const target = toClient(trackLeft + 220 * 0.8, trackY);

await press(start.x, start.y);
await dragTo(start, target);
await release(target.x, target.y);
await sleep(150);

const afterDrag = JSON.parse(await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const saved = JSON.parse(localStorage.getItem('mapex.settings.v1') || '{}');
  return JSON.stringify({
    master: saved.masterVolume,
    gain: scene.sfx.masterGain ? scene.sfx.masterGain.gain.value : null
  });
})()`));
check('kaydirici suruklemeyle %80 oldu', Math.abs(afterDrag.master - 0.8) < 0.05, afterDrag.master);
check('ana ses canli uygulandi', Math.abs(afterDrag.gain - 0.8) < 0.05, afterDrag.gain);

// Tuş atama: gerçek tıkla, sonra gerçek P tuşuna bas.
// Buton konumu sahneden okunur: panel düzeni değişse de test kaymaz.
const keyBtnProbe = JSON.parse(await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const refs = scene.settingsPanel.keyButtons.pickup;
  return JSON.stringify({ x: refs.btn.x, y: refs.btn.y });
})()`));
const keyBtn = toClient(keyBtnProbe.x, keyBtnProbe.y);
await click(keyBtn.x, keyBtn.y);
await sleep(120);
const listening = await evaluate("String(window.__mapexGame.scene.keys.MainScene.settingsPanel.listeningAction)");
check('butona tiklayinca tus bekleniyor', listening === 'pickup', listening);

await pressKey('p', 'KeyP', 80);
await sleep(150);
const bound = JSON.parse(await evaluate(`(() => {
  const saved = JSON.parse(localStorage.getItem('mapex.settings.v1') || '{}');
  return JSON.stringify({ pickup: saved.keys ? saved.keys.pickup : null });
})()`));
check('yeni tus kaydedildi', bound.pickup === 'P', bound.pickup);

// ESC: panel kapanmalı, pause menüsü açılmalı (aynı tuş iki kez işlenmemeli).
const beforeEsc = JSON.parse(await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  return JSON.stringify({ panelOpen: scene.settingsPanel.open, menu: scene.pauseMenu.isOpen });
})()`));
await pressKey('Escape', 'Escape', 27);
await sleep(400);
const afterEsc = JSON.parse(await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  return JSON.stringify({
    panelOpen: scene.settingsPanel.open,
    settingsOpen: scene.settingsOpen,
    menu: scene.pauseMenu.isOpen
  });
})()`));
check('ESC paneli kapatti', afterEsc.panelOpen === false && afterEsc.settingsOpen === false,
  `once panel=${beforeEsc.panelOpen} menu=${beforeEsc.menu} | sonra ${JSON.stringify(afterEsc)}`);
check('ESC sonrasi pause menusu acildi', afterEsc.menu === true, JSON.stringify(afterEsc));
check('panel kapaninca oyun devam ediyor', afterEsc.settingsOpen === false, JSON.stringify(afterEsc));

// Pause menüsü de ESC ile kapanabiliyor mu (çakışma tamamen bitti mi)?
await sleep(250);
await pressKey('Escape', 'Escape', 27);
await sleep(300);
const menuAfter = await evaluate("String(window.__mapexGame.scene.keys.MainScene.pauseMenu.isOpen)");
check('ESC menusu de kapaniyor', menuAfter === 'false', menuAfter);

const errors = logs.filter((l) => l.startsWith('[HATA]'));
check('konsol hatasi yok', errors.length === 0, errors.join(' | ').slice(0, 400));

ws.close();
browser.kill();
// Tarayıcı profili kapanırken kısa süre kilitli kalabiliyor (Windows): temizlik
// başarısız olsa da test sonucu değişmez.
await sleep(1500);
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch (error) {
  // profil klasörü silinemedi: sonucu etkilemez.
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tarayıcı kontrolü geçti`);
if (failed.length) {
  console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
  console.log('--- konsol ---');
  for (const line of logs) console.log(line);
  process.exit(1);
}
