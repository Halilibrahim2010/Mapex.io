// Envanter/hotbar çizimi: slot içeriği tamamen Inventory'den gelir,
// ikonlar JSON'daki nesne tanımından okunur. Yeni nesne eklenince UI
// kendiliğinden gösterir — burada tür adı geçmez.
import { getObjectDef } from "../core/ObjectDefs.js";
import { UI_DEPTH } from "./uiDepth.js";

const SLOT_SRC = 16;
const SLOT_SRC_X0 = 16;
const SLOT_SRC_Y = 48;
const SLOT_SCALE = 3;

// Slot ikonları: boş texture key'i Phaser'da __MISSING'e düşer ve görünmez
// kalır; bu yüzden ikonlar geçerli bir dokuyla (ilk tanımlı nesne) yaratılır,
// içerik gelince setTexture ile değiştirilir.
const ICON_PLACEHOLDER = "__ICON_EMPTY__";
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
    this.dropBuffer = "";
    this._hoverText = null;
    this._byIndex = new Map();
    this._dragSourceIndex = null;
    this._dragItem = null;
    this._ghostIcon = null;
    this._onPointerMove = null;
    this._onPointerUp = null;
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
    this._hoverText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Monocraft",
        fontSize: "13px",
        color: "#ffe9b0",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(depth)
      .setScrollFactor(0)
      .setVisible(false);
    return this._hoverText;
  }

  // --- Hotbar (ekranın alt ortası) ---

  createHotbar(columns = 5) {
    this._hotbarColumns = columns;
    const cam = this.scene.cameras.main;
    const group = this.scene.add.group();
    const depth = UI_DEPTH - 1;
    const slot = SLOT_SRC * SLOT_SCALE;
    const gap = 8;
    const totalWidth = columns * slot + (columns - 1) * gap;
    const startX = cam.width / 2 - totalWidth / 2 + slot / 2;
    const startY = cam.height - 30;
    const panel = this.scene.textures.get("action_panel");
    const slots = [];

    for (let i = 0; i < columns; i++) {
      const frameKey = `hotbar_cell_${i}`;
      if (!panel.has(frameKey)) {
        panel.add(
          frameKey,
          0,
          SLOT_SRC_X0 + i * SLOT_SRC,
          SLOT_SRC_Y,
          SLOT_SRC,
          SLOT_SRC,
        );
      }
      const x = startX + i * (slot + gap);
      const bg = this.scene.add
        .image(x, startY, "action_panel", frameKey)
        .setScale(SLOT_SCALE)
        .setDepth(depth)
        .setScrollFactor(0)
        .setInteractive();
      group.add(bg);
      const icon = this.scene.add
        .image(x, startY - 4, ICON_PLACEHOLDER)
        .setScale(1.2)
        .setDepth(depth)
        .setScrollFactor(0)
        .setVisible(false);
      group.add(icon);
      const countText = this.scene.add
        .text(x + slot / 2 - 4, startY + slot / 2 - 6, "", {
          fontFamily: "Monocraft",
          fontSize: "16px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(1, 1)
        .setDepth(depth)
        .setScrollFactor(0);
      group.add(countText);
      bg.on("pointerover", () => bg.setTint(0x9fe8a8));
      bg.on("pointerout", () => bg.clearTint());
      slots.push({ bg, icon, countText });
    }

    group.add(this._createHoverText(depth + 1));
    // Hotbar arka planı: slotların arkasında duran onlyhotbar.png (106x26).
    // Slot dizisini kapsayacak boyuta ölçeklenir, depth ile en arkada tutulur.
    const bgPaddingX = 10;
    const bgPaddingY = 8;
    const bgTargetW = totalWidth + bgPaddingX * 2;
    const bgTargetH = slot + bgPaddingY * 2;
    const hotbarBg = this.scene.add
      .image(cam.width / 2, startY, "hotbar_bg")
      .setDepth(depth - 1)
      .setScrollFactor(0);
    hotbarBg.setDisplaySize(bgTargetW, bgTargetH);
    group.add(hotbarBg);
    this.hotbar = { group, slots, startX, startY, slot, gap, bg: hotbarBg };
    // Ana menüde arka planda sadece harita görünsün: hotbar oyun başlayana dek gizli.
    group.setVisible(false);

    return this.hotbar;
  }

  // Ana menü önizlemesi ↔ oyun geçişinde hotbar görünürlüğü.
  setHotbarVisible(visible) {
    if (!this.hotbar) return;
    this.hotbar.group.setVisible(Boolean(visible));
  }

  // Hotbar elemanlarını güncel ekran boyutuna göre yeniden konumlandırır.
  layoutHotbar(width, height) {
    if (!this.hotbar) return;
    const w =
      width !== undefined
        ? width
        : this.scene.scale
          ? this.scene.scale.width
          : this.scene.cameras.main.width;
    const h =
      height !== undefined
        ? height
        : this.scene.scale
          ? this.scene.scale.height
          : this.scene.cameras.main.height;
    const columns = this._hotbarColumns || 5;
    const { slots, slot, gap } = this.hotbar;
    const totalWidth = columns * slot + (columns - 1) * gap;
    const startX = w / 2 - totalWidth / 2 + slot / 2;
    const startY = h - 30;

    this.hotbar.startX = startX;
    this.hotbar.startY = startY;

    for (let i = 0; i < slots.length; i++) {
      const x = startX + i * (slot + gap);
      const s = slots[i];
      if (s.bg) s.bg.setPosition(x, startY);
      if (s.icon) s.icon.setPosition(x, startY - 4);
      if (s.countText)
        s.countText.setPosition(x + slot / 2 - 4, startY + slot / 2 - 6);
    }
    // Arka plan her zaman slot dizisinin ortasında durur.
    if (this.hotbar.bg) this.hotbar.bg.setPosition(w / 2, startY);
  }

  _repositionHotbar() {
    this.layoutHotbar();
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
    this.dropBuffer = "";
    const cam = this.scene.cameras.main;
    const group = this.scene.add.group();
    const d = UI_DEPTH;
    const pw = Math.min(560, cam.width - 40);
    const ph = Math.min(440, cam.height - 40);
    const px = cam.width / 2;
    const py = cam.height / 2;
    const panelBounds = { x: px - pw / 2, y: py - ph / 2, w: pw, h: ph };

    group.add(
      this.scene.add
        .rectangle(px, py, cam.width, cam.height, 0x000000, 0.55)
        .setDepth(d)
        .setScrollFactor(0)
        .setInteractive(),
    );
    group.add(
      this.scene.add
        .rectangle(px, py, pw, ph, 0x2b2118, 0.97)
        .setDepth(d)
        .setScrollFactor(0)
        .setInteractive(),
    );
    group.add(
      this.scene.add
        .rectangle(px, py, pw, ph)
        .setStrokeStyle(2, 0x8a5a2b, 1)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .text(px, py - ph / 2 + 34, "Envanter", {
          fontFamily: "Monocraft",
          fontSize: "32px",
          fontStyle: "bold",
          color: "#ffe9b0",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(d)
        .setScrollFactor(0),
    );
    group.add(
      this.scene.add
        .rectangle(px, py - ph / 2 + 68, pw - 90, 2, 0x8a5a2b, 0.9)
        .setDepth(d)
        .setScrollFactor(0),
    );

    const grid = { cols: 5, rows: 3, slot: 64, gap: 32 };
    const maxSlots = this.scene.inventory ? this.scene.inventory.maxSlots : 15;
    const totalSlots = Math.min(grid.cols * grid.rows, maxSlots);
    const gridW = grid.cols * grid.slot + (grid.cols - 1) * grid.gap;
    const gridH = grid.rows * grid.slot + (grid.rows - 1) * grid.gap;
    const gx0 = px - gridW / 2 + grid.slot / 2;
    const gy0 = py - 34 - gridH / 2 + grid.slot / 2;
    const cells = [];

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const index = r * grid.cols + c;
        if (index >= totalSlots) break;
        const x = gx0 + c * (grid.slot + grid.gap);
        const y = gy0 + r * (grid.slot + grid.gap);
        cells.push(this._createCell(group, index, x, y + 40, grid.slot, d));
      }
    }

    this.window = { group, cells, items: [], panelBounds, slotSize: grid.slot };

    // Sürükleme için fare olaylarını bağla
    this._onPointerMove = (pointer) => {
      if (this._ghostIcon) {
        this._ghostIcon.setPosition(pointer.x, pointer.y);
      }
    };
    this._onPointerUp = (pointer) => {
      if (
        this._dragSourceIndex !== null &&
        this._dragSourceIndex !== undefined
      ) {
        this._endDrag(pointer);
      }
    };
    this.scene.input.on("pointermove", this._onPointerMove);
    this.scene.input.on("pointerup", this._onPointerUp);

    this.refresh(items);
  }

  _createCell(group, index, x, y, slot, d) {
    const bg = this.scene.add
      .rectangle(x, y, slot, slot, 0x241a10)
      .setDepth(d)
      .setScrollFactor(0)
      .setInteractive();
    group.add(bg);
    const icon = this.scene.add
      .image(x, y - 4, ICON_PLACEHOLDER)
      .setScale(1.5)
      .setDepth(d)
      .setScrollFactor(0)
      .setVisible(false);
    group.add(icon);
    const countText = this.scene.add
      .text(x + slot / 2 - 5, y + slot / 2 - 4, "", {
        fontFamily: "Monocraft",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffe9b0",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(1, 1)
      .setDepth(d)
      .setScrollFactor(0)
      .setVisible(false);
    group.add(countText);
    const label = this.scene.add
      .text(x, y + slot / 2 - 2, "", {
        fontFamily: "Monocraft",
        fontSize: "16px",
        color: "#e8c98a",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(d)
      .setScrollFactor(0)
      .setVisible(false);
    group.add(label);

    bg.on("pointerdown", (pointer) => {
      this.select(index, bg);
      this._startDrag(index, pointer);
    });
    return { bg, icon, countText, label };
  }

  _startDrag(index, pointer) {
    const entry = this._entryAt(index);
    if (!entry || !entry.slot) return;
    this._dragSourceIndex = index;
    this._dragItem = { itemId: entry.slot.itemId, count: entry.slot.count };
    const iconKey = this.iconOf(entry.slot.itemId);
    if (this._ghostIcon) this._ghostIcon.destroy();
    this._ghostIcon = this.scene.add
      .image(pointer.x, pointer.y, iconKey || ICON_PLACEHOLDER)
      .setScale(1.5)
      .setDepth(UI_DEPTH + 10)
      .setAlpha(0.85)
      .setScrollFactor(0);
    this._fitIcon(this._ghostIcon, 44);
    this.scene.input.setDefaultCursor("grabbing");
  }

  _cancelDrag() {
    if (this._ghostIcon) {
      this._ghostIcon.destroy();
      this._ghostIcon = null;
    }
    this._dragSourceIndex = null;
    this._dragItem = null;
    this.scene.input.setDefaultCursor("url(assets/cross.png) 25 25, default");
  }

  _endDrag(pointer) {
    if (
      this._dragSourceIndex === null ||
      this._dragSourceIndex === undefined ||
      !this._dragItem
    ) {
      this._cancelDrag();
      return;
    }

    const bounds = this.window && this.window.panelBounds;
    // a) pointer panelBounds DIŞINDAYSA → scene.dropItem(itemId, count) ile yığının tamamını yere at
    if (
      bounds &&
      (pointer.x < bounds.x ||
        pointer.x > bounds.x + bounds.w ||
        pointer.y < bounds.y ||
        pointer.y > bounds.y + bounds.h)
    ) {
      const dropItem = this._dragItem;
      this._cancelDrag();
      if (this.scene.dropItem) {
        this.scene.dropItem(dropItem.itemId, dropItem.count);
      }
      if (this.scene.inventoryUi) this.scene.inventoryUi.refresh();
      return;
    }

    // Hedef hücre tespiti
    let targetIndex = null;
    const slotSize = (this.window && this.window.slotSize) || 64;
    const half = slotSize / 2;
    for (let i = 0; i < this.window.cells.length; i++) {
      const cell = this.window.cells[i];
      if (
        pointer.x >= cell.bg.x - half &&
        pointer.x <= cell.bg.x + half &&
        pointer.y >= cell.bg.y - half &&
        pointer.y <= cell.bg.y + half
      ) {
        targetIndex = i;
        break;
      }
    }

    const fromIndex = this._dragSourceIndex;
    this._cancelDrag();

    // b) hücre yoksa veya aynı hücreyse → iptal (refresh ile eski görünüm)
    if (targetIndex === null || targetIndex === fromIndex) {
      if (this.scene.inventoryUi) this.scene.inventoryUi.refresh();
      return;
    }

    // c) dolu→dolu → inventory.slots üzerinde içerik takası
    // d) dolu→boş → taşıma (hedefe yaz, kaynaktan sil)
    const slots = this.scene.inventory ? this.scene.inventory.slots : null;
    if (slots && slots[fromIndex]) {
      const temp = slots[fromIndex];
      slots[fromIndex] = slots[targetIndex] || null;
      slots[targetIndex] = temp;
    }

    if (this.scene.inventoryUi) this.scene.inventoryUi.refresh();
  }

  // Slotlar envanterin yerleşik sırasını gösterir; seçili slot kare ile işaretlenir.
  select(index, bg) {
    if (this.window && this.selectedIndex !== null) {
      const previous = this.window.cells[this.selectedIndex];
      if (previous && previous.bg !== bg) previous.bg.setStrokeStyle(0);
    }
    this.selectedIndex = index;
    bg.setStrokeStyle(2, 0x4cd964, 1);
    this.dropBuffer = "";
  }

  _entryAt(absIndex) {
    if (!this.window) return null;
    return this._byIndex ? this._byIndex.get(absIndex) || null : null;
  }

  // Seçili slotun kaydı (dünya koordinatıyla eşleşmesi için items üzerinden).
  get selectedEntry() {
    if (!this.window || this.selectedIndex === null) return null;
    return this._entryAt(this.selectedIndex);
  }

  // Hover ve içerik yenileme: her açık frame'de çağrılır.
  refresh(items) {
    if (!this.window) return;
    this.window.items = items || [];
    const byIndex = new Map();
    for (const entry of this.window.items) {
      if (entry && entry.slot && Number.isFinite(entry.index)) {
        byIndex.set(entry.index, entry);
      }
    }
    this._byIndex = byIndex;

    const { cells } = this.window;
    for (let i = 0; i < cells.length; i++) {
      const entry = this._entryAt(i);
      const slotData = entry ? entry.slot : null;
      const cell = cells[i];
      const icon = slotData ? this.iconOf(slotData.itemId) : null;
      if (!slotData || !icon) {
        cell.icon.setVisible(false);
        cell.countText.setVisible(false);
        cell.label.setVisible(false);
        cell.bg.off("pointerover");
        cell.bg.off("pointerout");
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
    bg.off("pointerover");
    bg.off("pointerout");
    bg.on("pointerover", () => {
      if (this.selectedIndex !== index) bg.setStrokeStyle(2, 0x4cd964, 0.6);
      const hover = this._hoverText;
      if (!hover) return;
      hover.setText(this.stackLabelOf(slotData.itemId, slotData.count));
      hover.setPosition(bg.x, bg.y - 46).setVisible(true);
    });
    bg.on("pointerout", () => {
      if (this.selectedIndex !== index) bg.setStrokeStyle(0);
      if (this._hoverText) this._hoverText.setVisible(false);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this._onPointerMove) {
      this.scene.input.off("pointermove", this._onPointerMove);
      this._onPointerMove = null;
    }
    if (this._onPointerUp) {
      this.scene.input.off("pointerup", this._onPointerUp);
      this._onPointerUp = null;
    }
    this._cancelDrag();
    if (this.window) {
      this.window.group.destroy(true);
      this.window = null;
    }
    this.selectedIndex = null;
    this.dropBuffer = "";
    if (this._hoverText) this._hoverText.setVisible(false);
  }
}
