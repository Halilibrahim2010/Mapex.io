// Sunucu soket akışının uçtan uca testi (başsız istemci).
// Çalıştırma: node server/test/flow.test.js  (sunucu 12090'da açık olmalı)
const { io } = require('socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:12090';
const results = [];

function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Envanterdeki toplam eşya sayısı (slot sırasından bağımsız).
function totalOf(state, itemId) {
  return (state?.slots || [])
    .filter((slot) => slot && slot.itemId === itemId)
    .reduce((sum, slot) => sum + slot.count, 0);
}

function once(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`zaman aşımı: ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Sunucudan taze bir envanter durumu ister (bekleyen paketlerden etkilenmez).
// Sayaç farklarını ölçen kontroller bunu "taban" almak için kullanır.
// Not: sunucu yalnızca gerçek bir işlem sonrası inventoryState yayınlar;
// bu yüzden taban, bilinen bir eşya toplama ile tazelenir.
function lastState(socket, itemId = 'stone') {
  const pending = once(socket, 'inventoryState', 2000);
  socket.emit('pick', { itemId });
  return pending;
}

// Ayrı bir bağlantıda sayaç ayrımını doğrular: ağaç → "chopped",
// kütük → "logs". Envanter ve istatistikler istemci başına tutulduğundan
// ana test akışını etkilemez.
async function verifyHarvestCounters(url) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  await once(socket, 'connect');
  socket.emit('hello', { name: 'SayaçTesti', char: 1 });
  await once(socket, 'inventoryState');
  await wait(200);

  const base = await lastState(socket);
  const beforeChopped = base.stats.chopped;
  const beforeLogs = base.stats.logs || 0;
  // Nesne kimlikleri sunucuda kalıcıdır (aynı ağaç iki kez kesilemez).
  // Bu yüzden her koşuda taze kimlik üretilir.
  const stamp = `${Date.now()}`;

  const afterTree = once(socket, 'inventoryState');
  socket.emit('harvest', { kind: 'tree', id: `tree:0,0:${stamp}`, x: 10, y: 10 });
  const treeState = await afterTree;
  check('ağaç kesmek ağaç sayacını artırdı',
    treeState.stats.chopped === beforeChopped + 1,
    `${beforeChopped} -> ${treeState.stats.chopped}`);
  check('ağaç kesmek kütük sayacını etkilemedi',
    (treeState.stats.logs || 0) === beforeLogs,
    `logs: ${beforeLogs} -> ${treeState.stats.logs}`);

  const afterLog = once(socket, 'inventoryState');
  socket.emit('harvest', { kind: 'log', id: `log:0,0:${stamp}`, x: 20, y: 20 });
  const logState = await afterLog;
  check('kütük kesmek kütük sayacını artırdı',
    (logState.stats.logs || 0) === beforeLogs + 1,
    `${beforeLogs} -> ${logState.stats.logs}`);
  check('kütük kesmek ağaç sayacını etkilemedi',
    logState.stats.chopped === beforeChopped + 1,
    `chopped: ${logState.stats.chopped}`);
  socket.disconnect();
}

async function main() {
  const socket = io(URL, { transports: ['websocket'], autoConnect: false });
  const pendingWorld = once(socket, 'worldState');
  const pendingTime = once(socket, 'timeState');
  socket.connect();
  await once(socket, 'connect');

  const worldState = await pendingWorld;
  check('worldState geldi', worldState && Array.isArray(worldState.removed), worldState);
  check('worldState.drops dizisi', Array.isArray(worldState.drops));

  const timeState = await pendingTime;
  check('timeState geldi', Number.isFinite(timeState.serverNow), timeState);

  socket.emit('hello', { name: 'TestOyuncu', char: 3 });
  const inv0 = await once(socket, 'inventoryState');
  check('envanter 15 slot', inv0.slots.length === 15, inv0.slots.length);
  check('sayaçlar JSON tanımından geliyor', Number.isFinite(inv0.stats.chopped), inv0.stats);

  // Envanter IP'ye bağlı saklanır ve koşular arasında birikebilir; bu yüzden
  // tüm kontroller mutlak sayı yerine artış/azalış farkı üzerinden yapılır.
  const stoneBase = totalOf(inv0, 'stone');
  const woodBase = totalOf(inv0, 'wood');
  const choppedBase = inv0.stats.chopped;

  // Her isteğin yanıtı ayrı ayrı beklenir: aynı anda iki istek gönderilirse
  // ilk gelen paket diğerinin sonucunu gölgeler (test yarışı).
  const pickStone = async () => {
    const p = once(socket, 'inventoryState');
    socket.emit('pick', { itemId: 'stone' });
    return p;
  };
  await pickStone();
  const inv1 = await pickStone();
  check('taş envantere girdi', totalOf(inv1, 'stone') === stoneBase + 2,
    `${stoneBase} -> ${totalOf(inv1, 'stone')}`);

  // Sunucu bilinmeyen itemda değişiklik yapmaz; bu yüzden yanıt beklenmez.
  socket.emit('pick', { itemId: 'bilinmeyen' });
  await wait(150);
  const invUnknown = await new Promise((resolve) => {
    socket.emit('pick', { itemId: 'bilinmeyen2' });
    setTimeout(() => resolve(null), 200);
  });
  check('bilinmeyen item yok sayıldı (yanıt yok)', invUnknown === null, invUnknown);

  // Odun toplamak artık "chopped" sayacını artırmaz: o sayaç yalnızca AĞAÇ
  // kesmeye bağlıdır (JSON'daki "source": "tree"). Böylece kesilen ağaç ile
  // kesilen kütük aynı eşyayı verse de ayrı sayılır.
  socket.emit('pick', { itemId: 'wood' });
  const invWood = await once(socket, 'inventoryState');
  check('odun toplamak ağaç sayacını artırmaz', invWood.stats.chopped === choppedBase,
    `${choppedBase} -> ${invWood.stats.chopped}`);

  // Ağaç kesmek "chopped", kütük kesmek "logs" sayacını ayrı ayrı artırır.
  // Ayrı bağlantıda doğrulanır: bu soketin envanteri/istatistikleri bozulmasın.
  await verifyHarvestCounters(URL);

  const peer = io(URL, { transports: ['websocket'], autoConnect: false });
  const peerWorldPending = once(peer, 'worldState');
  peer.connect();
  await once(peer, 'connect');
  const peerWorld = await peerWorldPending;

  // Kesilen ağaç dünyadan kalkar ve diğer oyunculara duyurulur.
  const peerRemovedObject = once(peer, 'objectRemoved');
  socket.emit('harvest', { kind: 'tree', id: 'tree:0,0:1' });
  const removedObject = await peerRemovedObject;
  check('kesilen ağaç yayınlandı', removedObject.id === 'tree:0,0:1', removedObject);

  // Yeni bağlanan oyuncu kesilen ağacı görmez (sunucu durumu paylaşır).
  const late = io(URL, { transports: ['websocket'], autoConnect: false });
  const lateWorldPending = once(late, 'worldState');
  late.connect();
  await once(late, 'connect');
  const lateWorld = await lateWorldPending;
  check('yeni oyuncu kesilen ağacı görüyor', lateWorld.removed.some((r) => r.id === 'tree:0,0:1'), lateWorld.removed);
  late.disconnect();

  // Bırakılan eşyalar tüm oyunculara yayınlanır.
  const stoneBeforeDrop = totalOf(inv1, 'stone');
  const spawned = once(peer, 'dropsSpawned');
  const dropState = once(socket, 'inventoryState');
  socket.emit('drop', { itemId: 'stone', n: 2, x: 12, y: 34 });
  const invDrop = await dropState;
  check('bırakınca envanter azaldı', totalOf(invDrop, 'stone') === stoneBeforeDrop - 2,
    `${stoneBeforeDrop} -> ${totalOf(invDrop, 'stone')}`);
  const spawnedDrops = await spawned;
  check('düşen eşya diğer oyuncuya yayınlandı', spawnedDrops.drops.length === 2, spawnedDrops.drops);

  const dropId = spawnedDrops.drops[0].id;
  const stoneBeforePickup = totalOf(invDrop, 'stone');
  const peerRemoved = once(peer, 'dropRemoved');
  socket.emit('pickup', { id: dropId });
  const invTaken = await once(socket, 'inventoryState');
  const removed = await peerRemoved;
  check('alınan eşya herkesten silindi', removed.id === dropId, removed);
  check('alınan eşya envantere girdi', totalOf(invTaken, 'stone') === stoneBeforePickup + 1,
    `${stoneBeforePickup} -> ${totalOf(invTaken, 'stone')}`);

  socket.emit('timeSkip', { ms: 5000 });
  socket.disconnect();
  peer.disconnect();
  await wait(200);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`, r.ok ? '' : JSON.stringify(r.detail));
  console.log(`\n${results.length - failed.length}/${results.length} test geçti`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('Test hatası:', error.message);
  process.exit(1);
});