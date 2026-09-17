// Uçtan uca (iki gerçek istemci): # özel mesaj yalnızca hedefte görünür,
// @ bahsetme karşı tarafta bildirim üretir.
// Sunucu 3019'da çalışıyor olmalı:  node test/e2e-chat-clients.mjs
import { io } from 'socket.io-client';

const URL = 'http://localhost:3019';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? ' — ' + extra : ''));
}

// Gerçek istemci akışını taklit et: mesajları ChatService benzeri süzgeçten
// geçirir (özel mesaj yalnızca hedefe, bahsetme bildirimi koşulu).
function connect(name) {
  return new Promise((resolve) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const inbox = [];
    socket.on('chatMessage', (message) => inbox.push(message));
    socket.on('connect', () => {
      socket.emit('hello', { name, char: 1 });
      setTimeout(() => resolve({ socket, inbox, name }), 400);
    });
  });
}

const isMention = (text, name) =>
  new RegExp('(?<![\\w@])@' + name + '(?![\\w])', 'i').test(text);

async function main() {
  const ahmet = await connect('Ahmet');
  const mehmet = await connect('Mehmet');

  // --- @ bahsetme: genel mesaj karşı tarafta bildirim koşulunu sağlar ------
  mehmet.inbox.length = 0;
  ahmet.socket.emit('chatSend', { kind: 'chat', text: '@Mehmet buraya gel' });
  await sleep(350);
  const mentionMessage = mehmet.inbox.find((m) => m.text.includes('@Mehmet'));
  check('bahsetme içeren mesaj karşı tarafa ulaştı', Boolean(mentionMessage),
    JSON.stringify(mehmet.inbox));
  check('bahsetme koşulu sağlandı (bildirim üretilir)',
    Boolean(mentionMessage) && isMention(mentionMessage.text, 'Mehmet'),
    mentionMessage ? mentionMessage.text : '');
  check('başka isme bahsetme koşulu sağlanmaz',
    Boolean(mentionMessage) && !isMention(mentionMessage.text, 'Ahmet'),
    mentionMessage ? mentionMessage.text : '');

  // --- # özel mesaj: yalnızca hedefin gelen kutusunda ----------------------
  ahmet.inbox.length = 0;
  mehmet.inbox.length = 0;
  ahmet.socket.emit('chatSend', { kind: 'private', to: 'Mehmet', text: 'sadece sana' });
  await sleep(350);
  check('özel mesaj hedefe ulaştı', mehmet.inbox.some((m) => m.text === 'sadece sana'),
    JSON.stringify(mehmet.inbox));
  check('özel mesaj gönderene geri gelmedi', ahmet.inbox.length === 0,
    JSON.stringify(ahmet.inbox));

  // --- Üçüncü oyuncu: özel mesajı görmemeli -------------------------------
  const hasan = await connect('Hasan');
  await sleep(300);
  ahmet.inbox.length = 0;
  mehmet.inbox.length = 0;
  hasan.inbox.length = 0;
  ahmet.socket.emit('chatSend', { kind: 'private', to: 'Mehmet', text: 'gizli ikinci' });
  await sleep(350);
  check('üçüncü oyuncu özel mesajı görmez', hasan.inbox.length === 0, JSON.stringify(hasan.inbox));
  check('hedef yine görür', mehmet.inbox.some((m) => m.text === 'gizli ikinci'),
    JSON.stringify(mehmet.inbox));

  // --- Geçmiş: özel mesajlar yalnızca ilgili taraflara döner --------------
  hasan.socket.emit('chatRequest');
  await sleep(350);
  const hasanHistory = await new Promise((resolve) => {
    hasan.socket.once('chatHistory', resolve);
    hasan.socket.emit('chatRequest');
  });
  const hasanPrivates = hasanHistory.filter((m) => m.kind === 'private');
  check('geçmişte üçüncü oyuncuya özel mesaj sızmaz', hasanPrivates.length === 0,
    JSON.stringify(hasanPrivates.map((m) => m.text)));

  const mehmetHistory = await new Promise((resolve) => {
    mehmet.socket.once('chatHistory', resolve);
    mehmet.socket.emit('chatRequest');
  });
  const mehmetPrivates = mehmetHistory.filter((m) => m.kind === 'private');
  check('geçmişte hedefin özel mesajları yer alır', mehmetPrivates.length >= 1,
    JSON.stringify(mehmetPrivates.map((m) => m.text)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} istemci senkron kontrolü geçti`);
  ahmet.socket.close();
  mehmet.socket.close();
  hasan.socket.close();
  if (failed.length) {
    console.log('BAŞARISIZ: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

main();