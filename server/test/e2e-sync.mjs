// Uçtan uca: kesme senkronu, düşen odun, envanter ikonları ve IP tabanlı
// envanter kimliği. Sunucu 3019'da çalışıyor olmalı.
import { io } from 'socket.io-client';

const URL = 'http://localhost:3019';
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

function connect(name) {
  return new Promise((resolve) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const events = { playerMoved: [], dropsSpawned: [], inventoryState: [], objectRemoved: [] };
    for (const key of Object.keys(events)) socket.on(key, (d) => events[key].push(d));
    socket.on('connect', () => {
      socket.emit('hello', { name, char: 1 });
      setTimeout(() => resolve({ socket, events }), 400);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const total = (state, itemId) =>
  (state?.slots || []).filter((s) => s && s.itemId === itemId).reduce((a, s) => a + s.count, 0);

async function main() {
  const a = await connect('Ahmet');
  const b = await connect('Mehmet');

  // --- 1. Kesme (hold) bilgisi karşı tarafa ulaşıyor mu? ---
  b.events.playerMoved.length = 0;
  a.socket.emit('playerMove', {
    x: 120, y: 140, facingLeft: false, anim: 2,
    hold: { id: 'tree:0,0:5', progress: 0.6, x: 200, y: 260 }
  });
  await sleep(250);
  const holdMsg = b.events.playerMoved.find((m) => m.hold && m.hold.id === 'tree:0,0:5');
  check('kesme barı bilgisi karşıya ulaştı', Boolean(holdMsg),
    holdMsg ? `progress=${holdMsg.hold.progress}` : 'paket yok');
  check('progress 0-1 aralığında', holdMsg && holdMsg.hold.progress > 0 && holdMsg.hold.progress <= 1,
    holdMsg ? String(holdMsg.hold.progress) : '');

  // --- 2. Ağaç kesilince objectRemoved karşıya gidiyor mu? ---
  b.events.objectRemoved.length = 0;
  a.socket.emit('harvest', { kind: 'tree', id: 'tree:0,0:5', x: 200, y: 260 });
  await sleep(250);
  const removed = b.events.objectRemoved.find((o) => o.id === 'tree:0,0:5');
  check('uzak ağaç kaldırma bildirimi gitti', Boolean(removed),
    removed ? JSON.stringify(removed) : 'objectRemoved yok');

  // --- 3. Düşen odun karşıya gidiyor mu? ---
  const spawned = b.events.dropsSpawned.find((d) => d.drops && d.drops.length);
  check('düşen odun karşı tarafa yayınlandı', Boolean(spawned),
    spawned ? `${spawned.drops.length} adet` : 'dropsSpawned yok');
  check('düşen adedi 1-3', spawned && spawned.drops.length >= 1 && spawned.drops.length <= 3,
    spawned ? String(spawned.drops.length) : '');

  // --- 4. Oturum tabanlı envanter kimliği: her bağlantı kendi envanterini görür ---
  a.socket.emit('pick', { itemId: 'stone' });
  await sleep(200);
  const invA = a.events.inventoryState[a.events.inventoryState.length - 1];
  check('A oyuncusunun taşı var', total(invA, 'stone') >= 1, 'taş: ' + total(invA, 'stone'));

  // "Ahmet" adıyla yeni bir bağlantı: farklı bir misafir oturumu açılır, bu
  // yüzden AYRI (boş) bir envanter görür. Bu, eski IP tabanlı kimliğin yerini
  // alan davranıştır: aynı ağdaki iki oyuncu birbirinin eşyasını göremez.
  const c = await connect('Ahmet');
  const invC0 = c.events.inventoryState[c.events.inventoryState.length - 1];
  const cHasStone = total(invC0, 'stone') >= 1;
  check('yeni bağlantı kendi (boş) envanterini alır — oturum izolasyonu', !cHasStone,
    cHasStone ? 'aynı envanter paylaşıldı (HATA)' : `yeni boş envanter (taş: ${total(invC0, 'stone')})`);

  // --- 5. Eşya yere bırakma (Q): envanter azalıyor mu? ---
  // Not: her bağlantının kendi oturum envanteri vardır; bırakma yalnızca
  // kendi envanterini etkiler, bu yüzden öncesi/sonrası farkı ölçülür.
  const beforeDrop = a.events.inventoryState[a.events.inventoryState.length - 1];
  const stoneBefore = total(beforeDrop, 'stone');
  a.events.inventoryState.length = 0;
  a.socket.emit('drop', { itemId: 'stone', n: 1, x: 300, y: 300 });
  await sleep(250);
  const invAfterDrop = a.events.inventoryState[a.events.inventoryState.length - 1];
  check('Q ile yere bırakma envanteri azalttı',
    total(invAfterDrop, 'stone') === stoneBefore - 1,
    `${stoneBefore} -> ${total(invAfterDrop, 'stone')}`);

  a.socket.disconnect();
  b.socket.disconnect();
  c.socket.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti`);
  if (failed.length) {
    console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });