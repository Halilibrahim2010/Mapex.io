// Deterministik dünya üretimi: her chunk'ın içeriği chunk tohumundan türetilir,
// böylece tüm istemciler aynı nesneleri görür. Üretilecek nesne türleri ve
// oranları tamamen shared/objectDefs.json'daki "spawn" alanından gelir.
import { objectDefs, pickTexture, getGameData } from './ObjectDefs.js';

export class WorldGenerator {
  constructor(chunkSize, tileSize) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
    this.worldSize = chunkSize * tileSize;
    this.cache = new Map();
    this.renderConfig = getGameData().render;
    // MainScene bunu TerrainSystem.isWaterAt'a bağlar; su kontrolü için kullanılır.
    this.isWaterAt = null;
  }

  // Chunk koordinatlarından deterministik tohum üretir; salt aynı chunk'ta
  // farklı nesne gruplarının birbirinden bağımsız dizilmesini sağlar.
  _chunkSeed(chunkX, chunkY, salt = 0) {
    let h = (chunkX * 374761393 + chunkY * 668265263 + salt * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  // mulberry32: küçük, hızlı tohumlu rastgele sayı üreteci.
  _seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Chunk + salt için tohumlu rastgele üretici döndürür (göl gibi özel üretimler).
  randomAt(chunkX, chunkY, salt = 0) {
    return this._seededRandom(this._chunkSeed(chunkX, chunkY, salt));
  }

  _cached(key, producer) {
    if (this.cache.has(key)) return this.cache.get(key);
    const value = producer();
    this.cache.set(key, value);
    return value;
  }

  // Bir nesne türünün spawn ayarına göre chunk'taki örneklerini üretir.
  spawnGroup(id, def, chunkX, chunkY) {
    if (!def.spawn || !def.spawn.chance) return [];
    const key = `spawn:${id}:${chunkX},${chunkY}`;
    return this._cached(key, () => this._generateSpawn(id, def, chunkX, chunkY));
  }

  _generateSpawn(id, def, chunkX, chunkY) {
    const spawn = def.spawn;
    const rnd = this.randomAt(chunkX, chunkY, spawn.salt || 0);
    const cells = spawn.cells || this.chunkSize;
    const cellW = this.worldSize / cells;
    // Büyük nesne, chunk kenarından taşmasın diye son sütun/satırları atlar.
    const lastAllowed = spawn.bigOnly ? cells - (def.tileW - 1) : cells;
    const list = [];

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        if (cx >= lastAllowed || cy >= lastAllowed) continue;
        if (rnd() >= spawn.chance) continue;

        const isBig = spawn.size === 'big';
        const x = isBig
          ? chunkX * this.worldSize + (cx + 0.5) * cellW
          : chunkX * this.worldSize + cx * cellW + Math.floor(rnd() * cellW);
        const y = isBig
          ? chunkY * this.worldSize + (cy + 0.5) * cellW
          : chunkY * this.worldSize + cy * cellW + Math.floor(rnd() * cellW);

        // Nesneler asla suya düşmez: ayak izinin su içinde kalması yeterli.
        if (this._overlapsWater(x, y, def)) continue;

        list.push({
          itemId: id,
          size: spawn.size || 'small',
          isBig,
          texture: pickTexture(def, rnd),
          x,
          y,
          chunkX,
          chunkY,
          index: list.length
        });
      }
    }
    return list;
  }

  // Nesne ayak izinin (shape) herhangi bir köşesi suya denk gelirse spawn iptal.
  _overlapsWater(x, y, def) {
    if (!this.isWaterAt) return false;
    const halfW = (def.shape ? def.shape.w : 1) * this.tileSize * 0.5;
    const halfH = (def.shape ? def.shape.h : 1) * this.tileSize * 0.5;
    return this.isWaterAt(x - halfW, y - halfH) || this.isWaterAt(x + halfW, y - halfH) ||
           this.isWaterAt(x - halfW, y + halfH) || this.isWaterAt(x + halfW, y + halfH) ||
           this.isWaterAt(x, y);
  }

  // Tüm veri odaklı nesne türlerini tek seferde üretir (chunk başına).
  generateObjects(chunkX, chunkY) {
    const key = `objects:${chunkX},${chunkY}`;
    return this._cached(key, () => {
      const result = {};
      for (const [id, def] of Object.entries(objectDefs())) {
        if (def.spawn && def.spawn.chance > 0) {
          result[id] = this.spawnGroup(id, def, chunkX, chunkY);
        }
      }
      return result;
    });
  }

  // Zemin: çim örtüsü ve karoları JSON'daki render ayarından gelir.
  generateGround(chunkX, chunkY) {
    const key = `ground:${chunkX},${chunkY}`;
    return this._cached(key, () => {
      const rnd = this.randomAt(chunkX, chunkY, 9);
      const cfg = this.renderConfig;
      const startX = chunkX * this.worldSize;
      const startY = chunkY * this.worldSize;
      const items = [];

      for (let row = 0; row < this.chunkSize; row++) {
        for (let col = 0; col < this.chunkSize; col++) {
          if (rnd() >= cfg.grassChance) continue;
          if (rnd() >= cfg.grassDensity) continue;
          items.push({
            x: startX + col * this.tileSize,
            y: startY + row * this.tileSize,
            variant: 1 + Math.floor(rnd() * cfg.grassCells),
            row,
            col
          });
        }
      }
      return items;
    });
  }
}