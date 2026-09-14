import { WorldGenerator } from '../core/WorldGenerator.js';
import { Player } from '../entities/Player.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { SoundFX } from '../core/SoundFX.js';
import { UI_DEPTH } from '../ui/uiDepth.js';
import { ChunkManager } from '../world/ChunkManager.js';
import { WorldObjectWindow } from '../world/WorldObjectWindow.js';
import { HarvestSystem } from '../world/HarvestSystem.js';
import { Hud } from '../ui/Hud.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { InventorySystem, PlacementSystem, ObjectFactory } from '../core/ObjectSystem.js';

export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.CHUNK_SIZE = 16;
    this.TILE_SIZE = 32;
    this.RENDER_DISTANCE = 2;
    this.TOTAL_GRASS_TYPES = 6;
    this.TOTAL_STONE_TYPES = 16;
    // Data-driven object system
    this.placement = null;
    this.inventory = null;
    this.factory = null;
    this.clickEffects = [];
    this.CURSOR_TIP_OFFSET_X = -6;
    this.CURSOR_TIP_OFFSET_Y = -10;
    this.trees = new Map();
    this.trunks = new Map();
    this.choppedTrees = new Set();
    this.CHOP_TIME = 8;
    this.wood = 0;
    this.stone = 0;
    this.woodText = null;
    this.stoneText = null;
    this.inventoryOpen = false;
    this.inventoryGroup = null;
    this.inventoryWoodText = null;
    this.inventoryStats = null;
    this.inventorySlotBg = null;
    this.inventorySelected = false;
    this.dropBuffer = '';
    this.treesChopped = 0;
    this.stone = 0;
    this.chopCursor = null;
    this.removedByKind = { grass: new Set(), stone: new Set() };
    this._updateLast = null;
  }

  preload() {
    this.load.image('field_tile_38', 'assets/Tiles0/FieldsTile_38.png');
    for (let i = 1; i <= this.TOTAL_GRASS_TYPES; i++) {
      this.load.image(`grass_${i}`, `assets/Objects0/Grass/${i}.png`);
    }
    for (let i = 1; i <= this.TOTAL_STONE_TYPES; i++) {
      this.load.image(`stone_${i}`, `assets/Objects0/Stone/${i}.png`);
    }
    const CHAR_FILES = { 0: 'Character 1.png', 1: 'Character 5.png', 2: 'Character 9.png' };
    for (let i = 1; i <= 18; i++) {
      this.load.spritesheet(`char${i}`, `assets/72 Character Free/Char ${i}/${CHAR_FILES[(i - 1) % 3]}`, {
        frameWidth: 64,
        frameHeight: 64
      });
    }
    this.load.image('tree1', 'assets/Objects0/3 Decor/Tree1.png');
    this.load.image('tree2', 'assets/Objects0/3 Decor/Tree2.png');
    this.load.image('log', 'assets/Objects0/3 Decor/Log1.png');
    this.TOTAL_FLOWER_TYPES = 12;
    this.TOTAL_PLANT_TYPES = 6;
    for (let i = 1; i <= this.TOTAL_FLOWER_TYPES; i++) {
      this.load.image(`flower_${i}`, `assets/Objects0/Flower/${i}.png`);
    }
  }

  create() {
    this.worldGen = new WorldGenerator(this.CHUNK_SIZE, this.TILE_SIZE, this.TOTAL_GRASS_TYPES, this.TOTAL_STONE_TYPES);
    this.player = new Player(this, 0, 0);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 1, 1);

    this.chunkManager = new ChunkManager(this, this.worldGen);

    // Data-driven object system
    this.placement = new PlacementSystem(this.CHUNK_SIZE, this.TILE_SIZE);
    this.inventory = new InventorySystem(15, 99);
    this.factory = new ObjectFactory(this, this.inventory, this.placement);

    this.treeWindow = new WorldObjectWindow(this, {
      generate: (cx, cy) => this.worldGen.generateTrees(cx, cy),
      makeSprite: (obj, id) => this._makeTreeSprite(obj, id),
      removeStateKey: null,
      onNewObject: (src, id) => {
        if (this.choppedTrees.has(id)) {
          const baseOff = src.type === 'tree2' ? 12 : 61;
          this.placeBareTrunk(id, src.x, src.y + baseOff);
          return false;
        }
      },
      onWindowChanged: null
    });
    this.trees = this.treeWindow;

    this.plantWindow = new WorldObjectWindow(this, {
      generate: (cx, cy) => this.worldGen.generatePlants(cx, cy),
      makeSprite: (obj, id) => this._makePlantSprite(obj, id),
      removeStateKey: null,
      onNewObject: null,
      onWindowChanged: null
    });

    this.lastSentX = 0;
    this.lastSentY = 0;
    this.playerName = null;
    this.playerNameText = null;
    this.network = null;
    this.menuOpen = false;
    this.menuGroup = null;
    this.menuInfoText = null;

    this.chunkManager.update(0, 0);

    this.chopSound = new SoundFX();
    this.input.setDefaultCursor('url(assets/cross.png) 25 25, default');
    this.CHOP_RANGE = 70;

    this.harvestSystem = new HarvestSystem(this);
    this.hud = new Hud(this);
    this.hud.create();
    this.woodText = this.hud.woodText;
    this.stoneText = this.hud.stoneText;
    this.pauseMenu = new PauseMenu(this, {
      onOpenInventory: () => this.openInventory(),
      onStateChange: (open) => { this.menuOpen = open; }
    });

    this.createHotbar();

    this.input.on('pointerdown', (pointer) => {
      if (this.menuOpen || this.inventoryOpen) return;
      const worldX = pointer.x + this.cameras.main.scrollX + this.CURSOR_TIP_OFFSET_X;
      const worldY = pointer.y + this.cameras.main.scrollY + this.CURSOR_TIP_OFFSET_Y;
      this.spawnClickEffect(worldX, worldY);
      this.chopCursor = { x: worldX, y: worldY };
      const px = pointer.x + this.cameras.main.scrollX;
      const py = pointer.y + this.cameras.main.scrollY;
      this.harvestSystem.pointerDown(px, py);
    });

    this.input.on('pointerup', () => {
      this.harvestSystem.pointerUp();
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.harvestSystem.chopTarget || !this.chopCursor) return;
      const px = pointer.x + this.cameras.main.scrollX;
      const py = pointer.y + this.cameras.main.scrollY;
      this.harvestSystem.pointerMove(px, py);
      this.chopCursor.x = pointer.x + this.cameras.main.scrollX + this.CURSOR_TIP_OFFSET_X;
      this.chopCursor.y = pointer.y + this.cameras.main.scrollY + this.CURSOR_TIP_OFFSET_Y;
    });

    window.addEventListener('dneem-start', (e) => this.startGame(e.detail.name, e.detail.char), { once: true });
  }

  startGame(name, char) {
    if (this.playerName) return;
    this.playerName = name || 'Oyuncu';
    const charNum = (char && char >= 1 && char <= 18) ? char : 1;
    this.player.setCharacter(`char${charNum}`);
    this.player.activateInput();
    this.playerNameText = this.add.text(this.player.x, this.player.y, this.playerName, {
      fontFamily: "'Segoe UI', 'Trebuchet MS', Verdana, sans-serif",
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5)
      .setShadow(1, 1, 'rgba(0, 0, 0, 0.6)', 2)
      .setDepth(10);
    this.network = new NetworkManager(this, 'http://localhost:3019', this.playerName, charNum);
    this.woodText = this.hud.woodText;
    this.pauseMenu.bindEscapeKey();
    this.input.keyboard.on('keydown-I', () => {
      if (this.menuOpen) return;
      this.toggleInventory();
    });
    // E tuşu: yakındaki eşyayı envantere al (önce odun, sonra taş)
    this.input.keyboard.on('keydown-E', () => {
      if (this.menuOpen) return;
      const picked = this.harvestSystem.pickUpNearby();
      if (!picked && this.chunkManager) {
        this.chunkManager.pickUpNearbyStones(this.player);
      }
    });
    // Q tuşu: seçili eşyayı yere at
    this.input.keyboard.on('keydown-Q', () => {
      if (this.inventoryOpen && this.inventorySelected) {
        this.dropWood(1);
      }
    });
    this.input.keyboard.on('keydown', (event) => {
      if (!this.inventoryOpen || !this.inventorySelected) return;
      if (/^[0-9]$/.test(event.key)) {
        if (this.dropBuffer.length < 3) {
          this.dropBuffer = (this.dropBuffer + event.key).replace(/^0+/, '') || '0';
        }
      } else if (event.key === 'Backspace') {
        this.dropBuffer = this.dropBuffer.slice(0, -1);
      } else if (event.key === 'Enter') {
        this.dropWood(parseInt(this.dropBuffer, 10) || 0);
        this.dropBuffer = '';
      }
    });
  }

  update(time, delta) {
    if (this.player && !this.menuOpen && !this.inventoryOpen) {
      this.player.update();
      this.harvestSystem.resolveTreeCollisions();
      this.harvestSystem.updateLogDrops();
      const px = Math.round(this.player.x);
      const py = Math.round(this.player.y);
      if (this.network && (px !== this.lastSentX || py !== this.lastSentY)) {
        this.network.sendMove(px, py, this.player.facingLeft);
        this.lastSentX = px;
        this.lastSentY = py;
      }
      if (this.playerNameText) {
        this.playerNameText.x = this.player.x;
        this.playerNameText.y = this.player.y - 44;
      }
      if (this.network) this.network.update();
      const currentChunkX = Math.floor(this.player.x / (this.CHUNK_SIZE * this.TILE_SIZE));
      const currentChunkY = Math.floor(this.player.y / (this.CHUNK_SIZE * this.TILE_SIZE));
      this.chunkManager.update(currentChunkX, currentChunkY);
      this.treeWindow.update(currentChunkX, currentChunkY);
      this.plantWindow.update(currentChunkX, currentChunkY);
      this.updateTrunkVisibility(currentChunkX, currentChunkY);
      this.updateDepths();
    }
    if (this.inventoryOpen) this.refreshInventory();
    else if (this.hotbarGroup) this.refreshHotbar();
    this.updateClickEffects();
    this.harvestSystem.update(delta);
  }

  _makeTreeSprite(obj, id) {
    const tex = obj.type;
    const isBig = tex === 'tree1';
    const scale = isBig ? 1.6 : 1.0;
    const hitR = isBig ? 34 : 20;
    const baseY = isBig ? obj.y + 45 : obj.y + 8;
    const collR = isBig ? 16 : 10;
    const visualBase = isBig ? obj.y + 61 : obj.y + 12;
    const sprite = this.add.image(obj.x, obj.y, tex).setScale(scale)
      .setDepth(3000 + Math.round(baseY - this.cameras.main.scrollY));
    return {
      sprite,
      rec: { id, sprite, x: obj.x, y: obj.y, type: tex, hitR, progress: 0, baseY, visualBase, collR, choppable: isBig }
    };
  }

  _makePlantSprite(obj, id) {
    const tex = obj.kind === 'flower' ? `flower_${obj.type}` : `grass_${obj.type}`;
    const scale = obj.kind === 'flower' ? 2.4 : 2.0;
    const sprite = this.add.image(obj.x, obj.y, tex).setScale(scale).setDepth(3);
    return { sprite, rec: { id, sprite, x: obj.x, y: obj.y } };
  }

  updateTrunkVisibility(cx, cy) {
    for (const [id, trunk] of this.trunks) {
      const part = id.split(':')[0].split(',').map(Number);
      const chX = part[0], chY = part[1];
      if (Math.abs(chX - cx) > this.RENDER_DISTANCE || Math.abs(chY - cy) > this.RENDER_DISTANCE) {
        trunk.sprite.destroy();
        this.trunks.delete(id);
      }
    }
  }

  updateDepths() {
    if (!this.player) return;
    const scrollY = this.cameras.main.scrollY;
    const sortY = (y) => 3000 + Math.round(y - scrollY);
    const feetDepth = sortY(this.player.y + 34);
    this.player.setDepth(feetDepth);
    if (this.playerNameText) this.playerNameText.setDepth(feetDepth);
    for (const tree of this.trees.values()) {
      tree.sprite.setDepth(sortY(tree.baseY));
    }
    for (const trunk of this.trunks.values()) {
      trunk.sprite.setDepth(sortY(trunk.groundY));
    }
  }

  placeBareTrunk(id, x, groundY) {
    if (this.trunks.has(id)) return;
    const s = 1.7;
    const sprite = this.add.image(x, Math.round(groundY - 12 * s), 'tree2')
      .setDepth(3000 + Math.round(groundY - this.cameras.main.scrollY))
      .setScale(s);
    this.trunks.set(id, { id, sprite, x, groundY, r: 12 });
  }

  spawnClickEffect(wx, wy) {
    const g = this.add.graphics().setDepth(9000);
    this.clickEffects.push({ t: 0, dur: 0.32, g, wx, wy, s: 4.5 });
  }

  updateClickEffects() {
    if (!this.clickEffects.length) return;
    const dt = 1 / 60;
    const d = 0.7071;
    for (let i = this.clickEffects.length - 1; i >= 0; i--) {
      const e = this.clickEffects[i];
      e.t += dt;
      const k = Math.min(e.t / e.dur, 1);
      const a = 1 - k;
      const inner = 1.5 + 2 * k;
      const outer = e.s + 1.5 * k;
      e.g.clear();
      e.g.lineStyle(2.5, 0xffffff, a);
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        e.g.lineBetween(
          e.wx + sx * inner * d, e.wy + sy * inner * d,
          e.wx + sx * outer * d, e.wy + sy * outer * d
        );
      }
      e.g.lineStyle(1.5, 0xffffff, a * 0.5);
      e.g.strokeCircle(e.wx, e.wy, 3 + 11 * k);
      if (k >= 1) {
        e.g.destroy();
        this.clickEffects.splice(i, 1);
      }
    }
  }

  handleRemoteObjectRemoved(kind, id) {
    if (kind === 'grass') {
      this.removedByKind.grass.add(id);
      if (this.chunkManager) this.chunkManager.applyRemovedSets();
    } else if (kind === 'stone') {
      this.removedByKind.stone.add(id);
      if (this.chunkManager) this.chunkManager.applyRemovedSets();
    } else if (kind === 'tree') {
      if (this.choppedTrees.has(id)) return;
      this.choppedTrees.add(id);
      const tree = this.trees.get(id);
      if (tree) {
        this.trees.delete(id);
        this.chopSound.treeBreak();
        const s = tree.sprite;
        this.tweens.add({
          targets: s, alpha: 0, angle: 60, duration: 500,
          onComplete: () => s.destroy()
        });
        this.placeBareTrunk(id, tree.x, tree.visualBase);
      }
    }
  }

  applyWorldState(state) {
    if (state && state.removed) {
      for (const item of state.removed) {
        this.handleRemoteObjectRemoved(item.kind, item.id);
      }
    }
  }

  // Envanterin ilk 5 barı: açmadan ekranda görünsün (hotbar).
  // Tam envanter için I tuşuyla açılır.
  createHotbar() {
    const cam = this.cameras.main;
    const cw = cam.width;
    const group = this.add.group();
    this.hotbarGroup = group;
    const D = UI_DEPTH - 1;

    const slot = 48, gap = 8, cols = 5;
    const totalW = cols * slot + (cols - 1) * gap;
    const startX = cw / 2 - totalW / 2 + slot / 2;
    const startY = cam.height - 70;

    this.hotbarSlots = [];
    for (let i = 0; i < cols; i++) {
      const sx = startX + i * (slot + gap);
      const sy = startY;

      const bg = this.add.rectangle(sx, sy, slot, slot, 0x241a10)
        .setDepth(D).setScrollFactor(0).setInteractive();
      group.add(bg);

      const icon = this.add.image(sx, sy - 4, '').setScale(1.2).setDepth(D).setScrollFactor(0);
      group.add(icon);

      const countText = this.add.text(sx + slot / 2 - 4, sy + slot / 2 - 6, '', {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 2
      }).setOrigin(1, 1).setDepth(D).setScrollFactor(0);
      group.add(countText);

      bg.on('pointerover', () => {
        bg.setStrokeStyle(2, 0x4cd964, 1);
        if (this._hotbarHoverText && this._hotbarHoverText.active) {
          this._hotbarHoverText.setText(this._hotbarItemNames[i] || '');
          this._hotbarHoverText.setPosition(sx, sy - slot - 10);
        }
      });
      bg.on('pointerout', () => {
        bg.setStrokeStyle(0);
      });

      this.hotbarSlots.push({ bg, icon, countText, index: i });
    }
    this._hotbarItemNames = [];
    this._hotbarHoverText = this.add.text(0, 0, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffe9b0',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(D + 1).setScrollFactor(0).setVisible(false);
    group.add(this._hotbarHoverText);

    this.refreshHotbar();
  }

refreshHotbar() {
    if (!this.hotbarSlots) return;
    const woodCount = this.inventory ? this.inventory.totalItem('wood') : this.wood;
    const stoneCount = this.inventory ? this.inventory.totalItem('stone') : (this.stone || 0);
    const hasItems = woodCount > 0 || stoneCount > 0;
    // Hiç eşya yoksa hotbar'ı gizle
    if (!hasItems) {
      this.hotbarGroup.setVisible(false);
      return;
    }
    this.hotbarGroup.setVisible(true);
    const items = [
      { name: 'Odun', count: woodCount, icon: 'log' },
      { name: 'Taş', count: stoneCount, icon: 'stone_7' }
    ];
    for (let i = 0; i < this.hotbarSlots.length; i++) {
      const slot = this.hotbarSlots[i];
      const item = items[i];
      if (item && item.count > 0) {
        slot.icon.setVisible(true).setTexture(item.icon);
        slot.countText.setText(String(item.count)).setVisible(true);
        this._hotbarItemNames[i] = item.name;
      } else {
        slot.icon.setVisible(false);
        slot.countText.setVisible(false);
        this._hotbarItemNames[i] = '';
      }
    }
  }

  toggleMenu() {
    if (this.inventoryOpen) {
      this.closeInventory();
      return;
    }
    this.pauseMenu.toggle();
  }

  openMenu() {
    this.pauseMenu.open();
  }

  closeMenu() {
    this.pauseMenu.close();
  }

  setMenuInfo(txt) {
    this.pauseMenu.setInfo(txt);
  }

createMenuUI() {
    this.pauseMenu.create();
  }

  toggleInventory() {
    if (this.inventoryOpen) {
      this.closeInventory();
    } else {
      this.openInventory();
    }
  }

  openInventory() {
    if (this.inventoryOpen) return;
    if (this.menuOpen) this.closeMenu();
    this.inventoryOpen = true;
    this.createInventoryUI();
  }

  closeInventory() {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    if (this.inventoryGroup) {
      this.inventoryGroup.destroy(true);
      this.inventoryGroup = null;
    }
    this.inventoryWoodText = null;
    this.inventoryStoneText = null;
    this.inventoryStats = null;
    this.inventorySlotBg = null;
    this.inventorySelected = false;
    this.dropBuffer = '';
  }

  refreshInventory() {
    if (this.inventoryWoodText) this.inventoryWoodText.setText(String(this.wood));
    if (this.inventoryStats) {
      this.inventoryStats.setText(`Kesilen Ağaç: ${this.treesChopped}    •    Toplanan Odun: ${this.wood}    •    Taş: ${this.stone || 0}`);
    }
    this.refreshHotbar();
  }

  createInventoryUI() {
    const cam = this.cameras.main;
    const cw = cam.width, ch = cam.height;
    const group = this.add.group();
    this.inventoryGroup = group;
    const D = UI_DEPTH;
    const overlay = this.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0.55)
      .setDepth(D).setScrollFactor(0).setInteractive();
    group.add(overlay);
    const pw = Math.min(560, cw - 40), ph = Math.min(440, ch - 40);
    const px = cw / 2, py = ch / 2;
    const panel = this.add.rectangle(px, py, pw, ph, 0x2b2118, 0.97)
      .setDepth(D).setScrollFactor(0).setInteractive();
    group.add(panel);
    const frame = this.add.rectangle(px, py, pw, ph)
      .setStrokeStyle(2, 0x8a5a2b, 1).setDepth(D).setScrollFactor(0);
    group.add(frame);
    const title = this.add.text(px, py - ph / 2 + 34, 'Envanter', {
      fontFamily: 'Arial, sans-serif', fontSize: '26px', fontStyle: 'bold',
      color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
    group.add(title);
    const line = this.add.rectangle(px, py - ph / 2 + 58, pw - 90, 2, 0x8a5a2b, 0.9)
      .setDepth(D).setScrollFactor(0);
    group.add(line);
    this._createInventoryGrid(group, D, px, py, pw, ph);
    this.inventoryStats = this.add.text(px, py + ph / 2 - 54, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
    group.add(this.inventoryStats);
    const hint = this.add.text(px, py + ph / 2 - 24, 'I - Kapat', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#9a8a6a'
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);
    group.add(hint);
    this.refreshInventory();
  }

  _createInventoryGrid(group, D, px, py, pw, ph) {
    const cols = 5, rows = 3, slot = 64, gap = 14;
    const gridW = cols * slot + (cols - 1) * gap;
    const gridH = rows * slot + (rows - 1) * gap;
    const gx0 = px - gridW / 2 + slot / 2;
    const gy0 = py - 34 - gridH / 2 + slot / 2;

    // Hover text for inventory slots
    this._invHoverText = this.add.text(0, 0, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#ffe9b0',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(D + 1).setScrollFactor(0).setVisible(false);
    group.add(this._invHoverText);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
const filled = (r * cols + c === 0 && this.wood > 0) || (r * cols + c === 1 && (this.stone || 0) > 0);
        const sx = gx0 + c * (slot + gap);
        const sy = gy0 + r * (slot + gap);
        const slotIndex = r * cols + c;
        const bg = this.add.rectangle(sx, sy, slot, slot, filled ? 0x3a2a18 : 0x241a10)
          .setDepth(D).setScrollFactor(0).setInteractive();
        group.add(bg);

        if (slotIndex === 0 && this.wood > 0) {
          // Odun slotu
          const icon = this.add.image(sx, sy - 4, 'log').setScale(1.5).setDepth(D).setScrollFactor(0);
          group.add(icon);
          this.inventoryWoodText = this.add.text(sx + slot / 2 - 5, sy + slot / 2 - 4, String(this.wood), {
            fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold',
            color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
          }).setOrigin(1, 1).setDepth(D).setScrollFactor(0);
          group.add(this.inventoryWoodText);
          const label = this.add.text(sx, sy + slot / 2 + 9, 'Odun', {
            fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#e8c98a',
            stroke: '#000000', strokeThickness: 2
          }).setOrigin(0.5, 0).setDepth(D).setScrollFactor(0);
          group.add(label);

          bg.on('pointerover', () => {
            bg.setStrokeStyle(2, 0x4cd964, 1);
            this._invHoverText.setText('Odun (x' + this.wood + ')');
            this._invHoverText.setPosition(sx, sy - slot - 14);
            this._invHoverText.setVisible(true);
          });
          bg.on('pointerout', () => {
            bg.setStrokeStyle(0);
            this._invHoverText.setVisible(false);
          });
          bg.on('pointerdown', () => this.selectWoodSlot(bg));
        } else if (slotIndex === 1 && (this.stone || 0) > 0) {
          // Taş slotu
          const icon = this.add.image(sx, sy - 4, 'stone_7').setScale(1.5).setDepth(D).setScrollFactor(0);
          group.add(icon);
          this.inventoryStoneText = this.add.text(sx + slot / 2 - 5, sy + slot / 2 - 4, String(this.stone || 0), {
            fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold',
            color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
          }).setOrigin(1, 1).setDepth(D).setScrollFactor(0);
          group.add(this.inventoryStoneText);
          const label = this.add.text(sx, sy + slot / 2 + 9, 'Taş', {
            fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#e8c98a',
            stroke: '#000000', strokeThickness: 2
          }).setOrigin(0.5, 0).setDepth(D).setScrollFactor(0);
          group.add(label);

          bg.on('pointerover', () => {
            bg.setStrokeStyle(2, 0x4cd964, 1);
            this._invHoverText.setText('Taş (x' + (this.stone || 0) + ')');
            this._invHoverText.setPosition(sx, sy - slot - 14);
            this._invHoverText.setVisible(true);
          });
          bg.on('pointerout', () => {
            bg.setStrokeStyle(0);
            this._invHoverText.setVisible(false);
          });
          bg.on('pointerdown', () => this.selectStoneSlot(bg));
        }
      }
    }
  }

refreshInventory() {
    if (this.inventoryWoodText) this.inventoryWoodText.setText(String(this.inventory ? this.inventory.totalItem('wood') : this.wood));
    if (this.inventoryStoneText) this.inventoryStoneText.setText(String(this.inventory ? this.inventory.totalItem('stone') : (this.stone || 0)));
    if (this.inventoryStats) {
      this.inventoryStats.setText(`Kesilen Ağaç: ${this.treesChopped}    •    Toplanan Odun: ${this.inventory ? this.inventory.totalItem('wood') : this.wood}    •    Taş: ${this.inventory ? this.inventory.totalItem('stone') : (this.stone || 0)}`);
    }
this.refreshHotbar();
  }

  selectWoodSlot(bg) {
    if (this.inventorySlotBg && this.inventorySlotBg !== bg) this.inventorySlotBg.setStrokeStyle(0);
    this.inventorySlotBg = bg;
    this.inventorySelected = true;
    this.dropBuffer = '';
    bg.setStrokeStyle(2, 0x4cd964, 1);
  }

  selectStoneSlot(bg) {
    if (this.inventorySlotBg && this.inventorySlotBg !== bg) this.inventorySlotBg.setStrokeStyle(0);
    this.inventorySlotBg = bg;
    this.inventorySelected = true;
    this.dropBuffer = '';
    bg.setStrokeStyle(2, 0x4cd964, 1);
  }

  dropWood(n) {
    if (!this.player) return;
    n = Math.max(0, Math.min(Math.floor(n), this.wood));
    if (n === 0) return;
    this.wood -= n;
    if (this.woodText) this.woodText.setText('Odun: ' + this.wood);
    this.refreshHotbar();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.harvestSystem.dropLog(this.player.x + Math.cos(a) * (24 + Math.random() * 26),
                                   this.player.y + 30 + Math.sin(a) * 12, 1500);
    }
  }

  dropStone(n) {
    if (!this.player) return;
    n = Math.max(0, Math.min(Math.floor(n), this.stone || 0));
    if (n === 0) return;
    this.stone -= n;
    this.refreshHotbar();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.harvestSystem.dropStone(this.player.x + Math.cos(a) * (24 + Math.random() * 26),
                                    this.player.y + 30 + Math.sin(a) * 12, 1500);
    }
  }
}
