// Tarayıcı duman testi: oyun açılıyor mu, envanter ikonları görünüyor mu,
// uzaktan gelen ağaç kaldırma ve sarı kesme barı işleniyor mu?
// Edge/Chrome CDP ile çalışır:  node test/browser-smoke.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.BROWSER_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.BASE_URL || 'http://localhost:3019/index.html';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mapex-cdp-'));
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
  return res?.result?.value;
}

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    logs.push(`[${msg.params.type}] ${text}`);
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

// 1. Sahneler yüklendi mi?
const sceneKeys = await evaluate(
  "(window.__mapexGame && window.__mapexGame.scene.keys) ? Object.keys(window.__mapexGame.scene.keys).join(',') : 'yok'"
);
check('Phaser sahneleri yüklendi', String(sceneKeys).includes('MainScene'), String(sceneKeys));

// 2. Menüden oyuna gir ve envanter durumunu yerleştir.
await evaluate("document.getElementById('name-submit').click(); 'tiklandi'");
await sleep(2500);

const probe = await evaluate(`(() => {
  const g = window.__mapexGame;
  if (!g) return 'game yok';
  const scene = g.scene.keys.MainScene;
  if (!scene || !scene.inventory) return 'inventory yok';
  scene.inventory.applyState([{ itemId: 'stone', count: 5 }, { itemId: 'wood', count: 2 }]);
  scene.refreshUi();
  const slot = scene.inventoryView.hotbar.slots[0];
  return JSON.stringify({
    itemCount: scene.inventoryUi.items().length,
    iconStone: scene.inventoryView.iconOf('stone'),
    slotVisible: slot.icon.visible,
    slotTexture: slot.icon.texture ? slot.icon.texture.key : null,
    slotWidth: Math.round(slot.icon.displayWidth)
  });
})()`);
const parsed = String(probe).includes('{') ? JSON.parse(String(probe)) : null;
check('envanter ikonu cozuldu', Boolean(parsed && parsed.iconStone), String(probe));
check('hotbar slotu gorunur', Boolean(parsed && parsed.slotVisible), String(probe));
check('hotbar ikonu dogru doku', Boolean(parsed && parsed.slotTexture === 'assets/Objects/Stone/1.png'),
  parsed ? String(parsed.slotTexture) : String(probe));
check('hotbar ikonu olcekli (sifir degil)', Boolean(parsed && parsed.slotWidth > 0),
  parsed ? 'w=' + parsed.slotWidth : String(probe));

// 3. Envanter penceresi: ikon + isim + adet görünüyor mu?
const winProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  scene.toggleInventory();
  const view = scene.inventoryView;
  if (!view.window) return 'pencere yok';
  const cell = view.window.cells[0];
  return JSON.stringify({
    open: view.isOpen,
    iconVisible: cell.icon.visible,
    iconTexture: cell.icon.texture ? cell.icon.texture.key : null,
    label: cell.label.text,
    count: cell.countText.text
  });
})()`);
check('envanter penceresi dolu gorunuyor', String(winProbe).includes('"open":true'), String(winProbe));
check('pencere hucresinde isim var', String(winProbe).includes('"label":"Ta'), String(winProbe));
check('pencere hucresinde adet var', /"count":"\d+"/.test(String(winProbe)), String(winProbe));

// 4. Uzak nesne kaldırma: görsel siliniyor mu?
const remoteProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const layer = scene.layer;
  let targetId = null;
  for (const rec of layer.all()) { if (rec.type === 'tree') { targetId = rec.id; break; } }
  if (!targetId) return 'agac yok';
  scene.handleRemoteObjectRemoved('tree', targetId);
  return JSON.stringify({
    targetId,
    stillThere: Boolean(layer.get(targetId)),
    markedRemoved: scene.removedByKind.tree ? scene.removedByKind.tree.has(targetId) : false
  });
})()`);
check('uzak agac gorseli silindi', String(remoteProbe).includes('"stillThere":false'), String(remoteProbe));
check('silinen agac kalici isaretlendi', String(remoteProbe).includes('"markedRemoved":true'), String(remoteProbe));

// 5. Uzak kesme barı (sarı) çiziliyor mu?
const barProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  if (!scene.network || !scene.network.addRemotePlayer) return 'network yok';
  scene.network.addRemotePlayer({ id: 'test-remote', x: 100, y: 120, name: 'Test', char: 1 });
  const remote = scene.network.remotePlayers.get('test-remote');
  if (!remote) return 'remote yok';
  remote.setServerPosition(100, 120, false, 2, { id: 'tree:0,0:1', progress: 0.5, x: 130, y: 150 });
  remote.interpolate();
  const cmd = remote.holdBar.commandBuffer ? remote.holdBar.commandBuffer.length : -1;
  return JSON.stringify({ barExists: Boolean(remote.holdBar), visible: remote.holdBar.visible, commands: cmd });
})()`);
check('uzak kesme bari cizildi', String(barProbe).includes('"visible":true'), String(barProbe));

const errors = logs.filter((l) => l.startsWith('[HATA]'));
check('konsol hatasi yok', errors.length === 0, errors.join(' | ').slice(0, 300));

ws.close();
browser.kill();
fs.rmSync(profile, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tarayıcı kontrolü geçti`);
if (failed.length) {
  console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
  console.log('--- konsol ---');
  for (const line of logs) console.log(line);
  process.exit(1);
}