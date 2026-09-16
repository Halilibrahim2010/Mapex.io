// Zemin katmanı: karo + çim + göl + gölge çizimi. Dünyanın statik görsel
// katmanıdır; deterministik üretilen veriyi (WorldGenerator/TerrainSystem)
// ekrana çevirir. Etkileşimli nesneler ObjectLayer'da yaşar.
import { eachChunkInWindow } from '../world/WindowHelper.js';
import { getGameData } from '../core/ObjectDefs.js';

// Zemin katmanının sunucu senkronundaki "kind" adı (dünya nesnesi değildir).
export const GROUND_KIND = 'grass';

export class GroundLayer {
  constructor(scene, generator, terrain, removed) {
    this.scene = scene;
    this.gen = generator;
    this.terrain = terrain;
    this.removed = removed; // grass id'lerini tutan Set (sunucu senkronu)
    this.active = new Map();
    this.waterDots = []; // { key, sprite, base, phase, speed } — animasyonlu parıltılar
    this._lastX = null;
    this._lastY = null;
    this.config = getGameData();
  }

  // Her frame çağrılır: su parıltı noktalarının parlaklığını dalgalandırır.
  updateWater(timeMs) {
    const t = timeMs / 1000;
    for (const dot of this.waterDots) {
      dot.sprite.setAlpha(dot.base * (0.55 + 0.45 * Math.sin(t * dot.speed + dot.phase)));
    }
  }

  update(cx, cy) {
    if (cx === this._lastX && cy === this._lastY) return;
    this._lastX = cx;
    this._lastY = cy;

    const visible = new Set();
    eachChunkInWindow(cx, cy, this.scene.RENDER_DISTANCE, (chunkX, chunkY) => {
      const key = `${chunkX},${chunkY}`;
      visible.add(key);
      if (!this.active.has(key)) this._render(chunkX, chunkY, key);
    });

    for (const [key, group] of this.active) {
      if (visible.has(key)) continue;
      group.destroy(true);
      this.active.delete(key);
      // O chunk'a ait parıltı kayıtlarını da temizle (sprite'ları yok oldu).
      this.waterDots = this.waterDots.filter((d) => d.key !== key);
    }
  }

  _render(chunkX, chunkY, key) {
    const scene = this.scene;
    const group = scene.add.group();
    const T = this.gen.tileSize;
    const startX = chunkX * this.gen.worldSize;
    const startY = chunkY * this.gen.worldSize;
    const terrainDef = this.config.terrain;
    const groundTex = terrainDef.ground.atlas.replace('{n}', terrainDef.ground.n);

    for (let row = 0; row < this.gen.chunkSize; row++) {
      for (let col = 0; col < this.gen.chunkSize; col++) {
        const posX = startX + col * T;
        const posY = startY + row * T;
        group.add(scene.add.image(posX, posY, groundTex).setOrigin(0, 0).setDepth(0));
        if (this.terrain.waterDepthAt(chunkX, chunkY, col, row) >= 0) {
          this._drawWater(group, key, chunkX, chunkY, col, row, posX, posY);
        }
      }
    }

    for (const grass of this.gen.generateGround(chunkX, chunkY)) {
      const id = `grass:${chunkX},${chunkY}:${grass.row}:${grass.col}`;
      if (this.removed.has(id)) continue;
      // Çim suya binmez: göl karonun tamamına yakınsa çim çizme.
      if (this.terrain.waterDepthAt(chunkX, chunkY, grass.col, grass.row) >= 0) continue;
      const atlas = terrainDef.grass.atlas.replace('{n}', grass.variant);
      group.add(scene.add.image(grass.x, grass.y, atlas)
        .setOrigin(0, 0)
        .setDepth(terrainDef.grass.depth));
    }

    this.active.set(key, group);
  }

