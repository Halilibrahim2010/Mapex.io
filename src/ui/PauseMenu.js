// ESC pause menu, extracted from MainScene.
// callbacks: { onOpenInventory, onClose }
import { UI_DEPTH } from './uiDepth.js';

export class PauseMenu {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.open = false;
    this.group = null;
    this.infoText = null;
    this.onStateChange = callbacks.onStateChange || null;
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
    this.infoText = null;
    if (this.onStateChange) this.onStateChange(false);
  }

  // Registers the ESC key (called from MainScene.startGame).
  bindEscapeKey() {
    const escKey = this.scene.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ESC
    );

    escKey.on('down', () => {
      if (this.scene.inventoryOpen == true) {
        this.scene.toggleInventory();
      } else {
        this.toggle();
      }
    });
  }


  setInfo(txt) {
    if (this.infoText) this.infoText.setText(txt);
  }

  create() {
    if (this.open) return;
    this.open = true;
    if (this.onStateChange) this.onStateChange(true);

    const cam = this.scene.cameras.main;
    const cw = cam.width;
    const ch = cam.height;
    const group = this.scene.add.group();
    this.group = group;

    // Dim the background (fixed to the screen, not the world).
    const overlay = this.scene.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000).setDepth(UI_DEPTH);
    overlay.setAlpha(0.66);
    overlay.setScrollFactor(0);
    group.add(overlay);

    // Bottom info line.
    this.infoText = this.scene.add.text(cw / 2, ch - 70, '', {
      fontFamily: 'PixelOperator',
      fontSize: '14px',
      color: '#cccccc',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setDepth(UI_DEPTH).setScrollFactor(0);
    group.add(this.infoText);

    const self = this;
    const items = [
      { label: 'Resume', action: () => self.close() },
      { label: 'Settings', action: () => self.setInfo('Ayarlar yakında eklenecek') },
      { label: 'Equipment', action: () => { self.close(); self.callbacks.onOpenInventory(); } },
      { label: 'Craft', action: () => self.setInfo('Zanaat yakında eklenecek') },
      { label: 'Quit', action: () => { window.location.reload(); } }
    ];

    const bw = 260;
    const bh = 40;
    const gap = 54;
    const startY = Math.round(ch / 2 - ((items.length - 1) * gap) / 2);

    items.forEach((it, idx) => {
      const y = startY + idx * gap;

      const bg = this.scene.add.rectangle(cw / 2, y, bw, bh, 0x333333).setDepth(UI_DEPTH).setInteractive().setScrollFactor(0);
      group.add(bg);

      const label = this.scene.add.text(cw / 2, y, it.label, {
        fontFamily: 'PixelOperator',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5).setDepth(UI_DEPTH).setScrollFactor(0);
      group.add(label);

      bg.on('pointerover', () => bg.setFillStyle(0x4cd964));
      bg.on('pointerout', () => bg.setFillStyle(0x333333));
      bg.on('pointerup', () => {
        if (self.open) it.action();
      });
    });
  }
}
