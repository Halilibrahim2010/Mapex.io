export class WorldGenerator {
  constructor(chunkSize = 16, tileSize = 32, totalGrassTypes = 6, totalStoneTypes = 16) {
    this.chunkSize = chunkSize;
    this.tileSize = tileSize;
    this.totalGrassTypes = totalGrassTypes;
    this.totalStoneTypes = totalStoneTypes;
    this.loadedChunks = new Map();
    this.loadedTrees = new Map();
    this.loadedPlants = new Map();
    this.loadedStones = new Map();
  }

  // Chunk koordinatlarından deterministik tohum üretir.
  // Böylece her istemci aynı chunk'ta AYNI ağaçları görür (multiplayer uyumu).
  // salt: aynı chunk'ta ağaç ve çiçeklerin FARKLI dizilmesi için tohum karıştırır.
  _chunkSeed(chunkX, chunkY, salt = 0) {
    let h = (chunkX * 374761393 + chunkY * 668265263 + salt * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  // mulberry32: küçük, hızlı tohumlu rastgele sayı üreteci
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

  // Chunk içindeki ağaçları üretir (deterministik). Dönen dizideki sıra,
  // ağaçların kimliği (id) olarak kullanılır: "chunkX,chunkY:index"
  generateTrees(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    if (this.loadedTrees.has(key)) {
      return this.loadedTrees.get(key);
    }

    const rnd = this._seededRandom(this._chunkSeed(chunkX, chunkY));
    const worldSize = this.chunkSize * this.tileSize;
    const cells = 4;
    const cellW = worldSize / cells;
    const trees = [];

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        if (rnd() < 0.25) {
          trees.push({
            type: rnd() < 0.7 ? 'tree1' : 'tree2',
            x: chunkX * worldSize + cx * cellW + Math.floor(rnd() * cellW),
            y: chunkY * worldSize + cy * cellW + Math.floor(rnd() * cellW)
          });
        }
      }
    }

    this.loadedTrees.set(key, trees);
    return trees;
  }

  // Chunk içindeki çiçek/bitki dekorlarını üretir (deterministik).
  generatePlants(chunkX, chunkY) {
    const key = `plants:${chunkX},${chunkY}`;
    if (this.loadedPlants.has(key)) {
      return this.loadedPlants.get(key);
    }

    const rnd = this._seededRandom(this._chunkSeed(chunkX, chunkY, 1));
    const worldSize = this.chunkSize * this.tileSize;
    const cells = 4;
    const cellW = worldSize / cells;
    const plants = [];

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        if (rnd() < 0.36) {
          const isFlower = rnd() < 0.5;
          plants.push({
            kind: isFlower ? 'flower' : 'plant',
            type: isFlower ? 1 + Math.floor(rnd() * 12) : 1 + Math.floor(rnd() * 6),
            x: chunkX * worldSize + cx * cellW + Math.floor(rnd() * cellW),
            y: chunkY * worldSize + cy * cellW + Math.floor(rnd() * cellW)
          });
        }
      }
    }

    this.loadedPlants.set(key, plants);
    return plants;
  }

  // Chunk içindeki taşları üretir (deterministik). OBJECT_DEFS tabanlı.
  // stone = küçük taş (1x1), rock = büyük taş (2x2).
  generateStones(chunkX, chunkY) {
    const key = `stones:${chunkX},${chunkY}`;
    if (this.loadedStones.has(key)) {
      return this.loadedStones.get(key);
    }

    const rnd = this._seededRandom(this._chunkSeed(chunkX, chunkY, 2));
    const worldSize = this.chunkSize * this.tileSize;
    const cells = 4;
    const cellW = worldSize / cells;
    const stones = [];

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const isBigCell = cx < cells - 1 && cy < cells - 1;
        if (isBigCell && rnd() < 0.30) {
          // Büyük taş: 2x2 alanın tam ortasına hizalanır
          // Merkez pozisyon: (cx + 0.5) * cellW → startCol = cx olur
          const centerX = chunkX * worldSize + (cx + 0.5) * cellW;
          const centerY = chunkY * worldSize + (cy + 0.5) * cellW;
          stones.push({
            itemId: 'rock',
            type: 'rock',
            size: 'big',
            cellCount: 2,
            x: centerX,
            y: centerY,
            isBig: true,
            name: 'Rock',
            collider: { w: cellW * 2, h: cellW * 2, offset: { x: 0, y: 0 } }
          });
        } else if (!isBigCell && rnd() < 0.252) {
          // Küçük taş: kendi hücresinde
          stones.push({
            itemId: 'stone',
            type: 'stone',
            size: 'small',
            cellCount: 1,
            x: chunkX * worldSize + cx * cellW + Math.floor(rnd() * cellW),
            y: chunkY * worldSize + cy * cellW + Math.floor(rnd() * cellW),
            isBig: false,
            name: 'Stone',
            collider: { w: cellW, h: cellW, offset: { x: 0, y: 0 } }
          });
        }
      }
    }

    this.loadedStones.set(key, stones);
    return stones;
  }

  generateChunkData(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    if (this.loadedChunks.has(key)) {
      return this.loadedChunks.get(key);
    }

    const tileData = [];
    for (let y = 0; y < this.chunkSize; y++) {
      const row = [];
      for (let x = 0; x < this.chunkSize; x++) {
        const hasGrass = Math.random() >= 0.20;
        const grassObj = hasGrass ? `grass_${Math.floor(Math.random() * this.totalGrassTypes) + 1}` : null;
        row.push({ tile: 38, grass: grassObj, stone: null });
      }
      tileData.push(row);
    }

    // Deterministik taslari karo izgarasina yerlestir
    const stones = this.generateStones(chunkX, chunkY);
    const worldSize = this.chunkSize * this.tileSize;
    for (let si = 0; si < stones.length; si++) {
      const s = stones[si];
      const startCol = Math.floor((s.x - chunkX * worldSize) / this.tileSize);
      const startRow = Math.floor((s.y - chunkY * worldSize) / this.tileSize);
      const span = s.cellCount;
      for (let dy = 0; dy < span; dy++) {
        for (let dx = 0; dx < span; dx++) {
          const col = startCol + dx;
          const row = startRow + dy;
          if (col >= 0 && col < this.chunkSize && row >= 0 && row < this.chunkSize) {
            tileData[row][col].itemId = s.itemId;
            tileData[row][col].stone = s.itemId;
            tileData[row][col].stoneSize = s.size;
            tileData[row][col].stoneStartCol = startCol;
            tileData[row][col].stoneStartRow = startRow;
            tileData[row][col].stoneSpan = span;
            tileData[row][col].stoneIndex = si;
          }
        }
      }
    }

    this.loadedChunks.set(key, tileData);
    return tileData;
  }
}