// Sunucu yoksa devreye giren yerel (offline) mod. Aynı olay sözleşmesini
// taklit eder: envanter, düşen eşya ve dünya durumu bellekte tutulur.
// Böylece oyun backend olmadan da tek kişilik oynanabilir.
import { getObjectDef, getGameData, emptyStats, statsList } from '../core/ObjectDefs.js';
import { getRecipe } from '../core/Crafting.js';

export class LocalServer {
  constructor(scene) {
    this.scene = scene;
    // LocalServer da bir "oyuncu kimliği" tasinir: istemci kodu socket.id
    // yerine bu degeri gorebilir (tek kisilikte tek oyuncu = 'local').
    this.id = 'local';
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
      case 'craft':
        this._craft(data);
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
  // "/" ile baslayan metin debug komutudur: sohbete dusmez, yerelde calisir.
  _chatSend(data) {
    if (!data || !data.text) return;
    const text = String(data.text).trim();
    if (text.startsWith('/')) {
      this._debugCommand(text);
      return;
    }
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
      serverNow: Math.floor(Date.now() - this.startedAt + (10 / 24) * dayLength + (this._skipMs || 0)),
      dayLength
    };
  }

  // Tek oyunculu debug komutlari: /collider, /time, /player, /help.
  // Cok oyunculuda ayni isi sunucu yapar (server/game/DebugCommands.js).
  _debugCommand(text) {
    const parts = text.slice(1).split(/\s+/).filter(Boolean);
    const name = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const say = (message) => {
      const entry = {
        id: this.chatLog.length + 1, kind: 'system', fromId: null,
        from: 'Sistem', to: null, text: message, at: Date.now()
      };
      this.chatLog.push(entry);
      if (this.chatLog.length > 50) this.chatLog.shift();
      this._fire('chatMessage', entry);
    };
    if (name === 'collider') {
      const mode = String(args[0] || '').toLowerCase();
      if (mode !== 'show' && mode !== 'hide') {
        say('Kullanim: /collider show|hide');
        return;
      }
      this._fire('debugCollider', { visible: mode === 'show' });
      say(mode === 'show' ? 'Hitboxlar acildi.' : 'Hitboxlar kapatildi.');
      return;
    }
    if (name === 'tile') {
      const mode = String(args[0] || '').toLowerCase();
      if (mode !== 'show' && mode !== 'hide') {
        say('Kullanim: /tile show|hide');
        return;
      }
      this._fire('debugTile', { visible: mode === 'show' });
      say(mode === 'show' ? 'Tile izgarasi acildi.' : 'Tile izgarasi kapatildi.');
      return;
    }
    if (name === 'time') {
      const sub = String(args[0] || '').toLowerCase();
      if (sub === 'get') {
        say('Saat: ' + this._localClock());
        return;
      }
      if (sub === 'set') {
        const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(args[1] || ''));
        if (!match) {
          say('Kullanim: /time set SS:DD');
          return;
        }
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          say('Kullanim: /time set SS:DD');
          return;
        }
        const dayLength = 15 * 60 * 1000;
        const targetMs = ((hour * 60 + minute) / (24 * 60)) * dayLength;
        const cur = this._localClockParts();
        const nowMs = ((cur.hour * 60 + cur.minute) / (24 * 60)) * dayLength;
        let delta = targetMs - nowMs;
        if (delta < 0) delta += dayLength;
        this._skipMs = (this._skipMs || 0) + delta;
        this._fire('timeState', this._timeState());
        say('Saat ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ' olarak ayarlandi.');
        return;
      }
      say('Kullanim: /time set 5:40 | /time get');
      return;
    }
    if (name === 'player') {
      if (String(args[0] || '').toLowerCase() !== 'set' || String(args[1] || '').toLowerCase() !== 'health') {
        say('Kullanim: /player set health <isim> <can>');
        return;
      }
      const value = Number(args[3]);
      if (!args[2] || !Number.isFinite(value)) {
        say('Kullanim: /player set health <isim> <can>');
        return;
      }
      // Tek oyunculu: sadece kendi cani ayarlanabilir.
      const player = this.scene.player;
      if (!player || !player.setHealth) {
        say('Oyuncu bulunamadi.');
        return;
      }
      const clamped = Math.max(0, Math.min(player.maxHealth || 100, Math.floor(value)));
      player.setHealth(clamped, player.maxHealth);
      say('Canin ' + clamped + ' yapildi.');
      return;
    }
    if (name === 'help') {
      say('Komutlar: /collider show|hide, /tile show|hide, /time set SS:DD, /time get, /player set health <isim> <can>');
      return;
    }
    say('Bilinmeyen komut: /' + name);
  }

  _localClockParts() {
    const dayLength = 15 * 60 * 1000;
    const ms = ((Date.now() - this.startedAt + (10 / 24) * dayLength + (this._skipMs || 0)) % dayLength + dayLength) % dayLength;
    return {
      hour: Math.floor((ms / dayLength) * 24),
      minute: Math.floor((((ms / dayLength) * 24) % 1) * 60)
    };
  }

  _localClock() {
    const parts = this._localClockParts();
    return String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
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

  // Tek oyunculu üretim: tarif doğrulanır, girdiler düşer, çıktı eklenir.
  // (Çok oyunculuda aynı işi sunucu yapar; bkz. server/game/InventoryStore.craft)
  _craft(data) {
    if (!data || typeof data.recipeId !== 'string') return;
    const recipe = getRecipe(data.recipeId);
    if (!recipe) return;
    const norm = (data.slots || []).map((slot) =>
      slot && slot.itemId ? { itemId: slot.itemId, count: Math.floor(slot.count) || 0 } : null
    );
    while (norm.length < 4) norm.push(null);
    for (let i = 0; i < 4; i++) {
      const want = recipe.inputs[i] || null;
      const got = norm[i];
      if (!want && !got) continue;
      if (!want || !got) return;
      if (want.itemId !== got.itemId || got.count < want.count) return;
    }
    for (const input of recipe.inputs) {
      let total = 0;
      for (const slot of this.inventory) {
        if (slot && slot.itemId === input.itemId) total += slot.count;
      }
      if (total < input.count) return;
    }
    const removed = [];
    for (const input of recipe.inputs) {
      const got = this._remove(input.itemId, input.count);
      removed.push({ itemId: input.itemId, count: got });
      if (got < input.count) {
        for (const back of removed) {
          if (back.count > 0) this._addSilent(back.itemId, back.count);
        }
        this._fire('inventoryState', this._snapshot());
        return;
      }
    }
    const before = JSON.stringify(this.inventory);
    // Cikti objectDefs'te tanimli; normal ekleme yeterli.
    this._add(recipe.output.itemId, recipe.output.count);
    // Çıktı sığmadıysa (envanter dolu) işlemi geri al.
    if (JSON.stringify(this.inventory) === before) {
      for (const back of removed) {
        if (back.count > 0) this._addSilent(back.itemId, back.count);
      }
      this._fire('inventoryState', this._snapshot());
      return;
    }
    // _add zaten inventoryState yayinlar.
  }

  _addSilent(itemId, count) {
    const def = getObjectDef(itemId) || { maxStack: getGameData().inventoryMaxStack };
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
  }
}