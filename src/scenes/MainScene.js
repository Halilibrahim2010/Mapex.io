// Oyun sahnesi: yalnızca sistemleri kurar ve her frame onları çalıştırır.
// Oyun mantığı sistemlerde (world/, systems/, ui/) yaşar; sahne ince kalır.
import { getGameData, statsList, getCharacters } from '../core/ObjectDefs.js';
import { consumeStartRequest } from '../core/StartRequest.js';
import { WorldGenerator } from '../core/WorldGenerator.js';
import { safeSpawnPoint } from '../world/SpawnPoint.js';
import { TerrainSystem } from '../systems/TerrainSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { DropSystem } from '../systems/DropSystem.js';
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

const CURSOR_TIP_OFFSET_X = -6;
const CURSOR_TIP_OFFSET_Y = -10;

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
    this.sfx = new SoundFX();

    this.generator = new WorldGenerator(data.chunkSize, data.tileSize);
    this.terrain = new TerrainSystem(this.generator);

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

    this._bindInput();
    this.ground.update(0, 0);
    this.layer.update(0, 0);

    // Menü, oyun sahnesi hazır olmadan tıklandıysa bekleyen isteği şimdi uygula;
    // aksi halde sonraki tıklamayı bekle.
    consumeStartRequest((name, char) => this.startGame(name, char));
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
  }

  _worldPoint(pointer) {
    return {
      x: pointer.x + this.cameras.main.scrollX,
      y: pointer.y + this.cameras.main.scrollY
    };
  }

  _pointerDown(pointer) {
    if (this.menuOpen || this.inventoryOpen) return;
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
  startGame(name, char) {
    if (this.isStarted) return;
    this.isStarted = true;
    this.playerName = name || 'Oyuncu';
    const charCount = getCharacters().count;
    const charId = (char && char >= 1 && char <= charCount) ? char : 1;
    this.player.setCharacter(`char${charId}`);
    this.player.activateInput();
    this.playerNameText = this.add.text(this.player.x, this.player.y, this.playerName, {
      fontFamily: "'Segoe UI', 'Trebuchet MS', Verdana, sans-serif",
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5)
      .setShadow(1, 1, 'rgba(0, 0, 0, 0.6)', 2)
      .setDepth(10);

    this.network = new NetworkManager(this, this.playerName, charId);
    // Ağ senkronu için gönderilen son değerler (gereksiz paket göndermemek için).
    this.inventoryUi = new InventoryUi(this);
    this.movementSync = new MovementSync(this);
    this.pauseMenu.bindEscapeKey();
    this._bindKeyActions();
  }

  _bindKeyActions() {
    this.input.keyboard.on('keydown-I', () => {
      if (!this.menuOpen) this.toggleInventory();
    });
    this.input.keyboard.on('keydown-E', () => {
      if (this.menuOpen) return;
      this.interactions.pickUpNearby(this.drops);
    });
    this.input.keyboard.on('keydown-Q', () => {
      const entry = this.inventoryView.selectedEntry;
      if (this.inventoryView.isOpen && entry) this.dropItem(entry.slot.itemId, 1);
    });
    this.input.keyboard.on('keydown', (event) => this._handleInventoryKeys(event));
  }

  // Sayı yaz + Enter: seçili slottan o kadar eşya yere bırakılır.
  _handleInventoryKeys(event) {
    const view = this.inventoryView;
    if (!view.isOpen || view.selectedIndex === null) return;
    if (/^[0-9]$/.test(event.key)) {
      if (view.dropBuffer.length < 3) {
        view.dropBuffer = (view.dropBuffer + event.key).replace(/^0+/, '') || '0';
      }
      return;
    }
    if (event.key === 'Backspace') {
      view.dropBuffer = view.dropBuffer.slice(0, -1);
      return;
    }
    if (event.key !== 'Enter') return;
    const entry = view.selectedEntry;
    if (entry) this.dropItem(entry.slot.itemId, parseInt(view.dropBuffer, 10) || 0);
    view.dropBuffer = '';
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
    if (this.player && !this.menuOpen && !this.inventoryOpen) {
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
    this.dayNight.update(delta);
    if (this.inventoryView.isOpen) this.refreshUi();
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