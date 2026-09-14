import { createCharAnims } from '../animations/CharAnims.js';

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
      fontFamily: "'Segoe UI', 'Trebuchet MS', Verdana, sans-serif",
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5)
      .setShadow(1, 1, 'rgba(0, 0, 0, 0.6)', 2)
      .setDepth(9);

    this.targetX = x;
    this.targetY = y;
    this.facingLeft = false;
    this.isMoving = false; // Animasyon sapıtmasını önlemek için durum takibi
  }

  setName(name) {
    this.name = name || 'Oyuncu';
    this.nameText.setText(this.name);
  }

  // Sunucudan yeni pozisyon geldiğinde çağrılır
  setServerPosition(x, y, facingLeft) {
    const dx = x - this.targetX;
    const dy = y - this.targetY;
    
    // Çok küçük titreşimlerde (jitter) animasyonun yürümeye geçmesini engelle
    this.isMoving = (dx * dx + dy * dy) > 0.25; 

    this.targetX = x;
    this.targetY = y;
    this.facingLeft = facingLeft;

    this.sprite.setFlipX(this.facingLeft);
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

    // Animasyon kontrolünü her paket geldiğinde değil, hareket durumuna göre smooth yap
    const targetAnim = this.isMoving ? `${this.charKey}_walk` : `${this.charKey}_idle`;
    if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim.key !== targetAnim) {
      this.sprite.play(targetAnim, true);
    }

    // Kamera-göreli y-sort
    const feetY = 3000 + Math.round(this.sprite.y + 34 - this.scene.cameras.main.scrollY);
    this.sprite.setDepth(feetY);
    this.nameText.setDepth(feetY);
  }

  destroy() {
    this.sprite.destroy();
    this.nameText.destroy();
  }
}