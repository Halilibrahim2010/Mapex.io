// Basit sabit-pencere hız sınırı (bellek içi). Amaç: kaba kuvvet (brute force)
// ve spam denemelerini yavaşlatmak. Çok süreçli dağıtımda Redis'e taşınabilir
// diye arayüz (allow/reset) tek sınıfta toplanmıştır.
class RateLimiter {
  constructor({ windowMs = 60_000, max = 10 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  // Dönüş: { allowed, retryAfterMs, remaining }
  check(key) {
    const now = Date.now();
    const id = String(key || 'anon');
    let entry = this.hits.get(id);
    if (!entry || now - entry.start >= this.windowMs) {
      entry = { start: now, count: 0 };
      this.hits.set(id, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= this.max;
    return {
      allowed,
      remaining: Math.max(0, this.max - entry.count),
      retryAfterMs: allowed ? 0 : this.windowMs - (now - entry.start)
    };
  }

  reset(key) {
    this.hits.delete(String(key || 'anon'));
  }

  // Süresi dolmuş kayıtları temizler (uzun süre çalışan sunucuda bellek şişmesin).
  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now - entry.start >= this.windowMs) this.hits.delete(key);
    }
  }

  // Tüm sayaçları temizler (test/teşhis amaçlı).
  clear() {
    this.hits.clear();
  }
}

module.exports = { RateLimiter };