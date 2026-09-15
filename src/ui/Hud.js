// HUD: envanterdeki kaynakları tek satır olarak gösterir. Hangi kaynağın
// gösterileceği envanterdeki itemId'lerden gelir; taş/odun kodu yoktur.
import { UI_DEPTH } from './uiDepth.js';

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.rows = new Map(); // itemId → Text
    this.xText = null;
    this.yText = null;
    this._counts = new Map();
  }

  create() {
    this.xText = this._text(16, 12, 'X: 0', '#ffffff');
    this.yText = this._text(16, 36, 'Y: 0', '#ffffff');
  }

  _text(x, y, value, color) {
    return this.scene.add.text(x, y, value, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
  }

  // Envanterden gelen özet: [{ itemId, name, count }]
  // Yeni bir kaynak envantere girince satırı otomatik açılır.
  update(items) {
    let y = 60;
    for (const item of items) {
      let row = this.rows.get(item.itemId);
      if (!row) {
        row = this._text(16, y, '', '#e8c98a');
        this.rows.set(item.itemId, row);
      }
      row.setPosition(16, y);
      row.setText(`${item.name}: ${item.count}`);
      y += 24;
    }
    // Envanterde olmayan kaynakları gizle (satırlar tekrar kullanılır).
    for (const [itemId, row] of this.rows) {
      if (items.some((item) => item.itemId === itemId)) continue;
      row.setVisible(false);
    }
    for (const item of items) {
      const row = this.rows.get(item.itemId);
      if (row) row.setVisible(true);
    }
  }

  setPosition(x, y) {
    if (this.xText) this.xText.setText('X: ' + x);
    if (this.yText) this.yText.setText('Y: ' + y);
  }
}