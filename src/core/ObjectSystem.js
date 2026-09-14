// Veri odaklı nesne sistemi — Placement, Inventory, Factory
import { OBJECT_DEFS, getObjectDef } from './ObjectDefs.js';

// === PLACEMENT SYSTEM ===
// Tile tabanlı boyutlara göre nesneyi ortalar + collider hesaplar
export class PlacementSystem {
  constructor(chunkSize, tileSize) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
  }

  // Verilen tile boyutuna göre nesneyi ortalar
  // 3x2 nesne → (1, 0.5) offset ile ortalanır
  getPlacement(objDef, chunkX, chunkY, cellX, cellY) {
    const { tileW, tileH } = objDef;

    // Merkez offset: nesne (tileW x tileH) karo alanının ortasına hizalanır
    const centerX = cellX + (tileW - 1) / 2;
    const centerY = cellY + (tileH - 1) / 2;

    // Dünya piksel koordinatı
    const worldX = (chunkX * this.chunkSize + centerX) * this.tileSize;
    const worldY = (chunkY * this.chunkSize + centerY) * this.tileSize;

    return { worldX, worldY, tileW, tileH };
  }

  // Çarpışma kutusu (collider) — merkez + boyut
  getCollider(objDef, worldX, worldY) {
    const { tileW, tileH } = objDef;
    const w = tileW * this.tileSize;
    const h = tileH * this.tileSize;
    return {
      x: Math.round(worldX - w / 2),
      y: Math.round(worldY - h / 2),
      w, h
    };
  }
}

// === INVENTORY SYSTEM ===
// FIFO slot order — ilk alınan item ilk boş slota gider
export class InventorySystem {
  constructor(maxSlots = 15, maxStack = 99) {
    this.maxSlots = maxSlots;
    this.maxStack = maxStack;
    this.slots = new Array(maxSlots).fill(null); // [null, null, ...]
  }

  // Item ekle — FIFO: önce var olan stack'lere, sonra boş slot
  add(itemId, count = 1) {
    const def = getObjectDef(itemId);
    if (!def || !def.pickable) return { success: false, added: 0 };

    const stackLimit = def.maxStack || this.maxStack;
    let remaining = count;
    let added = 0;

    // 1. Var olan stack'lere ekle (same item)
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId && slot.count < stackLimit) {
        const add = Math.min(remaining, stackLimit - slot.count);
        slot.count += add;
        remaining -= add;
        added += add;
        if (remaining === 0) break;
      }
    }

    // 2. Boş slota ekle
    if (remaining > 0) {
      for (let i = 0; i < this.maxSlots; i++) {
        if (this.slots[i] === null) {
          const add = Math.min(remaining, stackLimit);
          this.slots[i] = { itemId, count: add };
          remaining -= add;
          added += add;
          if (remaining === 0) break;
        }
      }
    }

    return { success: remaining === 0, added, remaining };
  }

  // Slot index'e göre item al (UI binding)
  getSlot(index) {
    return this.slots[index];
  }

  // Slot temizle
  clearSlot(index, count = null) {
    if (this.slots[index]) {
      if (count === null) {
        this.slots[index] = null;
      } else {
        this.slots[index].count -= count;
        if (this.slots[index].count <= 0) this.slots[index] = null;
      }
    }
  }

  // Toplam item sayısı
  totalItem(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  // Boş slot sayısı
  emptySlots() {
    return this.slots.filter(s => s === null).length;
  }

  // Item var mı?
  hasItem(itemId, count = 1) {
    return this.totalItem(itemId) >= count;
  }
}

// === OBJECT FACTORY ===
// Nesne oluşturma + alma + kırma mantığı
export class ObjectFactory {
  constructor(scene, inventory, placement) {
    this.scene = scene;
    this.inventory = inventory;
    this.placement = placement;
  }

  // World'e nesne ekle (chunk + cell pozisyonuyla)
  spawn(itemId, chunkX, chunkY, cellX, cellY) {
    const def = getObjectDef(itemId);
    if (!def) return null;

    const { worldX, worldY, tileW, tileH } = this.placement.getPlacement(
      def, chunkX, chunkY, cellX, cellY
    );

    const collider = this.placement.getCollider(def, worldX, worldY);

    const obj = {
      def,
      worldX, worldY,
      tileW, tileH,
      collider,
      sprite: this.createSprite(def, worldX, worldY),
      isPickable: def.pickable
    };

    return obj;
  }

  createSprite(def, x, y) {
    return this.scene.add.image(x, y, def.icon).setOrigin(0.5, 0.5);
  }

  // Alma mantığı
  pickUp(obj) {
    if (!obj || !obj.def.pickable) return { success: false, added: 0 };
    return this.inventory.add(obj.def.id, 1);
  }

  // Kırma mantığı (tree → wood drop)
  break(obj) {
    const dropId = obj.def.onBreak;
    if (dropId && obj.sprite) {
      // World'e drop ekle
      this.spawnDrop(dropId, obj.worldX, obj.worldY);
    }
    if (obj.sprite) obj.sprite.destroy();
  }

  spawnDrop(itemId, x, y) {
    const def = getObjectDef(itemId);
    if (!def) return null;
    const sprite = this.scene.add.image(x, y, def.icon).setDepth(3).setScale(0.8);
    return { def, x, y, sprite, readyAt: performance.now() };
  }
}