  // Göl karosu: pikselli su dokusu. Derinliğe göre bantlı tonlar, dithering ile
  // yumuşayan geçişler, dalga çizgileri ve karaya bakan kenarda köpük şeridi.
  // Tüm desen deterministiktir (tile koordinatına bağlı) → her açılışta aynı.
  _drawWater(group, key, chunkX, chunkY, col, row, posX, posY) {
    const scene = this.scene;
    const T = this.gen.tileSize;
    const colors = this.config.terrain.water;
    const depth = this.terrain.waterDepthAt(chunkX, chunkY, col, row);
    const isShore = depth <= 0.3;
    const isMid = depth <= 0.6;

    // Yumuşak derinlik geçişi: sabit 3 bant yerine derinliğe göre renk lerp'i.
    const baseColor = this._waterColor(colors, depth);
    group.add(scene.add.rectangle(posX, posY, T, T, baseColor).setOrigin(0, 0).setDepth(1));

    // Pikselli dalga dokusu: animasyonlu parıltı noktaları. Her nokta kendi
    // fazında süzülür; updateWater(time) her frame parlaklıklarını günceller.
    const accent = isShore ? colors.foam : (isMid ? '#8fc6e8' : '#5f9fcf');
    const accentAlpha = isShore ? 0.5 : (isMid ? 0.3 : 0.16);
    const seed = (chunkX * 3121 + chunkY * 7919 + col * 131 + row * 7717) >>> 0;
    const dots = 5;
    const px = Math.max(3, Math.round(T / 10)); // piksel boyutu (piksel art hissi)
    for (let i = 0; i < dots; i++) {
      const h1 = this._hash(seed + i * 2);
      const h2 = this._hash(seed + i * 2 + 1);
      // Yatay dalga bantları: noktalar satır satır dizilir, faz kaymalı.
      const waveRow = Math.floor(h1 * (T / (px * 2))) * px * 2 + px;
      const dx = Math.floor(h2 * (T / px)) * px;
      const x = posX + dx;
      const y = posY + waveRow;
      const dot = scene.add.rectangle(x, y, px * 2, px, accent)
        .setOrigin(0, 0).setDepth(1).setAlpha(accentAlpha);
      this.waterDots.push({ key, sprite: dot, base: accentAlpha, phase: (h1 + h2) * Math.PI * 2, speed: 1 + h2 * 1.5 });
    }

    // Kıyı bandı: suya girişte açık, çakıl-ıslak kum tonu (shallow'un altında).
    if (isShore) {
      group.add(scene.add.rectangle(posX, posY, T, T, '#9ecfdd')
        .setOrigin(0, 0).setDepth(1).setAlpha(0.3));
    }

    // Karaya bakan kenarda köpük şeridi (iki tonlu, daha pikselli görünüm).
    const foam = 4;
    const neighbors = [
      { nc: col - 1, nr: row, x: posX, y: posY, w: foam, h: T },
      { nc: col + 1, nr: row, x: posX + T - foam, y: posY, w: foam, h: T },
      { nc: col, nr: row - 1, x: posX, y: posY, w: T, h: foam },
      { nc: col, nr: row + 1, x: posX, y: posY + T - foam, w: T, h: foam }
    ];
    for (const n of neighbors) {
      if (n.nc < 0 || n.nc >= this.gen.chunkSize || n.nr < 0 || n.nr >= this.gen.chunkSize) continue;
      const nx = chunkX * this.gen.worldSize + n.nc * T + T / 2;
      const ny = chunkY * this.gen.worldSize + n.nr * T + T / 2;
      if (this.terrain.isWaterAt(nx, ny)) continue;
      group.add(scene.add.rectangle(n.x, n.y, n.w, n.h, colors.foam)
        .setOrigin(0, 0).setDepth(1).setAlpha(0.85));
    }
  }

  // Küçük deterministik hash: aynı tile her zaman aynı deseni alır.
  _hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) >>> 0;
    n = (n ^ (n >>> 4)) >>> 0;
    n = Math.imul(n, 0x27d4eb2d) >>> 0;
    n = (n ^ (n >>> 15)) >>> 0;
    return n / 4294967296;
  }

  // Derinliğe göre kıyı → orta → derin renk geçişi (bant yerine yumuşak lerp).
  _waterColor(colors, depth) {
    const shallow = this._hexToRgb(colors.shallow);
    const mid = this._hexToRgb(colors.mid);
    const deep = this._hexToRgb(colors.deep);
    let a, b, k;
    if (depth <= 0.5) {
      a = shallow; b = mid; k = Math.max(0, depth) / 0.5;
    } else {
      a = mid; b = deep; k = (depth - 0.5) / 0.5;
    }
    const r = Math.round(a.r + (b.r - a.r) * k);
    const g = Math.round(a.g + (b.g - a.g) * k);
    const bl = Math.round(a.b + (b.b - a.b) * k);
    return (r << 16) | (g << 8) | bl;
  }

  _hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // Uzaklaşan chunk'ı yeniden çizer (sunucudan silme bilgisi gelince).
  invalidate(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    const group = this.active.get(key);
    if (!group) return;
    group.destroy(true);
    this.active.delete(key);
    this.waterDots = this.waterDots.filter((d) => d.key !== key);
    this._render(chunkX, chunkY, key);
  }

  applyRemoved() {
    for (const key of Array.from(this.active.keys())) {
      const [cx, cy] = key.split(',').map(Number);
      this.invalidate(cx, cy);
    }
  }
}