// Simple day/night cycle: a dark overlay above the world, below the UI.
export const NIGHT_OVERLAY_DEPTH = 5000; // world window is ~3000+, UI_DEPTH = 10000
export const NIGHT_MAX_ALPHA = 0.95;
export const DAY_LENGTH_MS = 15 * 60 * 1000; // one full in-game day = 15 real minutes
export const START_HOUR = 10;
export const TIME_SKIP_FACTOR = 40;   // Shift basılıyken zaman kaç kat hızlı akar
export const LIGHT_RADIUS = 65;       // gece karakter etrafındaki tam aydınlık yarıçapı (px)
export const LAMP_LIGHT_RADIUS = 55;  // fener ışığı yarıçapı
export const LAMP_LIGHT_STRENGTH = 0.5; // fener ışığının karanlığı açma gücü (hafif)

// Hours where darkness transitions happen.
const SUNRISE_START = 5, SUNRISE_END = 7;
const SUNSET_START = 17, SUNSET_END = 19;

export class DayNightCycle {
  constructor(scene) {
    this.scene = scene;
    this.elapsedMs = (START_HOUR / 24) * DAY_LENGTH_MS;
    this.overlay = null;
    this.clockText = null;
  }

  create() {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    // Karartma, canvas texture üzerine çizilir: karanlık doldurulup karakterin
    // etrafındaki daire "destination-out" ile delinir (fener efekti).
    // RenderTexture yerine canvas kullanılır çünkü Phaser 4'te güvenilir çalışır.
    this._createNightCanvas(w, h);
    this.overlay = this.scene.add.image(0, 0, 'night_canvas')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(NIGHT_OVERLAY_DEPTH);
    this.clockText = this.scene.add.text(w - 12, 12, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', fontStyle: 'bold',
      color: '#ffe9b0', stroke: '#000000', strokeThickness: 3
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(NIGHT_OVERLAY_DEPTH + 1);
    this.fastForwardKey = this.scene.input.keyboard.addKey('SHIFT');
    this.refreshSize();
  }

  _createNightCanvas(w, h) {
    if (this.scene.textures.exists('night_canvas')) this.scene.textures.remove('night_canvas');
    this.nightTex = this.scene.textures.createCanvas('night_canvas', Math.max(2, w), Math.max(2, h));
  }

  // Keep the overlay covering the screen on resize.
  refreshSize() {
    if (!this.overlay) return;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this._createNightCanvas(w, h);
    this.overlay.setTexture('night_canvas');
    this.clockText.setPosition(w - 12, 12);
  }

  // 0 = full day, 1 = full night.
  get nightness() {
    const hour = (this.elapsedMs / DAY_LENGTH_MS) * 24;
    if (hour >= SUNRISE_END && hour < SUNSET_START) return 0;
    if (hour >= SUNSET_END || hour < SUNRISE_START) return 1;
    if (hour < SUNRISE_END) return 1 - (hour - SUNRISE_START) / (SUNRISE_END - SUNRISE_START);
    return (hour - SUNSET_START) / (SUNSET_END - SUNSET_START);
  }

  update(deltaMs) {
    // Shift: zamanı hızlı ilerlet (test için).
    const step = this.fastForwardKey && this.fastForwardKey.isDown
      ? deltaMs * TIME_SKIP_FACTOR
      : deltaMs;
    this.elapsedMs = (this.elapsedMs + step) % DAY_LENGTH_MS;

    const nightness = this.nightness;
    if (nightness <= 0.01) {
      this.overlay.setVisible(false);
      this.clockText.setText(this.formatClock());
      return;
    }
    this.overlay.setVisible(true);

    // Canvas'ı yeniden çiz: karanlık katman + karakter etrafında ışık dairesi.
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cam = this.scene.cameras.main;
    const ctx = this.nightTex.context;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    // Nötr koyu renk: sarı/turuncu bir ton yok.
    ctx.globalAlpha = nightness * NIGHT_MAX_ALPHA;
    ctx.fillStyle = 'rgb(2, 3, 10)';
    ctx.fillRect(0, 0, w, h);

    if (this.scene.player) {
      const sx = this.scene.player.x - cam.scrollX;
      const sy = this.scene.player.y - cam.scrollY;
      const R = LIGHT_RADIUS;      // tam aydınlık çekirdek
      const R_OUTER = R * 2.0;     // yumuşak geçişin bittiği nokta
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      const grad = ctx.createRadialGradient(sx, sy, R, sx, sy, R_OUTER);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, R_OUTER, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Fenerler: küçük, hafif bir ışıltı (karanlığın yarısını bile açmaz).
    if (this.scene.chunkManager && this.scene.chunkManager.lampPoints) {
      ctx.globalCompositeOperation = 'destination-out';
      for (const points of this.scene.chunkManager.lampPoints.values()) {
        for (const p of points) {
          const sx = p.x - cam.scrollX;
          const sy = p.y - cam.scrollY;
          if (sx < -LAMP_LIGHT_RADIUS * 2 || sy < -LAMP_LIGHT_RADIUS * 2 ||
              sx > w + LAMP_LIGHT_RADIUS * 2 || sy > h + LAMP_LIGHT_RADIUS * 2) continue;
          const grad = ctx.createRadialGradient(sx, sy, 6, sx, sy, LAMP_LIGHT_RADIUS);
          grad.addColorStop(0, `rgba(0,0,0,${LAMP_LIGHT_STRENGTH})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, LAMP_LIGHT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.nightTex.refresh();
    this.clockText.setText(this.formatClock());
  }

  formatClock() {
    const hour = Math.floor((this.elapsedMs / DAY_LENGTH_MS) * 24);
    const minute = Math.floor((((this.elapsedMs / DAY_LENGTH_MS) * 24) % 1) * 60);
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
}