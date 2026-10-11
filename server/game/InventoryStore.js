// Sunucu tarafı envanter deposu: oyuncuların envanteri + yerdeki eşyalar.
// Kalıcı depolama yok; sunucu yeniden başlayınca sıfırlanır (bellek içi state).
const GameData = require('./GameData');
const CraftingData = require('./CraftingData');
const StatsTracker = require('./StatsTracker').StatsTracker;
const MAX_DROPS = 200;

class InventoryStore {
  constructor(gameWorld) {
    this.gameWorld = gameWorld;
    this.byTracker = new Map();
    this.stats = new StatsTracker();
    this.dropSeq = 0;
  }

  of(trackerId) {
    if (!trackerId) return null;
    let inv = this.byTracker.get(trackerId);
    if (!inv) {
      inv = GameData.emptyInventory();
      this.byTracker.set(trackerId, inv);
    }
    return inv;
  }

  snapshot(trackerId) {
    const inv = this.of(trackerId);
    return {
      slots: inv ? inv.slots : [],
      stats: this.stats.get(trackerId),
      drops: this.gameWorld.drops
    };
  }

  // Kaynak toplama: sunucu envanteri ve istatistikleri günceller.
  // Hangi kaynağın hangi sayacı artırdığı JSON'daki "stats" alanından gelir.
  pick(socketId, itemId) {
    const trackerId = this.stats.idOf(socketId);
    if (!trackerId || !GameData.isKnownItem(itemId)) return null;
    const result = GameData.addToInventory(this.of(trackerId), itemId, 1);
    if (result.added === 0) return this.snapshot(trackerId);
    this._creditResource(trackerId, itemId, result.added);
    return this.snapshot(trackerId);
  }

  // Toplanan kaynağa bağlı sayaçları artırır (tanım yoksa hiçbir şey yapmaz).
  _creditResource(trackerId, itemId, amount) {
    for (const stat of GameData.statsForResource(itemId)) {
      this.stats.applyDelta(trackerId, stat.id, amount);
    }
  }

  // Kırılan nesneye bağlı sayaçları artırır: kesilen ağaç ve kesilen kütük
  // aynı eşyayı (odun) verse de ayrı sayaçlarda sayılır (JSON'daki "source").
  _creditSource(trackerId, kind, amount = 1) {
    for (const stat of GameData.statsForSource(kind)) {
      this.stats.applyDelta(trackerId, stat.id, amount);
    }
  }

  // Kesme tamamlandı: nesne dünyadan düşer ve tanımındaki "drop" eşyası
  // (count..countMax arası rastgele adet) yere serilir. Rastgelelik sunucuda
  // üretilir; böylece tüm istemciler aynı düşenleri görür.
  chop(socketId, kind, id, x, y) {
    const trackerId = this.stats.idOf(socketId);
    if (!trackerId) return null;
    const ox = Number(x) || 0;
    const oy = Number(y) || 0;

    const def = GameData.def(kind);
    const drop = def && def.drop;
    const drops = [];
    if (drop) {
      const min = Math.max(1, Math.floor(drop.count || 1));
      const max = Math.max(min, Math.floor(drop.countMax || min));
      const count = min + Math.floor(Math.random() * (max - min + 1));
      for (let i = 0; i < count; i++) drops.push(this._pushDrop(drop.itemId, ox, oy));
    }

    // Nesne zaten başka istemci tarafından kaldırılmışsa düşenleri yine de ver.
    const removed = this.gameWorld.remove(kind, id);
    if (!removed && drops.length === 0) return null;
    // Sayaç yalnızca gerçekten kırıldığında artar (çift sayım olmaz).
    if (removed) this._creditSource(trackerId, kind, 1);
    return { drops };
  }

  // Yere eşya bırakma: envanterden düşer, dünya drop listesine eklenir.
  breakdown(socketId, itemId, n, x, y) {
    const trackerId = this.stats.idOf(socketId);
    if (!trackerId || !GameData.isKnownItem(itemId)) return null;
    const requested = Math.max(0, Math.min(99, Math.floor(Number(n) || 0)));
    if (requested === 0) return this.snapshot(trackerId);
    const result = GameData.removeFromInventory(this.of(trackerId), itemId, requested);
    if (result.removed === 0) return this.snapshot(trackerId);
    const drops = [];
    for (let i = 0; i < result.removed; i++) {
      drops.push(this._pushDrop(itemId, x, y));
    }
    return { snapshot: this.snapshot(trackerId), drops };
  }

