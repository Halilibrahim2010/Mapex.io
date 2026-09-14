// Inventory window (E key), extracted from MainScene.
// callbacks: { onDrop }
import { UI_DEPTH } from './uiDepth.js';

export class InventoryMenu {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.open = false;
    this.group = null;
    this.woodText = null;
    this.statsText = null;
    this.slotBg = null;      // selected slot highlight
    this.selected = false;
    this.dropBuffer = '';    // typed digits for the drop amount
    this._lastWood = null;   // cached so refresh skips redundant setText
    this._lastStats = null;
  }

  get isOpen() { return this.open; }

  toggle() {
    if (this.open) this.close();
    else this.create();
  }

  open() {
    if (!this.open) this.create();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.group) {
      this.group.destroy(true);
      this.group = null;
    }
    this.woodText = null;
    this.statsText = null;
    this.slotBg = null;
    this.selected = false;
    this.dropBuffer = '';
  }

  bindKeys() {
    // I key: open/close inventory (blocked while the pause menu is open).
    this.scene.input.keyboard.on('keydown-I', () => {
      if (this.scene.menuOpen) return;
      this.toggle();
    });

    // Digit typing + Enter to drop wood while a slot is selected.
    this.scene.input.keyboard.on('keydown', (event) => {
      if (!this.open || !this.selected) return;
      if (/^[0-9]$/.test(event.key)) {
        if (this.dropBuffer.length < 3) {
          this.dropBuffer = (this.dropBuffer + event.key).replace(/^0+/, '') || '0';
        }
      } else if (event.key === 'Backspace') {
        this.dropBuffer = this.dropBuffer.slice(0, -1);
      } else if (event.key === 'Enter') {
        this.callbacks.onDrop(parseInt(this.dropBuffer, 10) || 0);
        this.dropBuffer = '';
      }
    });
  }

  create() {
    if (this.open) return;
    this.open = true;
    const scene = this.scene;
    const cam = scene.cameras.main;
    const cw = cam.width;
    const ch = cam.height;
    const group = scene.add.group();
    this.group = group;

    // Dim layer: eats clicks, fixed to screen.
    const overlay = scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0.55)
      .setDepth(UI_DEPTH).setScrollFactor(0).setInteractive();
    group.add(overlay);

    // Wood-style panel + frame.
    const pw = Math.min(560, cw - 40);
    const ph = Math.min(440, ch - 40);
    const px = cw / 2, py = ch / 2;

    const panel = scene.add.rectangle(px, py, pw, ph, 0x2b2118, 0.97)
      .setDepth(UI_DEPTH).setScrollFactor(0).setInteractive();
    group.add(panel);

    const frame = scene.add.rectangle(px, py, pw, ph)
      .setStrokeStyle(2, 0x8a5a2b, 1)
      .setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(frame);

    // Title + divider.
    const title = scene.add.text(px, py - ph / 2 + 34, 'Envanter', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffe9b0',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(title);

    const line = scene.add.rectangle(px, py - ph / 2 + 58, pw - 90, 2, 0x8a5a2b, 0.9)
      .setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(line);

    this._createGrid(group, px, py);

    // Bottom stats + close hint.
    this.statsText = scene.add.text(px, py + ph / 2 - 54, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(this.statsText);

    const hint = scene.add.text(px, py + ph / 2 - 24, 'I - Kapat', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      color: '#9a8a6a'
    }).setOrigin(0.5).setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(hint);

    this._lastWood = null;
    this._lastStats = null;
    this.refresh();
  }

  // 5x3 slot grid. Slot 0 = wood, the rest are empty for now.
  _createGrid(group, px, py) {
    const scene = this.scene;
    const cols = 5, rows = 3, slot = 64, gap = 14;
    const gridW = cols * slot + (cols - 1) * gap;
    const gridH = rows * slot + (rows - 1) * gap;
    const gx0 = px - gridW / 2 + slot / 2;
    const gy0 = py - 34 - gridH / 2 + slot / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const filled = r * cols + c === 0; // slot 0: wood
        const sx = gx0 + c * (slot + gap);
        const sy = gy0 + r * (slot + gap);

        const bg = scene.add.rectangle(sx, sy, slot, slot, filled ? 0x3a2a18 : 0x241a10)
          .setDepth(UI_DEPTH).setScrollFactor(0).setInteractive();
        group.add(bg);

        if (filled) {
          const icon = scene.add.image(sx, sy - 4, 'log').setScale(1.5)
            .setDepth(UI_DEPTH).setScrollFactor(0);
          group.add(icon);

          this.woodText = scene.add.text(sx + slot / 2 - 5, sy + slot / 2 - 4, String(scene.wood), {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffe9b0',
            stroke: '#000000',
            strokeThickness: 3
          }).setOrigin(1, 1).setDepth(UI_DEPTH).setScrollFactor(0);
          group.add(this.woodText);

          const label = scene.add.text(sx, sy + slot / 2 + 9, 'Odun', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            color: '#e8c98a',
            stroke: '#000000',
            strokeThickness: 2
          }).setOrigin(0.5, 0).setDepth(UI_DEPTH).setScrollFactor(0);
          group.add(label);

          bg.on('pointerdown', () => {
            this.selectSlot(bg);
          });
        }
      }
    }
  }

  // Selects the wood slot (drop mode); frame highlight only.
  selectSlot(bg) {
    if (this.slotBg && this.slotBg !== bg) {
      this.slotBg.setStrokeStyle(0);
    }
    this.slotBg = bg;
    this.selected = true;
    this.dropBuffer = '';
    bg.setStrokeStyle(2, 0x4cd964, 1);
  }

  // Live values while open; skips setText when nothing changed.
  refresh() {
    if (!this.open) return;
    const wood = String(this.scene.wood);
    if (this.woodText && wood !== this._lastWood) {
      this.woodText.setText(wood);
      this._lastWood = wood;
    }
      const stats = `Kesilen Ağaç: ${this.scene.treesChopped}    •    Toplanan Odun: ${this.scene.wood}`;
    if (this.statsText && stats !== this._lastStats) {
      this.statsText.setText(stats);
      this._lastStats = stats;
    }
  }
}