import { eachChunkInWindow } from './WindowHelper.js';

// Ground chunks (tile + grass + stone decor), extracted from MainScene.
// Removal sync: render skips ids in scene.removedByKind (filled by
// server objectRemoved/worldState events), same logic as trees.
export class ChunkManager {
  constructor(scene, worldGen) {
    this.scene = scene;
    this.worldGen = worldGen;
    this.activeChunks = new Map();
    // Chunk başına kaya collider dikdörtgenleri: key -> [{x,y,w,h}]
    this.rockRects = new Map();
    // Chunk başına fener konumları (gece ışığı için): key -> [{x,y}]
    this.lampPoints = new Map();
    this._lastChunkX = null;
    this._lastChunkY = null;
  }

  // No-op when the player stays in the same chunk (previously 25 chunks
  // were scanned and 2 Sets allocated every frame -> wasted work).
  update(centerChunkX, centerChunkY) {
    if (centerChunkX === this._lastChunkX && centerChunkY === this._lastChunkY) return;
    this._lastChunkX = centerChunkX;
    this._lastChunkY = centerChunkY;

    const visible = new Set();
    eachChunkInWindow(centerChunkX, centerChunkY, this.scene.RENDER_DISTANCE, (chunkX, chunkY) => {
      const key = `${chunkX},${chunkY}`;
      visible.add(key);
      if (!this.activeChunks.has(key)) this.renderChunk(chunkX, chunkY, key);
    });

    for (const [key, group] of this.activeChunks) {
      if (!visible.has(key)) {
        group.destroy(true);
        this.activeChunks.delete(key);
        this.rockRects.delete(key);
        this.lampPoints.delete(key);
      }
    }
  }

  // Yakındaki taşları toplar (E tuşuyla)
  pickUpNearbyStones(player) {
    if (!player) return false;
    const feetX = player.x;
    const feetY = player.y + 34;
    const pickRange = 50;

    for (const [key, group] of this.activeChunks) {
      const children = group.getChildren();
      for (const child of children) {
        if (child.type !== 'Sprite') continue;
        const texKey = child.texture.key;
        if (!texKey || !texKey.startsWith('stone_')) continue;
        // Kayalar (büyük taşlar) toplanamaz.
        if (child.getData('itemId') === 'rock') continue;

        const dx = child.x - feetX;
        const dy = child.y - feetY;
        const dist = Math.hypot(dx, dy);
        if (dist < pickRange) {
          child.destroy();
          this.scene.stone = (this.scene.stone || 0) + 1;
          if (this.scene.hud) this.scene.hud.setStone(this.scene.stone);
          if (this.scene.refreshHotbar) this.scene.refreshHotbar();
          if (this.scene.chopSound) this.scene.chopSound.pickup();
          return true;
        }
      }
    }
    return false;
  }

  // Re-renders one chunk (e.g. after remote decor removal).
  invalidate(chunkX, chunkY) {
    const key = `${chunkX},${chunkY}`;
    const group = this.activeChunks.get(key);
    if (!group) return;
    group.destroy(true);
    this.activeChunks.delete(key);
    this.renderChunk(chunkX, chunkY, key);
  }

