import { eachChunkInWindow } from './WindowHelper.js';

// Ground chunks (tile + grass + stone decor), extracted from MainScene.
// Removal sync: render skips ids in scene.removedByKind (filled by
// server objectRemoved/worldState events), same logic as trees.
export class ChunkManager {
  constructor(scene, worldGen) {
    this.scene = scene;
    this.worldGen = worldGen;
    this.activeChunks = new Map();
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

    for (let row = 0; row < this.worldGen.chunkSize; row++) {
      for (let col = 0; col < this.worldGen.chunkSize; col++) {
        const posX = startX + col * this.worldGen.tileSize;
        const posY = startY + row * this.worldGen.tileSize;

        const tileImage = scene.add.image(posX, posY, 'field_tile_38')
          .setOrigin(0, 0)
          .setDepth(0);
        chunkGroup.add(tileImage);

        const cell = chunkData[row][col];

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
          // Icon: OBJECT_DEFS'den al (stone → stone_1, rock → stone_7)
          const iconTex = cell.itemId === 'rock' ? 'stone_7' : 'stone_1';
          const stoneImage = scene.add.image(
            posX + offset,
            posY + offset,
            iconTex
          )
            .setOrigin(0.5, 0.5)
            .setDepth(2);
          // Box collider: büyük taşlar için 2x2, küçük taşlar için 1x1
          if (isBig && scene.physics) {
            stoneImage.body = scene.physics.add.image(stoneImage);
            stoneImage.body.body.setSize(scene.TILE_SIZE * 2, scene.TILE_SIZE * 2);
            stoneImage.body.body.setOffset(0, 0);
          }
          chunkGroup.add(stoneImage);
        }
      }
    }

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
      this.renderChunk(cx, cy, key);
    }
  }

  destroyAll() {
    for (const group of this.activeChunks.values()) group.destroy(true);
    this.activeChunks.clear();
    this._lastChunkX = null;
    this._lastChunkY = null;
  }
}
