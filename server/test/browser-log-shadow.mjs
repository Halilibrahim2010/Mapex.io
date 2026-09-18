// Tarayıcı testi: kütük nesnesi ve gölge efektleri gerçekten çiziliyor mu?
// Edge/Chrome CDP ile çalışır:  node test/browser-log-shadow.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.BROWSER_PATH
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PAGE = process.env.BASE_URL || 'http://localhost:3019/index.html';
const PORT = 9341;
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
      // Uzantı/devtools sayfaları elenir: yanlış hedefe bağlanmak testi asardı.
      const page = list.find((t) => t.type === 'page'
        && !String(t.url || '').startsWith('chrome-extension://')
        && !String(t.url || '').startsWith('devtools://'));
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

// Oyuna gir: nesne katmanı dolsun.
await evaluate("document.getElementById('name-submit').click(); 'tiklandi'");
await sleep(2500);

// --- 1. Gölge asset'leri Phaser cache'ine yüklendi mi? --------------------
// Kullanılan gölgeler yüklenir; 1..6 arası mevcut olanları sayarız.
const textures = await evaluate(`(() => {
  const g = window.__mapexGame;
  if (!g || !g.textures) return 'textures yok';
  const found = [];
  for (let n = 1; n <= 6; n++) {
    if (g.textures.exists('assets/Objects/Shadow/' + n + '.png')) found.push(n);
  }
  return JSON.stringify({ found, total: found.length });
})()`);
const shadowLoaded = String(textures).includes('{') ? JSON.parse(String(textures)) : { total: 0 };
check('kullanılan gölge assetleri yüklendi', shadowLoaded.total >= 4, String(textures));
check('en küçük ve en büyük gölge yüklü', String(textures).includes('1')
  && String(textures).includes('6'), String(textures));

// --- 2. Kütük dokuları yüklendi mi? -------------------------------------
const logTex = await evaluate(`(() => {
  const g = window.__mapexGame;
  const found = [];
  for (let n = 1; n <= 4; n++) {
    if (g.textures.exists('assets/Objects/Decor/Log' + n + '.png')) found.push(n);
  }
  return JSON.stringify({ found });
})()`);
check('4 kütük dokusu yüklendi', String(logTex).includes('[1,2,3,4]'), String(logTex));

// --- 3. Kütük nesnesi dünyada üretiliyor mu? ----------------------------
const logProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const gen = scene.generator;
  let total = 0;
  const variants = new Set();
  for (let cx = -2; cx <= 2; cx++) {
    for (let cy = -2; cy <= 2; cy++) {
      const perType = gen.generateObjects(cx, cy);
      for (const item of perType.log || []) {
        total++;
        variants.add(String(item.texture).split('/').pop());
      }
    }
  }
  return JSON.stringify({ total, variants: Array.from(variants).sort() });
})()`);
check('kütük dünyada üretiliyor', /"total":[1-9]/.test(String(logProbe)), String(logProbe));
check('kütük birden fazla görselle üretiliyor', /Log[2-4]\.png/.test(String(logProbe)),
  String(logProbe));
// --- 4. Gölge gerçekten çiziliyor mu? (kütük, ağaç, kaya, taş) ----------
const shadowProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const out = {};
  for (const rec of scene.layer.all()) {
    if (out[rec.type]) continue;
    out[rec.type] = {
      hasShadow: Boolean(rec.shadow),
      texture: rec.shadow && rec.shadow.texture ? rec.shadow.texture.key : null,
      depth: rec.shadow ? rec.shadow.depth : null,
      spriteDepth: rec.sprite ? rec.sprite.depth : null,
      alpha: rec.shadow ? Number(rec.shadow.alpha.toFixed(2)) : null
    };
  }
  return JSON.stringify(out);
})()`);
const shadowData = String(shadowProbe).includes('{') ? JSON.parse(String(shadowProbe)) : {};
for (const kind of ['log', 'tree', 'rock', 'stone']) {
  check(`${kind} nesnesinde gölge var`, Boolean(shadowData[kind] && shadowData[kind].hasShadow),
    JSON.stringify(shadowData[kind]));
}
check('gölge dokusu Shadow klasöründen',
  Object.values(shadowData).every((s) => !s.hasShadow || String(s.texture).includes('/Shadow/')),
  Object.values(shadowData).map((s) => s.texture).join(', '));

// Gölge her zaman nesnenin bir alt katmanında olmalı (arkada kalsın).
const allBehind = Object.values(shadowData).every((s) => !s.hasShadow || s.depth < s.spriteDepth);
check('gölge nesnenin arkasında çiziliyor', allBehind,
  Object.entries(shadowData).map(([k, v]) => `${k}:${v.depth}<${v.spriteDepth}`).join(' '));

