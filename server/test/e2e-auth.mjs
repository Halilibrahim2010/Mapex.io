// Uçtan uca: hesap oturumu soket üzerinden oyuna akıyor mu?
// Sunucu 12090'da çalışıyor olmalı:  node test/e2e-auth.mjs
//
// Doğrulanan mimari iddiası: OYUN, HESABIN TÜRÜNÜ BİLMEZ. Sunucu oturumu
// çözer, oyuna yalnızca storageKey ve ekonomi verir; oyun tarafı misafir ve
// kayıtlı oyuncu için aynı kodu çalıştırır.
import { io } from 'socket.io-client';

const URL = 'http://localhost:12090';
const API = URL + '/auth';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail));
    failed++;
  }
}

// Oyuncu istemcisini taklit eder: hello olayında jetonu gönderir (oyunun
// NetworkManager'ı ile aynı sözleşme).
function connect({ name, token } = {}) {
  return new Promise((resolve) => {
    const socket = io(URL, { forceNew: true, reconnection: false });
    const store = { socket, sessionState: null, inventoryState: null };
    socket.on('sessionState', (state) => { store.sessionState = state; });
    socket.on('inventoryState', (state) => { store.inventoryState = state; });
    socket.on('connect', () => {
      socket.emit('hello', { name, char: 1, sessionToken: token || null });
      setTimeout(() => resolve(store), 500);
    });
  });
}

async function main() {
  const stamp = Date.now();

  // Hız sınırı IP başına tutulur ve testler aynı IP'den tekrar tekrar
  // çalışır; sayaç sıfırlanmazsa ikinci koşu 429 alır. Test kancası
  // MAPEX_ALLOW_TEST_HOOKS=1 değilse 404 döner ve bu adım sessizce geçilir.
  await fetch(API + '/__reset-limits').catch(() => null);

  // --- Kayıtlı oyuncu -----------------------------------------------------
  const registered = await fetch(API + '/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `e2e-${stamp}@example.com`, username: `E2e${String(stamp).slice(-8)}`, password: 'gizli12345' })
  }).then((r) => r.json());
  const token = registered.token;
  if (!token) {
    console.error('Kayıt başarısız (sunucu 12090 açık mı? test kancası açık mı?):', registered);
    process.exit(1);
  }

  const accountPlayer = await connect({ name: 'KayitliOyuncu', token });
  check('kayıtlı oyuncuya sessionState geldi', Boolean(accountPlayer.sessionState));
  check('oturum tipi account', accountPlayer.sessionState.kind === 'account', accountPlayer.sessionState);
  check('oturum isAuthenticated true', accountPlayer.sessionState.isAuthenticated === true);
  check('envanter anahtarı kullanıcı kimliğine bağlı',
    accountPlayer.sessionState.storageKey === 'user:' + registered.user.id, accountPlayer.sessionState.storageKey);
  check('oturum ekonomi alanı taşıyor', accountPlayer.sessionState.economy && accountPlayer.sessionState.economy.gold === 0);
  check('kayıtlı oyuncu ticaret yapabilir', accountPlayer.sessionState.capabilities.trade === true);
  check('kayıtlı oyuncu envanter aldı', Array.isArray(accountPlayer.inventoryState.slots));

  // --- Misafir oyuncu -----------------------------------------------------
  const guestPlayer = await connect({ name: 'MisafirOyuncu' });
  check('misafire sessionState geldi', Boolean(guestPlayer.sessionState));
  check('oturum tipi guest', guestPlayer.sessionState.kind === 'guest', guestPlayer.sessionState);
  check('misafir isAuthenticated false', guestPlayer.sessionState.isAuthenticated === false);
  check('misafir ticaret yapamaz', guestPlayer.sessionState.capabilities.trade === false);
  check('misafir de envanter kullanır (oyun çalışır)', guestPlayer.sessionState.capabilities.inventory === true);
  check('misafir envanter anahtarı oturuma özel', String(guestPlayer.sessionState.storageKey).startsWith('guest:'), guestPlayer.sessionState.storageKey);

  // --- KRİTİK: iki misafir birbirinin envanterini görmemeli --------------
  // (Eski IP tabanlı trackerId kullanılsaydı ikisi aynı anahtarı paylaşırdı.)
  const guestA = await connect({ name: 'MisafirA' });
  const guestB = await connect({ name: 'MisafirB' });
  check('iki misafirin storageKey farklı', guestA.sessionState.storageKey !== guestB.sessionState.storageKey);

  guestA.socket.emit('pick', { itemId: 'wood' });
  await sleep(400);
  const bWood = (guestB.inventoryState.slots || []).find((slot) => slot && slot.itemId === 'wood');
  check('misafir A topladı, misafir B görmedi', !bWood, bWood);

  const aSlots = guestA.inventoryState.slots || [];
  const aWood = aSlots.find((slot) => slot && slot.itemId === 'wood');
  check('misafir A kendi eşyasını gördü', Boolean(aWood), aSlots);

  // --- KRİTİK: bozuk jeton oyunu kilitlememeli --------------------------
  const brokenPlayer = await connect({ name: 'BozukJeton', token: 'gecersiz.jeton.imzasi' });
  check('bozuk jetonla bağlanan oyuncu misafire düşer', brokenPlayer.sessionState.kind === 'guest');
  check('bozuk jetonlu oyuncu YİNE DE envanter alır (oyun çalışır)', Array.isArray(brokenPlayer.inventoryState.slots));
  check('bozuk jetonlu oyuncu oyuna katıldı', Boolean(brokenPlayer.sessionState.storageKey));

  // --- Temizlik -----------------------------------------------------------
  for (const store of [accountPlayer, guestPlayer, guestA, guestB, brokenPlayer]) store.socket.disconnect();
  await sleep(200);

  console.log(`\n${failed === 0 ? 'Hesap e2e kontrolü geçti' : 'Hesap e2e kontrolü BAŞARISIZ: ' + failed + ' hata'}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log('  ✗ test çalıştırılamadı (sunucu 12090 açık mı?):', error.message);
  process.exit(1);
});