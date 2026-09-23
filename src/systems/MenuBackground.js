import { getCharacters } from '../core/ObjectDefs.js';

const NAME_PREFIXES = ['Shadow', 'Alex', 'Frost', 'Pixel', 'Echo', 'Cat', 'Wolf', 'Storm', 'Cyber', 'Iron', 'Nova', 'Swift', 'Ghost', 'Blaze', 'Night', 'Vortex', 'Silver', 'Golden'];
const NAME_SUFFIXES = ['Hunter', 'Dinosaurus', 'Below', 'Runner', 'Blade', 'Master', 'Knight', 'Fox', 'Walker', 'Strike', 'Lord', 'Crafter', 'Gamer', 'Hero'];

function randomName() {
  const p = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const s = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  const num = Math.random() < 0.6 ? Math.floor(Math.random() * 90 + 10) : '';
  const sep = Math.random() < 0.4 ? '_' : '';
  return `${p}${sep}${s}${num}`;
}

export class MenuBackgroundActor {
  constructor(scene, x, y, charId) {
    this.scene = scene;
    this.charId = charId || (Math.floor(Math.random() * 18) + 1);
    this.charKey = `char${this.charId}`;
    this.name = randomName();
    this.speed = 22 + Math.random() * 20;
    this.dirX = Math.random() < 0.5 ? 1 : -1;

    // Oyuncu gölgesi
    this.shadow = scene.add.image(x, y + 16, 'assets/Objects/Shadow/1.png')
      .setOrigin(0.5, 0.5)
      .setScale(1.1, 0.7)
      .setAlpha(0.45);

    // Oyuncu sprite'ı
    this.sprite = scene.add.sprite(x, y, this.charKey).setScale(2);
    this.nameText = scene.add.text(x, y - 36, this.name, {
      fontFamily: 'PixelOperator',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.state = 'walk';
    this.stateTimer = 2 + Math.random() * 4;
    this._updateDepth();
    this._applyAnim();
  }

  _updateDepth() {
    if (!this.sprite) return;
    // Y koordinatına dayalı dinamik derinlik (ana oyundaki Y-sorting ile birebir aynı)
    const baseDepth = 10 + (this.sprite.y * 0.01);
    if (this.shadow) this.shadow.setDepth(baseDepth - 0.05);
    this.sprite.setDepth(baseDepth);
    if (this.nameText) this.nameText.setDepth(baseDepth + 0.05);
  }

  _applyAnim() {
    if (!this.sprite || !this.sprite.anims) return;
    const suffix = this.state === 'chop' ? 'punch' : this.state;
    const key = `${this.charKey}_${suffix}`;
    if (this.scene.anims.exists(key)) {
      this.sprite.play(key, true);
    }
    // Sağa yürürken (dirX > 0) normal bak, sola yürürken (dirX < 0) flipX yap ki öne doğru yürüsün
    this.sprite.setFlipX(this.dirX < 0);
  }

  _switchRandomState() {
    const r = Math.random();
    if (r < 0.6) {
      this.state = 'walk';
      if (Math.random() < 0.45) this.dirX *= -1;
    } else if (r < 0.85) {
      this.state = 'idle';
    } else {
      this.state = 'chop';
    }
    this.stateTimer = 2.5 + Math.random() * 4.5;
    this._applyAnim();
  }

  update(deltaMs, obstacles) {
    const dt = (deltaMs || 16.6) / 1000;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this._switchRandomState();
    }

    if (this.state === 'walk') {
      this.sprite.x += this.speed * this.dirX * dt;

      // Ağaç gövdesi ve kaya engellerinden etrafından kavis çizerek dolaşma (Trunk avoidance)
      if (obstacles && obstacles.length) {
        for (const obs of obstacles) {
          const distX = obs.x - this.sprite.x;
          const distY = obs.y - this.sprite.y;
          // Eğer karakter tam ağaç gövdesi hizasından geçiyorsa ve ağaca doğru yürüyorsa etrafından dolaş
          if (Math.abs(distX) < 30 && Math.abs(distY) < 20 && (distX * this.dirX > 0)) {
            const dodgeDir = distY >= 0 ? -1 : 1;
            this.sprite.y += dodgeDir * 28 * dt;
          }
        }
      }
    }

    if (this.shadow) {
      this.shadow.x = this.sprite.x;
      this.shadow.y = this.sprite.y + 16;
    }
    this.nameText.x = this.sprite.x;
    this.nameText.y = this.sprite.y - 36;
    this._updateDepth();

    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    // Ekran dışına çıkınca karşı taraftan temiz geçiş yap
    if (this.dirX > 0 && this.sprite.x > screenW + 60) {
      this.sprite.x = -60;
      this.sprite.y = 120 + Math.random() * (Math.max(100, screenH - 240));
      this.name = randomName();
      this.nameText.setText(this.name);
      this.charId = Math.floor(Math.random() * 18) + 1;
      this.charKey = `char${this.charId}`;
      this.sprite.setTexture(this.charKey);
      this._applyAnim();
    } else if (this.dirX < 0 && this.sprite.x < -60) {
      this.sprite.x = screenW + 60;
      this.sprite.y = 120 + Math.random() * (Math.max(100, screenH - 240));
      this.name = randomName();
      this.nameText.setText(this.name);
      this.charId = Math.floor(Math.random() * 18) + 1;
      this.charKey = `char${this.charId}`;
      this.sprite.setTexture(this.charKey);
      this._applyAnim();
    }
  }

  destroy() {
    if (this.shadow) this.shadow.destroy();
    if (this.sprite) this.sprite.destroy();
    if (this.nameText) this.nameText.destroy();
  }
}

export class MenuBackground {
  constructor(scene) {
    this.scene = scene;
    this.actors = [];
    this.decorations = [];
    this.placedObstacles = [];
    this.overlay = null;
  }

