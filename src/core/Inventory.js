// Envanter: FIFO slot düzeni. Saf veri tutar, çizim yapmaz (bkz. ui/InventoryView).
import { getObjectDef, getGameData } from './ObjectDefs.js';

export class Inventory {
  constructor(maxSlots, maxStack) {
    this.maxSlots = maxSlots || getGameData().inventorySlots;
    this.maxStack = maxStack || getGameData().inventoryMaxStack;
    this.slots = new Array(this.maxSlots).fill(null);
  }

  // Sunucudan gelen mutlak durumu uygular (tek sahip sunucu).
  applyState(slots) {
    const next = new Array(this.maxSlots).fill(null);
    if (Array.isArray(slots)) {
      for (let i = 0; i < Math.min(slots.length, this.maxSlots); i++) {
        const slot = slots[i];
        if (slot && slot.itemId && slot.count > 0) next[i] = { itemId: slot.itemId, count: slot.count };
      }
    }
    this.slots = next;
  }

  stackLimit(itemId) {
    const def = getObjectDef(itemId);
    return (def && def.maxStack) || this.maxStack;
  }

  add(itemId, count = 1) {
    const def = getObjectDef(itemId);
    if (!def) return { added: 0, remaining: count };
    const limit = this.stackLimit(itemId);
    let remaining = Math.max(0, Math.floor(count));

    for (const slot of this.slots) {
      if (remaining <= 0) break;
      if (slot && slot.itemId === itemId && slot.count < limit) {
        const take = Math.min(remaining, limit - slot.count);
        slot.count += take;
        remaining -= take;
      }
    }
    for (let i = 0; i < this.maxSlots && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const take = Math.min(remaining, limit);
        this.slots[i] = { itemId, count: take };
        remaining -= take;
      }
    }
    return { added: Math.floor(count) - remaining, remaining };
  }

  remove(itemId, count = 1) {
    let remaining = Math.max(0, Math.floor(count));
    const requested = remaining;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (!slot || slot.itemId !== itemId) continue;
      const take = Math.min(remaining, slot.count);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.slots[i] = null;
    }
    return requested - remaining;
  }

  count(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  has(itemId, count = 1) {
    return this.count(itemId) >= count;
  }

  // Yerleşik sıraya göre dolu slotlar (hotbar/inventory çizimi için).
  filled() {
    return this.slots.map((slot, index) => ({ slot, index })).filter((entry) => entry.slot);
  }
}