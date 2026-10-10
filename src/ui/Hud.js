// HUD: envanterdeki kaynakları tek satır olarak gösterir. Hangi kaynağın
// gösterileceği envanterdeki itemId'lerden gelir; taş/odun kodu yoktur.
//
// HESAP/OTURUM: HUD oturumun TÜRÜNÜ bilmez. "Misafir" veya "kayıtlı" etiketi
// yalnızca teşhis amaçlıdır; bakiye (gold/gems) soyut oturum arayüzünden gelir.
import { UI_DEPTH } from './uiDepth.js';

// Panel ölçeği (Orijinal görsel boyutu: 84x30 px)
const PANEL_SCALE = 3.5; // 3.5x -> Genişlik: 294px, Yükseklik: 105px
const PANEL_X = 16;
const PANEL_Y = 12;

export class Hud {
  constructor(scene) {
    this.scene = scene;
    this.rows = new Map(); // itemId → Text
    this.panelBg = null;
    this.portraitBg = null;
    this.portraitSprite = null;
    this.healthBar = null;
    this.currentHealth = 100;
    this.maxHealth = 100;
    this.charKey = 'char1';
    this.xText = null;
    this.yText = null;
    this.sessionText = null;
    this._counts = new Map();
    this._visible = true;
    this._itemStartY = 144;
  }

  create() {
    // Daire merkez ve yarıçap hesabı (panel_empty görselinde ahşap halka merkezi: x=14.5, y=14.5)
    const circleCenterX = PANEL_X + 14.5 * PANEL_SCALE;
    const circleCenterY = PANEL_Y + 14.5 * PANEL_SCALE;
    // Ahşap halkanın arkasına taşacak şekilde yarıçap geniş tutulur (boşluk kalmaz)
    const circleRadius = 13.0 * PANEL_SCALE;

    // 1. Daire içi arka plan (Ten rengi)
    this.portraitBg = this.scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(UI_DEPTH - 3);
    this.portraitBg.fillStyle(0xe5b88f, 1);
    this.portraitBg.fillCircle(circleCenterX, circleCenterY, circleRadius);

    // 2. Karakter portresi (kafa, ağız, çene ve boyun dahil tam portre)
    this.portraitSprite = this.scene.add.sprite(circleCenterX, circleCenterY, this.charKey, 0)
      .setOrigin(30.5 / 64, 25.5 / 64)
      .setScale(PANEL_SCALE * 0.72)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH - 2);
    this.portraitSprite.setCrop(0, 0, 64, 40);

    // 3. Sol üst panel görseli (84x30 -> 294x105 px)
    this.panelBg = this.scene.add
      .image(PANEL_X, PANEL_Y, 'panel_empty')
      .setOrigin(0, 0)
      .setScale(PANEL_SCALE)
      .setDepth(UI_DEPTH - 1)
      .setScrollFactor(0);

    // 4. Can Çubuğu (En üstteki kırmızı bar: panel içinde x=28, y=8, 52x2 px)
    const barX = PANEL_X + 28 * PANEL_SCALE;
    const barY = PANEL_Y + 8 * PANEL_SCALE;
    this.healthBar = this.scene.add
      .image(barX, barY, 'bar_red')
      .setOrigin(0, 0)
      .setScale(PANEL_SCALE)
      .setDepth(UI_DEPTH)
      .setScrollFactor(0);
    this.setHealth(this.currentHealth, this.maxHealth);

    // Panelin altından başlayan metinler (Panel yüksekliği: 105px + boşluk)
    const startY = Math.round(PANEL_Y + 30 * PANEL_SCALE + 10);
    this.xText = this._text(16, startY, 'X: 0', '#ffffff');
    this.yText = this._text(16, startY + 24, 'Y: 0', '#ffffff');
    // Alt bakiye satırı: yalnızca oturum bu veriyi sağlıyorsa görünür olur.
    this.sessionText = this._text(16, startY + 48, '', '#ffe9a8');
    this.sessionText.setVisible(false);
    this._itemStartY = startY + 48;
    // Ana menüde arka planda sadece harita görünsün: oyun başlayana dek gizli.
    this.setVisible(false);
  }

  setCharacter(charKey) {
    this.charKey = typeof charKey === 'number' ? `char${charKey}` : charKey;
    if (this.portraitSprite && this.scene.textures.exists(this.charKey)) {
      this.portraitSprite.setTexture(this.charKey, 0);
      this.portraitSprite.setCrop(0, 0, 64, 40);
    }
  }

  // Can değerini günceller ve kırmızı can barını piksel bazında kırparak ayarlar
  setHealth(current, max = 100) {
    this.maxHealth = max > 0 ? max : 100;
    this.currentHealth = Math.max(0, Math.min(this.maxHealth, Number(current) || 0));
    if (!this.healthBar) return;
    const ratio = this.currentHealth / this.maxHealth;
    if (ratio <= 0) {
      this.healthBar.setVisible(false);
    } else {
      this.healthBar.setVisible(this._visible);
      const cropW = Math.max(1, Math.round(52 * ratio));
      this.healthBar.setCrop(0, 0, cropW, 2);
    }
  }

  // Ana menü önizlemesinde tüm HUD yazılarını gizler/gösterir.
  setVisible(visible) {
    this._visible = Boolean(visible);
    if (this.panelBg) this.panelBg.setVisible(this._visible);
    if (this.portraitBg) this.portraitBg.setVisible(this._visible);
    if (this.portraitSprite) this.portraitSprite.setVisible(this._visible);
    if (this.healthBar) this.healthBar.setVisible(this._visible && this.currentHealth > 0);
    if (this.xText) this.xText.setVisible(this._visible);
    if (this.yText) this.yText.setVisible(this._visible);
    if (this.sessionText) this.sessionText.setVisible(this._visible && this.sessionText.text !== '');
    for (const row of this.rows.values()) row.setVisible(false);
  }

  // Oturumdan gelen ekonomi özeti. Değerler yoksa satır gizlenir; oyun kodu
  // "hesap yok" durumunu ayrıca ele almak zorunda kalmaz.
  setSession(session) {
    const startY = Math.round(PANEL_Y + 30 * PANEL_SCALE + 10);
    if (!this.sessionText) return;
    if (!session) {
      this.sessionText.setVisible(false);
      this._itemStartY = startY + 48;
      return;
    }
    const economy = session.economy || {};
    this.sessionText.setText(`🪙 ${Number(economy.gold || 0)}   💎 ${Number(economy.gems || 0)}   ★ ${Number(economy.level || 1)}`);
    this.sessionText.setVisible(this._visible);
    this._itemStartY = startY + 72;
  }

  _text(x, y, value, color) {
    return this.scene.add.text(x, y, value, {
      fontFamily: 'Monocraft',
      fontSize: '20px',
      fontStyle: 'bold',
      color,
      stroke: '#000000',
      strokeThickness: 3
    }).setScrollFactor(0).setDepth(UI_DEPTH);
  }

  // Envanterden gelen özet: [{ itemId, name, count }]
  // Yeni bir kaynak envantere girince satırı otomatik açılır.
  update(items) {
    if (!this._visible) {
      for (const row of this.rows.values()) row.setVisible(false);
      return;
    }
    let y = this._itemStartY || 96;
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
    if (!this._visible) return;
    if (this.xText) this.xText.setText('X: ' + x);
    if (this.yText) this.yText.setText('Y: ' + y);
  }
}