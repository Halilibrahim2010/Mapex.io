// Dünyadaki nesneler (taş, kaya, ağaç, çiçek, lamba…) tek katmanda yaşar.
// Hangi türün nasıl çizileceği tamamen shared/objectDefs.json'dan gelir:
// yeni bir nesne eklemek için buraya kod yazmak GEREKMEZ.
import { eachChunkInWindow } from '../world/WindowHelper.js';
import { getObjectDef, getGameData } from '../core/ObjectDefs.js';

export class ObjectLayer {
  constructor(scene, generator, terrain, removed) {
    this.scene = scene;
    this.gen = generator;
    this.terrain = terrain;
    this.removed = removed; // kind → Set(id)
    this.records = new Map(); // id → kayıt (görsel + veri)
    this.colliders = new Map(); // id → { x, y, w, h } (sadece obstacle türleri)
    this.lights = new Map(); // id → { x, y, radius, strength } (gece ışığı yayanlar)
    this.stumps = []; // kesilen ağaçlardan kalan gövdeler
    this._lastX = null;
    this._lastY = null;
    this.types = getGameData().defs;
  }

  update(cx, cy) {
    if (cx === this._lastX && cy === this._lastY) return;
    this._lastX = cx;
    this._lastY = cy;

    const visible = new Set();
    eachChunkInWindow(cx, cy, this.scene.RENDER_DISTANCE, (chunkX, chunkY) => {
      const perType = this.gen.generateObjects(chunkX, chunkY);
      for (const [type, list] of Object.entries(perType)) {
        for (const data of list) {
          const id = `${type}:${chunkX},${chunkY}:${data.index}`;
          if (this.removed[type] && this.removed[type].has(id)) continue;
          visible.add(id);
          if (!this.records.has(id)) this._build(id, type, data);
        }
      }
    });

    for (const [id, record] of this.records) {
      if (visible.has(id)) continue;
      this._destroy(id, record);
    }
  }

  _build(id, type, data) {
    const def = getObjectDef(type);
    if (!def) return;
    const sprite = this._createSprite(def, data);
    const record = {
      id,
      type,
      def,
      data,
      sprite,
      progress: 0,
      interruptible: def.kind !== 'decor',
      harvestable: def.choppable,
      pickupable: def.pickable
    };
    this.records.set(id, record);

    if (def.sprite.collider) {
      const size = this.gen.tileSize * def.sprite.collider;
      this.colliders.set(id, {
        x: data.x - size / 2,
        y: data.y - size / 2 + (def.sprite.colliderOffsetY || 0),
        w: size,
        h: size
      });
    }
    if (def.light) {
      this.lights.set(id, { x: data.x, y: data.y, radius: def.light.radius, strength: def.light.strength });
    }
  }

  _createSprite(def, data) {
    const texture = data.texture || def.textures[0];
    if (!texture) return null;
    const sprite = this.scene.add.image(data.x, data.y, texture);
    const origin = def.sprite.origin;
    sprite.setOrigin(origin === undefined ? 0.5 : origin, def.sprite.originY === undefined ? 0.5 : def.sprite.originY);
    if (def.sprite.scale) sprite.setScale(def.sprite.scale);
    if (def.sprite.display) {
      const size = this.gen.tileSize * def.sprite.display;
      sprite.setDisplaySize(size, size);
    }
    sprite.setDepth(def.sprite.depth === 3000 ? this._sortDepth(data.y) : def.sprite.depth);
    return sprite;
  }

  // Y-sort: nesne ayağı kameraya göre derinlik alır (ağaçlar oyuncunun önünde/arkasında).
  _sortDepth(feetY) {
    return 3000 + Math.round(feetY - this.scene.cameras.main.scrollY);
  }

  refreshDepths() {
    for (const record of this.records.values()) {
      if (record.def.sprite.depth !== 3000 || !record.sprite) continue;
      record.sprite.setDepth(this._sortDepth(record.data.y));
    }
  }

  // Kırılan/kesilen nesne: görsel bırakır (stump), eşya düşürür.
  remove(id) {
    const record = this.records.get(id);
    if (!record) return null;
    const def = record.def;
    const x = record.data.x;
    const y = record.data.y;
    this._destroy(id, record);
    if (def.stump) this._createStump(def, x, y);
    const drop = def.drop ? { itemId: def.drop.itemId, count: def.drop.count, x, y } : null;
    return { x, y, drop };
  }

  _createStump(def, x, y) {
    const texture = def.stumpTexture;
    if (!texture || !this.scene.textures.exists(texture)) return;
    const stump = def.stump;
    const sprite = this.scene.add.image(
      x + (stump.offsetX || 0),
      y + (stump.offsetY || 0),
      texture
    ).setScale(stump.scale || 1).setDepth(def.sprite.depth === 3000 ? 2 : def.sprite.depth);
    this.stumps.push({ sprite, x, y, collider: stump.collider });
  }

  _destroy(id, record) {
    if (record.sprite) record.sprite.destroy();
    this.records.delete(id);
    this.colliders.delete(id);
    this.lights.delete(id);
  }

  get(id) {
    return this.records.get(id) || null;
  }

  markRemoved(id) {
    const record = this.records.get(id);
    if (!record) return null;

    if (!this.removed[record.type]) {
      this.removed[record.type] = new Set();
    }

    this.removed[record.type].add(id);

    return this.remove(id);
  }


  // Kırma/hedefleme arayüzü: verilen dünya noktasına denk gelen en yakın nesne.
  pick(worldX, worldY, predicate) {
    let best = null;
    let bestDistance = Infinity;
    for (const record of this.records.values()) {
      if (predicate && !predicate(record)) continue;
      const hit = this._hitTest(record, worldX, worldY);
      if (!hit) continue;
      const dx = worldX - record.data.x;
      const dy = worldY - record.data.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = record;
      }
    }
    return best;
  }

  _hitTest(record, worldX, worldY) {
    const def = record.def;
    const harvest = def.harvest;
    if (!harvest) return false;
    const dx = Math.abs(worldX - record.data.x);
    const dy = worldY - record.data.y;
    return dx <= harvest.hitHalfWidth && dy >= -40 && dy <= 40;
  }

  // Türün etkileşim türüne göre ilk aday (toplanabilir eşya için).
  pickClosestByKind(worldX, worldY, kind) {
    return this.pick(worldX, worldY, (record) => record.def.kind === kind);
  }

  all() {
    return this.records.values();
  }
}