  _pushDrop(itemId, x, y) {
    const drop = { id: `d${++this.dropSeq}`, itemId, x: Number(x) || 0, y: Number(y) || 0, at: Date.now() };
    this.gameWorld.drops.push(drop);
    while (this.gameWorld.drops.length > MAX_DROPS) this.gameWorld.drops.shift();
    return drop;
  }

  // Yerdeki eşyayı al: dünyadan silinir, envantere girer.
  takeDrop(socketId, dropId) {
    const trackerId = this.stats.idOf(socketId);
    if (!trackerId) return null;
    const index = this.gameWorld.drops.findIndex((d) => d.id === dropId);
    if (index === -1) return null;
    const drop = this.gameWorld.drops.splice(index, 1)[0];
    const result = GameData.addToInventory(this.of(trackerId), drop.itemId, 1);
    if (result.added === 0) {
      // Envanter dolu: eşya yerinde kalsın.
      this.gameWorld.drops.splice(index, 0, drop);
      return this.snapshot(trackerId);
    }
    this._creditResource(trackerId, drop.itemId, result.added);
    return this.snapshot(trackerId);
  }

  // Üretim: istemci tarif kimliği + slot içeriğini gönderir, sunucu doğrular.
  // Tarif eşleşmezse, girdi yetersizse veya çıktı sığmazsa üretim yapılmaz.
  craft(socketId, recipeId, slots) {
    const trackerId = this.stats.idOf(socketId);
    if (!trackerId || typeof recipeId !== 'string') return null;
    const recipe = CraftingData.getRecipe(recipeId);
    if (!recipe) return null;
    // İstemcinin gönderdiği slotlar tarifle birebir eşleşmeli (sıra + adet).
    const norm = (slots || []).map((slot) =>
      slot && slot.itemId ? { itemId: slot.itemId, count: Math.floor(slot.count) || 0 } : null
    );
    while (norm.length < 4) norm.push(null);
    let matched = true;
    for (let i = 0; i < 4; i++) {
      const want = recipe.inputs[i] || null;
      const got = norm[i];
      if (!want && !got) continue;
      if (!want || !got) { matched = false; break; }
      if (want.itemId !== got.itemId || got.count < want.count) { matched = false; break; }
    }
    if (!matched) return null;
    const inv = this.of(trackerId);
    // Girdiler gerçekten envanterde mi? (istemci yalan söylüyor olabilir)
    for (const input of recipe.inputs) {
      let total = 0;
      for (const slot of inv.slots) {
        if (slot && slot.itemId === input.itemId) total += slot.count;
      }
      if (total < input.count) return null;
    }
    // Önce girdileri düş, sonra çıktıyı ekle (çıktı sığmazsa girdiler iade).
    const removed = [];
    for (const input of recipe.inputs) {
      const result = GameData.removeFromInventory(inv, input.itemId, input.count);
      removed.push({ itemId: input.itemId, count: result.removed });
      if (result.removed < input.count) {
        for (const back of removed) {
          if (back.count > 0) GameData.addToInventory(inv, back.itemId, back.count);
        }
        return null;
      }
    }
    // Uretilen esya objectDefs'te tanimli (tarif dogrulamada bakildi).
    const outResult = GameData.addToInventory(inv, recipe.output.itemId, recipe.output.count);
    if (outResult.added < recipe.output.count) {
      // Çıktı tam sığmadı: ekleneni geri al, girdileri iade et.
      if (outResult.added > 0) GameData.removeFromInventory(inv, recipe.output.itemId, outResult.added);
      for (const back of removed) {
        if (back.count > 0) GameData.addToInventory(inv, back.itemId, back.count);
      }
      return null;
    }
    return this.snapshot(trackerId);
  }

  disconnect(socketId) {
    this.stats.disconnect(socketId);
  }
}

module.exports = { InventoryStore };