// Sunucu yoksa devreye giren yerel (offline) mod. Aynı olay sözleşmesini
// taklit eder: envanter, düşen eşya ve dünya durumu bellekte tutulur.
// Böylece oyun backend olmadan da tek kişilik oynanabilir.
import { getObjectDef, getGameData, emptyStats, statsList } from '../core/ObjectDefs.js';

export class LocalServer {
  constructor(scene) {
    this.scene = scene;
    this.handlers = new Map();
    this.inventory = new Array(getGameData().inventorySlots).fill(null);
    this.stats = emptyStats();
    this.drops = [];
    this.dropSeq = 0;
    this.startedAt = Date.now();
    // Tek kişilik modda sohbet: mesajlar yalnızca bu istemcide tutulur.
    this.chatLog = [];
  }

  // NetworkManager ile aynı arayüz: olay dinleyicileri burada tutulur.
  on(event, callback) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(callback);
  }

  emit(event, data) {
    this._handle(event, data);
  }

  _fire(event, data) {
    for (const callback of this.handlers.get(event) || []) callback(data);
  }

  _handle(event, data) {
    switch (event) {
      case 'hello':
        this._fire('currentPlayers', {});
        this._fire('worldState', { removed: [], drops: this.drops });
        this._fire('timeState', this._timeState());
        this._fire('inventoryState', this._snapshot());
        break;
      case 'pick':
        this._add(data.itemId, 1);
        break;
      case 'drop':
        this._breakdown(data);
        break;
      case 'pickup':
        this._takeDrop(data.id);
        break;
      case 'harvest':
        this._harvest(data);
        break;
      case 'objectRemoved':
        this._fire('inventoryState', this._snapshot());
        break;
      case 'chatSend':
        this._chatSend(data);
        break;
      case 'chatRequest':
        this._fire('chatHistory', this.chatLog.slice());
        break;
      default:
        break;
    }
  }

  // Yerel modda sunucu yok: kendi mesajımızı yalnizca kendimize yayınlarız.
  _chatSend(data) {
    if (!data || !data.text) return;
    const entry = {
      id: this.chatLog.length + 1,
      kind: data.kind === 'private' ? 'private' : 'chat',
      fromId: null,
      from: data.kind === 'private' ? (data.to || 'Oyuncu') : 'Oyuncu',
      to: data.kind === 'private' ? (data.to || null) : null,
      text: String(data.text).slice(0, 140),
      at: Date.now()
    };
    this.chatLog.push(entry);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this._fire('chatMessage', entry);
  }

  _timeState() {
    const dayLength = 15 * 60 * 1000;
    return {
      serverNow: Math.floor(Date.now() - this.startedAt + (10 / 24) * dayLength),
      dayLength
    };
  }

  _snapshot() {
    return { slots: this.inventory, stats: { ...this.stats }, drops: this.drops };
  }

  // Toplanan kaynağa bağlı sayaçları artırır (JSON'daki "stats" tanımından).
  // "source" alanı olan sayaçlar yalnızca ilgili nesne kırıldığında artar.
  _creditResource(itemId, amount) {
    for (const stat of statsList()) {
      if (stat.resource === itemId && !stat.source) {
        this.stats[stat.id] = (this.stats[stat.id] || 0) + amount;
      }
    }
  }

  // Kırılan nesne türüne bağlı sayaçlar (ağaç / kütük ayrımı).
  _creditSource(kind, amount = 1) {
    for (const stat of statsList()) {
      if (stat.source === kind) this.stats[stat.id] = (this.stats[stat.id] || 0) + amount;
    }
  }

  _add(itemId, count) {
    const def = getObjectDef(itemId);
    if (!def) return;
    const limit = def.maxStack || getGameData().inventoryMaxStack;
    let remaining = count;
    for (const slot of this.inventory) {
      if (remaining <= 0) break;
      if (slot && slot.itemId === itemId && slot.count < limit) {
        const take = Math.min(remaining, limit - slot.count);
        slot.count += take;
        remaining -= take;
      }
    }
    for (let i = 0; i < this.inventory.length && remaining > 0; i++) {
      if (this.inventory[i] !== null) continue;
      const take = Math.min(remaining, limit);
      this.inventory[i] = { itemId, count: take };
      remaining -= take;
    }
    this._creditResource(itemId, count - remaining);
    this._fire('inventoryState', this._snapshot());
  }

  _remove(itemId, count) {
    let remaining = count;
    for (let i = this.inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.inventory[i];
      if (!slot || slot.itemId !== itemId) continue;
      const take = Math.min(remaining, slot.count);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.inventory[i] = null;
    }
    return count - remaining;
  }

  // Kesme tamamlandı: tanımdaki drop eşyası 1..countMax arası rastgele adet
  // yere serilir (sunucudaki davranışın yerel eşdeğeri).
  _harvest(data) {
    if (!data) return;
    const def = getObjectDef(data.kind);
    const drop = def && def.drop;
    const drops = [];
    if (drop) {
      const min = Math.max(1, Math.floor(drop.count || 1));
      const max = Math.max(min, Math.floor(drop.countMax || min));
      const count = min + Math.floor(Math.random() * (max - min + 1));
      for (let i = 0; i < count; i++) {
        drops.push({ id: `d${++this.dropSeq}`, itemId: drop.itemId, x: data.x, y: data.y, at: Date.now() });
      }
      this.drops.push(...drops);
    }
    // Sayaç: ağaç ve kütük ayrı sayılır (JSON'daki "source" alanı).
    this._creditSource(data.kind, 1);
    this._fire('inventoryState', this._snapshot());
    if (drops.length) this._fire('dropsSpawned', { drops });
  }

  _breakdown(data) {
    const removed = this._remove(data.itemId, Math.max(0, Math.floor(data.n || 0)));
    const drops = [];
    for (let i = 0; i < removed; i++) {
      drops.push({ id: `d${++this.dropSeq}`, itemId: data.itemId, x: data.x, y: data.y, at: Date.now() });
    }
    this.drops.push(...drops);
    this._fire('inventoryState', this._snapshot());
    if (drops.length) this._fire('dropsSpawned', { drops });
  }

  _takeDrop(id) {
    const index = this.drops.findIndex((drop) => drop.id === id);
    if (index === -1) return;
    const drop = this.drops.splice(index, 1)[0];
    this._add(drop.itemId, 1);
    this._fire('dropRemoved', { id });
  }
}