  create() {
    const scene = this.scene;
    const w = scene.scale.width;
    const h = scene.scale.height;

    const tileSize = 32;
    const cols = Math.ceil(w / tileSize) + 2;
    const rows = Math.ceil(h / tileSize) + 2;
    const groundGroup = scene.add.group();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const posX = c * tileSize;
        const posY = r * tileSize;
        const tile = scene.add.image(posX, posY, 'assets/Tiles0/FieldsTile_38.png')
          .setOrigin(0, 0).setDepth(0);
        groundGroup.add(tile);
      }
    }
    this.decorations.push(groundGroup);

    // 1. Zemin karoları üzerine serpiştirilmiş çim detayları (GroundLayer ile aynı)
    const grassGroup = scene.add.group();
    const grassCount = Math.max(45, Math.floor((w * h) / 12000));
    for (let i = 0; i < grassCount; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const grassNum = Math.floor(Math.random() * 6) + 1;
      const grassTile = scene.add.image(gx, gy, `assets/Objects/Grass/${grassNum}.png`)
        .setOrigin(0, 0).setDepth(1).setAlpha(0.9);
      grassGroup.add(grassTile);
    }
    this.decorations.push(grassGroup);

    // 2. Etkileşimli nesneler, ağaçlar, kayalar, taşlar ve gölgeleri
    const decorGroup = scene.add.group();
    const decorCount = Math.max(22, Math.floor((w * h) / 18000));
    const placedPositions = [];
    this.placedObstacles = [];
    const minDistance = 54;

    for (let i = 0; i < decorCount; i++) {
      let dx = 0;
      let dy = 0;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 25) {
        attempts++;
        dx = 30 + Math.random() * (w - 60);
        dy = 30 + Math.random() * (h - 60);
        valid = true;

        for (const pos of placedPositions) {
          const dist = Math.hypot(dx - pos.x, dy - pos.y);
          if (dist < minDistance) {
            valid = false;
            break;
          }
        }
      }

      if (!valid) continue;
      placedPositions.push({ x: dx, y: dy });

      const r = Math.random();
      const baseDepth = 10 + (dy * 0.01);

