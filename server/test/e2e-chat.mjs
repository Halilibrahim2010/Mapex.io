// Uçtan uca sohbet testi: genel mesaj herkese, özel mesaj yalnızca hedefe.
// Ayrıca geçmiş isteği ve doğrulama (boş/uzun metin) denetlenir.
// Sunucu 3019'da çalışıyor olmalı:  node test/e2e-chat.mjs
import { io } from 'socket.io-client';

const URL = 'http://localhost:3019';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

// Oyuncu bağlantısı: gelen sohbet mesajları ve geçmiş toplanır.
function connect(name) {
  return new Promise((resolve) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const events = { chatMessage: [], chatHistory: [] };
    for (const key of Object.keys(events)) socket.on(key, (d) => events[key].push(d));
    socket.on('connect', () => {
      socket.emit('hello', { name, char: 1 });
      setTimeout(() => resolve({ socket, events }), 400);
    });
  });
}

// Sohbet gönderimi: sunucuda 300 ms spam koruması vardır (bilinçli tasarım).
// Test mesajları bu yüzden aralıklı gönderilir; aksi halde mesaj sunucu
// tarafından reddedilir ve test yanlışlıkla başarısız olur.
const SPAM_WINDOW_MS = 350;
async function send(player, payload) {
  player.socket.emit('chatSend', payload);
  await sleep(SPAM_WINDOW_MS);
}

async function main() {
  const a = await connect('Ahmet');
  const b = await connect('Mehmet');

  // --- 1. Genel sohbet: iki oyuncu da görür --------------------------------
  b.events.chatMessage.length = 0;
  a.events.chatMessage.length = 0;
  a.socket.emit('chatSend', { kind: 'chat', text: 'herkese selam' });
  await sleep(400);
  check('genel mesaj gönderene geri döndü', a.events.chatMessage.length === 1,
    JSON.stringify(a.events.chatMessage));
  check('genel mesaj karşı tarafa ulaştı', b.events.chatMessage.length === 1,
    JSON.stringify(b.events.chatMessage));
  check('genel mesaj gönderen adını taşıyor', b.events.chatMessage[0]?.from === 'Ahmet',
    b.events.chatMessage[0]?.from);

  // --- 2. Özel mesaj: yalnızca hedef ---------------------------------------
  await sleep(SPAM_WINDOW_MS);
  await connect('Hasan'); // üçüncü oyuncu: özel mesajı görmemeli
  await sleep(400);

  b.events.chatMessage.length = 0;
  a.events.chatMessage.length = 0;
  await send(a, { kind: 'private', to: 'Mehmet', text: 'gizli mesaj' });
  check('özel mesaj hedefe ulaştı', b.events.chatMessage.length === 1,
    JSON.stringify(b.events.chatMessage));
  check('özel mesaj türü doğru', b.events.chatMessage[0]?.kind === 'private',
    b.events.chatMessage[0]?.kind);
  check('özel mesaj gönderene yansımadı (yerel yankı)', a.events.chatMessage.length === 0,
    JSON.stringify(a.events.chatMessage));

  // --- 3. Geçmiş: bağlanan oyuncu son mesajları alır -----------------------
  const c = await connect('Mehmet');
  c.socket.emit('chatRequest');
  await sleep(300);
  const history = c.events.chatHistory[c.events.chatHistory.length - 1] || [];
  check('geçmiş istendiğinde mesajlar gelir', history.length >= 1, history.length);
  check('geçmişte genel mesaj var', history.some((m) => m.text === 'herkese selam'),
    JSON.stringify(history.map((m) => m.text)));
  check('geçmişte kendisine gelen özel mesaj var', history.some((m) => m.text === 'gizli mesaj'),
    JSON.stringify(history.map((m) => m.text)));

  // --- 4. Doğrulama: boş metin ve hatalı paket yayınlanmamalı --------------
  b.events.chatMessage.length = 0;
  await send(a, { kind: 'chat', text: '   ' });
  check('boş mesaj yayınlanmadı', b.events.chatMessage.length === 0,
    JSON.stringify(b.events.chatMessage));

  // --- 5. Uzun metin kırpılır (140 karakter) -------------------------------
  b.events.chatMessage.length = 0;
  await send(a, { kind: 'chat', text: 'x'.repeat(400) });
  const longMessage = b.events.chatMessage.find((m) => m.text.startsWith('xxx'));
  check('uzun mesaj 140 karaktere kırpıldı', longMessage && longMessage.text.length === 140,
    longMessage ? String(longMessage.text.length) : 'paket yok');

  // --- 6. Hedefi olmayan özel mesaj yayınlanmaz ----------------------------
  b.events.chatMessage.length = 0;
  await send(a, { kind: 'private', to: 'Kimse', text: 'kimseye' });
  check('olmayan hedefe özel mesaj gitmedi', b.events.chatMessage.length === 0,
    JSON.stringify(b.events.chatMessage));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} sohbet kontrolü geçti`);
  a.socket.close();
  b.socket.close();
  if (failed.length) {
    console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main();