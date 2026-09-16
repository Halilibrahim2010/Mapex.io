import { createCharAnims } from '../animations/CharAnims.js';
import { ANIM_STATE, animKeyOf } from './AnimState.js';

// Uzak oyuncunun kesme barı: kendi barımız yeşil, başkasınınki sarı.
const HOLD_BAR_WIDTH = 52;
const HOLD_BAR_HEIGHT = 6;
const HOLD_BAR_COLOR = 0xf5c542;
const HOLD_BAR_TRACK = 0x3a2a18;

export class RemotePlayer {
  constructor(scene, id, x, y, name = 'Oyuncu', char = 1) {
    this.scene = scene;
    this.id = id;
    this.name = name || 'Oyuncu';
    this.charKey = `char${char || 1}`;

    createCharAnims(scene, this.charKey);

    this.sprite = scene.add.sprite(x, y, this.charKey);
    this.sprite.setDepth(9);
    this.sprite.setScale(2);
    this.sprite.play(`${this.charKey}_idle`);

    this.nameText = scene.add.text(x, y, this.name, {
      fontFamily: "PixelOperator",
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5)
      .setShadow(1, 1, 'rgba(0, 0, 0, 0.6)', 2)
      .setDepth(9);

    this.targetX = x;
    this.targetY = y;
    this.facingLeft = false;
    this.animState = ANIM_STATE.IDLE; // Sunucudan gelen animasyon durumu

    // Kesme barı (yalnızca karşı oyuncu ağaç keserken görünür).
    this.holdBar = scene.add.graphics();
    this.holdBar.setVisible(false);
    this.hold = { id: null, progress: 0, x: 0, y: 0 };
  }

  setName(name) {
    this.name = name || 'Oyuncu';
    this.nameText.setText(this.name);
  }

  // Sunucudan yeni pozisyon/durum geldiğinde çağrılır. Animasyon artık
  // tahmin edilmez; sunucudan gelen "anim" alanı doğrudan uygulanır.
  setServerPosition(x, y, facingLeft, anim, hold) {
    this.targetX = x;
    this.targetY = y;
    this.facingLeft = facingLeft;
    if (Number.isInteger(anim)) this.animState = anim;
    if (hold) this.hold = hold;

    this.sprite.setFlipX(this.facingLeft);
  }

  // Kesme barini cizer: hedef nesnenin ustunde sari dolum (kendi barimiz yesil).
  _drawHoldBar() {
    const bar = this.holdBar;
    if (!bar) return;
    const active = Boolean(this.hold.id) && this.hold.progress > 0;
    if (!active) {
      if (bar.visible) bar.setVisible(false);
      return;
    }
    bar.setVisible(true);
    bar.clear();
    const x = this.hold.x - HOLD_BAR_WIDTH / 2;
    const y = this.hold.y - 74;
    const filled = Math.max(2, HOLD_BAR_WIDTH * Math.min(1, this.hold.progress));
    bar.fillStyle(0x000000, 0.55).fillRoundedRect(x - 1, y - 1, HOLD_BAR_WIDTH + 2, HOLD_BAR_HEIGHT + 2, 3);
    bar.fillStyle(HOLD_BAR_TRACK, 1).fillRoundedRect(x, y, HOLD_BAR_WIDTH, HOLD_BAR_HEIGHT, 2);
    bar.fillStyle(HOLD_BAR_COLOR, 1).fillRoundedRect(x, y, filled, HOLD_BAR_HEIGHT, 2);
  }

  // Karakter seçimi sunucudan güncellenirse dokuyu/animasyonları değiştir
  setCharacter(char) {
    const key = `char${char || 1}`;
    if (this.charKey === key) return;
    
    this.charKey = key;
    createCharAnims(this.scene, key);
    this.sprite.setTexture(key);
    this.sprite.play(`${key}_idle`, true);
  }

  // Her frame çağrılır, pozisyonu yumuşak şekilde hedefe yaklaştırır
  interpolate() {
    const lerp = 0.25;
    
    // Doğrudan hedefteyse gereksiz hesaplama ve setX/setY yapma
    if (Math.abs(this.targetX - this.sprite.x) > 0.1 || Math.abs(this.targetY - this.sprite.y) > 0.1) {
      this.sprite.x += (this.targetX - this.sprite.x) * lerp;
      this.sprite.y += (this.targetY - this.sprite.y) * lerp;

      // Piksel artifaktlarını önlemek için konumu yuvarla
      const roundedX = Math.round(this.sprite.x);
      const roundedY = Math.round(this.sprite.y);

      this.sprite.setPosition(roundedX, roundedY);
      this.nameText.setPosition(roundedX, roundedY - 44);
    }

    // Animasyon: sunucudan gelen durum (idle/walk/chop) uygulanır.
    const targetAnim = animKeyOf(this.charKey, this.animState);
    if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim.key !== targetAnim) {
      this.sprite.play(targetAnim, true);
    }

    // Kamera-göreli y-sort
    const feetY = 3000 + Math.round(this.sprite.y + 34 - this.scene.cameras.main.scrollY);
    this.sprite.setDepth(feetY);
    this.nameText.setDepth(feetY);

    // Karşı oyuncunun kesme barı (sarı) hedef nesnenin üstünde çizilir.
    this._drawHoldBar();
    if (this.holdBar.visible) this.holdBar.setDepth(feetY + 1);
  }

  destroy() {
    this.sprite.destroy();
    this.nameText.destroy();
    if (this.holdBar) this.holdBar.destroy();
  }
}