// Auth katmanının tek giriş noktası. Sunucu (server.js) yalnızca bu nesneyi
// kurar ve hazır geldiği sürece oyun kodundan ayrı kalır.
//
// ÖNEMLİ: Veritabanı (Prisma) yoksa katman sessizce bellek deposuna düşer.
// Böylece hesap sistemi opsiyonel bir eklenti gibi davranır; oyun onsuz da
// eksiksiz çalışır (misafir/çevrimdışı mod).
const { AuthService } = require('./AuthService');
const { TokenStore } = require('./TokenStore');
const { SessionFactory } = require('./SessionFactory');
const { MemoryUserRepository } = require('./MemoryUserRepository');
const { RateLimiter } = require('./RateLimiter');

function createAuthLayer(options = {}) {
  const repository = options.repository || new MemoryUserRepository();
  const tokens = new TokenStore(options.secret);
  const auth = new AuthService(repository, tokens);
  const sessions = new SessionFactory({ auth, repository }).useDefaults();

  return {
    repository,
    tokens,
    auth,
    sessions,
    mode: options.mode || (options.repository ? 'custom' : 'memory'),
    // Kaba kuvvet koruması: giriş/kayıt uçları bu sınırlayıcıdan geçer.
    limiters: {
      login: new RateLimiter({ windowMs: 60_000, max: 10 }),
      register: new RateLimiter({ windowMs: 60 * 60_000, max: 8 }),
      session: new RateLimiter({ windowMs: 60_000, max: 60 })
    }
  };
}

// Prisma'yı geç yükler: modül kurulu değilse hata fırlatmaz, null döner.
// Sunucu bu durumda bellek deposuyla çalışmaya devam eder.
function tryCreatePrismaClient() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PrismaClient } = require('@prisma/client');
    return new PrismaClient();
  } catch (error) {
    console.warn('[auth] @prisma/client bulunamadı; bellek deposu kullanılacak.', error.message);
    return null;
  }
}

module.exports = { createAuthLayer, tryCreatePrismaClient };