// Sunucunun veri katmanı: tek kaynak shared/objectDefs.json.
// İstemci ObjectDefs.js'i, sunucu ise GameData.js kullanır → tanım iki yerde tutulmaz.
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', '..', 'shared', 'objectDefs.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const objects = data.objects || {};
const stats = data.stats || [];

function def(id) {
  return objects[id] || null;
}

// Sayaç tanımları JSON'dan gelir: hangi kaynak hangi sayacı artırır?
// Örn. { id: 'chopped', label: 'Kesilen Ağaç', resource: 'wood' }
function emptyStats() {
  const result = {};
  for (const stat of stats) result[stat.id] = 0;
  return result;
}

// Kaynak eşyasına göre sayaçlar (toplama sırasında: taş/odun…).
// "source" alanı olan sayaçlar yalnızca o nesne kırıldığında artar; böylece
// "Kesilen Ağaç" ve "Kesilen Kütük" aynı eşyayı (wood) verse de ayrı sayılır.
function statsForResource(itemId) {
  return stats.filter((stat) => stat.resource === itemId && !stat.source);
}

// Belirli bir nesne türü kırıldığında artacak sayaçlar (ör. kind='log').
function statsForSource(kind) {
  return stats.filter((stat) => stat.source === kind);
}

// Elenebilir (dünyadan kaldırılabilir) nesneler ve id şeması:
//   <itemId>:<chunkX>,<chunkY>:<index>
function removableIds() {
  return Object.keys(objects).filter((id) => {
    const d = objects[id];
    return d.interaction === 'pickup' || d.interaction === 'hold' || Boolean(d.drop);
  });
}

function isKnownItem(id) {
  return Boolean(def(id) && def(id).kind === 'resource');
}

// Envanter kaydındaki item_type alanı için: tanımdaki "kind" (resource,
// harvestable...) yoksa 'misc'. Veritabanına yazılan tek resmi tür kaynağı.
function typeOfItem(id) {
  const d = def(id);
  return (d && d.kind) || 'misc';
}

function stackLimit(id) {
  const d = def(id);
  return d && d.maxStack ? d.maxStack : 0;
}

// Envanter slotları saf veri: kıyafet, eşya, kaynak… hepsi aynı şekilde taşınır.
function emptyInventory() {
  return {
    slots: new Array(data.inventorySlots || 15).fill(null),
    stats: emptyStats()
  };
}

function addToInventory(inv, itemId, count) {
  const limit = stackLimit(itemId) || (data.inventoryMaxStack || 99);
  let remaining = Math.max(0, Math.floor(count));
  let added = 0;

  if (!isKnownItem(itemId)) return { added: 0, remaining };

  for (const slot of inv.slots) {
    if (remaining <= 0) break;
    if (slot && slot.itemId === itemId && slot.count < limit) {
      const take = Math.min(remaining, limit - slot.count);
      slot.count += take;
      remaining -= take;
      added += take;
    }
  }
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    if (inv.slots[i] === null) {
      const take = Math.min(remaining, limit);
      inv.slots[i] = { itemId, count: take };
      remaining -= take;
      added += take;
    }
  }
  return { added, remaining };
}

function removeFromInventory(inv, itemId, count) {
  let remaining = Math.max(0, Math.floor(count));
  for (let i = inv.slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = inv.slots[i];
    if (!slot || slot.itemId !== itemId) continue;
    const take = Math.min(remaining, slot.count);
    slot.count -= take;
    remaining -= take;
    if (slot.count <= 0) inv.slots[i] = null;
  }
  return { removed: Math.floor(count) - remaining };
}

module.exports = {
  data,
  objects,
  def,
  typeOfItem,
  removableIds,
  isKnownItem,
  stackLimit,
  emptyStats,
  statsForResource,
  statsForSource,
  emptyInventory,
  addToInventory,
  removeFromInventory
};
