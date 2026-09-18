// İstemci tarafı oturum katmanı (proxy).
//
// OYUN KODU İÇİN SÖZLEŞME:
//   Sahne/kontroller/HUD/görev sistemleri yalnızca bu nesneyi okur:
//     currentSession.displayName   → isim etiketi, sohbet
//     currentSession.storageKey    → envanter anahtarı
//     currentSession.can('trade')  → yetenek sorgusu
//     currentSession.economy       → { gold, gems, level, xp }
//   "Kullanıcı giriş yaptı mı?" diye sorulmaz; davranışı adaptör belirler.
//
// Sunucudan gelen biçim ile çevrimdışı biçim aynı olduğu için oyun tarafında
// iki ayrı kod yolu oluşmaz. Sınıf, sunucu /auth/session yanıtını sarar
// (delegate); böylece sunucu sözleşmesi değişse bile oyun kodu etkilenmez.
import { OfflineSession } from './OfflineSession.js';

export class ClientSession {
  constructor(data = {}) {
    this.kind = data.kind || 'guest';
    this.id = data.id || null;
    this.displayName = data.displayName || 'Oyuncu';
    this.storageKey = data.storageKey || this.displayName;
    this.capabilities = data.capabilities || { chat: true, trade: false, ranked: false, persist: false, inventory: true };
    this.isAuthenticated = Boolean(data.isAuthenticated);
    this.economy = data.economy || data.snapshot || { gold: 0, gems: 0, level: 1, xp: 0, items: [] };
  }

  get isGuest() { return !this.isAuthenticated; }
  get isPersistent() { return Boolean(this.capabilities.persist); }
  get isOffline() { return this.kind === 'offline'; }
  get isAccount() { return this.kind === 'account'; }

  can(action) { return Boolean(this.capabilities[action]); }

  get gold() { return Number(this.economy.gold || 0); }
  get gems() { return Number(this.economy.gems || 0); }
  get level() { return Number(this.economy.level || 1); }
  get xp() { return Number(this.economy.xp || 0); }

  // Sunucudan taze veri geldiğinde (sessionState olayı) yerinde güncellenir:
  // sahne referansı yeniden atanmaz, dinleyiciler aynı nesneyi okumaya devam eder.
  applyState(data) {
    if (!data) return this;
    if (data.displayName) this.displayName = data.displayName;
    if (data.storageKey) this.storageKey = data.storageKey;
    if (data.capabilities) this.capabilities = data.capabilities;
    if (typeof data.isAuthenticated === 'boolean') this.isAuthenticated = data.isAuthenticated;
    if (data.kind) this.kind = data.kind;
    if (data.economy) this.economy = data.economy;
    return this;
  }

  denyReason(action) {
    if (action === 'trade') return 'Ticaret için hesabına giriş yapmalısın.';
    if (action === 'persist') return 'İlerlemeni kaydetmek için hesabına giriş yapmalısın.';
    return 'Bu eylem için hesap gerekli.';
  }

  // Çevrimdışı moda geçiş: sunucu yoksa oyun aynı arayüzle devam eder.
  toOffline() {
    return new OfflineSession({ displayName: this.displayName, gold: this.economy.gold });
  }
}

// Oyun başlamadan önce kullanılan varsayılan oturum: hiçbir şey bilinmiyor ama
// oyun kodunun okuduğu tüm alanlar doludur.
export function pendingSession(name = 'Oyuncu') {
  return new ClientSession({ kind: 'guest', displayName: name, storageKey: name });
}