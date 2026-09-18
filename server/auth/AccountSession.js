// Kayıtlı hesap oturumu (adapter): veritabanı destekli.
//
// Oyun tarafı bu sınıfla GuestSession arasındaki farkı GÖRMEZ. Tek fark
// capabilities: persist/trade/ranked açıktır ve snapshot() veritabanından okur.
//
// Önbellek mantığı: bakiye sık okunur (HUD her karede okuyabilir) — bu yüzden
// snapshot() bellekteki son değeri döner, tazeleme `refresh()` ile yapılır.
// Yazma işlemleri (harcama/kazanç) veritabanında atomik yapılır ve önbellek
// yalnızca BAŞARILI işlemden sonra güncellenir.
const { UserSession } = require('./UserSession');

class AccountSession extends UserSession {
  constructor(props = {}) {
    super({
      kind: 'account',
      id: props.userId,
      displayName: props.username || 'Oyuncu',
      storageKey: 'user:' + props.userId,
      // Kayıtlı oyuncu: kalıcı ilerleme, ticaret ve sıralama açık.
      capabilities: { chat: true, trade: true, ranked: true, persist: true, inventory: true }
    });
    this.userId = props.userId;
    this.email = props.email || null;
    this.role = props.role || 'player';
    this.isVerified = Boolean(props.isVerified);
    this.provider = props.provider || null; // { economy, inventory } repository'leri
    this._economy = {
      gold: Number(props.gold || 0),
      gems: Number(props.gems || 0),
      level: Number(props.level || 1),
      xp: Number(props.xp || 0)
    };
    this._items = [];
    this._loaded = false;
  }

  get isGuest() { return false; }
  get isAuthenticated() { return true; }
  get isAdmin() { return this.role === 'admin'; }

  // Kısayol okuyucular: snapshot() ile aynı veriyi sunar. Oyun kodu hangisini
  // kullanırsa kullansın aynı sonucu alır (Guest/Account fark etmez).
  get gold() { return Number(this._economy.gold || 0); }
  get gems() { return Number(this._economy.gems || 0); }
  get level() { return Number(this._economy.level || 1); }
  get xp() { return Number(this._economy.xp || 0); }

  // Veritabanından taze bakiye/ilerleme okur (girişte ve kritik işlemlerden sonra).
  async refresh() {
    if (!this.provider || !this.provider.economy) return this.snapshot();
    const account = await this.provider.economy.readAccount(this.userId);
    if (account) {
      this._economy = {
        gold: Number(account.gold || 0),
        gems: Number(account.gems || 0),
        level: Number(account.level || 1),
        xp: Number(account.xp || 0)
      };
    }
    if (this.provider.inventory) {
      this._items = (await this.provider.inventory.list(this.userId)) || [];
    }
    this._loaded = true;
    return this.snapshot();
  }

  snapshot() {
    return { ...this._economy, items: this._items };
  }

  // --- Ekonomi: race condition korumalı ----------------------------------
  // Tek SQL ifadesiyle "yeterli altın varsa düş" yapılır; yarış kaybedilirse
  // hiçbir şey değişmez ve { ok:false } döner. Kontrol-sonra-yaz (check-then-act)
  // deseni KULLANILMAZ.
  async spendGold(amount, reason) {
    return this._spend('gold', amount, reason);
  }

  async spendGems(amount, reason) {
    return this._spend('gems', amount, reason);
  }

  async _spend(currency, amount, reason) {
    const cost = Math.floor(Number(amount) || 0);
    if (cost <= 0) return { ok: false, error: 'Geçersiz tutar.' };
    if (!this.provider || !this.provider.economy) return { ok: false, error: 'Ekonomi deposu yok.' };

    const result = await this.provider.economy.trySpend(this.userId, currency, cost, reason || 'spend');
    if (!result.ok) {
      // Yarışı kaybettik: yerel önbelleği gerçek değerle hizala ki sonraki
      // kararlar güncel bakiyeye göre verilsin.
      await this.refresh();
      return { ok: false, error: 'Yetersiz bakiye.' };
    }
    this._economy[currency] = Number(result.balance);
    return { ok: true, balance: result.balance };
  }

  async addGold(amount, reason) {
    return this._earn('gold', amount, reason);
  }

  async addGems(amount, reason) {
    return this._earn('gems', amount, reason);
  }

  async _earn(currency, amount, reason) {
    const gain = Math.floor(Number(amount) || 0);
    if (gain <= 0) return { ok: false, error: 'Geçersiz tutar.' };
    if (!this.provider || !this.provider.economy) return { ok: false, error: 'Ekonomi deposu yok.' };
    const result = await this.provider.economy.credit(this.userId, currency, gain, reason || 'earn');
    this._economy[currency] = Number(result.balance);
    return { ok: true, balance: result.balance };
  }

  // --- Envanter -----------------------------------------------------------
  async grantItem(itemId, itemType, count = 1) {
    if (!this.provider || !this.provider.inventory) return { ok: false, error: 'Envanter deposu yok.' };
    const entry = await this.provider.inventory.grant(this.userId, itemId, itemType, count);
    this._items = (await this.provider.inventory.list(this.userId)) || [];
    return { ok: true, entry };
  }

  async describeForClient() {
    return {
      ...this.describe(),
      isAuthenticated: true,
      role: this.role,
      gold: this._economy.gold,
      gems: this._economy.gems,
      level: this._economy.level
    };
  }
}

module.exports = { AccountSession };