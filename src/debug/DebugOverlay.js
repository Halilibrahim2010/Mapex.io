// Debug: tum istemcilerde hitbox cizimi (sunucu "debugCollider" olayiyla acar/kapatir).
// Catisma saf matematiktir (Arcade Physics yok); bu yuzden kutular Graphics ile cizilir.
import { UI_DEPTH } from "../ui/uiDepth.js";
import { resolveFootprint } from "../core/ObjectDefs.js";

export const DEBUG_DEPTH = UI_DEPTH + 50;

export class DebugOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.tileVisible = false;
    this.graphics = null;
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this._syncGraphicsVisibility();
  }

  // Tile/chunk izgarasi (/tile show|hide): carpisma kutularindan bagimsiz acilir.
  setTileVisible(visible) {
    this.tileVisible = Boolean(visible);
    this._syncGraphicsVisibility();
  }

  // Iki bayraktan en az biri aciksa graphics gorunur; ikisi de kapaliysa
  // temizlenip gizlenir (bir digerini kapatirken digerini bozmamak icin).
  _syncGraphicsVisibility() {
    const anyOn = this.visible || this.tileVisible;
    if (!this.graphics) return;
    if (!anyOn) {
      this.graphics.clear();
      this.graphics.setVisible(false);
    } else {
      this.graphics.setVisible(true);
    }
  }

  get isVisible() {
    return this.visible;
  }

  // Her frame cagrilir: collider kutulari + oyuncu ayak noktasi cizilir.
  // Tile izgarasi bagimsiz bayraktir: ayni graphics uzerinde birlikte cizilir.
  update() {
    if (!this.visible && !this.tileVisible) return;
    if (!this.graphics) {
      this.graphics = this.scene.add.graphics().setDepth(DEBUG_DEPTH).setScrollFactor(0);
    }
    const g = this.graphics;
    g.clear();
    g.setVisible(true);
    const cam = this.scene.cameras.main;
    // Dunya nesnelerinin carpism kutulari (yesil).
    const colliders =
      this.scene.layer && this.scene.layer.colliders
        ? this.scene.layer.colliders.values()
        : [];
    g.lineStyle(2, 0x4cd964, 1);
    for (const rect of colliders) {
      const sx = rect.x - cam.scrollX;
      const sy = rect.y - cam.scrollY;
      // Açılı collider (colliderAngle tanımlıysa) merkezde döndürülür; yoksa
      // klasik eksene hizalı kutu çizilir.
      if (rect.angle) {
        const hw = rect.w / 2;
        const hh = rect.h / 2;
        const cos = Math.cos(rect.angle);
        const sin = Math.sin(rect.angle);
        const ccx = rect.cx - cam.scrollX;
        const ccy = rect.cy - cam.scrollY;
        const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
        const pts = corners.map(([lx, ly]) => ({
          x: ccx + lx * cos - ly * sin,
          y: ccy + lx * sin + ly * cos
        }));
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.strokePath();
      } else {
        g.strokeRect(sx, sy, rect.w, rect.h);
      }
    }
    // Kesilmis agac govdeleri (sari daire).
    const stumps = (this.scene.layer && this.scene.layer.stumps) || [];
    g.lineStyle(2, 0xf5c542, 1);
    for (const stump of stumps) {
      const sx = stump.x - cam.scrollX;
      const sy = stump.y - cam.scrollY;
      g.strokeCircle(sx, sy, stump.collider || 12);
    }
    // Yerel oyuncu ayak noktasi + yari cap (kirmizi).
    const player = this.scene.player;
    if (player) {
      const fx = player.x - cam.scrollX;
      const fy = player.y + 34 - cam.scrollY;
      g.lineStyle(2, 0xff4757, 1);
      g.strokeCircle(fx, fy, 12);
      g.fillStyle(0xff4757, 1);
      g.fillCircle(fx, fy, 2);
    }
    // Uzak oyuncularin ayak noktalari (mavi).
    const network = this.scene.network;
    const remotes =
      network && network.remotePlayers ? network.remotePlayers.values() : [];
    g.lineStyle(2, 0x7fd4ff, 1);
    for (const remote of remotes) {
      const pos = remote.sprite || remote;
      if (!pos || !Number.isFinite(pos.x)) continue;
      const fx = pos.x - cam.scrollX;
      const fy = (pos.y || 0) + 34 - cam.scrollY;
      g.strokeCircle(fx, fy, 12);
    }
    // Tile izgari: karo sinirlari (soluk beyaz) + chunk sinirlari (belirgin turuncu).
    if (this.tileVisible) {
      this._drawTileGrid(g, cam);
      this._drawShapes(g, cam);
    }
  }

  // /tile show: dunyadaki nesnelerin footprint ayak izleri (mavi kutu) cizilir.
  // Ayak izi tile koordinatinda footprint (karo) olarak hesaplanir; varyant
  // footprint'i de gozukur (Log1-Log4 gibi) — resolveFootprint texture'a bakar.
  _drawShapes(g, cam) {
    const layer = this.scene.layer;
    if (!layer) return;
    const gen = this.scene.generator;
    if (!gen || !(gen.tileSize > 0)) return;
    const T = gen.tileSize;
    g.lineStyle(1, 0x3aa0ff, 0.9);
    for (const record of layer.all()) {
      const def = record.def;
      const data = record.data;
      if (!data || !Number.isFinite(data.x)) continue;
      const footprint = resolveFootprint(def, data.texture);
      const w = footprint ? footprint.w : 1;
      const h = footprint ? footprint.h : 1;
      const sx = data.x - (w * T) / 2 - cam.scrollX;
      const sy = data.y - (h * T) / 2 - cam.scrollY;
      g.strokeRect(sx, sy, w * T, h * T);
    }
  }

  // Kamera penceresini kapsayan tile/chunk izgarasi. Cizim world koordinatinda
  // hesaplanip ekrana cam.scrollX/Y ile cevrilir (graphics scrollFactor 0).
  _drawTileGrid(g, cam) {
    const gen = this.scene.generator;
    if (!gen || !(gen.tileSize > 0)) return;
    const T = gen.tileSize;
    const chunkPx = (gen.chunkSize || 1) * T;
    const viewLeft = cam.scrollX;
    const viewTop = cam.scrollY;
    const viewRight = viewLeft + cam.width;
    const viewBottom = viewTop + cam.height;
    // Tile sinirlari: her karonun cevresi (soluk).
    g.lineStyle(1, 0xffffff, 0.22);
    for (let x = Math.floor(viewLeft / T) * T; x <= viewRight; x += T) {
      g.lineBetween(x - cam.scrollX, 0, x - cam.scrollX, cam.height);
    }
    for (let y = Math.floor(viewTop / T) * T; y <= viewBottom; y += T) {
      g.lineBetween(0, y - cam.scrollY, cam.width, y - cam.scrollY);
    }
    // Chunk sinirlari: dunya uretim penceresi (belirgin).
    g.lineStyle(2, 0xf5923e, 0.6);
    for (let x = Math.floor(viewLeft / chunkPx) * chunkPx; x <= viewRight; x += chunkPx) {
      g.lineBetween(x - cam.scrollX, 0, x - cam.scrollX, cam.height);
    }
    for (let y = Math.floor(viewTop / chunkPx) * chunkPx; y <= viewBottom; y += chunkPx) {
      g.lineBetween(0, y - cam.scrollY, cam.width, y - cam.scrollY);
    }
  }

  destroy() {
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
    this.visible = false;
  }
}
