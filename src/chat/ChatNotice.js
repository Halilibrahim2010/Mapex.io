// Bildirimler: ekranin ustunde kisa sureli seritler. "X senden bahsetti" ve
// "X sana ozel mesaj gonderdi" mesajlari burada gosterilir; ayni anda en fazla
// birkac bildirim tutulur (yigin halinde yukaridan asagi).
import { UI_DEPTH } from '../ui/uiDepth.js';

const NOTICE_W = 380;
const NOTICE_H = 34;
const NOTICE_GAP = 6;
const NOTICE_LIFETIME_MS = 5000;
const MAX_NOTICES = 3;
const EDGE_MARGIN = 8;

const COLORS = {
  mention: 0x6b5a1f,
  private: 0x1f4a6b
};

export class ChatNotice {
  constructor(scene) {
    this.scene = scene;
    this.records = []; // { text, group, until }
  }

  push(note) {
    if (!note || !note.text) return;
    const scene = this.scene;
    const group = scene.add.group();
    const fill = note.kind === 'private' ? COLORS.private : COLORS.mention;
    const w = Math.min(NOTICE_W, scene.scale.width - 40);

    group.add(scene.add.rectangle(0, 0, w, NOTICE_H, fill, 0.92).setOrigin(0, 0)
      .setDepth(UI_DEPTH + 6).setScrollFactor(0).setStrokeStyle(2, 0xd9c07a, 0.9));
    group.add(scene.add.text(0, 0, note.text, {
      fontFamily: 'PixelOperator', fontSize: '16px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0, 0.5).setDepth(UI_DEPTH + 7).setScrollFactor(0));

    this.records.push({ group, until: performance.now() + NOTICE_LIFETIME_MS });
    if (this.records.length > MAX_NOTICES) this._remove(this.records[0]);
    this._layout();
  }

  // Bildirimler ust ortada alt alta dizilir; en yeni bildirim en altta.
  _layout() {
    const w = Math.min(NOTICE_W, this.scene.scale.width - 40);
    const x = (this.scene.scale.width - w) / 2;
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      const y = EDGE_MARGIN + i * (NOTICE_H + NOTICE_GAP);
      record.group.getChildren().forEach((child) => {
        if (child.setOrigin && child.type === 'Text') child.setPosition(x + 10, y + NOTICE_H / 2);
        else child.setPosition(x, y);
      });
    }
  }

  update() {
    if (!this.records.length) return;
    const now = performance.now();
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i].until < now) this._remove(this.records[i]);
    }
  }

  _remove(record) {
    const index = this.records.indexOf(record);
    if (index !== -1) this.records.splice(index, 1);
    record.group.destroy(true);
    this._layout();
  }

  // Pencere acildiginda bekleyen bildirimler okunmus sayilir.
  clear() {
    for (const record of this.records.slice()) this._remove(record);
  }

  get count() { return this.records.length; }
}