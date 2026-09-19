// Envanter/hotbar çizimi: slot içeriği tamamen Inventory'den gelir,
// ikonlar JSON'daki nesne tanımından okunur. Yeni nesne eklenince UI
// kendiliğinden gösterir — burada tür adı geçmez.
import { getObjectDef } from '../core/ObjectDefs.js';
import { UI_DEPTH } from './uiDepth.js';

const SLOT_SRC = 16;
const SLOT_SRC_X0 = 16;
const SLOT_SRC_Y = 48;
const SLOT_SCALE = 3;

// Slot ikonları: boş texture key'i Phaser'da __MISSING'e düşer ve görünmez
// kalır; bu yüzden ikonlar geçerli bir dokuyla (ilk tanımlı nesne) yaratılır,
// içerik gelince setTexture ile değiştirilir.
const ICON_PLACEHOLDER = '__ICON_EMPTY__';
const ICON_MAX_SIZE = 40;

function ensureIconPlaceholder(scene) {
  if (scene.textures.exists(ICON_PLACEHOLDER)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x000000, 0);
  g.fillRect(0, 0, 2, 2);
  g.generateTexture(ICON_PLACEHOLDER, 2, 2);
  g.destroy();
}

export class InventoryView {
  constructor(scene) {
    this.scene = scene;
    this.hotbar = null;
    this.window = null;
    this.isOpen = false;
    this.selectedIndex = null;
    this.dropBuffer = '';
    this._hoverText = null;
    ensureIconPlaceholder(scene);
  }

  // Nesnenin envanterde gösterilecek ikon anahtarı (JSON'daki ilk texture).
  iconOf(itemId) {
    const def = getObjectDef(itemId);
    if (!def || !def.textures.length) return null;
    const key = def.textures[0];
    return this.scene.textures.exists(key) ? key : null;
  }

  labelOf(itemId) {
    const def = getObjectDef(itemId);
    return def ? def.name : itemId;
  }

  stackLabelOf(itemId, count) {
    const def = getObjectDef(itemId);
    const base = def && def.stackLabel ? def.stackLabel : this.labelOf(itemId);
    return `${base} (x${count})`;
  }

