// SessionFactory: "hangi oturum tipi kullanılacak" kararını veren TEK yer.
//
// Oyun kodu bu sınıfı çağırır, tip ayrımını asla kendisi yapmaz:
//   const session = await sessions.forConnection({ token, displayName, ip });
//
// Adapter deseni: kayıtlı sağlayıcılar sırayla denenir; ilk uyan kazanır.
// Yeni bir oturum türü eklemek için yeni bir provider kaydetmek yeterlidir —
// oyun kodu ve bu sınıfın geri kalanı değişmez.
const { GuestSession } = require('./GuestSession');
const { AccountSession } = require('./AccountSession');

class SessionFactory {
  constructor({ auth, repository } = {}) {
    this.auth = auth || null;
    this.repository = repository || null;
    this.providers = [];
  }

  // Registrable provider: { name, resolve(context) -> UserSession | null }
  addProvider(provider) {
    if (provider && typeof provider.resolve === 'function') this.providers.push(provider);
    return this;
  }

  // Varsayılan sağlayıcılar: jetonlu hesap > misafir.
  // Sıra önemlidir: hesap bulunursa misafire düşülmez.
  useDefaults() {
    this.addProvider({
      name: 'account',
      resolve: async (context) => {
        if (!context || !context.token || !this.auth) return null;
        const identity = this.auth.verifyToken(context.token);
        if (!identity) return null;
        const account = await this.repository.readAccount(identity.userId);
        if (!account) return null;
        const session = new AccountSession({
          userId: account.id,
          username: account.username,
          email: account.email,
          role: account.role,
          isVerified: account.isVerified,
          gold: account.gold,
          gems: account.gems,
          level: account.level,
          xp: account.xp,
          provider: { economy: this.repository, inventory: this.repository }
        });
        await session.refresh();
        return session;
      }
    });
    this.addProvider({
      name: 'guest',
      resolve: async (context) => new GuestSession({
        displayName: (context && context.displayName) || 'Misafir'
      })
    });
    return this;
  }

  async forConnection(context = {}) {
    for (const provider of this.providers) {
      try {
        const session = await provider.resolve(context);
        if (session) return session;
      } catch (error) {
        // Bozuk jeton gibi durumlarda oyuncuyu dışarıda bırakmak yerine
        // bir sonraki sağlayıcıya (misafir) düşeriz: oyun her zaman başlar.
        if (context && context.onError) context.onError(provider.name, error);
      }
    }
    return new GuestSession({ displayName: (context && context.displayName) || 'Misafir' });
  }
}

module.exports = { SessionFactory };