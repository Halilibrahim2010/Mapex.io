import { eachChunkInWindow } from './WindowHelper.js';

// Shared window manager for "deterministic per-chunk, id-keyed" world
// objects (trees/plants). Previously two copies (updateTrees/updatePlants);
// now a single class.
// removeStateKey: key into scene.removedByKind ('tree' | null)
export class WorldObjectWindow {
  constructor(scene, opts) {
    this.scene = scene;
    this.generate = opts.generate;      // (chunkX, chunkY) => [ {...} ]
    this.makeSprite = opts.makeSprite;  // (obj) => { sprite, ySortY?, rec? }
    this.removeStateKey = opts.removeStateKey; // 'tree' | null (kept for docs; removal handled by onNewObject)
    this.map = new Map();               // id -> record
    this.onNewObject = opts.onNewObject || null;
    this.onWindowChanged = opts.onWindowChanged || null; // (visible:Set) => void
    this._lastCX = null;
    this._lastCY = null;
  }

  update(cx, cy) {
    // No-op while the player stays in the same chunk (same reason as ChunkManager).
    if (cx === this._lastCX && cy === this._lastCY) return;
    this._lastCX = cx;
    this._lastCY = cy;
    const visible = new Set();
    const scene = this.scene;

    eachChunkInWindow(cx, cy, scene.RENDER_DISTANCE, (chunkX, chunkY) => {
      const data = this.generate(chunkX, chunkY);
      data.forEach((src, i) => {
        const id = `${chunkX},${chunkY}:${i}`;
        visible.add(id);
        if (this.map.has(id)) return;
        // FIX: removed ids still need derived-state restore (e.g. the bare
        // trunk left by a chopped tree). The owner guards duplicates
        // internally (placeBareTrunk checks trunks.has), so always run the
        // hook, then keep the id out of the visible tree set.
        const skipped = this.onNewObject ? this.onNewObject(src, id) : undefined;
        if (skipped === false) {
          visible.delete(id);
          return;
        }
        // FIX: clone the cached generator object. Writing progress/sprite
        // onto the cached object would leak state across chunk reloads.
        const obj = Object.assign({}, src);
        const made = this.makeSprite(obj, id);
        if (made) {
          obj.sprite = made.sprite;
          if (made.ySortY !== undefined) obj.ySortY = made.ySortY;
          if (made.rec) Object.assign(obj, made.rec);
        }
        this.map.set(id, obj);
      });
    });

    for (const [id, rec] of this.map) {
      if (!visible.has(id)) {
        this.destroySprite(id);
      }
    }
    if (this.onWindowChanged) this.onWindowChanged(visible);
  }

  get(id) { return this.map.get(id); }
  // Removes the record WITHOUT destroying the sprite (the caller owns the
  // sprite lifecycle, e.g. break animation in HarvestSystem).
  delete(id) { return this.map.delete(id); }
  // Removes the record AND destroys its sprite (chunk out of view).
  destroySprite(id) {
    const rec = this.map.get(id);
    if (!rec) return false;
    this.map.delete(id);
    if (rec.sprite) rec.sprite.destroy();
    return true;
  }
  values() { return this.map.values(); }
  has(id) { return this.map.has(id); }
}
