// Ayarlar paneli: ses seviyelerinin ve tuş atamalarının gerçekten kaydedildiğini
// doğrular (jsdom yok — minimal Phaser/DOM stub'ı, menu.test.mjs ile aynı üslup).
// Çalıştır:  node test/settings.test.mjs
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`, detail === undefined ? '' : detail);
    failed++;
  }
}

// --- Minimal DOM / Phaser stub ---------------------------------------------
const windowHandlers = {};
global.window = {
  addEventListener: (type, fn) => { (windowHandlers[type] ||= []).push(fn); },
  removeEventListener: (type, fn) => {
    const list = windowHandlers[type] || [];
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  }
};
global.localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); }
};

function fireWindowKey(type, keyCode) {
  const event = {
    keyCode,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; }
  };
  for (const fn of [...(windowHandlers[type] || [])]) fn(event);
  return event;
}

const KeyCodes = { ESC: 27, SHIFT: 16, E: 69, I: 73, Q: 81, P: 80, K: 75 };
global.Phaser = { Input: { Keyboard: { KeyCodes } } };

const created = { rects: [], texts: [], graphics: [] };

function makeDisplayObject(x, y, extra) {
  return {
    x,
    y,
    w: 0,
    h: 0,
    depth: 0,
    scrollFactor: 1,
    interactive: false,
    handlers: {},
    ...extra,
    setDepth(d) { this.depth = d; return this; },
    setScrollFactor(f) { this.scrollFactor = f; return this; },
    setInteractive() { this.interactive = true; return this; },
    setOrigin() { return this; },
    setText(text) { this.text = text; return this; },
    setColor(color) { this.color = color; return this; },
    setPosition(px, py) { this.x = px; this.y = py; return this; },
    setFillStyle() { return this; },
    setStrokeStyle() { return this; },
    on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; },
    fire(type, payload) { for (const fn of this.handlers[type] || []) fn(payload); }
  };
}

const masterGain = { value: 0 };
const scene = {
  settingsOpen: false,
  cameras: { main: { width: 1280, height: 720 } },
  sfx: { _output: () => ({ gain: masterGain }) },
  input: {
    handlers: {},
    on(type, fn) { (this.handlers[type] ||= []).push(fn); },
    off(type, fn) {
      const list = this.handlers[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    listenerCount(type) { return (this.handlers[type] || []).length; }
  },
  add: {
    group() {
      const children = [];
      return { add(o) { children.push(o); return this; }, destroy() { children.length = 0; } };
    },
    rectangle(x, y, w, h, color, alpha) {
      const rect = makeDisplayObject(x, y, { w, h, color, alpha });
      created.rects.push(rect);
      return rect;
    },
    text(x, y, text) {
      const t = makeDisplayObject(x, y, { text });
      created.texts.push(t);
      return t;
    },
    graphics() {
      const g = makeDisplayObject(0, 0, { ops: [] });
      g.setScrollFactor = function setScrollFactor() { return this; };
      g.clear = function clear() { this.ops.length = 0; return this; };
      g.fillStyle = function fillStyle(color, alpha) { this.style = { color, alpha }; return this; };
      g.fillRect = function fillRect(sx, sy, sw, sh) {
        this.ops.push({ x: sx, y: sy, w: sw, h: sh, style: this.style });
        return this;
      };
      created.graphics.push(g);
      return g;
    }
  }
};


// --- Test ------------------------------------------------------------------
const { SettingsPanel } = await import(new URL('../../src/ui/SettingsPanel.js', import.meta.url).href);
const { getSettings } = await import(new URL('../../src/core/GameSettings.js', import.meta.url).href);

const panel = new SettingsPanel(scene);
let backCalled = false;
panel.openPanel(() => { backCalled = true; });

check('panel acildi ve oyunu durdurdu', panel.open === true && scene.settingsOpen === true,
  `open=${panel.open} settingsOpen=${scene.settingsOpen}`);
check('panel gorselleri olusturuldu', created.rects.length > 0, created.rects.length);
check('ESC dinleyicisi baglandi', (windowHandlers.keydown || []).length === 1,
  (windowHandlers.keydown || []).length);
check('surukleme dinleyicisi baglandi', scene.input.listenerCount('pointermove') === 1,
  scene.input.listenerCount('pointermove'));

// Kaydırıcılar: rayı 220x8, tutma alanı 220x26 olan gölünmez dikdörtgenler.
const hitAreas = created.rects.filter((r) => r.w === 220 && r.h === 26);
check('iki ses kaydiricisi var', hitAreas.length === 2, hitAreas.length);

const masterHit = hitAreas[0];
const ambienceHit = hitAreas[1];
const leftOf = (hit) => hit.x - hit.w / 2;

check('ana ses kayitli degeri gosteriyor', created.texts.some((t) => t.text === '80%'),
  created.texts.map((t) => t.text).join('|'));
check('ortam sesi kayitli degeri gosteriyor', created.texts.some((t) => t.text === '100%'),
  created.texts.map((t) => t.text).join('|'));

// Kaydırıcı sürüklemesi: ray üzerinde basılı tutup hareket ettirme.
function scenePointerMove(x) {
  for (const fn of [...(scene.input.handlers.pointermove || [])]) fn({ x, isDown: true });
}
function scenePointerUp(x) {
  for (const fn of [...(scene.input.handlers.pointerup || [])]) fn({ x, isDown: false });
}

// Ana ses %30'a çekilince hem ayar hem canlı master gain güncellenir.
masterHit.fire('pointerdown', { x: leftOf(masterHit) + 220 * 0.2 });
check('raya tiklayinca deger atandi', Math.abs(getSettings().masterVolume - 0.2) < 0.001,
  getSettings().masterVolume);

scenePointerMove(leftOf(masterHit) + 220 * 0.3);
check('ana ses ayara yazildi', Math.abs(getSettings().masterVolume - 0.3) < 0.001,
  getSettings().masterVolume);
check('ana ses canli uygulandi', Math.abs(masterGain.value - 0.3) < 0.001, masterGain.value);

// Kol bırakıldıktan sonra hareket değeri değiştirmemeli.
scenePointerUp();
scenePointerMove(leftOf(masterHit) + 220 * 0.9);
check('birakinca surukleme durdu', Math.abs(getSettings().masterVolume - 0.3) < 0.001,
  getSettings().masterVolume);

// Ortam sesi: tıklayınca %50 olur (AmbienceSystem her frame okur).
ambienceHit.fire('pointerdown', { x: leftOf(ambienceHit) + 220 * 0.5 });
check('ortam sesi ayara yazildi', Math.abs(getSettings().ambienceVolume - 0.5) < 0.001,
  getSettings().ambienceVolume);
scenePointerUp();

// Taşan sürükleme 0..1 aralığında kırpılır.
masterHit.fire('pointerdown', { x: leftOf(masterHit) + 999 });
check('ana ses 1 ile sinirli', getSettings().masterVolume === 1, getSettings().masterVolume);
scenePointerMove(leftOf(masterHit) - 999);
check('ana ses 0 ile sinirli', getSettings().masterVolume === 0, getSettings().masterVolume);
scenePointerUp();

// Tuş atama: butona tıkla, sonra yeni tuşa bas.
const keyButtons = created.rects.filter((r) => r.w === 70 && r.h === 30);
check('alti tus butonu var (4 oyun + 2 sohbet)', keyButtons.length === 6, keyButtons.length);

// Sohbet kısayolları varsayılan ENTER olarak panelde görünür.
const enterLabels = created.texts.filter((t) => t.text === 'ENTER');
check('sohbet kisayollari ENTER varsayilaniyla gorunur', enterLabels.length === 2, enterLabels.length);

// Sohbet metin ayarı satırları: chatName + chatMentions (240x30 kutu).
const textBoxes = created.rects.filter((r) => r.w === 240 && r.h === 30);
check('iki sohbet metin ayari satiri var', textBoxes.length === 2, textBoxes.length);
check('metin satirlari bos durumda ipucu gosterir',
  created.texts.filter((t) => t.text === '(boş)').length === 2,
  created.texts.map((t) => t.text).join('|'));

keyButtons[0].fire('pointerup');
check('tus bekleniyor durumuna gecti', panel.listeningAction === 'pickup', panel.listeningAction);

const pressEvent = fireWindowKey('keydown', KeyCodes.P);
check('yeni tus atandi', getSettings().keys.pickup === 'P', getSettings().keys.pickup);
check('atama tusu oyuna iletilmedi', pressEvent.prevented === true && pressEvent.stopped === true,
  `prevented=${pressEvent.prevented} stopped=${pressEvent.stopped}`);
check('bekleme durumu bitti', panel.listeningAction === null, panel.listeningAction);
check('buton metni guncellendi', created.texts.some((t) => t.text === 'P'),
  created.texts.map((t) => t.text).join('|'));

// Atama sırasında ESC iptal eder, eski tuş korunur.
keyButtons[1].fire('pointerup');
fireWindowKey('keydown', KeyCodes.ESC);
check('ESC atamayi iptal etti', panel.listeningAction === null, panel.listeningAction);
check('iptalde eski tus korundu', getSettings().keys.inventory === 'I', getSettings().keys.inventory);

// ESC paneli kapatır, durum sıfırlanır ve dinleyici temizlenir.
const closeEvent = fireWindowKey('keydown', KeyCodes.ESC);
check('ESC paneli kapatti', panel.open === false && scene.settingsOpen === false,
  `open=${panel.open} settingsOpen=${scene.settingsOpen}`);
check('kapanista geri donuldu', backCalled === true, backCalled);
check('ESC oyuna iletilmedi', closeEvent.stopped === true, closeEvent.stopped);
check('ESC dinleyicisi temizlendi', (windowHandlers.keydown || []).length === 0,
  (windowHandlers.keydown || []).length);
check('surukleme dinleyicisi temizlendi', scene.input.listenerCount('pointermove') === 0
  && scene.input.listenerCount('pointerup') === 0, scene.input.listenerCount('pointermove'));

// Panel yeniden açılınca kaydırıcı yeni ayarlarla kurulur.
panel.openPanel();
check('panel tekrar acilabiliyor', panel.open === true && scene.settingsOpen === true,
  `open=${panel.open}`);
panel.closePanel();

// Kapalı panel tuş olaylarını yok sayar.
fireWindowKey('keydown', KeyCodes.P);
check('kapali panel tus yok sayiyor', panel.open === false && getSettings().keys.pickup === 'P',
  getSettings().keys.pickup);

console.log(failed === 0 ? 'Ayarlar testi geçti' : `Ayarlar testi BAŞARISIZ (${failed})`);
process.exit(failed === 0 ? 0 : 1);
