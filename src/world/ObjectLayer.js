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
    const { sprite, shadow, groundY } = this._createSprite(def, data);
    const record = {
      id,
      type,
      def,
      data,
      sprite,
      shadow,
      groundY,
      progress: 0,
      interruptible: def.kind !== 'decor',
      harvestable: def.choppable,
      pickupable: def.pickable
    };
    this.records.set(id, record);

    // Çarpışma kutusu nesnenin AYAK İZİDİR: yere basan noktaya göre
    // ortalanır, genişliği/derinliği colliderW/colliderH ile verilir.
    // (collider tek sayıysa kare kabul edilir — eski tanımlar bozulmasın.)
    if (def.sprite.collider) {
      const w = def.sprite.colliderW !== undefined
        ? def.sprite.colliderW
        : def.sprite.collider * this.gen.tileSize;
      const h = def.sprite.colliderH !== undefined
        ? def.sprite.colliderH
        : def.sprite.collider * this.gen.tileSize;
            this.colliders.set(id, {
        x: data.x - w / 2,
        y: groundY - h,
        w,
        h
            });
    }
    if (def.light) {
      this.lights.set(id, { x: data.x, y: data.y, radius: def.light.radius, strength: def.light.strength });
    }
  }

    _createSprite(def, data) {
    const texture = data.texture || def.textures[0];
    if (!texture) return { sprite: null, shadow: null };
    const sprite = this.scene.add.image(data.x, data.y, texture);
    const origin = def.sprite.origin;
    sprite.setOrigin(origin === undefined ? 0.5 : origin,
      def.sprite.originY === undefined ? 0.5 : def.sprite.originY);
    if (def.sprite.scale) sprite.setScale(def.sprite.scale);
    if (def.sprite.display) {
      const size = this.gen.tileSize * def.sprite.display;
      sprite.setDisplaySize(size, size);
    }
    // groundOffset: sprite merkezinden yere dokunana kadar olan mesafe (px).
    // Gölge ve çarpışma kutusu bu ortak "yer çizgisine" göre hizalanır.
    const groundY = data.y + (def.sprite.groundOffset || 0);
    const depth = def.sprite.depth === 3000 ? this._sortDepth(groundY) : def.sprite.depth;
    sprite.setDepth(depth);
    const shadow = this._createShadow(def, data.x, groundY);
    if (shadow) shadow.setDepth(depth - 1);
    return { sprite, shadow, groundY };
  }

  // Gölge: tanımdaki "shadow" bloğu varsa nesnenin AYAKLARININ ALTINA,
  // nesnenin hemen ARKASINA (depth - 1) yumuşak bir leke çizilir.
  // Hangi gölge asset'inin (1..6) kullanılacağı ve ne kadar yayılacağı
  // tamamen JSON'dan gelir; kodda nesne adı geçmez.
  _createShadow(def, x, groundY) {
    const shadow = def.shadow;
    const texture = def.shadowTexture;
    if (!shadow || !texture || !this.scene.textures.exists(texture)) return null;
    // offsetY yer çizgisinden ölçülür; 0 gölgeyi tam ayağın üstüne oturtur.
    const sprite = this.scene.add.image(x + (shadow.offsetX || 0), groundY + (shadow.offsetY || 0), texture);
    if (shadow.width && shadow.height) sprite.setDisplaySize(shadow.width, shadow.height);
    if (shadow.alpha !== undefined) sprite.setAlpha(shadow.alpha);
    sprite.setOrigin(0.5, 0.5);
    return sprite;
  }

  // Y-sort: nesne ayağı kameraya göre derinlik alır (ağaçlar oyuncunun önünde/arkasında).
  _sortDepth(feetY) {
    return 3000 + Math.round(feetY - this.scene.cameras.main.scrollY);
  }

  refreshDepths() {
    for (const record of this.records.values()) {
      if (record.def.sprite.depth !== 3000 || !record.sprite) continue;
      const depth = this._sortDepth(record.groundY);
      record.sprite.setDepth(depth);
      // Gölge her zaman nesnenin bir alt katmanında kalmalı.
      if (record.shadow) record.shadow.setDepth(depth - 1);
    }
  }

  // Kırılan/kesilen nesne: görsel bırakır (stump), eşya düşürür.
  remove(id) {
    const record = this.records.get(id);
    if (!record) return null;
    const def = record.def;
    const x = record.data.x;
    const y = record.data.y;
    const groundY = record.groundY;
    this._destroy(id, record);
    if (def.stump) this._createStump(def, x, groundY);
    const drop = def.drop ? { itemId: def.drop.itemId, count: def.drop.count, x, y } : null;
    return { x, y, drop };
  }

  // Kalıntı (stump) nesnenin yer çizgisine oturur: artık havada durmaz.
  _createStump(def, x, groundY) {
    const texture = def.stumpTexture;
    if (!texture || !this.scene.textures.exists(texture)) return;
    const stump = def.stump;
    const sx = x + (stump.offsetX || 0);
    const sy = groundY + (stump.offsetY || 0);
    const shadow = this._createShadowFrom(stump.shadow || def.shadow, sx, sy);
    const sprite = this.scene.add.image(sx, sy, texture)
      .setScale(stump.scale || 1)
      .setDepth(def.sprite.depth === 3000 ? 2 : def.sprite.depth);
    if (shadow) shadow.setDepth(sprite.depth - 1);
    this.stumps.push({ sprite, shadow, x, y: groundY, collider: stump.collider });
  }

  // Verilen gölge bloğundan sprite üretir (stump gibi yerel gölgeler için).
  _createShadowFrom(shadow, x, y) {
    if (!shadow) return null;
    const texture = this._shadowFile(shadow);
    if (!texture || !this.scene.textures.exists(texture)) return null;
    const sprite = this.scene.add.image(x + (shadow.offsetX || 0), y + (shadow.offsetY || 0), texture);
    if (shadow.width && shadow.height) sprite.setDisplaySize(shadow.width, shadow.height);
    if (shadow.alpha !== undefined) sprite.setAlpha(shadow.alpha);
    return sprite;
  }

  _shadowFile(shadow) {
    return shadow.atlas ? shadow.atlas.replace('{n}', String(shadow.n)) : null;
  }

  _destroy(id, record) {
    if (record.sprite) record.sprite.destroy();
    if (record.shadow) record.shadow.destroy();
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