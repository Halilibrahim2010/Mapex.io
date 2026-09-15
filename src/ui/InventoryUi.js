// Envanter ve HUD yardımcıları: MainScene'i sade tutmak için envanter
// sıralaması, özet metni ve arayüz tazeleme burada toplanır. Hangi kaynağın
// gösterileceği JSON tanımlarından (stats) gelir; kodda kaynak adı geçmez.
import { statsList } from '../core/ObjectDefs.js';

export class InventoryUi {
  constructor(scene) {
    this.scene = scene;
  }

  // Hotbar/envanter çizimi için sıralı liste (yalnızca dolu slotlar).
  items() {
    return this.scene.inventory.slots
      .map((slot, index) => ({ slot, index }))
      .filter((entry) => entry.slot);
  }

  // Özet satırı: sayaçlar JSON'dan, kaynak adları nesne tanımından gelir.
  summaryText() {
    const scene = this.scene;
    const stats = scene.stats || {};
    const parts = statsList()
      .filter((stat) => Number.isFinite(stats[stat.id]))
      .map((stat) => `${stat.label}: ${stats[stat.id]}`);
    for (const stat of statsList()) {
      if (stat.resource) {
        parts.push(`${scene.inventoryView.labelOf(stat.resource)}: ${scene.inventory.count(stat.resource)}`);
      }
    }
    return parts.join('    •    ');
  }

  // HUD ve envanter görünümünü envanter durumuna göre tazeler.
  refresh() {
    const scene = this.scene;
    const items = this.items();
    scene.hud.update(items.map((entry) => ({
      itemId: entry.slot.itemId,
      name: scene.inventoryView.labelOf(entry.slot.itemId),
      count: entry.slot.count
    })));
    scene.inventoryView.refreshHotbar(items);
    if (!scene.inventoryView.isOpen) return;
    scene.inventoryView.refresh(items, this.summaryText());
  }
}