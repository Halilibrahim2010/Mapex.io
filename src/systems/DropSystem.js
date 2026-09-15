// Yerdeki eşyalar: sunucunun "drops" listesi tek doğruluk kaynağıdır.
// Sunucu desdeği eşyalar burada çizilir, E tuşuyla toplanınca sunucuya bildirilir.
import { getObjectDef } from '../core/ObjectDefs.js';

const PICKUP_RANGE = 60;
// Kendi bıraktığımız eşya hemen geri alınmasın (sunucu onayı gelene kadar).
const STAGED_LIFETIME_MS = 900;

export class DropSystem {
  constructor(scene) {
    this.scene = scene;
    this.records = new Map(); // dropId → { id, itemId, x, y, sprite, readyAt }
    this.staged = []; // sunucu onayı bekleyen yerel eşyalar
  }

  // Sunucuya sorulmadan gösterilen geçici eşya: görsel geri bildirim.
  // Gerçek kayıt sunucudan gelince eşleşirse çift görsel oluşmaz.
  stageMany(itemId, count, x, y) {
    const def = getObjectDef(itemId);
    if (!def || !def.textures.length) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sprite = this.scene.add.image(
        x + Math.cos(angle) * (24 + Math.random() * 26),
        y + 30 + Math.sin(angle) * 12,
        def.textures[0]
      ).setDepth(def.sprite.depth).setScale(def.sprite.scale || 1);
      this.staged.push({
        itemId,
        x: sprite.x,
        y: sprite.y,
        sprite,
        readyAt: performance.now() + STAGED_LIFETIME_MS
      });
    }
    this._collectStaged();
  }

  _collectStaged() {
    const now = performance.now();
    for (let i = this.staged.length - 1; i >= 0; i--) {
      const entry = this.staged[i];
      if (now < entry.readyAt) continue;
      // Sunucudan gelen kayıtla eşleşiyorsa çift görsel oluşmasın.
      const matched = this._findMatching(entry);
      entry.sprite.destroy();
      this.staged.splice(i, 1);
      if (!matched) {
        this.spawn({ id: `staged:auto:${Math.round(now)}:${i}`, itemId: entry.itemId, x: entry.x, y: entry.y });
      }
    }
  }

  _findMatching(entry) {
    for (const record of this.records.values()) {
      if (record.itemId !== entry.itemId) continue;
      if (Math.hypot(record.x - entry.x, record.y - entry.y) < 8) return record;
    }
    return null;
  }

  // Sunucudan gelen tam liste (bağlantı kurulunca / yeniden bağlanınca).
  applyState(drops) {
    for (const id of Array.from(this.records.keys())) this.remove(id);
    for (const entry of this.staged) entry.sprite.destroy();
    this.staged = [];
    for (const drop of drops || []) this.spawn(drop);
  }

  spawn(drop, delayMs = 0) {
    if (!drop || this.records.has(drop.id)) return;
    const def = getObjectDef(drop.itemId);
    if (!def || !def.textures.length) return;
    const sprite = this.scene.add.image(drop.x, drop.y, def.textures[0])
      .setDepth(def.sprite.depth)
      .setScale(def.sprite.scale || 1);
    // Hazır olma zamanı kaydın kendisinde: kayıt listesi tek biçimde gezilir.
    const record = {
      id: drop.id,
      itemId: drop.itemId,
      x: drop.x,
      y: drop.y,
      sprite,
      readyAt: performance.now() + delayMs
    };
    this.records.set(drop.id, record);
    this._playToss(record);
  }

  spawnMany(drops, delayMs = 0) {
    for (const drop of drops || []) this.spawn(drop, delayMs);
  }

  _playToss(record) {
    const sprite = record.sprite;
    this.scene.tweens.add({
      targets: sprite,
      y: record.y - 24,
      duration: 180,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => { sprite.y = record.y; }
    });
    this.scene.tweens.add({
      targets: sprite,
      angle: (Math.random() < 0.5 ? -1 : 1) * 90,
      duration: 360
    });
  }

  remove(id) {
    const record = this.records.get(id);
    if (!record) return;
    this.records.delete(id);
    if (record.sprite) record.sprite.destroy();
    for (let i = this.staged.length - 1; i >= 0; i--) {
      const entry = this.staged[i];
      if (Math.hypot(entry.x - record.x, entry.y - record.y) < 40) {
        entry.sprite.destroy();
        this.staged.splice(i, 1);
      }
    }
  }

  nearest() {
    return this._nearestIn(this.records);
  }

  // Hover/etkileşim sırası: önce hazır yerel eşya, sonra sunucu kayıtları.
  stagedNearest() {
    for (const entry of this.staged) {
      if (performance.now() < entry.readyAt) continue;
      const player = this.scene.player;
      if (!player) return null;
      if (Math.hypot(player.x - entry.x, player.y - entry.y) >= PICKUP_RANGE) continue;
      const def = getObjectDef(entry.itemId);
      if (!def) continue;
      return { record: { id: `staged:${entry.readyAt}`, itemId: entry.itemId, x: entry.x, y: entry.y, sprite: entry.sprite }, label: def.name };
    }
    return null;
  }

  _nearestIn(records) {
    const player = this.scene.player;
    if (!player) return null;
    const now = performance.now();
    let nearest = null;
    let nearestDistance = Infinity;
    for (const record of records.values()) {
      if (record.readyAt !== undefined && now < record.readyAt) continue;
      const distance = Math.hypot(player.x - record.x, player.y - record.y);
      if (distance >= PICKUP_RANGE || distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearest = record;
    }
    return nearest;
  }

  // E tuşu: en yakın eşyayı alma isteği (onay sunucudan gelir).
  pickupNearest() {
    const staged = this._nearestIn(this.staged);
    if (staged) {
      this._removeStaged(staged);
      this.scene.sfx.pickup();
      return true;
    }
    const record = this.nearest();
    if (!record) return false;
    this.scene.network.sendPickupDrop(record.id);
    this.scene.sfx.pickup();
    return true;
  }

  // Geçici eşyayı listeden çıkarır ve envantere eklenmesi için sunucuya bildirir.
  _removeStaged(entry) {
    const index = this.staged.indexOf(entry);
    if (index !== -1) this.staged.splice(index, 1);
    entry.sprite.destroy();
    this.scene.network.sendPick(entry.itemId);
  }
}