// Auth HTTP istemcisi: yalnızca sunucu sözleşmesini bilir.
//
// Bağımsızlık kuralı: bu dosya Phaser'ı ve oyunu import etmez. Hesap sistemi
// kaldırılsa oyun çalışmaya devam eder (ağ yoksa isLoginAvailable() false döner
// ve menü "misafir olarak oyna" akışını gösterir).
export const TOKEN_KEY = 'mapex.session.token';
export const ACCOUNT_KEY = 'mapex.session.name';

export function authBase() {
  if (typeof window === 'undefined') return 'http://localhost:3019';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:3019`;
}

// Jeton her zaman tek anahtarda tutulur (sayfa yenilendiğinde oturum sürer).
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch (error) {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    /* gizli sekme: oturum yalnızca bellekte kalır */
  }
}

export function rememberName(name) {
  try {
    if (name) localStorage.setItem(ACCOUNT_KEY, name);
  } catch (error) { /* yok sayılır */ }
}

export function rememberedName() {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || null;
  } catch (error) {
    return null;
  }
}

// Tüm çağrılar aynı sözleşmeye uyar: { ok:true, ... } | { ok:false, error, code }
async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = token === undefined ? getToken() : token;
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let response;
  try {
    response = await fetch(`${authBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    // Sunucu yok: oyunu durdurmuyoruz, çağıran taraf misafir/çevrimdışı moda düşer.
    return { ok: false, error: 'Sunucuya ulaşılamadı.', code: 'network_error' };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    return { ok: false, error: 'Sunucu yanıtı okunamadı.', code: 'bad_response' };
  }
  if (!response.ok && payload && payload.ok === undefined) {
    return { ok: false, error: 'İstek başarısız.', code: 'http_' + response.status };
  }
  return payload;
}

export const AuthApi = {
  // Sunucudan mevcut oturumu ister. Jeton geçersizse sunucu MİSAFİR oturumu
  // döner — bu yüzden bu çağrı asla oyunu kilitlemez.
  session: () => request('/auth/session'),

  register: (email, username, password) => request('/auth/register', { method: 'POST', body: { email, username, password } }),

  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, token: null }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  me: () => request('/auth/me'),

  changePassword: (oldPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } }),

  checkUsername: (name) => request(`/auth/check-username?name=${encodeURIComponent(name)}`)
};