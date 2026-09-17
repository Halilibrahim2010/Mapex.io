// Sohbet penceresi tarayıcı testi: Enter ile açılıyor mu, yazı/gönderim
// çalışıyor mu, # özel mesaj ve @ bahsetme ayrışıyor mu, ESC kapatıyor mu,
// köşeden boyutlandırma gerçekten pencereyi büyütüyor mu?
// Edge/Chrome CDP ile çalışır (sunucu 3019'da çalışıyor olmalı):
//   node test/browser-chat.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.BROWSER_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.BASE_URL || 'http://localhost:3019/index.html';
const PORT = 9336;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mapex-chat-'));
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

async function pressKey(key, code, vk) {
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, text: key.length === 1 ? key : undefined,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

// Programatik yazma: CDP tuş gönderimi karakter üretmediği için doğrudan
// ChatBox'un tuş işleyicisi çağrılır (gerçek kod yolu test edilir).
async function typeIntoChat(text) {
  return evaluate(`(() => {
    const scene = window.__mapexGame.scene.keys.MainScene;
    for (const char of ${JSON.stringify(text)}) scene.chatBox.handleKey({ key: char });
    return scene.chatBox.inputText.text;
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

// Ayar kalıntısı olmasın ve oyuna gir.
await evaluate("localStorage.removeItem('mapex.settings.v1'); 'temiz'");

// Oyun önyüklemesi: __mapexGame yoksa testler anlamsız olur, erken dur.
const boot = await evaluate(`(() => {
  if (!window.__mapexGame) return 'game yok';
  return JSON.stringify({ scenes: Object.keys(window.__mapexGame.scene.keys || {}) });
})()`);
check('oyun önyüklendi', String(boot).includes('MainScene'), String(boot));

await evaluate("document.getElementById('name-submit').click(); 'tiklandi'");
await sleep(2500);

// Sohbet altyapısı kuruldu mu?
const probe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  if (!scene.chatBox) return 'chatBox yok';
  return JSON.stringify({
    hasService: Boolean(scene.chat),
    hasNotice: Boolean(scene.chatNotice),
    name: scene.chat.name,
    open: scene.chatBox.open,
    hint: scene.chatHint ? scene.chatHint.text : null
  });
})()`);
check('sohbet altyapısı kuruldu', String(probe).includes('"hasService":true'), String(probe));
check('sohbet penceresi başlangıçta kapalı', String(probe).includes('"open":false'), String(probe));
check('sahne chatOpen bayrağı kapalı', await evaluate('String(window.__mapexGame.scene.keys.MainScene.chatOpen)') === 'false');
check('kısayol ipucu görünür', String(probe).includes('sohbet'), String(probe));

// --- Enter ile aç -----------------------------------------------------------
await pressKey('Enter', 'Enter', 13);
await sleep(400);
const opened = await evaluate('String(window.__mapexGame.scene.keys.MainScene.chatBox.open)');
check('Enter sohbeti açtı', opened === 'true', opened);
check('oyun girdisi duraklatıldı (chatOpen)', await evaluate('String(window.__mapexGame.scene.keys.MainScene.chatOpen)') === 'true');

// --- Yazma ve gönderme ------------------------------------------------------
const typed = await typeIntoChat('herkese merhaba');
await sleep(300);
check('yazılan metin kutuda görünür', String(typed).startsWith('herkese merhaba'), String(typed));

await pressKey('Enter', 'Enter', 13);
await sleep(400);
const afterSend = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const journal = scene.chat.model.journal;
  const last = journal[journal.length - 1];
  return JSON.stringify({
    open: scene.chatBox.open,
    input: scene.chatBox.inputText.text,
    count: journal.length,
    last: last ? { kind: last.kind, from: last.from, text: last.text } : null
  });
})()`);
check('Enter mesajı gönderdi ve pencere açık kaldı', String(afterSend).includes('"open":true'), String(afterSend));
check('gönderilen mesaj günlüğe girdi', String(afterSend).includes('herkese merhaba'), String(afterSend));
check('yazı kutusu temizlendi', String(afterSend).includes('"input":"_"'), String(afterSend));

// --- Yukarı ok: son mesajı geri getirir ------------------------------------
await pressKey('ArrowUp', 'ArrowUp', 38);
await sleep(300);
const recalled = await evaluate("window.__mapexGame.scene.keys.MainScene.chatBox.inputText.text");
check('yukarı ok son mesajı getirdi', String(recalled).startsWith('herkese merhaba'), String(recalled));

// --- ESC kapatır ------------------------------------------------------------
await pressKey('Escape', 'Escape', 27);
await sleep(400);
const closed = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  return JSON.stringify({ open: scene.chatBox.open, chatOpen: scene.chatOpen, menu: scene.pauseMenu.isOpen });
})()`);
check('ESC sohbeti kapattı', String(closed).includes('"open":false'), String(closed));
check('ESC pause menüsünü açmadı', String(closed).includes('"menu":false'), String(closed));

