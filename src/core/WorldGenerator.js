// Deterministik dünya üretimi: her chunk'ın içeriği chunk tohumundan türetilir,
// böylece tüm istemciler aynı nesneleri görür. Üretilecek nesne türleri ve
// oranları tamamen shared/objectDefs.json'daki "spawn" alanından gelir.
import { objectDefs, pickTexture, getGameData, resolveFootprint } from './ObjectDefs.js';

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
  // `taken`: önceki türlerin kapladığı karo kümesi — üst üste binmeyi önler.
  spawnGroup(id, def, chunkX, chunkY, taken) {
    if (!def.spawn || !def.spawn.chance) return [];
    const key = `spawn:${id}:${chunkX},${chunkY}`;
    // Not: cache tür başına ayrıdır ama `taken` generateObjects içinde tek
    // geçişte paylaşılır; aynı chunk iki kez üretilirse cache ilk sonucu
    // (taken'ın boş hâliyle) döndürür — determinizm korunur.
    return this._cached(key, () => this._generateSpawn(id, def, chunkX, chunkY, taken || new Set()));
  }

  _generateSpawn(id, def, chunkX, chunkY, taken) {
    const spawn = def.spawn;
    const rnd = this.randomAt(chunkX, chunkY, spawn.salt || 0);
    const cells = spawn.cells || this.chunkSize;
    const cellW = this.worldSize / cells;
    const chunkMinX = chunkX * this.worldSize;
    const chunkMinY = chunkY * this.worldSize;
    const chunkMaxX = chunkMinX + this.worldSize;
    const chunkMaxY = chunkMinY + this.worldSize;
    const isBig = spawn.size === 'big';
    const clusterStep = Math.max(2, Math.floor(cells / (isBig ? 2.2 : 3.5)));
    const localRadius = Math.max(cellW * 0.9, cellW * (isBig ? 1.6 : 2.2));
    const list = [];

    for (let cy = 0; cy < cells; cy += clusterStep) {
      for (let cx = 0; cx < cells; cx += clusterStep) {
        const regionNoise = rnd();
        const effectiveChance = Math.min(0.95, spawn.chance * (0.7 + regionNoise * 0.9));
        if (regionNoise > effectiveChance) continue;

        const centerX = chunkMinX + (cx + 0.5 + (rnd() - 0.5) * 0.8) * cellW;
        const centerY = chunkMinY + (cy + 0.5 + (rnd() - 0.5) * 0.8) * cellW;
        const clusterCount = isBig ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);

        for (let i = 0; i < clusterCount; i++) {
          const x = centerX + (rnd() - 0.5) * localRadius * 2;
          const y = centerY + (rnd() - 0.5) * localRadius * 2;
          if (x < chunkMinX || y < chunkMinY || x > chunkMaxX || y > chunkMaxY) continue;

          const texture = pickTexture(def, rnd);
          if (this._overlapsWater(x, y, def, texture)) continue;
          if (!this._claimFootprint(x, y, def, texture, taken)) continue;

          list.push({
            itemId: id,
            size: spawn.size || 'small',
            isBig,
            texture,
            x,
            y,
            chunkX,
            chunkY,
            index: list.length
          });
        }
      }
    }
    return list;
  }

  // Item'ın shape ayak izini (karo) `taken`'a yerleştirir. Boşsa true döner ve
  // karoları işaretler; bir karo bile doluyssa false döner (hiçbir şey
  // işaretlemez — atomik). Ayak izi, sprite merkezinden ortalanır.
  _claimFootprint(x, y, def, texture, taken) {
    const footprint = resolveFootprint(def, texture);
    const w = (footprint ? footprint.w : 1);
    const h = (footprint ? footprint.h : 1);
    const left = Math.floor((x - (w * this.tileSize) / 2) / this.tileSize);
    const right = Math.floor((x + (w * this.tileSize) / 2) / this.tileSize);
    const top = Math.floor((y - (h * this.tileSize) / 2) / this.tileSize);
    const bottom = Math.floor((y + (h * this.tileSize) / 2) / this.tileSize);
    // Önce çakışma kontrolü (hiçbir şey işaretlemeden).
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (taken.has(`${tx},${ty}`)) return false;
      }
    }
    // Boş: karoları işaretle.
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        taken.add(`${tx},${ty}`);
      }
    }
    return true;
  }

  // Nesne ayak izinin (shape) herhangi bir köşesi suya denk gelirse spawn iptal.
  _overlapsWater(x, y, def, texture) {
    if (!this.isWaterAt) return false;
    const footprint = resolveFootprint(def, texture);
    const halfW = (footprint ? footprint.w : 1) * this.tileSize * 0.5;
    const halfH = (footprint ? footprint.h : 1) * this.tileSize * 0.5;
    return this.isWaterAt(x - halfW, y - halfH) || this.isWaterAt(x + halfW, y - halfH) ||
           this.isWaterAt(x - halfW, y + halfH) || this.isWaterAt(x + halfW, y + halfH) ||
           this.isWaterAt(x, y);
  }

  // Tüm veri odaklı nesne türlerini tek seferde üretir (chunk başına).
  // Türler sırayla işlenir (JSON key sırası sabit) ve her item, öncekilerin
  // shape (karo ayak izi) alanını kaplamışsa atlanır — nesneler üst üste
  // binmesin. Bu kontrol deterministiktir: tüm istemciler aynı sırayla
  // ürettiği için aynı sonucu görür.
  generateObjects(chunkX, chunkY) {
    const key = `objects:${chunkX},${chunkY}`;
    return this._cached(key, () => {
      const result = {};
      const taken = new Set(); // kaplanmış karo anahtarları: `${tx},${ty}`
      for (const [id, def] of Object.entries(objectDefs())) {
        if (def.spawn && def.spawn.chance > 0) {
          result[id] = this.spawnGroup(id, def, chunkX, chunkY, taken);
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