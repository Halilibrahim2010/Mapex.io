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
    this._lastX = null;
    this._lastY = null;
    this.config = getGameData();
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
          this._drawWater(group, chunkX, chunkY, col, row, posX, posY);
        }
      }
    }

    for (const grass of this.gen.generateGround(chunkX, chunkY)) {
      const id = `grass:${chunkX},${chunkY}:${grass.row}:${grass.col}`;
      if (this.removed.has(id)) continue;
      const atlas = terrainDef.grass.atlas.replace('{n}', grass.variant);
      group.add(scene.add.image(grass.x, grass.y, atlas)
        .setOrigin(0, 0)
        .setDepth(terrainDef.grass.depth));
    }

    this.active.set(key, group);
  }

  // Göl karosu: derinliğe göre üç ton + karaya bakan kenarda köpük şeridi.
  _drawWater(group, chunkX, chunkY, col, row, posX, posY) {
    const scene = this.scene;
    const T = this.gen.tileSize;
    const colors = this.config.terrain.water;
    const depth = this.terrain.waterDepthAt(chunkX, chunkY, col, row);
    const color = depth > 0.6 ? colors.deep : (depth > 0.3 ? colors.mid : colors.shallow);
    group.add(scene.add.rectangle(posX, posY, T, T, color).setOrigin(0, 0).setDepth(1));

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
        .setOrigin(0, 0).setDepth(1).setAlpha(0.8));
    }
  }

  // Uzaklaşan chunk'ı yeniden çizer (sunucudan silme bilgisi gelince).
  invalidate(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    const group = this.active.get(key);
    if (!group) return;
    group.destroy(true);
    this.active.delete(key);
    this._render(chunkX, chunkY, key);
  }

  applyRemoved() {
    for (const key of Array.from(this.active.keys())) {
      const [cx, cy] = key.split(',').map(Number);
      this.invalidate(cx, cy);
    }
  }
}