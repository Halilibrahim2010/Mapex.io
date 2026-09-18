// Misafir oturumu: veritabanına HİÇ dokunmaz.
//
// Misafir oyuncu tam oyunu oynar (hareket, kesme, sohbet, envanter) ama
// ilerleme yalnızca bellekte tutulur; sunucu yeniden başlarsa sıfırlanır.
// Kayıt olmak istemediği sürece hiçbir kayıt oluşturulmaz.
const crypto = require('crypto');
const { UserSession } = require('./UserSession');

class GuestSession extends UserSession {
  constructor(props = {}) {
    super({
      kind: 'guest',
      id: props.id || 'guest:' + crypto.randomUUID(),
      displayName: props.displayName || 'Misafir',
      storageKey: props.storageKey || null,
      // Misafir: sohbet eder, ticaret ve sıralama yok, kalıcılık yok.
      capabilities: { chat: true, trade: false, ranked: false, persist: false, inventory: true }
    });
    // storageKey verilmezse oturuma özel üretilir: iki misafir birbirinin
    // envanterini görmez (IP paylaşımı sorun olmaktan çıkar).
    if (!this.storageKey) this.storageKey = 'guest:' + crypto.randomUUID();
    this.expiresAt = Date.now() + (props.ttlMs || 1000 * 60 * 60 * 6); // 6 saat
    // Bellek içi ekonomi: misafirin altını vardır ama yalnızca bu oturumda.
    this._economy = { gold: 0, gems: 0, level: 1, xp: 0 };
    this._items = new Map();
  }

  get isGuest() { return true; }

  // Kısayol okuyucular (AccountSession ile aynı arayüz).
  get gold() { return Number(this._economy.gold || 0); }
  get gems() { return Number(this._economy.gems || 0); }
  get level() { return Number(this._economy.level || 1); }
  get xp() { return Number(this._economy.xp || 0); }

  snapshot() {
    return {
      ...this._economy,
      items: Array.from(this._items.entries()).map(([itemId, value]) => ({ itemId, count: value.count, itemType: value.itemType }))
    };
  }

  isExpired() { return Date.now() > this.expiresAt; }

  addItem(itemId, itemType, count = 1) {
    const entry = this._items.get(itemId) || { itemType: itemType || 'misc', count: 0 };
    entry.count += count;
    this._items.set(itemId, entry);
    return entry;
  }

  addGold(amount) {
    this._economy.gold = Math.max(0, this._economy.gold + Math.floor(amount || 0));
    return this._economy.gold;
  }
}

module.exports = { GuestSession };