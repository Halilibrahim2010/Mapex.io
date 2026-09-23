// Oyun sahnesi: yalnızca sistemleri kurar ve her frame onları çalıştırır.
// Oyun mantığı sistemlerde (world/, systems/, ui/) yaşar; sahne ince kalır.
import { getGameData, statsList, getCharacters } from '../core/ObjectDefs.js';
import { consumeStartRequest } from '../core/StartRequest.js';
import { WorldGenerator } from '../core/WorldGenerator.js';
import { safeSpawnPoint } from '../world/SpawnPoint.js';
import { TerrainSystem } from '../systems/TerrainSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { DropSystem } from '../systems/DropSystem.js';
import { AmbienceSystem } from '../systems/AmbienceSystem.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { MovementSync } from '../network/MovementSync.js';
import { GroundLayer, GROUND_KIND } from '../world/GroundLayer.js';
import { InventoryUi } from '../ui/InventoryUi.js';
import { ObjectLayer } from '../world/ObjectLayer.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { Player } from '../entities/Player.js';
import { SoundFX } from '../core/SoundFX.js';
import { Hud } from '../ui/Hud.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { InventoryView } from '../ui/InventoryView.js';
import { Inventory } from '../core/Inventory.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { UI_DEPTH } from '../ui/uiDepth.js';
import { getSettings, onSettingsChange, keyCodeName } from '../core/GameSettings.js';
import { ChatService } from '../chat/ChatService.js';
import { ChatBox } from '../chat/ChatBox.js';
import { ChatNotice } from '../chat/ChatNotice.js';
import { applySessionState } from '../account/index.js';

const CURSOR_TIP_OFFSET_X = -6;
const CURSOR_TIP_OFFSET_Y = -10;

// 'Enter' gibi adları Phaser'ın tuş adlarına çevirir (ayarlarda öyle saklanır).
const KEY_NAME_ALIASES = { Enter: 'ENTER', Escape: 'ESC', ' ': 'SPACE' };

// Klavye olayındaki tuşu ayarlardaki KeyCodes adına çevirir (ör. 'ENTER').
function keyNameOfEvent(event) {
  const alias = KEY_NAME_ALIASES[event.key];
  if (alias) return alias;
  return keyCodeName(event.keyCode);
}

