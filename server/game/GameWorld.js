// Sunucu dünyası: hangi nesne kaldırıldı + kim hangi eşyayı yerde bıraktı.
// Deterministik üretim istemcide olduğu için sunucu yalnızca değişiklikleri tutar.
const GameData = require('./GameData');

class GameWorld {
  constructor() {
    // kind → Set(id): kaldırılan nesneler (ağaç, taş, kaya…)
    this.removed = new Map();
    // Gerçekten denendiğinde kaldırılabilecek türler (diğer kind'ler reddedilir).
    this.removableKinds = GameData.removableIds();
    // Yerdeki eşyalar: { id, itemId, x, y, at }
    this.drops = [];
  }

  isRemovable(kind) {
    return this.removableKinds.indexOf(kind) !== -1;
  }

  remove(kind, id) {
    if (!this.isRemovable(kind)) return false;
    let set = this.removed.get(kind);
    if (!set) {
      set = new Set();
      this.removed.set(kind, set);
    }
    if (set.has(id)) return false;
    set.add(id);
    return true;
  }

  snapshot() {
    const removed = [];
    for (const [kind, ids] of this.removed) {
      for (const id of ids) removed.push({ kind, id });
    }
    return { removed, drops: this.drops };
  }
}

module.exports = { GameWorld };