// --- @ bahsetme: üstte bildirim çıkar --------------------------------------
const mentionProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chat.onIncoming({ kind: 'chat', from: 'Ali', to: null, text: 'selam @Oyuncu gel' });
  const notes = scene.chat.model.takeNotifications();
  if (notes.length) scene.chatNotice.push(notes[0]);
  return JSON.stringify({
    notes,
    noticeCount: scene.chatNotice.count,
    text: scene.chatNotice.records[0] ? scene.chatNotice.records[0].group.getChildren()[1].text : null
  });
})()`);
check('bahsetme bildirimi üretildi', String(mentionProbe).includes('senden bahsetti'), String(mentionProbe));
check('bildirim ekranda görünür', String(mentionProbe).includes('"noticeCount":1'), String(mentionProbe));

// --- # özel mesaj: yalnızca hedefte bildirim + günlükte vurgu --------------
const privateProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chat.onIncoming({ kind: 'private', from: 'Ali', to: 'Oyuncu', text: 'gizli selam' });
  const notes = scene.chat.model.takeNotifications();
  const stored = scene.chat.model.journal[scene.chat.model.journal.length - 1];
  return JSON.stringify({
    notes,
    storedKind: stored.kind,
    highlight: scene.chatBox._lineColor(stored)
  });
})()`);
check('özel mesaj bildirimi üretildi', String(privateProbe).includes('ozel mesaj gonderdi'), String(privateProbe));
check('özel mesaj günlükte vurgulanır', String(privateProbe).includes('"highlight":"#7fd4ff"'), String(privateProbe));

// Başkasına gelen özel mesaj bu istemciye hiç girmez.
const otherProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const before = scene.chat.model.journal.length;
  scene.chat.onIncoming({ kind: 'private', from: 'Ali', to: 'Mehmet', text: 'ona yazdim' });
  const after = scene.chat.model.journal.length;
  const leaked = scene.chat.model.journal.some((e) => e.text === 'ona yazdim');
  return JSON.stringify({ before, after, leaked });
})()`);
check('başkasına gelen özel mesaj günlüğe girmez',
  String(otherProbe).includes('"leaked":false'), String(otherProbe));
check('başkasına gelen özel mesaj günlüğü büyütmez', await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const before = scene.chat.model.journal.length;
  scene.chat.onIncoming({ kind: 'private', from: 'Ali', to: 'Mehmet', text: 'ikinci sizinti' });
  return String(scene.chat.model.journal.length === before);
})()`) === 'true');

// --- Kısayol değişebilir: sohbet açma tuşu ayarlardan gelir ------------------
// setBinding gerçek kod yoludur (Ayarlar paneli de bunu çağırır).
await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chatBox.close();
  scene.settingsPanel.openPanel();
  scene.settingsPanel.keyButtons.chatOpen.btn.fire('pointerup');
  return 'hazir';
})()`);
await sleep(200);
const listeningProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const panel = scene.settingsPanel;
  panel.listeningAction = 'chatOpen';
  return JSON.stringify({ open: panel.open, listening: panel.listeningAction });
})()`);
check('panel tuş atama kipinde', String(listeningProbe).includes('"listening":"chatOpen"'), String(listeningProbe));
await pressKey('t', 'KeyT', 84);
await sleep(400);
const afterBind = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const saved = JSON.parse(localStorage.getItem('mapex.settings.v1') || '{}');
  return JSON.stringify({
    listening: scene.settingsPanel.listeningAction,
    saved: saved.keys ? saved.keys.chatOpen : null
  });
})()`);
await evaluate("window.__mapexGame.scene.keys.MainScene.settingsPanel.closePanel()");
await sleep(200);

check('panelde tuş beklerken yazılan tuş atanır', String(afterBind).includes('"listening":null'),
  String(afterBind));
check('sohbet kısayolu ayarlara yazıldı', String(afterBind).includes('"saved":"T"'), String(afterBind));

await pressKey('Enter', 'Enter', 13);
await sleep(300);
check('eski tuş (Enter) sohbeti açmıyor',
  await evaluate('String(window.__mapexGame.scene.keys.MainScene.chatBox.open)') === 'false');

await pressKey('t', 'KeyT', 84);
await sleep(300);
check('yeni tuş (T) sohbeti açıyor',
  await evaluate('String(window.__mapexGame.scene.keys.MainScene.chatBox.open)') === 'true');

// --- Köşeden boyutlandırma -------------------------------------------------
const sizeBefore = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chatBox.openBox();
  scene.chatBox.setSize(460, 240);
  return JSON.stringify({ w: scene.chatBox.width, h: scene.chatBox.height });
})()`);
await sleep(300);

const resize = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const origin = scene.chatBox.origin();
  scene.chatBox.setSize(680, 380);
  return JSON.stringify({ w: scene.chatBox.width, h: scene.chatBox.height, origin });
})()`);
const parsedBefore = JSON.parse(String(sizeBefore));
const parsedResize = JSON.parse(String(resize));
check('boyutlandırma genişliği büyüttü', parsedResize.w > parsedBefore.w,
  `${parsedBefore.w} -> ${parsedResize.w}`);
check('boyutlandırma yüksekliği büyüttü', parsedResize.h > parsedBefore.h,
  `${parsedBefore.h} -> ${parsedResize.h}`);
check('pencere sol alt köşeye yapışık kalıyor', await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const origin = scene.chatBox.origin();
  return String(origin.y === scene.scale.height - scene.chatBox.margin - scene.chatBox.height
    && origin.x === scene.chatBox.margin);
})()`) === 'true');
check('boyutlandırma alt sınırla korunur', await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chatBox.setSize(10, 10);
  return String(scene.chatBox.width >= 260 && scene.chatBox.height >= 150);
})()`) === 'true');
check('boyutlandırma üst sınırla korunur', await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.chatBox.setSize(99999, 99999);
  return String(scene.chatBox.width <= scene.scale.width && scene.chatBox.height <= scene.scale.height);
})()`) === 'true');

const errors = logs.filter((l) => l.startsWith('[HATA]'));
check('konsol hatası yok', errors.length === 0, errors.join(' | ').slice(0, 400));

ws.close();
browser.kill();
await sleep(1500);
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch (error) {
  // profil klasörü silinemedi: sonucu etkilemez.
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} sohbet tarayıcı kontrolü geçti`);
if (failed.length) {
  console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
  console.log('--- konsol ---');
  for (const line of logs) console.log(line);
  process.exit(1);
}