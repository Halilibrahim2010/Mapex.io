// Arazi yardımcıları: göller ve su sorgusu. Göller chunk'a göre deterministiktir
// (JSON'daki terrain.lake ayarlarıyla üretilir) ve suya girilemez.
import { getGameData } from '../core/ObjectDefs.js';

export class TerrainSystem {
  constructor(generator) {
    this.gen = generator;
    this.chunkSize = generator.chunkSize;
    this.tileSize = generator.tileSize;
    this.lake = getGameData().terrain.lake;
    this.cache = new Map();
  }

  // Chunk içindeki göller; her göl 1-3 daireden oluşan düzensiz bir şekildir.
  lakesAt(chunkX, chunkY) {
    const key = `lakes:${chunkX},${chunkY}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rnd = this.gen.randomAt(chunkX, chunkY, 3);
    const cfg = this.lake;
    const lakes = [];
    if (rnd() < cfg.chance) {
      const cx = 5 + Math.floor(rnd() * 6);
      const cy = 5 + Math.floor(rnd() * 6);
      const circles = [this._clampCircle(cx, cy, cfg.minRadius + Math.floor(rnd() * cfg.radiusSpread))];
      const lobes = cfg.minLobes + Math.floor(rnd() * cfg.lobeSpread);
      for (let i = 0; i < lobes; i++) {
        const ox = cx + Math.floor(rnd() * 5) - 2;
        const oy = cy + Math.floor(rnd() * 5) - 2;
        circles.push(this._clampCircle(ox, oy, cfg.lobeMinRadius + Math.floor(rnd() * cfg.lobeRadiusSpread)));
      }
      lakes.push({ circles });
    }
    this.cache.set(key, lakes);
    return lakes;
  }

  // Merkezi chunk içinde kalacak şekilde kenara sıkıştırılmış daire.
  _clampCircle(cx, cy, r) {
    return {
      cx: Math.max(r, Math.min(this.chunkSize - 1 - r, cx)),
      cy: Math.max(r, Math.min(this.chunkSize - 1 - r, cy)),
      r
    };
  }

  // Dünya koordinatındaki nokta su mu? (oyuncu hareketi bunu kullanır)
  isWaterAt(worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);
    const chunkX = Math.floor(tx / this.chunkSize);
    const chunkY = Math.floor(ty / this.chunkSize);
    return this.waterDepthAt(chunkX, chunkY, tx - chunkX * this.chunkSize, ty - chunkY * this.chunkSize) >= 0;
  }

  // Karonun göl derinliği: 0 (kıyı) .. 1 (en derin). Suda değilse -1.
  waterDepthAt(chunkX, chunkY, col, row) {
    let best = -1;
    for (const lake of this.lakesAt(chunkX, chunkY)) {
      for (const circle of lake.circles) {
        const dx = col - circle.cx;
        const dy = row - circle.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= circle.r) {
          const depth = 1 - dist / circle.r;
          if (depth > best) best = depth;
        }
      }
    }
    return best;
  }
}