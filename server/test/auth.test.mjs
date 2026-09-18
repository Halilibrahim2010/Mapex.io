// Hesap katmanı testleri: parola özeti, jeton, oturum adaptörleri,
// race condition koruması ve Express/soket entegrasyonu (sunucu gerekmez).
// Çalıştır:  node test/auth.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { hashPassword, verifyPassword, isHashed } = require('../auth/Password');
const { TokenStore } = require('../auth/TokenStore');
const { AuthService } = require('../auth/AuthService');
const { SessionFactory } = require('../auth/SessionFactory');
const { MemoryUserRepository } = require('../auth/MemoryUserRepository');
const { GuestSession } = require('../auth/GuestSession');
const { AccountSession } = require('../auth/AccountSession');
const { UserSession } = require('../auth/UserSession');
const { RateLimiter } = require('../auth/RateLimiter');
const { validateUsername, validateEmail, validatePassword } = require('../auth/validate');
const { createAuthLayer } = require('../auth');

let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`, detail === undefined ? '' : detail);
    failed++;
  }
}

// --- 1. Parola özeti -------------------------------------------------------
console.log('\n== Parola ==');
const hash = await hashPassword('gizli12345');
check('özet scrypt biçiminde', isHashed(hash), hash.slice(0, 30));
check('özet düz metin içermiyor', !hash.includes('gizli12345'));
check('doğru şifre geçer', await verifyPassword('gizli12345', hash));
check('yanlış şifre geçmez', !(await verifyPassword('yanlis12345', hash)));
check('boş şifre geçmez', !(await verifyPassword('', hash)));
check('bozuk özet geçmez', !(await verifyPassword('gizli12345', 'scrypt$bozuk')));
check('iki özet farklı (tuz)', (await hashPassword('gizli12345')) !== hash);

// --- 2. Jeton --------------------------------------------------------------
console.log('\n== Jeton ==');
const tokens = new TokenStore('test-anahtari');
const signed = tokens.sign({ sub: 'u1', role: 'player', sid: 's1' });
const decoded = tokens.verify(signed);
check('imzalı jeton doğrulanır', decoded && decoded.sub === 'u1');
check('yanlış anahtarla doğrulanmaz', !new TokenStore('baska').verify(signed));
check('bozuk jeton reddedilir', !tokens.verify('abc.def') && !tokens.verify(null));
const tampered = signed.split('.')[0] + '.' + 'x'.repeat(signed.split('.')[1].length);
check('kurcalanmış imza reddedilir', !tokens.verify(tampered));
check('süresi geçmiş jeton reddedilir', !tokens.verify(tokens.sign({ sub: 'u1' }, -1000)));

// --- 3. Doğrulama kuralları ------------------------------------------------
console.log('\n== Doğrulama ==');
check('kullanıcı adı 3-15', validateUsername('Ali').ok && !validateUsername('Al').ok && !validateUsername('a'.repeat(16)).ok);
check('kullanıcı adı regex', validateUsername('Ali_1').ok && !validateUsername('Ali-1').ok && !validateUsername('Ali 1').ok);
check('e-posta biçimi', validateEmail('a@b.co').ok && !validateEmail('abc').ok && !validateEmail('a@b').ok);
check('şifre en az 8', validatePassword('12345678').ok && !validatePassword('1234567').ok);

// --- 4. AuthService: kayıt/giriş ------------------------------------------
console.log('\n== Kayıt / Giriş ==');
const repo = new MemoryUserRepository();
const auth = new AuthService(repo, tokens);
const registered = await auth.register({ email: 'Ali@Example.com', username: 'Ali', password: 'gizli12345' }, { ip: '1.2.3.4' });
check('kayıt başarılı', registered.ok, registered.error);
check('e-posta küçük harfe indi', registered.user.email === 'ali@example.com');
check('şifre özeti dışarı sızmıyor', registered.user.passwordHash === undefined);
check('kayıtta varsayılan rol player', registered.user.role === 'player');
check('kayıtta is_verified false', registered.user.isVerified === false);
check('kayıt jeton döndürür', typeof registered.token === 'string' && registered.token.includes('.'));
check('aynı e-posta tekrar kayıt olamaz', !(await auth.register({ email: 'ali@example.com', username: 'Baska', password: 'gizli12345' })).ok);
check('aynı kullanıcı adı alınamaz', (await auth.register({ email: 'baska@example.com', username: 'Ali', password: 'gizli12345' })).code === 'username_taken');
check('kısa şifre kayıt olamaz', !(await auth.register({ email: 'x@y.com', username: 'Xy', password: '123' })).ok);

const logged = await auth.login({ email: 'ALI@example.com', password: 'gizli12345' });
check('giriş başarılı (büyük harfli e-posta)', logged.ok, logged.error);
check('yanlış şifreyle giriş yok', (await auth.login({ email: 'ali@example.com', password: 'yanlis' })).code === 'bad_credentials');
check('olmayan kullanıcı aynı hatayı verir', (await auth.login({ email: 'yok@example.com', password: 'gizli12345' })).code === 'bad_credentials');
check('giriş last_login günceller', Boolean((await repo.findByEmail('ali@example.com')).lastLogin));

const identity = auth.verifyToken(logged.token);
check('jeton kimliğe çözülür', identity && identity.userId === registered.user.id);
check('iptal sonrası jeton geçersiz', (await auth.revoke(logged.token)) && auth.verifyToken(logged.token) === null);

// --- 5. RACE CONDITION: eş zamanlı harcama --------------------------------
// KRİTİK TEST: 100 altını olan oyuncu 10 kez 30 altın harcamaya çalışırsa
// yalnızca 3'ü başarılı olmalı ve bakiye asla eksiye düşmemeli. Check-then-act
// deseni kullanılsaydı burada 10 kez geçerdi.
console.log('\n== Race condition ==');
const raceRepo = new MemoryUserRepository();
const raceAuth = new AuthService(raceRepo, new TokenStore('race'));
const racer = (await raceAuth.register({ email: 'race@test.com', username: 'Racer', password: 'gizli12345' })).user;
await raceRepo.credit(racer.id, 'gold', 100, 'test');
const raceSession = new AccountSession({
  userId: racer.id, username: 'Racer', provider: { economy: raceRepo, inventory: raceRepo }
});
await raceSession.refresh();
check('başlangıç bakiyesi 100', raceSession.gold === 100, raceSession.gold);

const attempts = await Promise.all(Array.from({ length: 10 }, () => raceSession.spendGold(30, 'test')));
const successes = attempts.filter((result) => result.ok).length;
check('eş zamanlı 10 denemeden yalnızca üçü geçti', successes === 3, `geçen: ${successes}`);
check('bakiye eksiye düşmedi', raceSession.gold === 10, raceSession.gold);
check('veritabanı bakiyesi de 10', (await raceRepo.readAccount(racer.id)).gold === 10);
check('bakiye yetmezse harcama reddedilir', !(await raceSession.spendGold(50, 'test')).ok);
check('harcama defteri tutuldu (3 kayıt)', raceRepo.transactionLog().filter((t) => t.delta < 0).length === 3);

// Aynı anda aynı eşyadan düşme: yeterli adet yoksa hiçbiri geçmemeli.
await raceRepo.grant(racer.id, 'wood', 'resource', 5);
const takes = await Promise.all(Array.from({ length: 8 }, () => raceRepo.take(racer.id, 'wood', 2)));
check('eş zamanlı eşya düşme tutarlı (yalnızca 2 geçer)', takes.filter((t) => t.ok).length === 2);
check('kalan eşya 1', (await raceRepo.list(racer.id)).find((i) => i.itemId === 'wood').count === 1);

// --- 6. Oturum adaptörleri (Guest / Account / Offline) --------------------
console.log('\n== Oturum adaptörleri ==');
check('UserSession soyut (doğrudan kurulamaz)', (() => {
  try { new UserSession(); return false; } catch (error) { return true; }
})());

const guest = new GuestSession({ displayName: 'Misafir1' });
check('misafir isGuest true', guest.isGuest && !guest.isAuthenticated);
check('misafir kalıcı değil', !guest.isPersistent && !guest.can('trade'));
check('misafir sohbet edebilir', guest.can('chat'));
check('misafir storageKey oturuma özel', guest.storageKey.startsWith('guest:'));
check('iki misafirin anahtarı farklı', new GuestSession().storageKey !== new GuestSession().storageKey);
check('misafir varsayılan ekonomi verir', guest.snapshot().gold === 0 && guest.snapshot().level === 1);
guest.addGold(50); guest.addItem('wood', 'resource', 3);
check('misafir bellekte altın tutar', guest.snapshot().gold === 50 && guest.snapshot().items[0].count === 3);
check('misafir oyun kodu için aynı arayüzü sunar', typeof guest.snapshot === 'function' && typeof guest.can === 'function');

const account = new AccountSession({
  userId: racer.id, username: 'Racer', role: 'premium',
  provider: { economy: raceRepo, inventory: raceRepo }
});
check('hesap isGuest false', !account.isGuest && account.isAuthenticated);
check('hesap kalıcı ve ticaret yapabilir', account.isPersistent && account.can('trade') && account.can('ranked'));
check('hesap storageKey kullanıcı kimliği', account.storageKey === 'user:' + racer.id);
check('hesap snapshot veritabanından okur', (await account.refresh()).gold === 10);
check('hesap premium rolü', account.role === 'premium');
check('hesap denyReason mesajı var', account.denyReason('trade').length > 0);

// --- 7. SessionFactory: oturum seçimi -------------------------------------
console.log('\n== SessionFactory ==');
const layer = createAuthLayer({ repository: new MemoryUserRepository(), secret: 'sf' });
const created = await layer.auth.register({ email: 'sf@test.com', username: 'SfUser', password: 'gizli12345' });

const fromToken = await layer.sessions.forConnection({ token: created.token, displayName: 'SfUser' });
check('geçerli jeton hesap oturumu verir', fromToken.kind === 'account' && !fromToken.isGuest);
check('hesap oturumu doğru kullanıcıya bağlanır', fromToken.id === created.user.id);

const noToken = await layer.sessions.forConnection({ displayName: 'Yeni' });
check('jetonsuz bağlantı misafir oturumu alır', noToken.kind === 'guest' && noToken.isGuest);
check('misafirin adı taşınır', noToken.displayName === 'Yeni');

const badToken = await layer.sessions.forConnection({ token: 'bozuk.jeton', displayName: 'X' });
check('bozuk jeton oyunu KİLİTLEMEZ (misafire düşer)', badToken.kind === 'guest');

const revoked = await layer.sessions.forConnection({ token: created.token, displayName: 'SfUser' });
await layer.auth.revoke(created.token);
const afterRevoke = await layer.sessions.forConnection({ token: created.token, displayName: 'SfUser' });
check('iptal edilen jeton hesap vermez', revoked.kind === 'account' && afterRevoke.kind === 'guest');

// --- 8. Hız sınırı --------------------------------------------------------
console.log('\n== Hız sınırı ==');
const limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
const outcomes = [limiter.check('1.2.3.4'), limiter.check('1.2.3.4'), limiter.check('1.2.3.4'), limiter.check('1.2.3.4')];
check('limit altındaki istekler geçer', outcomes[0].allowed && outcomes[1].allowed && outcomes[2].allowed);
check('limit aşılınca reddedilir', !outcomes[3].allowed && outcomes[3].retryAfterMs > 0);
check('başka IP etkilenmez', limiter.check('5.6.7.8').allowed);
limiter.reset('1.2.3.4');
check('reset sonrası tekrar geçer', limiter.check('1.2.3.4').allowed);

console.log(`\n${failed === 0 ? 'Hesap katmanı testleri geçti' : 'Hesap katmanı testleri BAŞARISIZ: ' + failed + ' hata'}`);
process.exit(failed === 0 ? 0 : 1);