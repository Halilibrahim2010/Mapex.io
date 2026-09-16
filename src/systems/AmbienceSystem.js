// Prosedürel ambiyans sesleri + gece ateş böcekleri (ses dosyası gerekmez).
// Gündüz: kuş cıvıltıları ve hafif rüzgâr. Gece: cırcır böcekleri.
// Su yakınında: mesafeye göre şiddetlenen akarsu uğultusu.
import { NIGHT_OVERLAY_DEPTH } from '../world/DayNightCycle.js';
import { getSettings } from '../core/GameSettings.js';

const WATER_HEAR_RANGE = 96;    // ~3 karo: sadece göle bu kadar yakınken su sesi duyulur
const WATER_MAX_GAIN = 0.05;    // su sesi çok yumuşak kalır (hışırtı olmaz)
const FIREFLY_COUNT = 3;        // geceleri sadece birkaç ateş böceği belirir
const FIREFLY_ARRIVE_RANGE = 260; // oyuncunun etrafında serbest uçuş alanı
const FIREFLY_DEPTH = NIGHT_OVERLAY_DEPTH + 2; // karanlık katmanın üstünde parlar

export class AmbienceSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this._birdTimer = 2.5;
    this._cricketTimer = 1.0;
    this._waterGain = null;
    this._ambBus = null; // ortam sesleri ortak çıkışı (Ayarlar'daki seviye)
    this._fireflies = null;
  }

  // Ortam seslerinin bağlandığı bus: ana ses çıkışının üstüne ayrı seviye.
  _bus() {
    const output = this.scene.sfx._output();
    if (!output) return null;
    if (!this._ambBus) {
      this._ambBus = this.scene.sfx.ctx.createGain();
      this._ambBus.gain.value = getSettings().ambienceVolume;
      this._ambBus.connect(output);
    }
    return this._ambBus;
  }

  update(deltaMs) {
    const sfx = this.scene.sfx;
    const ctx = sfx && sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const nightness = this.scene.dayNight ? this.scene.dayNight.nightness : 0;
    // Ortam sesi seviyesi her frame güncellenir: Ayarlar'daki kaydırıcı canlı çalışır.
    if (this._ambBus) this._ambBus.gain.value = getSettings().ambienceVolume;
    this._updateAmbientLoops(ctx);
    this._updateBirds(ctx, nightness, deltaMs);
    this._updateCrickets(ctx, nightness, deltaMs);
    this._updateFireflies(nightness, deltaMs);
  }

  // Su yakınlığı: oyuncunun etrafında karo adımlarıyla su araştır.
  _waterProximity() {
    const player = this.scene.player;
    if (!player) return 0;
    const step = this.terrain.tileSize || 32;
    let nearest = Infinity;
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      for (let d = step; d <= WATER_HEAR_RANGE; d += step) {
        if (this.terrain.isWaterAt(player.x + Math.cos(angle) * d, player.y + Math.sin(angle) * d)) {
          nearest = Math.min(nearest, d);
          break;
        }
      }
    }
    return nearest === Infinity ? 0 : 1 - nearest / WATER_HEAR_RANGE;
  }

  // Sürekli döngüler: sadece su. Rüzgâr döngüsü kaldırıldı — heryerde hışırtı
  // hissi veriyordu; ambiyansı kuşlar ve cırcırlar taşır.
  _updateAmbientLoops(ctx) {
    const proximity = this._waterProximity();
    if (proximity <= 0) {
      if (this._waterGain) this._waterGain.gain.value = 0;
      return;
    }
    if (this._waterGain === null) {
      // Yumuşak su sesi: alçak frekanslı lowpass gürültü, hışırtı değil uğultu.
      // LFO ayrı bir ara düğüme bağlanır: master gain 0 olunca ses TAMAMEN kesilir
      // (LFO master'a bağlı olsaydı 0'da bile salınım duyulurdu).
      const buffer = this.scene.sfx._noiseBuffer(ctx, 2.0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      lp.Q.value = 0.5;
      const wobble = ctx.createGain();
      wobble.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(wobble.gain);
      lfo.start();
      this._waterGain = ctx.createGain();
      this._waterGain.gain.value = 0;
      src.connect(lp).connect(wobble).connect(this._waterGain).connect(this._bus());
      src.start();
    }
    this._waterGain.gain.value = proximity * WATER_MAX_GAIN;
  }

  // Gündüz rastgele kuş cıvıltıları: kısa, parlak, iki-notalı.
  _updateBirds(ctx, nightness, deltaMs) {
    if (nightness > 0.35) return;
    this._birdTimer -= deltaMs / 1000;
    if (this._birdTimer > 0) return;
    this._birdTimer = 2.5 + Math.random() * 5;
    const t = ctx.currentTime;
    const base = 2200 + Math.random() * 1400;
    for (let n = 0; n < 2; n++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const start = t + n * 0.12;
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.5, start + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 1.1, start + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.045, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(g).connect(this._bus());
      osc.start(start);
      osc.stop(start + 0.18);
    }
  }

  // Gece cırcır böcekleri: hızlı titreşen yüksek ton patlamaları.
  _updateCrickets(ctx, nightness, deltaMs) {
    if (nightness < 0.5) return;
    this._cricketTimer -= deltaMs / 1000;
    if (this._cricketTimer > 0) return;
    this._cricketTimer = 1.2 + Math.random() * 2.5;
    const t = ctx.currentTime;
    const chirps = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < chirps; c++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const start = t + c * 0.09;
      osc.frequency.value = 4200 + Math.random() * 400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.03, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      osc.connect(g).connect(this._bus());
      osc.start(start);
      osc.stop(start + 0.07);
    }
  }

  // Gece ateş böcekleri: az sayıda, serbestçe süzülen, oyuncuyu yavaşça izleyen
  // piksel ışıklar. Sabit yörünge yerine hedef noktası değişen rahat uçuş.
  _updateFireflies(nightness, deltaMs) {
    if (nightness < 0.5) {
      this._hideFireflies();
      return;
    }
    if (!this._fireflies) this._createFireflies();
    const player = this.scene.player;
    if (!player) return;
    const dt = deltaMs / 1000;
    const t = performance.now() / 1000;
    for (const f of this._fireflies) {
      // Hedefe yumuşak yaklaşma: böcek süzülerek uçar, hedefi dönmez.
      const ease = 1 - Math.exp(-f.speed * dt);
      f.x += (f.targetX - f.x) * ease;
      f.y += (f.targetY - f.y) * ease;
      // Hedefe vardıkça oyuncuya göre yeni bir hedef seçilir (oyuncu taşındığında
      // böcek onu takip eder ama arkasından süzülerek varır).
      const dx = f.targetX - f.x;
      const dy = f.targetY - f.y;
      if (dx * dx + dy * dy < 400 || f.targetTimer <= 0) {
        f.targetTimer = 3 + Math.random() * 4;
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * FIREFLY_ARRIVE_RANGE;
        f.targetX = player.x + Math.cos(angle) * dist;
        f.targetY = player.y + Math.sin(angle) * dist * 0.7;
      }
      f.targetTimer -= dt;
      f.sprite.x = f.x;
      f.sprite.y = f.y + Math.sin(t * 1.4 + f.phase) * 5;
      const glow = 0.5 + 0.5 * Math.sin(t * f.blink + f.phase * 3);
      f.sprite.setAlpha(nightness * (0.25 + glow * 0.75));
    }
  }

  _createFireflies() {
    // Ateş böceği dokusu: 2x2 parlak çekirdek + 4x4 soluk hale (piksel hissi).
    if (!this.scene.textures.exists('firefly')) {
      const tex = this.scene.textures.createCanvas('firefly', 4, 4);
      const c = tex.context;
      c.fillStyle = 'rgba(220, 255, 140, 0.35)';
      c.fillRect(0, 0, 4, 4);
      c.fillStyle = '#eaffa0';
      c.fillRect(1, 1, 2, 2);
      tex.refresh();
    }
    this._fireflies = [];
    const player = this.scene.player;
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * FIREFLY_ARRIVE_RANGE;
      const startX = player ? player.x + Math.cos(angle) * dist : 0;
      const startY = player ? player.y + Math.sin(angle) * dist * 0.7 : 0;
      const sprite = this.scene.add.image(startX, startY, 'firefly')
        .setDepth(FIREFLY_DEPTH)
        .setAlpha(0);
      this._fireflies.push({
        sprite,
        x: startX,
        y: startY,
        targetX: startX,
        targetY: startY,
        targetTimer: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.4,
        blink: 1.5 + Math.random() * 2.5
      });
    }
  }

  _hideFireflies() {
    if (!this._fireflies) return;
    for (const f of this._fireflies) f.sprite.setAlpha(0);
  }

  destroy() {
    if (!this._fireflies) return;
    for (const f of this._fireflies) f.sprite.destroy();
    this._fireflies = null;
  }
}