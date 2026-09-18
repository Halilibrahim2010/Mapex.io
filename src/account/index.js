// Hesap katmanının istemci giriş noktası (Facade).
//
// OYUN KODU YALNIZCA BURAYI KULLANIR:
//   await initAccount(name)     → oturumu çöz (oyun başlamadan önce)
//   getSession()                → UserSession arayüzü (asla null değil)
//   applySessionState(state)    → sunucudan gelen taze veri
//   signOut()                   → kayıtlı oturumdan misafire dön
//
// Oyun çekirdeği (MainScene, Hud, Player) bu dosyanın ötesine bakmaz; hesap
// sistemi kaldırılsa yalnızca initAccount her zaman misafir döner ve oyun
// davranışı değişmez.
import { SessionProvider, createDefaultProvider } from './SessionProvider.js';
import { pendingSession } from './ClientSession.js';
import { AuthApi, getToken, setToken, rememberName, rememberedName } from './AuthApi.js';

let provider = null;
let session = null;

export async function initAccount(name = 'Oyuncu') {
  if (session) return session;
  provider = createDefaultProvider(name);
  session = await provider.resolve({ displayName: name });
  return session;
}

export function getSession() {
  if (!session) session = pendingSession();
  return session;
}

export function applySessionState(state) {
  if (!provider) provider = createDefaultProvider();
  return provider.applyState(state);
}

export function onSessionChange(listener) {
  if (!provider) provider = createDefaultProvider();
  return provider.onChange(listener);
}

// Kayıt/giriş sonrası: jeton saklanır, sağlayıcı zinciri yeniden çözülür.
export async function adoptLogin(result, name) {
  if (!result || !result.ok || !result.token) return getSession();
  setToken(result.token);
  rememberName(result.user && result.user.username);
  if (!provider) provider = createDefaultProvider(name);
  return provider.resolve({ displayName: (result.user && result.user.username) || name });
}

// Çıkış: sunucudaki jeton iptal edilir, yerelde temizlenir, misafire dönülür.
export async function signOut() {
  const result = await AuthApi.logout();
  setToken(null);
  if (!provider) provider = createDefaultProvider();
  return provider.resolve({ displayName: getSession().displayName });
}

export { AuthApi, getToken, setToken, rememberName, rememberedName };
export { pendingSession } from './ClientSession.js';
export { OfflineSession } from './OfflineSession.js';