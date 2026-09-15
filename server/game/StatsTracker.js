// Sunucu tarafı istatistik takibi: eksilen sayaçları "yıkım" olarak sayar.
// Oyuncu kaynağı yere bırakırsa istatistiği azaltır.
// Sayaç isimleri JSON'daki "stats" listesinden gelir; kodda sabit isim yoktur.
const GameData = require('./GameData');

class StatsTracker {
  constructor() {
    this.trackerOf = new Map();
    this.playerOf = new Map();
    this.values = new Map();
  }

  assign(socketId, trackerId) {
    if (!trackerId) return;
    const id = String(trackerId);
    this.playerOf.set(socketId, id);
    this.trackerOf.set(id, socketId);
    if (!this.values.has(id)) this.values.set(id, GameData.emptyStats());
  }

  idOf(socketId) {
    return this.playerOf.get(socketId) || null;
  }

  get(trackerId) {
    return this.values.get(trackerId) || GameData.emptyStats();
  }

  disconnect(socketId) {
    const id = this.playerOf.get(socketId);
    if (!id) return;
    this.playerOf.delete(socketId);
    // Aynı istatistiğe bağlı başka sekme yoksa belleği boşalt (kalıcı depolama yok).
    for (const owner of this.trackerOf.values()) {
      if (owner === id) return;
    }
    this.trackerOf.delete(id);
    this.values.delete(id);
  }

  // Soyut sayaç: delta > 0 artırır, delta < 0 azaltır.
  applyDelta(trackerId, stat, delta) {
    if (!trackerId || !delta) return;
    const values = this.get(trackerId);
    values[stat] = Math.max(0, (values[stat] || 0) + delta);
    this.values.set(trackerId, values);
  }

  // breakdown sonrası negatife düşen bakiyeyi geri verir (sayaç asla ekside kalmaz).
  creditBack(trackerId, stat, amount) {
    if (!trackerId || amount <= 0) return;
    const values = this.get(trackerId);
    values[stat] = (values[stat] || 0) + amount;
    this.values.set(trackerId, values);
  }
}

module.exports = { StatsTracker };