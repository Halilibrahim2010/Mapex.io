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
    this.loadedLakes = new Map();
    this.loadedLamps = new Map();
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
            // Görsel çeşitlilik: her kaya farklı taş dokusu (stone_7..stone_12)
            tex: 7 + Math.floor(rnd() * 6),
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

  // Chunk içindeki gölleri üretir (deterministik). Nadir görülür (~%12) ve
  // 1-3 lobluk düzensiz bir şekli olur; göl tamamen chunk içinde kalır.
  generateLakes(chunkX, chunkY) {
    const key = `lakes:${chunkX},${chunkY}`;
    if (this.loadedLakes.has(key)) {
      return this.loadedLakes.get(key);
    }

    const rnd = this._seededRandom(this._chunkSeed(chunkX, chunkY, 3));
    const lakes = [];
    if (rnd() < 0.12) {
      const cx = 5 + Math.floor(rnd() * 6); // 5..10
      const cy = 5 + Math.floor(rnd() * 6);
      // Ana havuz + istenirse 1-2 ek lob: düzensiz, doğal şekil.
      const circles = [this._clampedCircle(cx, cy, 2 + Math.floor(rnd() * 3))];
      const lobes = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < lobes; i++) {
        const ox = cx + Math.floor(rnd() * 5) - 2;
        const oy = cy + Math.floor(rnd() * 5) - 2;
        circles.push(this._clampedCircle(ox, oy, 1 + Math.floor(rnd() * 3)));
      }
      lakes.push({ circles });
    }

    this.loadedLakes.set(key, lakes);
    return lakes;
  }

  // Merkezi chunk içinde kalacak şekilde kenara sıkıştırılmış daire.
  _clampedCircle(cx, cy, r) {
    return {
      cx: Math.max(r, Math.min(this.chunkSize - 1 - r, cx)),
      cy: Math.max(r, Math.min(this.chunkSize - 1 - r, cy)),
      r
    };
  }

  // Dünya koordinatındaki nokta su mu? (göllere girilemez kontrolü)
  isWaterAt(worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);
    const chunkX = Math.floor(tx / this.chunkSize);
    const chunkY = Math.floor(ty / this.chunkSize);
    const col = tx - chunkX * this.chunkSize;
    const row = ty - chunkY * this.chunkSize;
    for (const lake of this.generateLakes(chunkX, chunkY)) {
      for (const c of lake.circles) {
        const dx = col - c.cx;
        const dy = row - c.cy;
        if (dx * dx + dy * dy <= c.r * c.r) return true;
      }
    }
    return false;
  }

  // Tile merkezinden göl derinliği: 0 (kıyı) .. 1 (en derin). Suda değilse -1.
  waterDepthAt(chunkX, chunkY, col, row) {
    let best = -1;
    for (const lake of this.generateLakes(chunkX, chunkY)) {
      for (const c of lake.circles) {
        const dx = col - c.cx;
        const dy = row - c.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= c.r) {
          const depth = 1 - dist / c.r; // 0 kıyı, 1 merkez
          if (depth > best) best = depth;
        }
      }
    }
    return best;
  }

  // Chunk başına en fazla bir gaz lambası (fener): nadir, göl kenarını tercih
  // eder. Ağaçların, kayaların ve suyun üstüne çıkmaz; çıkamazsa hiç çıkmaz.
  generateLamps(chunkX, chunkY) {
    const key = `lamps:${chunkX},${chunkY}`;
    if (this.loadedLamps.has(key)) {
      return this.loadedLamps.get(key);
    }

    const rnd = this._seededRandom(this._chunkSeed(chunkX, chunkY, 4));
    let lamps = [];
    // Göl varsa her göle bir fener; göl yoksa nadiren (%6) açık alanda.
    const hasLake = this.generateLakes(chunkX, chunkY).length > 0;
    if (hasLake || rnd() < 0.06) {
      const worldSize = this.chunkSize * this.tileSize;
      const clampTile = (t) => Math.max(1, Math.min(this.chunkSize - 2, t));
      // Konum: göl varsa kıyının 1-2 karo dışı, yoksa açık bir alan.
      const lakes = this.generateLakes(chunkX, chunkY);
      let tx, ty;
      if (lakes.length) {
        const c = lakes[0].circles[0];
        const ang = rnd() * Math.PI * 2;
        const dist = c.r + 1 + rnd();
        tx = clampTile(c.cx + Math.round(Math.cos(ang) * dist));
        ty = clampTile(c.cy + Math.round(Math.sin(ang) * dist));
      } else {
        tx = 2 + Math.floor(rnd() * (this.chunkSize - 4));
        ty = 2 + Math.floor(rnd() * (this.chunkSize - 4));
      }
      const toWorld = (t) => chunkX * worldSize + t * this.tileSize + this.tileSize / 2;
      let x = toWorld(tx);
      let y = toWorld(ty);
      // Ağaç/kaya/su çakışması varsa birkaç kez kaydır; olmazsa vazgeç.
      const stones = this.generateStones(chunkX, chunkY);
      const trees = this.generateTrees(chunkX, chunkY);
      const MIN_DIST = 48;
      for (let attempt = 0; attempt < 8; attempt++) {
        const collides = stones.some(s => Math.hypot(s.x - x, s.y - y) < MIN_DIST) ||
          trees.some(t => Math.hypot(t.x - x, t.y - y) < MIN_DIST) ||
          this.isWaterAt(x, y);
        if (!collides) break;
        x = toWorld(clampTile(tx + Math.floor(rnd() * 5) - 2));
        y = toWorld(clampTile(ty + Math.floor(rnd() * 5) - 2));
        if (attempt === 7) lamps = [];
      }
      if (!stones.some(s => Math.hypot(s.x - x, s.y - y) < MIN_DIST) &&
          !trees.some(t => Math.hypot(t.x - x, t.y - y) < MIN_DIST) &&
          !this.isWaterAt(x, y)) {
        lamps = [{ x, y, type: 9 + Math.floor(rnd() * 3) }]; // 9, 10 veya 11
      } else {
        lamps = [];
      }
    }

    this.loadedLamps.set(key, lamps);
    return lamps;
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
            tileData[row][col].stoneTex = s.tex || 1;
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