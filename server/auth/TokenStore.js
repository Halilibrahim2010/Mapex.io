// Oturum jetonları: HMAC-SHA256 ile imzalanmış, kendini taşıyan (stateless)
// token'lar. JWT ile aynı fikirdedir ancak bağımlılık gerektirmez.
//
// Biçim:  <base64url(payload)>.<base64url(imza)>
//   payload: { sub: userId, role, sid: oturum kimliği, iat, exp }
//
// Not: Jeton yalnızca "kim olduğunu" söyler. Bakiye gibi oyun verisi asla
// jetondan okunmaz; her zaman veritabanından (tek doğruluk kaynağı) okunur.
const crypto = require('crypto');

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 gün

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

class TokenStore {
  // secret verilmezse ortam değişkeni, o da yoksa geçici rastgele anahtar
  // kullanılır (sunucu yeniden başlarsa oturumlar düşer — geliştirme için kabul).
  constructor(secret) {
    this.secret = secret || process.env.MAPEX_AUTH_SECRET || crypto.randomBytes(32).toString('hex');
    this.ttlMs = DEFAULT_TTL_MS;
  }

  sign(payload, ttlMs) {
    const now = Date.now();
    const body = { ...payload, iat: now, exp: now + (ttlMs || this.ttlMs) };
    const encoded = base64url(JSON.stringify(body));
    return `${encoded}.${this._mac(encoded)}`;
  }

  // Geçerliyse payload döner, aksi halde null (bozuk, imza hatalı veya süresi geçmiş).
  verify(token) {
    if (typeof token !== 'string' || token.indexOf('.') === -1) return null;
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = this._mac(encoded);
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    let payload;
    try {
      payload = JSON.parse(fromBase64url(encoded));
    } catch (error) {
      return null;
    }
    if (!payload || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  }

  _mac(encoded) {
    return base64url(crypto.createHmac('sha256', this.secret).update(encoded).digest());
  }

  newSessionId() {
    return crypto.randomUUID();
  }
}

module.exports = { TokenStore, DEFAULT_TTL_MS };