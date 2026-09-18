// Oturum sağlayıcı (client tarafı Adapter/Plugin kaydı).
//
// Tek karar noktası: "bu oyuncunun oturumu hangi kaynaktan gelir?"
// Sağlayıcılar sırayla denenir, ilk geçerli olan kazanır:
//   1) hesap  → kayıtlı jeton varsa sunucudan hesap oturumu
//   2) misafir → sunucu varsa misafir oturumu (ilerleme bellekte)
//   3) çevrimdışı → sunucu yoksa tamamen yerel oturum
//
// Oyun kodu bu sırayı bilmez; yalnızca resolve() sonucunu okur. Yeni bir
// oturum kaynağı (ör. Discord) eklemek = register() ile bir sağlayıcı eklemek.
import { ClientSession, pendingSession } from './ClientSession.js';
import { AuthApi, getToken, setToken } from './AuthApi.js';

export class SessionProvider {
  constructor() {
    this.providers = [];
    this.current = null;
    this.listeners = new Set();
  }

  register(name, resolve) {
    this.providers.push({ name, resolve });
    return this;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit() {
    for (const listener of this.listeners) {
      try {
        listener(this.current);
      } catch (error) {
        console.error('Oturum dinleyicisi hata verdi:', error);
      }
    }
  }

  set(session) {
    this.current = session;
    this._emit();
    return session;
  }

  // Sunucudan gelen oturum durumunu (sessionState olayı) mevcut oturuma işler.
  applyState(state) {
    if (!this.current) this.current = pendingSession();
    this.current.applyState(state);
    this._emit();
    return this.current;
  }

  // Sağlayıcıları sırayla dener. Hata durumunda bir sonrakine düşer; asla
  // null dönmez (oyun her koşulda bir oturumla başlar).
  async resolve(context = {}) {
    for (const provider of this.providers) {
      try {
        const session = await provider.resolve(context);
        if (session) return this.set(session);
      } catch (error) {
        console.warn(`Oturum sağlayıcı "${provider.name}" başarısız:`, error.message);
      }
    }
    return this.set(pendingSession(context.displayName || 'Oyuncu'));
  }
}

// Varsayılan sağlayıcı zinciri: hesap > misafir > çevrimdışı.
export function createDefaultProvider(name = 'Oyuncu') {
  const provider = new SessionProvider();

  provider.register('account', async (context) => {
    if (!getToken()) return null;
    const response = await AuthApi.session();
    if (!response.ok || !response.session) {
      // Jeton artık geçersiz (süresi dolmuş, iptal edilmiş): temizle ve devam et.
      if (response.code === 'network_error') return null;
      setToken(null);
      return null;
    }
    if (response.session.isGuest) return null;
    return new ClientSession({ ...response.session, displayName: response.session.displayName || context.displayName || name });
  });

  provider.register('guest', async (context) => {
    const response = await AuthApi.session();
    if (!response.ok || !response.session) return null;
    const session = new ClientSession({ ...response.session, displayName: context.displayName || name });
    // Misafir oturumu da sunucudan gelir: envanter anahtarı sunucuda üretilir,
    // böylece istemci ile sunucu aynı anahtarı kullanır (tek doğruluk kaynağı).
    return session;
  });

  provider.register('offline', async (context) => provider.current
    ? provider.current.toOffline()
    : new ClientSession({ kind: 'offline', displayName: context.displayName || name, isAuthenticated: false }));

  return provider;
}