// Uçtan uca: ağaç kesme → 1-3 odun düşer → toplanır → envantere girer.
// Ayrıca animasyon durumunun (idle/walk/chop) karşı tarafa doğru geçtiği
// doğrulanır. Sunucu 12090 portunda çalışıyor olmalı.
import { io } from 'socket.io-client';

const URL = 'http://localhost:12090';
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

function connect(name) {
  return new Promise((resolve) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const events = { playerMoved: [], dropsSpawned: [], inventoryState: [], objectRemoved: [] };
    for (const key of Object.keys(events)) socket.on(key, (data) => events[key].push(data));
    socket.on('connect', () => {
      // trackerId artık kullanılmıyor: envanter kimliğini sunucu, oturumun
      // storageKey'inden üretir (misafirde oturuma özel, kayıtlıda kullanıcı kimliği).
      socket.emit('hello', { name, char: 1 });
      setTimeout(() => resolve({ socket, events }), 400);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const woodCount = (state) =>
  (state.slots || []).filter((s) => s && s.itemId === 'wood').reduce((a, s) => a + s.count, 0);

async function main() {
  const a = await connect('TestA');
  const b = await connect('TestB');
  check('iki oyuncu bağlandı', a.socket.connected && b.socket.connected);

  // --- 1. Animasyon senkronu: A yürür, B aynı animasyonu görür ---
  a.events.playerMoved.length = 0; b.events.playerMoved.length = 0;
  a.socket.emit('playerMove', { x: 100, y: 100, facingLeft: false, anim: 1 });
  await sleep(200);
  const walkSeen = b.events.playerMoved.find((m) => m.anim === 1);
  check('yürüme animasyonu karşıya ulaştı', Boolean(walkSeen),
    walkSeen ? `anim=${walkSeen.anim}` : 'paket yok');

  // A durur (pozisyon aynı, yalnızca anim değişir)
  b.events.playerMoved.length = 0;
  a.socket.emit('playerMove', { x: 100, y: 100, facingLeft: false, anim: 0 });
  await sleep(200);
  const idleSeen = b.events.playerMoved.find((m) => m.anim === 0);
  check('durma (idle) karşıya ulaştı, pozisyon aynı olsa da', Boolean(idleSeen),
    idleSeen ? `ayni x,y ile anim=${idleSeen.anim}` : 'paket yok');

  // A kesme yapar
  b.events.playerMoved.length = 0;
  a.socket.emit('playerMove', { x: 100, y: 100, facingLeft: true, anim: 2 });
  await sleep(200);
  const chopSeen = b.events.playerMoved.find((m) => m.anim === 2);
  check('kesme animasyonu karşıya ulaştı', Boolean(chopSeen),
    chopSeen ? `anim=${chopSeen.anim}` : 'paket yok');

  // --- 2. Ağaç kesilince 1-3 odun düşer (astar: 12 denemede 1 ve 3 görülmeli) ---
  // Kimlikler sunucuda kalıcıdır; taze üretilmezse ikinci koşuda sayaç artmaz.
  const treeStamp = `${Date.now()}`;
  const counts = new Set();
  let dropsOk = true;
  let pickOk = false;
  let seenDropId = null;

  for (let i = 0; i < 12; i++) {
    a.events.dropsSpawned.length = 0;
    const treeId = `tree:0,0:${treeStamp}-${i}`;
    a.socket.emit('harvest', { kind: 'tree', id: treeId, x: 200, y: 260 });
    await sleep(120);
    const spawn = a.events.dropsSpawned.find((d) => d.drops && d.drops.length);
    if (!spawn) { dropsOk = false; break; }
    counts.add(spawn.drops.length);
    if (spawn.drops.length < 1 || spawn.drops.length > 3) dropsOk = false;
    if (!seenDropId) seenDropId = spawn.drops[0].id;
  }

  check('her kesmede 1-3 arası odun düştü', dropsOk && counts.size > 0,
    'görülen adetler: ' + Array.from(counts).sort().join(', '));
  check('rastgelelik çalışıyor (birden fazla farklı adet)', counts.size >= 2,
    'farklı adet sayısı: ' + counts.size);

  // --- 3. Yerden odun toplanınca envantere girer ---
  // Yeni bir drop üretip doğrudan onu toplayalım.
  a.events.dropsSpawned.length = 0;
  a.socket.emit('harvest', { kind: 'tree', id: 'tree:0,0:999', x: 300, y: 300 });
  await sleep(200);
  const spawn = a.events.dropsSpawned.find((d) => d.drops && d.drops.length);
  if (spawn) {
    const dropId = spawn.drops[0].id;
    a.events.inventoryState.length = 0;
    a.socket.emit('pickup', { id: dropId });
    await sleep(250);
    const state = a.events.inventoryState.find((s) => s.slots);
    pickOk = Boolean(state) && woodCount(state) >= 1;
    check('yerden odun toplanınca envantere girdi', pickOk,
      state ? `envanterdeki odun: ${woodCount(state)}, slotlar: ${JSON.stringify(state.slots.filter(Boolean))}` : 'inventoryState gelmedi');
  } else {
    check('yerden odun toplanınca envantere girdi', false, 'drop üretilemedi');
  }

  // --- 4. Aynı bağlantıda tekrar hello: oturum ve envanter KORUNMALI --------
  // (Sunucu oturumu bağlantı başına bir kez çözer; misafir her hello'da
  //  envanterini kaybetmemeli.)
  a.events.inventoryState.length = 0;
  a.socket.emit('hello', { name: 'TestA', char: 1 });
  await sleep(400);
  const finalState = a.events.inventoryState.find((s) => s.slots);
  const hasWoodSlot = Boolean(finalState) && woodCount(finalState) >= 1;
  check('tekrar hello envanteri kaybettirmedi (oturum sabit)', hasWoodSlot,
    `gelen: ${a.events.inventoryState.length} | slotlar: ${finalState ? JSON.stringify((finalState.slots || []).filter(Boolean)) : 'yok'}`);

  // --- 5. Taş toplama da çalışıyor (kontrol) ---
  a.events.inventoryState.length = 0;
  a.socket.emit('pick', { itemId: 'stone' });
  await sleep(250);
  const stoneState = a.events.inventoryState.find((s) => s.slots);
  const stoneCount = (stoneState?.slots || []).filter((s) => s && s.itemId === 'stone')
    .reduce((sum, s) => sum + s.count, 0);
  check('taş toplanınca envantere giriyor', stoneCount >= 1, 'taş: ' + stoneCount);

  // --- 6. Kütük kesme: ağaçla aynı akış, ayrı sayaç ------------------------
  // Kütük 1-2 odun verir ve "logs" sayacını artırır (ağaç "chopped" sayar).
  // Nesne kimlikleri sunucuda kalıcıdır; her koşuda taze kimlik üretilir.
  const stamp = `${Date.now()}`;
  a.events.dropsSpawned.length = 0;
  a.events.inventoryState.length = 0;
  const logCounts = new Set();
  let logDropsOk = true;
  for (let i = 0; i < 8; i++) {
    a.events.dropsSpawned.length = 0;
    a.socket.emit('harvest', { kind: 'log', id: `log:0,0:${stamp}-${i}`, x: 400, y: 400 });
    await sleep(120);
    const spawn = a.events.dropsSpawned.find((d) => d.drops && d.drops.length);
    if (!spawn) { logDropsOk = false; break; }
    logCounts.add(spawn.drops.length);
    if (spawn.drops.length < 1 || spawn.drops.length > 2) logDropsOk = false;
    if (!spawn.drops.every((d) => d.itemId === 'wood')) logDropsOk = false;
  }
  check('kütük kesince 1-2 odun düştü', logDropsOk && logCounts.size > 0,
    'görülen adetler: ' + Array.from(logCounts).sort().join(', '));

  await sleep(200);
  const logState = a.events.inventoryState.find((s) => s.stats);
  check('kütük kesmek "logs" sayacını artırdı',
    Boolean(logState) && (logState.stats.logs || 0) >= 1,
    logState ? `logs: ${logState.stats.logs}, chopped: ${logState.stats.chopped}` : 'durum yok');

  a.socket.disconnect();
  b.socket.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti`);
  if (failed.length) {
    console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });