// Web Audio ile prosedürel ses efektleri (ses dosyası gerekmez).
// Tarayıcı politikası gereği AudioContext ilk kullanıcı etkileşiminde oluşturulur.
export class SoundFX {
  constructor() {
    this.ctx = null;
  }

  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // Kısa beyaz gürültü tamponu
  _noiseBuffer(ctx, dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Balta ağaca vurma sesi: düşük "tok" gövde + kısa tokmalık gürültü
  chop() {
    const ctx = this._ctx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Gövde vuruşu (düşük tok ses)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.17);

    // Tokmalık kısa gürültü
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(ctx, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 750;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(ng).connect(ctx.destination);
    src.start(t);
  }

  // Toplama sesi: kısa parlak "çink"
  pickup() {
    const ctx = this._ctx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Ağaç kırılma sesi: daha derin çatlama + uzun düşen gürültü
  treeBreak() {
    const ctx = this._ctx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Derin çatlama
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.42);

    // Uzayan düşen gürültü (ağaç yığılması)
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(ctx, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(lp).connect(ng).connect(ctx.destination);
    src.start(t);
  }
}
