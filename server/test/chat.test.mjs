// Sohbet sistemi testi: mesaj ayrıştırma (# özel, @ bahsetme), gönderim geçmişi
// ve doğrulama kuralları. Phaser yerine minimal stub kullanılır.
// Çalıştır:  node test/chat.test.mjs
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`, detail === undefined ? '' : detail);
    failed++;
  }
}

// --- Minimal DOM / Phaser stub (settings.test.mjs ile aynı üslup) ------------
global.window = { addEventListener() {}, removeEventListener() {} };
const store = {};
global.localStorage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; }
};
global.Phaser = { Input: { Keyboard: { KeyCodes: { ESC: 27, ENTER: 13, SHIFT: 16, E: 69, I: 73, Q: 81 } } } };

// --- Modüller ---------------------------------------------------------------
const { getSettings, setChatText } = await import(new URL('../../src/core/GameSettings.js', import.meta.url).href);
const { ChatModel } = await import(new URL('../../src/chat/ChatModel.js', import.meta.url).href);
const { ChatService } = await import(new URL('../../src/chat/ChatService.js', import.meta.url).href);
const { isNameMentioned, privateBodyAfter } = await import(new URL('../../src/chat/ChatTypes.js', import.meta.url).href);

// --- 1. Yardımcı fonksiyonlar ----------------------------------------------
check('bahsetme: tam kelime eşleşir', isNameMentioned('selam @ali naber', 'ali') === true);
check('bahsetme: büyük/küçük harf duyarsız', isNameMentioned('@ALI naber', 'ali') === true);
check('bahsetme: ön ek yanlış eşleşmez', isNameMentioned('@ali naber', 'alican') === false);
check('bahsetme: @ olmadan eşleşmez', isNameMentioned('ali naber', 'ali') === false);
check('bahsetme: noktalama sonrası eşleşir', isNameMentioned('@ali, gel', 'ali') === true);
check('bahsetme: türkçe karakterli ad', isNameMentioned('@şükrü gel', 'şükrü') === true);

check('özel mesaj: # sonrası metin alınır', privateBodyAfter('selam #ali nasilsin', 'ali') === 'nasilsin');
check('özel mesaj: # ile birlikte boş metin', privateBodyAfter('#ali', 'ali') === '');
check('özel mesaj: isim yoksa null', privateBodyAfter('selam ali', 'ali') === null);
check('özel mesaj: çok kelimeli gövde', privateBodyAfter('#ali iyi misin dostum', 'ali') === 'iyi misin dostum');

// --- 2. Ayarlar -------------------------------------------------------------
check('sohbet kısayolu varsayılanı ENTER', getSettings().keys.chatOpen === 'ENTER', getSettings().keys.chatOpen);
check('mesaj gönderme kısayolu varsayılanı ENTER', getSettings().keys.chatSend === 'ENTER', getSettings().keys.chatSend);
setChatText('chatName', 'Oyuncu');
setChatText('chatMentions', 'ali, mehmet');
check('sohbet adı kaydedildi', getSettings().chatName === 'Oyuncu', getSettings().chatName);
check('bahsetme kelimeleri kaydedildi', getSettings().chatMentions === 'ali, mehmet', getSettings().chatMentions);

// --- 3. ChatModel: gelen mesajlar ------------------------------------------
const model = new ChatModel();
model.playerName = 'Oyuncu';
model.applyIncoming({ kind: 'chat', from: 'Ali', text: 'herkes @Oyuncu gelsin' });
const mentions = model.takeNotifications();
check('bahsetme bildirimi üretildi', mentions.length === 1, JSON.stringify(mentions));
check('bahsetme metni doğru', mentions[0] && mentions[0].text === 'Ali sohbette senden bahsetti.',
  mentions[0] && mentions[0].text);

model.applyIncoming({ kind: 'private', from: 'Ali', to: 'Oyuncu', text: 'gizli' });
const privates = model.takeNotifications();
check('özel mesaj bildirimi üretildi', privates.length === 1, JSON.stringify(privates));
check('özel mesaj metni doğru', privates[0].text === 'Ali sana ozel mesaj gonderdi.', privates[0] && privates[0].text);

model.applyIncoming({ kind: 'chat', from: 'Ali', text: '@Ayse naber' });
check('başkasına bahsetme bildirim üretmez', model.takeNotifications().length === 0);

model.applyIncoming({ kind: 'private', from: 'Ali', to: 'Mehmet', text: 'ona yazdım' });
check('başkasına özel mesaj bildirim üretmez', model.takeNotifications().length === 0);
check('başkasına özel mesaj günlüğe de yazılmaz',
  model.journal.filter((e) => e.text === 'ona yazdım').length === 0);

// --- 4. Gönderme geçmişi (yukarı/aşağı ok) ---------------------------------
// Not: ok yönü bağımsız değişken olarak değil `navigate(-1)`/`navigate(1)` gibi
// çağrılır; testte aynı üslup korunur.
const lookback = new ChatModel();
lookback.remember('bir');
lookback.remember('iki');
const firstUp = lookback.navigate(-1, '');
check('boş yazıda yukarı ok son mesajı verir', firstUp === 'iki', firstUp);
check('ikinci yukarı ok bir öncekini verir', lookback.navigate(-1, '') === 'bir');
check('geçmişin başında değişmez', lookback.navigate(-1, '') === 'bir');
check('aşağı ok ileri gider', lookback.navigate(1, '') === 'iki');
check('aşağı ok sonunda boşaltır', lookback.navigate(1, '') === '');

// Taslak yazılırken yukarı ok da geçmişte gezinir (en yeniden başlar).
const draft = new ChatModel();
draft.remember('ilk');
draft.remember('son');
check('taslak varken yukarı ok en yeniyi verir', draft.navigate(-1, 'taslak') === 'son');
check('taslak varken ikinci yukarı ok öncekini verir', draft.navigate(-1, 'taslak') === 'ilk');

// --- 5. ChatService: ağ olmadan gönderim -----------------------------------
const service = new ChatService({});
service.setPlayerName('Oyuncu');
check('ağ yokken gönderim hata döner', Boolean(service.send('selam').error), JSON.stringify(service.send('selam')));

// Sahte ağ: gönderilen paketleri toplar, uzak oyuncu listesi verir.
const sent = [];
const network = {
  remotePlayers: new Map([['p1', { name: 'Ali' }]]),
  handlers: {},
  on(event, fn) { (this.handlers[event] ||= []).push(fn); },
  emit(event, data) { sent.push({ event, data }); }
};
service.attach(network);
check('bağlanınca geçmiş istenir', sent.some((s) => s.event === 'chatRequest'),
  JSON.stringify(sent.map((s) => s.event)));

sent.length = 0;
service.send('herkese selam');
check('genel mesaj gönderildi', sent.length === 1 && sent[0].data.kind === 'chat', JSON.stringify(sent));
check('genel mesaj metni korundu', sent[0].data.text === 'herkese selam', sent[0].data.text);
check('kendi mesajı günlüğe yazıldı',
  service.model.journal.some((e) => e.from === 'Oyuncu' && e.text === 'herkese selam'));

sent.length = 0;
service.send('#Ali gizli mesaj');
check('özel mesaj hedefe gitti', sent.length === 1 && sent[0].data.kind === 'private', JSON.stringify(sent));
check('özel mesaj alıcısı doğru', sent[0].data.to === 'Ali', sent[0].data.to);
check('özel mesaj gövdesi ayıklandı', sent[0].data.text === 'gizli mesaj', sent[0].data.text);

sent.length = 0;
const unknown = service.send('#Yok boyle biri');
check('olmayan oyuncuya gönderim reddedilir', Boolean(unknown.error), JSON.stringify(unknown));
check('reddedilen mesaj ağa gitmedi', sent.length === 0, JSON.stringify(sent));

sent.length = 0;
const emptyPrivate = service.send('#Ali');
check('boş özel mesaj reddedilir', Boolean(emptyPrivate.error), JSON.stringify(emptyPrivate));

sent.length = 0;
service.send('#ali kucuk harfle');
check('isim eşleşmesi büyük/küçük harf duyarsız', sent.length === 1 && sent[0].data.to === 'Ali',
  JSON.stringify(sent));

sent.length = 0;
service.send('#a kisa yol');
check('ön ek eşleşmesi çalışır', sent.length === 1 && sent[0].data.to === 'Ali', JSON.stringify(sent));

// --- 6. Gelen özel mesaj filtreleme ----------------------------------------
const listener = new ChatService({ chatBox: { markDirty() {} } });
listener.setPlayerName('Oyuncu');
listener.attach(network);
network.handlers.chatMessage.forEach((fn) => fn({ kind: 'private', from: 'Ali', to: 'Mehmet', text: 'sana degil' }));
check('bize gelmeyen özel mesaj günlüğe girmez', listener.model.journal.length === 0,
  JSON.stringify(listener.model.journal));
network.handlers.chatMessage.forEach((fn) => fn({ kind: 'private', from: 'Ali', to: 'Oyuncu', text: 'sana' }));
check('bize gelen özel mesaj günlüğe girer', listener.model.journal.length === 1,
  JSON.stringify(listener.model.journal));
check('özel mesaj bildirimi kuyruğa girdi', listener.model.takeNotifications().length === 1);

// --- 7. Bahsetme sayacı -----------------------------------------------------
const counter = new ChatService({});
counter.setPlayerName('Oyuncu');
check('bahsetme sayacı tekrarı bir kez sayar', counter.mentionCount('@Oyuncu ve @Oyuncu tekrar') === 1,
  counter.mentionCount('@Oyuncu ve @Oyuncu tekrar'));
check('bahsetme için oyuncu adı geçerli', counter.mentionCount('selam @Oyuncu') === 1,
  String(counter.mentionCount('selam @Oyuncu')));
check('bahsetmesiz mesaj sıfır sayar', counter.mentionCount('selam millet') === 0,
  String(counter.mentionCount('selam millet')));

console.log(failed === 0 ? 'Sohbet testi geçti' : `Sohbet testi BAŞARISIZ (${failed})`);
process.exit(failed === 0 ? 0 : 1);