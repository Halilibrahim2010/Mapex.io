// Çevrimdışı (tek oyunculu) oturum: sunucu yokken istemcinin kullandığı adapter.
//
// Sunucu kapalıysa oyun çalışmaya devam eder (mevcut LocalServer davranışı).
// Bu oturum tamamen istemcide yaşar; veritabanı yok, ağ yok, ama arayüz aynı:
// oyun kodu "sunucu yok" durumunu bilmek zorunda kalmaz.
import { UserSession } from './UserSession.js';

export class OfflineSession extends UserSession {
  constructor(props = {}) {
    super({
      kind: 'offline',
      id: props.id || 'offline:local',
      displayName: props.displayName || 'Oyuncu',
      storageKey: 'offline:local',
      // Tek oyunculu: sohbet yok (kimse dinlemiyor), kalıcılık yok (sunucu yok).
      capabilities: { chat: false, trade: false, ranked: false, persist: false, inventory: true }
    });
    this._economy = { gold: Number(props.gold || 0), gems: 0, level: 1, xp: 0 };
    this._items = [];
  }

  get isOffline() { return true; }

  snapshot() {
    return { ...this._economy, items: [...this._items] };
  }

  denyReason(action) {
    if (action === 'chat') return 'Sohbet için sunucuya bağlanmalısın.';
    return 'Bu eylem çevrimdışı modda kullanılamaz.';
  }

  addItem(itemId, itemType, count = 1) {
    const found = this._items.find((item) => item.itemId === itemId);
    if (found) found.count += count;
    else this._items.push({ itemId, itemType: itemType || 'misc', count });
    return found || this._items[this._items.length - 1];
  }

  addGold(amount) {
    this._economy.gold = Math.max(0, this._economy.gold + Math.floor(amount || 0));
    return this._economy.gold;
  }

  toJSON() {
    return this.describe();
  }
}