// --- 5. Kütük ağaçtan %30 hızlı kırılıyor mu? (veriden okunur) ----------
const holdProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const defs = scene.layer.types;
  return JSON.stringify({
    tree: defs.tree.harvest.holdTime,
    log: defs.log.harvest.holdTime,
    ratio: Number((defs.log.harvest.holdTime / defs.tree.harvest.holdTime).toFixed(3))
  });
})()`);
check('kütük hold süresi ağacın %70 i', String(holdProbe).includes('"ratio":0.7'), String(holdProbe));

// --- 6. Kütük kesme etkileşimi tanınıyor mu? ----------------------------
const chopProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  let logRec = null;
  for (const rec of scene.layer.all()) { if (rec.type === 'log') { logRec = rec; break; } }
  if (!logRec) return 'kutuk yok';
  return JSON.stringify({
    harvestable: logRec.harvestable,
    pickable: logRec.pickable,
    dropItem: logRec.def.drop ? logRec.def.drop.itemId : null,
    collider: Boolean(logRec.def.sprite.collider)
  });
})()`);
check('kütük kırılabilir olarak işaretli', String(chopProbe).includes('"harvestable":true'), String(chopProbe));
check('kütük odun düşürür', String(chopProbe).includes('"dropItem":"wood"'), String(chopProbe));
check('kütük toplanabilir değil (kırılır)', String(chopProbe).includes('"pickable":false')
  || !String(chopProbe).includes('"pickable":true'), String(chopProbe));

// --- 7. Kütüğün vuruş alanı gerçekten isabet ettiriyor mu? --------------
const hitProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const layer = scene.layer;
  let logRec = null;
  for (const rec of layer.all()) { if (rec.type === 'log') { logRec = rec; break; } }
  if (!logRec) return 'kutuk yok';
  const hit = layer.pick(logRec.data.x, logRec.data.y, (r) => r.harvestable);
  const far = layer.pick(logRec.data.x + 900, logRec.data.y, (r) => r.harvestable);
  return JSON.stringify({
    isLog: hit ? hit.type === 'log' : false,
    farMiss: far === null
  });
})()`);
check('kütük vuruş alanı isabetli', String(hitProbe).includes('"isLog":true'), String(hitProbe));
check('uzak noktada isabet yok', String(hitProbe).includes('"farMiss":true'), String(hitProbe));

// --- 8. Kesilen kütüğün gölgesi de temizleniyor mu? ---------------------
// Gölge sprite'ı destroy edilirse Phaser display listesinden ÇIKAR.
// Sayarak doğruluyoruz: sızıntı (hayalet gölge) olmamalı.
const cleanupProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const layer = scene.layer;
  let logRec = null;
  for (const rec of layer.all()) { if (rec.type === 'log') { logRec = rec; break; } }
  if (!logRec || !logRec.shadow) return 'kutuk/golge yok';
  const before = scene.children.list.length;
  scene.handleRemoteObjectRemoved('log', logRec.id);
  const after = scene.children.list.length;
  return JSON.stringify({
    recordGone: !layer.get(logRec.id),
    removedSprites: before - after,
    // Nesne + gölge = 2 sprite silinmeli.
    shadowCleaned: before - after >= 2
  });
})()`);
check('kesilen kütük kaydı silindi', String(cleanupProbe).includes('"recordGone":true'), String(cleanupProbe));
check('kesilen kütüğün gölgesi de silindi', String(cleanupProbe).includes('"shadowCleaned":true'),
  String(cleanupProbe));

