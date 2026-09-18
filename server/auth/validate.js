// Auth girdilerinin doğrulanması. Tüm kurallar tek yerde: hem HTTP uçları hem
// soket katmanı aynı fonksiyonları kullanır (kural iki yerde tekrarlanmaz).
const USERNAME_RE = /^[A-Za-z0-9_]{3,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

// Dönüş: { ok: true, value } | { ok: false, error }
function validateUsername(raw) {
  const value = String(raw || '').trim();
  if (value.length < 3 || value.length > 15) {
    return { ok: false, error: 'Kullanıcı adı 3-15 karakter olmalı.' };
  }
  if (!USERNAME_RE.test(value)) {
    return { ok: false, error: 'Kullanıcı adı yalnızca harf, rakam ve _ içerebilir.' };
  }
  return { ok: true, value };
}

function validateEmail(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value.length === 0 || value.length > 254 || !EMAIL_RE.test(value)) {
    return { ok: false, error: 'Geçerli bir e-posta gir.' };
  }
  return { ok: true, value };
}

function validatePassword(raw) {
  const value = String(raw || '');
  if (value.length < MIN_PASSWORD) {
    return { ok: false, error: `Şifre en az ${MIN_PASSWORD} karakter olmalı.` };
  }
  if (value.length > 200) {
    return { ok: false, error: 'Şifre çok uzun.' };
  }
  return { ok: true, value };
}

function validateCredentials(raw) {
  const email = validateEmail(raw && raw.email);
  if (!email.ok) return email;
  const password = validatePassword(raw && raw.password);
  if (!password.ok) return password;
  const username = validateUsername(raw && raw.username);
  if (raw && raw.username !== undefined && !username.ok) return username;
  return { ok: true, value: { email: email.value, password: password.value, username: username.value } };
}

module.exports = {
  validateUsername,
  validateEmail,
  validatePassword,
  validateCredentials,
  rules: { USERNAME_RE, EMAIL_RE, MIN_PASSWORD }
};