export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.removedByKind = {};
    this.clickEffects = [];
    this.chopCursor = null;
    this.isStarted = false;
  }

  create() {
    const data = getGameData();
    this.TILE_SIZE = data.tileSize;
    this.CHUNK_SIZE = data.chunkSize;
    this.RENDER_DISTANCE = 2;
    this.menuOpen = false;
    this.inventoryOpen = false;
    this.settingsOpen = false;
    this.chatOpen = false;
    this.sfx = new SoundFX();

    this.generator = new WorldGenerator(data.chunkSize, data.tileSize);
    this.terrain = new TerrainSystem(this.generator);
    // Nesneler suya spawn olamaz: jeneratör su kontrolünü terrain'den alır.
    this.generator.isWaterAt = (x, y) => this.terrain.isWaterAt(x, y);

    const spawn = this._safeSpawnPoint();
    this.player = new Player(this, spawn.x, spawn.y);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 1, 1);

    this.ground = new GroundLayer(this, this.generator, this.terrain, this._removedSet(GROUND_KIND));
    this.layer = new ObjectLayer(this, this.generator, this.terrain, this.removedByKind);
    this.drops = new DropSystem(this);
    this.interactions = new InteractionSystem(this, this.layer);
    this.inventory = new Inventory();
    this.inventoryView = new InventoryView(this);
    this.inventoryView.createHotbar(5);

    this.hud = new Hud(this);
    this.hud.create();
    this.pauseMenu = new PauseMenu(this, {
      onOpenInventory: () => this.toggleInventory(),
      onStateChange: (open) => { this.menuOpen = open; }
    });
    this.dayNight = new DayNightCycle(this);
    this.dayNight.create();
    this.ambience = new AmbienceSystem(this, this.terrain);
    this.settingsPanel = new SettingsPanel(this);

    this._bindInput();
    this.ground.update(0, 0);
    this.layer.update(0, 0);

    // Menü, oyun sahnesi hazır olmadan tıklandıysa bekleyen isteği şimdi uygula;
    // aksi halde sonraki tıklamayı bekle.
    consumeStartRequest((name, char, session, options) => this.startGame(name, char, session, options));
  }

  // Doğuş noktası mantığı world/SpawnPoint.js içinde (engel + su kontrolü).
  _safeSpawnPoint() {
    return safeSpawnPoint(this.generator, this.terrain, this.TILE_SIZE);
  }


  preload() {
    // Asset yükleme PreloadScene'de tamamlanır (JSON'dan türetilir).
  }

  _removedSet(kind) {
    if (!this.removedByKind[kind]) this.removedByKind[kind] = new Set();
    return this.removedByKind[kind];
  }

  _bindInput() {
    this.input.setDefaultCursor('url(assets/cross.png) 25 25, default');
    this.input.on('pointerdown', (pointer) => this._pointerDown(pointer));
    this.input.on('pointerup', () => this.interactions.pointerUp());
    this.input.on('pointermove', (pointer) => this._pointerMove(pointer));
    // Tek klavye dinleyicisi: sohbet acikken tuslar sohbete, degilse oyuna gider.
    this.input.keyboard.on('keydown', (event) => this._handleKeydown(event));
  }

  // Odak sirasi: sohbet > envanter > sohbet kisayolu. Sohbet acikken oyun
  // tuslari (hareket, envanter, kesme) calismaz; yazi yazma onceliklidir.
  _handleKeydown(event) {
    if (this.chatBox && this.chatBox.handleKeydown(event)) return;
    if (this._handleInventoryKeys(event)) return;
    this._handleChatToggle(event);
  }

  _handleChatToggle(event) {
    if (!this.chatBox) return;
    if (this.menuOpen || this.settingsOpen) return;
    const wanted = getSettings().keys.chatOpen;
    const name = keyNameOfEvent(event);
    if (!name || name !== wanted) return;
    this.chatBox.toggle();
  }

  _worldPoint(pointer) {
    return {
      x: pointer.x + this.cameras.main.scrollX,
      y: pointer.y + this.cameras.main.scrollY
    };
  }

  _pointerDown(pointer) {
    if (this.menuOpen || this.inventoryOpen || this.settingsOpen || this.chatOpen) return;
    const point = this._worldPoint(pointer);
    this.chopCursor = { x: point.x + CURSOR_TIP_OFFSET_X, y: point.y + CURSOR_TIP_OFFSET_Y };
    this.spawnClickEffect(this.chopCursor.x, this.chopCursor.y);
    this.interactions.pointerDown(point.x + CURSOR_TIP_OFFSET_X, point.y + CURSOR_TIP_OFFSET_Y);
  }

  _pointerMove(pointer) {
    const point = this._worldPoint(pointer);
    this.chopCursor = { x: point.x + CURSOR_TIP_OFFSET_X, y: point.y + CURSOR_TIP_OFFSET_Y };
    this.interactions.pointerMove(this.chopCursor.x, this.chopCursor.y);
  }

  // Oyuncu adı ve karakteri menüden gelir; ağ bağlantısı burada kurulur.
  // session: hesap katmanından gelen oturum nesnesi (misafir/kayıtlı/çevrimdışı).
  // options: { mode, roomId, friendlyFire, isOffline }
  startGame(name, char, session, options = {}) {
    if (this.isStarted) return;
    this.isStarted = true;
    this.session = session || null;
    this.options = options || {};
    this.playerName = (this.session && this.session.displayName) || name || 'Oyuncu';
    const charCount = getCharacters().count;
    const charId = (char && char >= 1 && char <= charCount) ? char : 1;
    this.player.setCharacter(`char${charId}`);
    this.player.activateInput();
    this.playerNameText = this.add.text(this.player.x, this.player.y, this.playerName, {
      fontFamily: "Monocraft",
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5)
      .setShadow(1, 1, 'rgba(0, 0, 0, 0.6)', 2)
      .setDepth(10);

    this.network = new NetworkManager(this, this.playerName, charId, this.session, this.options);
    // Ağ senkronu için gönderilen son değerler (gereksiz paket göndermemek için).
    this.inventoryUi = new InventoryUi(this);
    this.movementSync = new MovementSync(this);
    this.pauseMenu.bindEscapeKey();
    this._bindKeyActions();
    this._startChat();
  }

  // Sohbet: servis (ag), pencere (sol altta) ve bildirimler (ustte) birlikte kurulur.
  _startChat() {
    this.chat = new ChatService(this);
    this.chat.setPlayerName(this.playerName);
    this.chatBox = new ChatBox(this, this.chat.model, (text) => this.chat.send(text));
    this.chatBox.onOpenStateChange = (open) => this._onChatStateChange(open);
    this.chatNotice = new ChatNotice(this);
    this.chat.attach(this.network);
    this._layoutChatUi();
    this._chatKeyUnsubscribe = onSettingsChange(() => {
      this.chat.syncSettings();
    });
  }

  // Sunucu oturumu çözdüğünde (sessionState olayı) çağrılır. Sahne yalnızca
  // köprü görevi görür: veriyi oturum katmanına ve HUD'a iletir. "Kayıtlı mı
  // misafir mi" ayrımı burada YAPILMAZ — adaptörler zaten hallediyor.
  applySessionState(state) {
    if (!state) return;
    // storageKey sunucudan gelir: istemci ve sunucu aynı envanter anahtarını
    // kullanır (misafirde oturuma özel, kayıtlıda kullanıcı kimliği).
    applySessionState(state);
    if (this.session) {
      this.session.applyState(state);
      if (state.displayName) this.playerName = state.displayName;
    }
    if (this.hud) this.hud.setSession(state.economy ? state : this.session);
    if (this.sessionBarRefresh) this.sessionBarRefresh();
  }

  // Pencere açılıp kapanınca: oyun tuşları susturulur, bildirimler temizlenir.
  _onChatStateChange(open) {
    this.chatOpen = open;
    if (open && this.chatNotice) this.chatNotice.clear();
  }

  // Sohbet penceresi sol alt köşede durur; ekran ölçüsü değişince yeniden yerleşir.
  _layoutChatUi() {
    if (!this.chatBox) return;
    const origin = this.chatBox.origin();
    if (this.chatHint) this.chatHint.destroy();
    if (this.chatBox.open) this.chatBox.rebuild();
  }

  // Aksiyon tuşları Ayarlar'dan gelir; ayar değişince tuşlar canlı yeniden bağlanır.
  _bindKeyActions() {
    this._keyHandlers = {
      inventory: () => {
        if (!this.menuOpen && !this.settingsOpen && !this.chatOpen) this.toggleInventory();
      },
      pickup: () => {
        if (this.menuOpen || this.settingsOpen || this.chatOpen) return;
        this.interactions.pickUpNearby(this.drops);
      },
      dropItem: () => {
        if (this.menuOpen || this.settingsOpen || this.chatOpen) return;
        const entry = this.inventoryView.selectedEntry;
        if (this.inventoryView.isOpen && entry) this.dropItem(entry.slot.itemId, 1);
      }
    };
    this._attachAllKeys();
    // Ayar değişince tuşları yeniden bağla (panel kapandığında temizlenir).
    this._settingsUnsubscribe = onSettingsChange(() => this._rebindKeys());
  }

  // Tuş event adları Phaser'da 'keydown-<KeyCodes adı>' biçimindedir.
  _attachAllKeys() {
    this._attached = {};
    for (const [action, handler] of Object.entries(this._keyHandlers)) {
      const name = getSettings().keys[action];
      const eventName = 'keydown-' + name;
      this.input.keyboard.on(eventName, handler);
      this._attached[action] = { eventName, handler };
    }
  }

  _rebindKeys() {
    for (const { eventName, handler } of Object.values(this._attached || {})) {
      this.input.keyboard.removeListener(eventName, handler);
    }
    this._attachAllKeys();
  }

  // Sayı yaz + Enter: seçili slottan o kadar eşya yere bırakılır.
  // Tuşu işlediyse true döner (klavye yönlendirmesi buna göre karar verir).
  _handleInventoryKeys(event) {
    const view = this.inventoryView;
    if (!view.isOpen || view.selectedIndex === null) return false;
    if (/^[0-9]$/.test(event.key)) {
      if (view.dropBuffer.length < 3) {
        view.dropBuffer = (view.dropBuffer + event.key).replace(/^0+/, '') || '0';
      }
      return true;
    }
    if (event.key === 'Backspace') {
      view.dropBuffer = view.dropBuffer.slice(0, -1);
      return true;
    }
    if (event.key !== 'Enter') return false;
    const entry = view.selectedEntry;
    if (entry) this.dropItem(entry.slot.itemId, parseInt(view.dropBuffer, 10) || 0);
    view.dropBuffer = '';
    return true;
  }

  // Envanterden yere bırakma isteği: görsel hemen, doğrulama sunucudan.
  dropItem(itemId, count) {
    const amount = Math.max(0, Math.min(Math.floor(count), this.inventory.count(itemId)));
    if (amount === 0) return;
    this.drops.stageMany(itemId, amount, this.player.x, this.player.y);
    this.network.sendDrop(itemId, amount, this.player.x, this.player.y);
  }

  sendBreakdown(itemId, count, x, y) {
    this.drops.stageMany(itemId, count, x, y);
    this.network.sendDrop(itemId, count, x, y);
  }

  toggleInventory() {
    if (this.inventoryView.isOpen) {
      this.inventoryView.close();
      this.inventoryOpen = false;
      return;
    }
    if (this.menuOpen) this.closeMenu();
    this.inventoryOpen = true;
    this.inventoryView.open(this.inventoryItems());
  }

  // Hotbar/envanter çizimi için sıralı liste (dolu slotlar).
  inventoryItems() {
    return this.inventoryUi.items();
  }

  // --- Sunucu olayları ---

  applyInventoryState(state) {
    if (!state) return;
    this.inventory.applyState(state.slots);
    this.stats = state.stats || {};
    if (state.drops) this.drops.applyState(state.drops);
    this.refreshUi();
  }

  applyWorldState(state) {
    if (!state) return;
    for (const item of state.removed || []) this.handleRemoteObjectRemoved(item.kind, item.id);
    if (state.drops) this.drops.applyState(state.drops);
  }

  refreshUi() {
    this.inventoryUi.refresh();
  }


  // Uzak oyuncu bir nesneyi kaldırdı: görseli sil, kütük varsa bırak.
  handleRemoteObjectRemoved(kind, id) {
    this._removedSet(kind).add(id);
    const record = this.layer.get(id);
    if (!record) {
      // Nesne bu istemcide kayıtlı değil: zemin ise chunk yeniden çizilir.
      if (kind === GROUND_KIND) {
        const chunk = this._chunkOf(id);
        this.ground.invalidate(chunk[0], chunk[1]);
      }
      return;
    }
    this.layer.remove(id);
    if (record.def.stump) this.sfx.treeBreak();
  }

  // id bicimi: "kind:chunkX,chunkY:index" -> chunk koordinatlarini verir.
  _chunkOf(id) {
    const match = new RegExp(String.raw`:(-?\d+),(-?\d+):`).exec(id);
    if (!match) return [0, 0];
    return [parseInt(match[1], 10), parseInt(match[2], 10)];
  }
  // --- Frame döngüsü ---

  update(time, delta) {
    if (this.player && !this.menuOpen && !this.inventoryOpen && !this.settingsOpen) {
      // Katmanlar önce tazelenir: çarpışma çözümü güncel collider'larla yapılmalı.
      this._updateLayers();
      this.player.update();
      this.interactions.resolveCollisions();
      this.interactions.update(delta);
      this._syncNetwork();
      this._updateDepth();
    }
    this.interactions.updateHover(this.drops);
    this.updateClickEffects();
    this.ground.updateWater(time);
    this.dayNight.update(delta);
    this.ambience.update(delta);
    if (this.inventoryView.isOpen) this.refreshUi();
    this._updateChat();
  }

  // Sohbet: yeni mesaj çizimi (throttle) + bekleyen bildirimler.
  _updateChat() {
    if (!this.chatBox) return;
    this.chatBox.update();
    if (this.chatNotice) this.chatNotice.update();
    const notes = this.chat.model.takeNotifications();
    for (const note of notes) {
      if (this.chatBox.open) continue;  // pencere açıkken bildirim gerekmez
      this.chatNotice.push(note);
    }
  }

  _syncNetwork() {
    if (this.movementSync) this.movementSync.update();
  }

  _updateLayers() {
    const chunkPixels = this.CHUNK_SIZE * this.TILE_SIZE;
    const chunkX = Math.floor(this.player.x / chunkPixels);
    const chunkY = Math.floor(this.player.y / chunkPixels);
    this.ground.update(chunkX, chunkY);
    this.layer.update(chunkX, chunkY);
    this.hud.setPosition(
      Math.round(this.player.x / this.TILE_SIZE),
      Math.round(-this.player.y / this.TILE_SIZE)
    );
  }

  _updateDepth() {
    const feetDepth = this._sortDepth(this.player.y + 34);
    this.player.setDepth(feetDepth);
    if (this.playerNameText) this.playerNameText.setDepth(feetDepth);
    this.layer.refreshDepths();
  }

  _sortDepth(feetY) {
    return 3000 + Math.round(feetY - this.cameras.main.scrollY);
  }

  closeMenu() {
    this.pauseMenu.close();
  }

  setMenuInfo(text) {
    this.pauseMenu.setInfo(text);
  }

  // Sohbet açık/kapalı bilgisi: kısayollar bunu kontrol eder.
  setChatOpen(open) {
    this.chatOpen = Boolean(open);
  }

  // --- Tıklama efekti (büyüyen artı işareti) ---

  spawnClickEffect(worldX, worldY) {
    const graphics = this.add.graphics().setDepth(9000);
    this.clickEffects.push({ t: 0, dur: 0.32, g: graphics, wx: worldX, wy: worldY, s: 4.5 });
  }

  updateClickEffects() {
    if (!this.clickEffects.length) return;
    const dt = 1 / 60;
    const diagonal = 0.7071;
    for (let i = this.clickEffects.length - 1; i >= 0; i--) {
      const effect = this.clickEffects[i];
      effect.t += dt;
      const k = Math.min(effect.t / effect.dur, 1);
      const alpha = 1 - k;
      const inner = 1.5 + 2 * k;
      const outer = effect.s + 1.5 * k;
      effect.g.clear();
      effect.g.lineStyle(2.5, 0xffffff, alpha);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        effect.g.lineBetween(
          effect.wx + sx * inner * diagonal, effect.wy + sy * inner * diagonal,
          effect.wx + sx * outer * diagonal, effect.wy + sy * outer * diagonal
        );
      }
      effect.g.lineStyle(1.5, 0xffffff, alpha * 0.5);
      effect.g.strokeCircle(effect.wx, effect.wy, 3 + 11 * k);
      if (k >= 1) {
        effect.g.destroy();
        this.clickEffects.splice(i, 1);
      }
    }
  }
}