      if (r < 0.28) {
        // Ağaç, Kök Çimleri ve Gölgesi
        this.placedObstacles.push({ x: dx, y: dy, kind: 'tree' });
        const shadow = scene.add.image(dx, dy + 6, 'assets/Objects/Shadow/6.png')
          .setOrigin(0.5, 0.5).setDepth(baseDepth - 0.05).setAlpha(0.65);
        const rootGrass1 = scene.add.image(dx - 12, dy + 4, 'assets/Objects/Grass/1.png')
          .setOrigin(0.5, 0.5).setScale(1.2).setDepth(baseDepth - 0.02);
        const rootGrass2 = scene.add.image(dx + 12, dy + 4, 'assets/Objects/Grass/3.png')
          .setOrigin(0.5, 0.5).setScale(1.2).setDepth(baseDepth - 0.02);
        const tree = scene.add.image(dx, dy, 'assets/Objects/Decor/Tree1.png')
          .setOrigin(0.5, 0.85).setScale(1.4).setDepth(baseDepth);
        decorGroup.add(shadow);
        decorGroup.add(rootGrass1);
        decorGroup.add(rootGrass2);
        decorGroup.add(tree);
      } else if (r < 0.45) {
        // Taş Düğümleri (Stone Pickups) ve Gölgesi
        const stoneNum = Math.floor(Math.random() * 8) + 1;
        const shadow = scene.add.image(dx, dy + 2, 'assets/Objects/Shadow/1.png')
          .setOrigin(0.5, 0.5).setScale(0.9, 0.5).setDepth(baseDepth - 0.05).setAlpha(0.45);
        const stone = scene.add.image(dx, dy, `assets/Objects/Stone/${stoneNum}.png`)
          .setOrigin(0.5, 0.5).setScale(1.1).setDepth(baseDepth);
        decorGroup.add(shadow);
        decorGroup.add(stone);
      } else if (r < 0.62) {
        // Çiçek Varyantları
        const flowerNum = Math.floor(Math.floor(Math.random() * 12) + 1);
        const flower = scene.add.image(dx, dy, `assets/Objects/Flower/${flowerNum}.png`)
          .setOrigin(0.5, 0.5).setScale(2.0).setDepth(baseDepth - 0.02);
        decorGroup.add(flower);
      } else if (r < 0.88) {
        // Kaya (Rock Obstacle) ve Gölgesi
        this.placedObstacles.push({ x: dx, y: dy, kind: 'rock' });
        const rockNum = Math.random() < 0.5 ? 7 : 8;
        const shadow = scene.add.image(dx, dy + 4, 'assets/Objects/Shadow/6.png')
          .setOrigin(0.5, 0.5).setScale(0.8, 0.5).setDepth(baseDepth - 0.05).setAlpha(0.5);
        const rockGrass = scene.add.image(dx - 8, dy + 3, 'assets/Objects/Grass/2.png')
          .setOrigin(0.5, 0.5).setScale(1.1).setDepth(baseDepth - 0.02);
        const rock = scene.add.image(dx, dy, `assets/Objects/Rock/${rockNum}.png`)
          .setOrigin(0.5, 0.5).setScale(0.85).setDepth(baseDepth);
        decorGroup.add(shadow);
        decorGroup.add(rockGrass);
        decorGroup.add(rock);
      } else {
        // Gaz Lambası / Odun Yığını ve Gölgesi
        const shadow = scene.add.image(dx, dy + 2, 'assets/Objects/Shadow/2.png')
          .setOrigin(0.5, 0.5).setScale(1.2).setDepth(baseDepth - 0.05).setAlpha(0.5);
        const lamp = scene.add.image(dx, dy, 'assets/Objects/Decor/Lamp1.png')
          .setOrigin(0.5, 0.85).setScale(1.8).setDepth(baseDepth);
        decorGroup.add(shadow);
        decorGroup.add(lamp);
      }
    }
    this.decorations.push(decorGroup);

    this.overlay = null;

    const actorCount = Math.max(4, Math.min(7, Math.floor(w / 240)));
    this.actors = [];
    for (let i = 0; i < actorCount; i++) {
      const ax = (i / actorCount) * w + Math.random() * 40;
      const ay = 120 + Math.random() * (Math.max(100, h - 240));
      const actor = new MenuBackgroundActor(scene, ax, ay, (i % 18) + 1);
      this.actors.push(actor);
    }
  }

  update(time, delta) {
    for (const actor of this.actors) {
      actor.update(delta, this.placedObstacles);
    }
  }

  destroy() {
    for (const actor of this.actors) actor.destroy();
    this.actors = [];
    for (const d of this.decorations) {
      if (d.destroy) d.destroy(true);
    }
    this.decorations = [];
    if (this.overlay) this.overlay.destroy();
  }
}