  renderChunk(chunkX, chunkY, key) {
    const scene = this.scene;
    const chunkData = this.worldGen.generateChunkData(chunkX, chunkY);
    const chunkGroup = scene.add.group();

    const startX = chunkX * this.worldGen.chunkSize * this.worldGen.tileSize;
    const startY = chunkY * this.worldGen.chunkSize * this.worldGen.tileSize;
    const removedGrass = scene.removedByKind.grass;
    const removedStone = scene.removedByKind.stone;
    const rockRects = [];
    const WATER_DEEP = 0x1b3f5e;
    const WATER_MID = 0x2a6293;
    const WATER_SHALLOW = 0x3f83b5;
    const WATER_FOAM = 0xcfe8f2;

    for (let row = 0; row < this.worldGen.chunkSize; row++) {
      for (let col = 0; col < this.worldGen.chunkSize; col++) {
        const posX = startX + col * this.worldGen.tileSize;
        const posY = startY + row * this.worldGen.tileSize;

        const tileImage = scene.add.image(posX, posY, 'field_tile_38')
          .setOrigin(0, 0)
          .setDepth(0);
        chunkGroup.add(tileImage);

        const cell = chunkData[row][col];
        const waterDepth = scene.worldGen.waterDepthAt(chunkX, chunkY, col, row);
        if (waterDepth >= 0) {
          // Göl karosu: derinliğe göre üç ton (kıyı/orta/derin).
          const color = waterDepth > 0.6 ? WATER_DEEP
            : (waterDepth > 0.3 ? WATER_MID : WATER_SHALLOW);
          chunkGroup.add(scene.add.rectangle(posX, posY,
            this.worldGen.tileSize, this.worldGen.tileSize, color)
            .setOrigin(0, 0).setDepth(1));
          // Kıyı köpüğü: karaya bakan kenara açık şerit.
          const T = this.worldGen.tileSize;
          const foam = 4;
          const neighbors = [
            { nc: col - 1, nr: row, rx: posX, ry: posY, w: foam, h: T },
            { nc: col + 1, nr: row, rx: posX + T - foam, ry: posY, w: foam, h: T },
            { nc: col, nr: row - 1, rx: posX, ry: posY, w: T, h: foam },
            { nc: col, nr: row + 1, rx: posX, ry: posY + T - foam, w: T, h: foam }
          ];
          for (const n of neighbors) {
            const nx = startX + n.nc * T;
            const ny = startY + n.nr * T;
            if (n.nc < 0 || n.nc >= this.worldGen.chunkSize ||
                n.nr < 0 || n.nr >= this.worldGen.chunkSize) continue;
            if (scene.worldGen.isWaterAt(nx + T / 2, ny + T / 2)) continue;
            chunkGroup.add(scene.add.rectangle(n.rx, n.ry, n.w, n.h, WATER_FOAM)
              .setOrigin(0, 0).setDepth(1).setAlpha(0.8));
          }
          continue;
        }

        if (cell.grass && !removedGrass.has(`grass:${chunkX},${chunkY}:${row}:${col}`)) {
          const grassImage = scene.add.image(posX, posY, cell.grass)
            .setOrigin(0, 0)
            .setDepth(1);
          chunkGroup.add(grassImage);
        }

if (cell.itemId) {
          // Taş: OBJECT_DEFS tabanlı (stone = 1x1, rock = 2x2)
          // Rock ve stone tamamen bağımsız — kendi alanlarında çalışır
          const stoneId = `stone:${chunkX},${chunkY}:${cell.stoneIndex}`;
          if (removedStone.has(stoneId)) continue;
          const span = cell.stoneSpan || 1;
          const isBig = cell.stoneSize === 'big';
          // Büyük taş: sadece sol üst karoDA çizilir (diğer 3 karo atlanır)
          // ve 2x2 alanın ortasına hizalanır (offset = 1 karo)
          if (isBig && (cell.stoneStartCol !== col || cell.stoneStartRow !== row)) continue;
          const offset = isBig ? scene.TILE_SIZE : 0;
          // Icon: kaya → üretilen dokudan (stone_7..12), küçük taş → stone_1
          const iconTex = isBig ? `stone_${cell.stoneTex || 7}` : 'stone_1';
          const stoneImage = scene.add.image(
            posX + offset,
            posY + offset,
            iconTex
          )
            .setOrigin(0.5, 0.5)
            .setDepth(2)
            .setData('itemId', cell.itemId);
          if (isBig) {
            // Kaya: karonun biraz altında; toplanamaz, içinden geçilemez.
            const ROCK_SIZE = scene.TILE_SIZE * 0.85;
            stoneImage.setDisplaySize(ROCK_SIZE, ROCK_SIZE);
            rockRects.push({
              x: posX + scene.TILE_SIZE - ROCK_SIZE / 2,
              y: posY + scene.TILE_SIZE - ROCK_SIZE / 2 + 15,
              w: ROCK_SIZE, h: ROCK_SIZE
            });
          } else {
            // Küçük taş: karonun ~%40'ı — toplanabilir boyut.
            stoneImage.setDisplaySize(scene.TILE_SIZE * 0.42, scene.TILE_SIZE * 0.42);
          }
          chunkGroup.add(stoneImage);
        }
      }
    }

    this.rockRects.set(key, rockRects);

    // Gaz lambaları (fener): gölge + lamba; konumları gece ışığı için saklanır.
    const lampPoints = [];
    for (const lamp of scene.worldGen.generateLamps(chunkX, chunkY)) {
      chunkGroup.add(scene.add.image(lamp.x, lamp.y + 14, 'shadow_2')
        .setOrigin(0.5, 0.5).setDepth(1).setAlpha(0.45).setDisplaySize(22, 10));
      chunkGroup.add(scene.add.image(lamp.x, lamp.y, `lamp_${lamp.type}`)
        .setOrigin(0.5, 0.85).setDepth(2));
      lampPoints.push({ x: lamp.x, y: lamp.y });
    }
    this.lampPoints.set(key, lampPoints);

    this.activeChunks.set(key, chunkGroup);
  }

  // Removes a single grass/stone sprite that was deleted remotely.
  // id format: "grass:CX,CY:row:col" or "stone:CX,CY:index".
  removeDecor(id) {
    const m = /^(grass|stone):(-?\d+),(-?\d+):(\d+)$/.exec(id);
    if (!m) return;
    const kind = m[1];
    const chunkX = parseInt(m[2], 10);
    const chunkY = parseInt(m[3], 10);
    this.invalidate(chunkX, chunkY);
    void kind;
  }

  // Re-renders visible chunks so already-removed decor stays hidden
  // after the initial worldState arrives.
  applyRemovedSets() {
    for (const key of Array.from(this.activeChunks.keys())) {
      const [cx, cy] = key.split(',').map(Number);
      const group = this.activeChunks.get(key);
      if (group) group.destroy(true);
      this.activeChunks.delete(key);
      this.rockRects.delete(key);
      this.lampPoints.delete(key);
      this.renderChunk(cx, cy, key);
    }
  }

  destroyAll() {
    for (const group of this.activeChunks.values()) group.destroy(true);
    this.activeChunks.clear();
    this.rockRects.clear();
    this.lampPoints.clear();
    this._lastChunkX = null;
    this._lastChunkY = null;
  }
}
