// UserSession: oyunun hesap sistemine baktığı TEK pencere (istemci sürümü).
//
// MİMARİ SÖZLEŞME (çok önemli):
//   Oyun motoru (MainScene, Player, Hud, NetworkManager) "kullanıcı giriş
//   yaptı mı?" diye SORMAZ. Yalnızca bu arayüzü okur:
//
//     session.displayName   → oyuncunun görünen adı (her modda dolu)
//     session.storageKey    → envanter/ilerleme anahtarı (her modda dolu)
//     session.isGuest       → hesap kalıcı mı? (davranışı bu belirler)
//     session.snapshot()    → { gold, gems, level, xp, items }
//     session.can('trade')  → yetenek sorgusu
//
// Guest / Kayıtlı / Çevrimdışı ayrımı oyun koduna sızmaz; yalnızca alt
// sınıflarda (adapter) yaşar. Sunucu tarafındaki karşılığı:
// server/auth/UserSession.js
export class UserSession {
  constructor(props = {}) {
    if (new.target === UserSession) {
      throw new Error('UserSession soyut bir sınıftır; alt sınıf kullanılmalı.');
    }
    this.kind = props.kind || 'abstract';
    this.id = props.id || null;
    this.displayName = props.displayName || 'Oyuncu';
    // storageKey: envanter ve istatistiklerin bağlandığı anahtar. null geçilirse
    // alt sınıfın kendi anahtarını üretmesi beklenir.
    this.storageKey = props.storageKey === undefined ? this.displayName : props.storageKey;
    this.capabilities = props.capabilities || { chat: true, trade: false, ranked: false, persist: false };
  }

  get isGuest() { return true; }
  get isPersistent() { return Boolean(this.capabilities.persist); }
  get isAuthenticated() { return false; }

  can(action) { return Boolean(this.capabilities[action]); }

  // Yetkisiz eylem denemesinde gösterilecek metin (UI bunu kullanır).
  denyReason(action) {
    if (action === 'trade') return 'Ticaret için hesabına giriş yapmalısın.';
    if (action === 'persist') return 'İlerlemeni kaydetmek için hesabına giriş yapmalısın.';
    return 'Bu eylem için hesap gerekli.';
  }

  // Oyunun okuduğu veri. Dolu olması ZORUNLU: oyun "hesap yok" durumunu
  // bilmemeli, sadece varsayılanları görmeli.
  snapshot() {
    return { gold: 0, gems: 0, level: 1, xp: 0, items: [] };
  }

  // Sunucuya giden hafif kimlik bilgisi (jeton asla burada tutulmaz).
  describe() {
    return { kind: this.kind, isGuest: this.isGuest, displayName: this.displayName, storageKey: this.storageKey };
  }

  async logout() { return { ok: true }; }
}