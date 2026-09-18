// Hesap girdilerinin istemci tarafı doğrulaması. Sunucudaki kuralların
// (server/auth/validate.js) birebir aynısıdır ve ÖNEMLİDİR: iki taraf aynı
// kuralları kullanır, sunucu yine de son sözü söyler (istemci doğrulaması
// yalnızca hızlı geri bildirim içindir, güvenlik sınırı değildir).
export const USERNAME_RE = /^[A-Za-z0-9_]{3,15}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

export function validateUsername(raw) {
  const value = String(raw || '').trim();
  if (value.length < 3 || value.length > 15) return { ok: false, error: 'Kullanıcı adı 3-15 karakter olmalı.' };
  if (!USERNAME_RE.test(value)) return { ok: false, error: 'Kullanıcı adı yalnızca harf, rakam ve _ içerebilir.' };
  return { ok: true, value };
}

export function validateEmail(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value.length > 254 || !EMAIL_RE.test(value)) return { ok: false, error: 'Geçerli bir e-posta gir.' };
  return { ok: true, value };
}

export function validatePassword(raw) {
  const value = String(raw || '');
  if (value.length < MIN_PASSWORD) return { ok: false, error: `Şifre en az ${MIN_PASSWORD} karakter olmalı.` };
  return { ok: true, value };
}