// --- 9. Hizalama: gölge nesnenin AYAĞINDA mı, collider doğru yerde mi? ---
// Ölçüt: gölge merkezi, sprite'ın görsel tabanına collider'ın üst kenarına
// yakın olmalı. Bu, "gölge olduğundan aşağıda" hatasını yakalar.
const alignProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const out = {};
  for (const rec of scene.layer.all()) {
    if (out[rec.type]) continue;
    const s = rec.def.sprite;
    let visualBottom = null;
    if (rec.sprite) {
      const scaleY = s.scale || 1;
      const dispH = s.display ? scene.TILE_SIZE * s.display : rec.sprite.height * scaleY;
      const gap = s.textureBottomGap || 0;
      visualBottom = rec.sprite.y + dispH / 2 - gap;
    }
    out[rec.type] = {
      groundY: rec.groundY,
      spriteY: rec.sprite ? rec.sprite.y : null,
      shadowY: rec.shadow ? rec.shadow.y : null,
      collider: scene.layer.colliders.get(rec.id) || null,
      displayH: s.display ? scene.TILE_SIZE * s.display : null
    };
  }
  return JSON.stringify(out);
})()`);
const alignData = String(alignProbe).includes('{') ? JSON.parse(String(alignProbe)) : {};

for (const kind of ['rock', 'tree', 'log']) {
  const a = alignData[kind];
  if (!a) continue;
  // Gölge yer çizgisinden en fazla ~6px sapmalı (offsetY=0 verildi).
  const shadowOk = a.shadowY !== null && Math.abs(a.shadowY - a.groundY) <= 6;
  check(`${kind} gölgesi ayak hizasında`, shadowOk,
    `golgeY=${a.shadowY} groundY=${a.groundY}`);
  // Çarpışma kutusu yere basmalı: alt kenarı yer çizgisine eşit.
  const bottom = a.collider ? a.collider.y + a.collider.h : null;
  const colliderOk = a.collider && Math.abs(bottom - a.groundY) <= 1;
  check(`${kind} collider zemine basıyor`, Boolean(colliderOk),
    `collider alt=${bottom} groundY=${a.groundY}`);
  // Collider havada olmamalı: yer çizgisinden yukarıda ve makul boyutta.
  const sizeOk = a.collider && a.collider.h > 6 && a.collider.h <= 30 && a.collider.w > 10;
  check(`${kind} collider boyutu makul`, Boolean(sizeOk),
    a.collider ? `${Math.round(a.collider.w)}x${Math.round(a.collider.h)}` : 'yok');
}

// Ağaç gölgesi 6.png olmalı (en büyük leke).
check('ağaç gölgesi 6.png kullanıyor',
  Boolean(alignData.tree) && String(shadowData.tree?.texture).endsWith('/6.png'),
  String(shadowData.tree?.texture));

// Gölge, nesnenin görsel tabanından AŞAĞIYA kaymamalı (bildirilen hata).
const treeAlign = alignData.tree;
if (treeAlign && treeAlign.spriteY !== null) {
  const shifted = treeAlign.shadowY - treeAlign.groundY;
  check('ağaç gölgesi aşağı kaymıyor', shifted <= 6, `kayma=${shifted}px`);
}

// --- 10. KRİTİK: collider oyuncuyu gerçekten durduruyor mu? -------------
// Çarpışma çözümü, kayanın içine giren oyuncuyu dışarı itmeli. Kutu "havada"
// olsaydı oyuncu kayanın içinden geçerdi; bu test onu yakalar.
const blockProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const layer = scene.layer;
  let rock = null;
  for (const rec of layer.all()) { if (rec.type === 'rock') { rock = rec; break; } }
  if (!rock) return 'kaya yok';
  const rect = layer.colliders.get(rock.id);
  if (!rect) return 'collider yok';
  // Oyuncuyu kutunun tam merkezine koy (FEET_OFFSET = 34).
  const FEET = 34;
  scene.player.x = rect.x + rect.w / 2;
  scene.player.y = rect.y + rect.h / 2 - FEET;
  const insideBefore = scene.player.x > rect.x && scene.player.x < rect.x + rect.w
    && (scene.player.y + FEET) > rect.y && (scene.player.y + FEET) < rect.y + rect.h;
  scene.interactions.resolveCollisions();
  const feetY = scene.player.y + FEET;
  const stillInside = scene.player.x > rect.x && scene.player.x < rect.x + rect.w
    && feetY > rect.y && feetY < rect.y + rect.h;
  return JSON.stringify({ insideBefore, stillInside, rect });
})()`);
check('oyuncu kayanın içindeyken dışarı itiliyor',
  String(blockProbe).includes('"insideBefore":true') && String(blockProbe).includes('"stillInside":false'),
  String(blockProbe));

// Ağaç da geçilmez olmalı: aynı kontrol.
const treeBlockProbe = await evaluate(`(() => {
  const scene = window.__mapexGame.scene.keys.MainScene;
  const layer = scene.layer;
  let tree = null;
  for (const rec of layer.all()) { if (rec.type === 'tree') { tree = rec; break; } }
  if (!tree) return 'agac yok';
  const rect = layer.colliders.get(tree.id);
  if (!rect) return 'collider yok';
  const FEET = 34;
  scene.player.x = rect.x + rect.w / 2;
  scene.player.y = rect.y + rect.h / 2 - FEET;
  scene.interactions.resolveCollisions();
  const feetY = scene.player.y + FEET;
  const stillInside = scene.player.x > rect.x && scene.player.x < rect.x + rect.w
    && feetY > rect.y && feetY < rect.y + rect.h;
  return JSON.stringify({ stillInside });
})()`);
check('ağaç gövdesi de geçilemez', String(treeBlockProbe).includes('"stillInside":false'),
  String(treeBlockProbe));

const errors = logs.filter((l) => l.startsWith('[HATA]'));
check('konsol hatası yok', errors.length === 0, errors.join(' | ').slice(0, 300));

ws.close();
browser.kill();
await sleep(1500);
try {
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch (error) {
  // profil klasörü silinemedi: sonucu etkilemez.
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kütük+gölge kontrolü geçti`);
if (failed.length) {
  console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
  console.log('--- konsol ---');
  for (const line of logs) console.log(line);
  process.exit(1);
}