  _createHoverText(depth) {
    if (this._hoverText && this._hoverText.active) return this._hoverText;
        this._hoverText = this.scene.add.text(0, 0, '', {
      fontFamily: 'Monocraft', fontSize: '13px', color: '#ffe9b0',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(depth).setScrollFactor(0).setVisible(false);
    return this._hoverText;
  }

  // --- Hotbar (ekranın alt ortası) ---

  createHotbar(columns = 5) {
    const cam = this.scene.cameras.main;
    const group = this.scene.add.group();
    const depth = UI_DEPTH - 1;
    const slot = SLOT_SRC * SLOT_SCALE;
    const gap = 8;
    const totalWidth = columns * slot + (columns - 1) * gap;
    const startX = cam.width / 2 - totalWidth / 2 + slot / 2;
    const startY = cam.height - 48;
    const panel = this.scene.textures.get('action_panel');
    const slots = [];

    for (let i = 0; i < columns; i++) {
      const frameKey = `hotbar_cell_${i}`;
      if (!panel.has(frameKey)) {
        panel.add(frameKey, 0, SLOT_SRC_X0 + i * SLOT_SRC, SLOT_SRC_Y, SLOT_SRC, SLOT_SRC);
      }
      const x = startX + i * (slot + gap);
      const bg = this.scene.add.image(x, startY, 'action_panel', frameKey)
        .setScale(SLOT_SCALE).setDepth(depth).setScrollFactor(0).setInteractive();
      group.add(bg);
      const icon = this.scene.add.image(x, startY - 4, ICON_PLACEHOLDER).setScale(1.2)
        .setDepth(depth).setScrollFactor(0).setVisible(false);
      group.add(icon);
      const countText = this.scene.add.text(x + slot / 2 - 4, startY + slot / 2 - 6, '', {
        fontFamily: 'Monocraft', fontSize: '16px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000000', strokeThickness: 2
      }).setOrigin(1, 1).setDepth(depth).setScrollFactor(0);
      group.add(countText);
      bg.on('pointerover', () => bg.setTint(0x9fe8a8));
      bg.on('pointerout', () => bg.clearTint());
      slots.push({ icon, countText });
    }

    group.add(this._createHoverText(depth + 1));
    this.hotbar = { group, slots, startX, startY, slot, gap };
    return this.hotbar;
  }

  // İkonu slota sığacak şekilde ölçekler (pixel art oranı korunur).
  _fitIcon(icon, maxSize = ICON_MAX_SIZE) {
    icon.setScale(1);
    const src = icon.getSourceImage ? icon.getSourceImage() : null;
    const w = src ? src.width : icon.width;
    const h = src ? src.height : icon.height;
    if (!w || !h) return;
    const scale = Math.min(maxSize / w, maxSize / h);
    icon.setScale(scale);
  }

  refreshHotbar(items) {
    if (!this.hotbar) return;
    const { slots, startX, startY, slot, gap } = this.hotbar;
    for (let i = 0; i < slots.length; i++) {
      // items öğeleri { slot: { itemId, count }, index } biçimindedir.
      const slotData = items[i] ? items[i].slot : null;
      const icon = slotData ? this.iconOf(slotData.itemId) : null;
      const s = slots[i];
      if (!slotData || !icon) {
        s.icon.setVisible(false);
        s.countText.setVisible(false);
        continue;
      }
      s.icon.setTexture(icon);
      this._fitIcon(s.icon, slot * 0.7);
      s.icon.setVisible(true);
      s.countText.setText(String(slotData.count)).setVisible(true);
      s.icon.setPosition(startX + i * (slot + gap), startY - 4);
    }
  }

  // --- Tam envanter penceresi (I tuşu) ---

  open(items) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.selectedIndex = null;
    this.dropBuffer = '';
    const cam = this.scene.cameras.main;
    const group = this.scene.add.group();
    const d = UI_DEPTH;
    const pw = Math.min(560, cam.width - 40);
    const ph = Math.min(440, cam.height - 40);
    const px = cam.width / 2;
    const py = cam.height / 2;

    group.add(this.scene.add.rectangle(px, py, cam.width, cam.height, 0x000000, 0.55)
      .setDepth(d).setScrollFactor(0).setInteractive());
    group.add(this.scene.add.rectangle(px, py, pw, ph, 0x2b2118, 0.97)
      .setDepth(d).setScrollFactor(0).setInteractive());
    group.add(this.scene.add.rectangle(px, py, pw, ph)
      .setStrokeStyle(2, 0x8a5a2b, 1).setDepth(d).setScrollFactor(0));
    group.add(this.scene.add.text(px, py - ph / 2 + 34, 'Envanter', {
      fontFamily: 'Monocraft', fontSize: '32px', fontStyle: 'bold',
      color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(d).setScrollFactor(0));
    group.add(this.scene.add.rectangle(px, py - ph / 2 + 68, pw - 90, 2, 0x8a5a2b, 0.9)
      .setDepth(d).setScrollFactor(0));

    const grid = { cols: 5, rows: 3, slot: 64, gap: 14 };
    const gridW = grid.cols * grid.slot + (grid.cols - 1) * grid.gap;
    const gridH = grid.rows * grid.slot + (grid.rows - 1) * grid.gap;
    const gx0 = px - gridW / 2 + grid.slot / 2;
    const gy0 = py - 34 - gridH / 2 + grid.slot / 2;
    const cells = [];

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const index = r * grid.cols + c;
        const x = gx0 + c * (grid.slot + grid.gap);
        const y = gy0 + r * (grid.slot + grid.gap);
        cells.push(this._createCell(group, index, x, y + 20, grid.slot, d));
      }
    }

    this.window = { group, cells, items: [] };
    this.refresh(items);
  }

  _createCell(group, index, x, y, slot, d) {
    const bg = this.scene.add.rectangle(x, y, slot, slot, 0x241a10)
      .setDepth(d).setScrollFactor(0).setInteractive();
    group.add(bg);
    const icon = this.scene.add.image(x, y - 4, ICON_PLACEHOLDER).setScale(1.5)
      .setDepth(d).setScrollFactor(0).setVisible(false);
    group.add(icon);
    const countText = this.scene.add.text(x + slot / 2 - 5, y + slot / 2 - 4, '', {
      fontFamily: 'Monocraft', fontSize: '18px', fontStyle: 'bold',
      color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
    }).setOrigin(1, 1).setDepth(d).setScrollFactor(0).setVisible(false);
    group.add(countText);
    const label = this.scene.add.text(x, y + slot / 2 + 9, '', {
      fontFamily: 'Monocraft', fontSize: '16px', color: '#e8c98a',
      stroke: '#000000', strokeThickness: 2
    }).setOrigin(0.5, 0).setDepth(d).setScrollFactor(0).setVisible(false);
    group.add(label);

    bg.on('pointerdown', () => this.select(index, bg));
    return { bg, icon, countText, label };
  }

  // Slotlar envanterin yerleşik sırasını gösterir; seçili slot kare ile işaretlenir.
  select(index, bg) {
    if (this.window && this.selectedIndex !== null) {
      const previous = this.window.cells[this.selectedIndex];
      if (previous && previous.bg !== bg) previous.bg.setStrokeStyle(0);
    }
    this.selectedIndex = index;
    bg.setStrokeStyle(2, 0x4cd964, 1);
    this.dropBuffer = '';
  }

  // Seçili slotun kaydı (dünya koordinatıyla eşleşmesi için items üzerinden).
  get selectedEntry() {
    if (!this.window || this.selectedIndex === null) return null;
    return this.window.items[this.selectedIndex] || null;
  }

  // Hover ve içerik yenileme: her açık frame'de çağrılır.
  refresh(items) {
    if (!this.window) return;
    this.window.items = items;
    const { cells } = this.window;
    for (let i = 0; i < cells.length; i++) {
      // items öğeleri { slot: { itemId, count }, index } biçimindedir.
      const slotData = items[i] ? items[i].slot : null;
      const cell = cells[i];
      const icon = slotData ? this.iconOf(slotData.itemId) : null;
      if (!slotData || !icon) {
        cell.icon.setVisible(false);
        cell.countText.setVisible(false);
        cell.label.setVisible(false);
        cell.bg.removeAllListeners('pointerover');
        cell.bg.removeAllListeners('pointerout');
        if (this.selectedIndex !== i) cell.bg.setStrokeStyle(0);
        continue;
      }
      cell.icon.setTexture(icon);
      this._fitIcon(cell.icon, 44);
      cell.icon.setVisible(true);
      cell.countText.setText(String(slotData.count)).setVisible(true);
      cell.label.setText(this.labelOf(slotData.itemId)).setVisible(true);
      this._bindHover(cell, i, slotData);
    }
  }

  _bindHover(cell, index, slotData) {
    const bg = cell.bg;
    bg.off('pointerover');
    bg.off('pointerout');
    bg.on('pointerover', () => {
      if (this.selectedIndex !== index) bg.setStrokeStyle(2, 0x4cd964, 0.6);
      const hover = this._hoverText;
      if (!hover) return;
      hover.setText(this.stackLabelOf(slotData.itemId, slotData.count));
      hover.setPosition(bg.x, bg.y - 46).setVisible(true);
    });
    bg.on('pointerout', () => {
      if (this.selectedIndex !== index) bg.setStrokeStyle(0);
      if (this._hoverText) this._hoverText.setVisible(false);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.window) {
      this.window.group.destroy(true);
      this.window = null;
    }
    this.selectedIndex = null;
    this.dropBuffer = '';
    if (this._hoverText) this._hoverText.setVisible(false);
  }
}