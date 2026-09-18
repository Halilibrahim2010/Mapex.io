// Şifre özetleme: Node'un yerleşik scrypt'i kullanılır (bcrypt/argon2 ile aynı
// sınıf; native derleme ve ek bağımlılık gerektirmez).
//
// Kayıt biçimi (tek satır, veritabanında password_hash alanına yazılır):
//   scrypt$N$r$p$<base64 tuz>$<base64 özet>
// Parametreler özete gömülüdür; ileride N artırılsa bile eski kayıtlar
// doğrulanmaya devam eder (verify parametreleri kayıttan okur).
const crypto = require('crypto');

const N = 16384;   // CPU/maliyet faktörü (2^14)
const R = 8;       // blok boyutu
const P = 1;       // paralelleştirme
const KEY_LEN = 64;
const SALT_LEN = 16;
// scrypt bellek sınırı: 128*N*r = 16 MB civarı; Node varsayılanı 32 MB, açıkça verilir.
const MAX_MEM = 64 * 1024 * 1024;

function scrypt(password, salt, n, r, p, len) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      len,
      { N: n, r, p, maxmem: MAX_MEM },
      (error, derived) => (error ? reject(error) : resolve(derived))
    );
  });
}

// Şifreyi özetler. Dönen değer veritabanına yazılmaya hazırdır.
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Şifre boş olamaz');
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scrypt(password, salt, N, R, P, KEY_LEN);
  return ['scrypt', N, R, P, salt.toString('base64'), derived.toString('base64')].join('$');
}

// Şifreyi kayıtlı özetle karşılaştırır. Zamanlama saldırısına kapalı
// (timingSafeEqual); bozuk/eski biçimlerde güvenli biçimde false döner.
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let expected;
  let salt;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch (error) {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived;
  try {
    derived = await scrypt(password, salt, n, r, p, expected.length);
  } catch (error) {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// Özet biçiminin geçerli olduğunu (bozmadan önce) kontrol eder.
function isHashed(value) {
  return typeof value === 'string' && /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(value);
}

module.exports = { hashPassword, verifyPassword, isHashed, PARAMS: { N, R, P, KEY_LEN, SALT_LEN } };