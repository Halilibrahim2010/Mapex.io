// Oyun ayarları: ses seviyeleri ve tuş atamaları. localStorage'a kaydedilir —
// yalnızca kullanıcı tercihleri saklanır, oyun durumu asla burada tutulmaz.
const STORAGE_KEY = 'mapex.settings.v1';

const DEFAULTS = {
  masterVolume: 0.8,   // tüm sesler (efektler + ambiyans)
  ambienceVolume: 1,   // ortam sesleri (kuş, cırcır, su)
  keys: {
    pickup: 'E',       // eşya al
    inventory: 'I',    // envanter
    dropItem: 'Q',     // eşya bırak
    timeSkip: 'SHIFT'  // zaman hızlandır
  }
};

let settings = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        ...DEFAULTS,
        ...saved,
        keys: { ...DEFAULTS.keys, ...(saved.keys || {}) }
      };
    }
  } catch (e) {
    // Okuma başarısız (gizli mod vb.): varsayılanlarla devam et.
  }
  return { ...DEFAULTS, keys: { ...DEFAULTS.keys } };
}

export function getSettings() {
  if (!settings) settings = load();
  return settings;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Yazma başarısız: ayarlar yalnızca bu oturumda geçerli kalır.
  }
}

function notify() {
  for (const fn of listeners) fn();
}

// Ses seviyesi güncelle (0..1).
export function setVolume(kind, value) {
  const s = getSettings();
  const clamped = Math.max(0, Math.min(1, value));
  if (kind === 'master') s.masterVolume = clamped;
  else if (kind === 'ambience') s.ambienceVolume = clamped;
  save();
  notify();
}

// Tuş atamasını değiştir (keyName: Phaser KeyCodes adı, ör. 'E', 'SHIFT').
export function setBinding(action, keyName) {
  const s = getSettings();
  if (!s.keys[action]) return;
  s.keys[action] = keyName;
  save();
  notify();
}

// Ayar değişikliklerini dinle (dönen fonksiyon aboneliği iptal eder).
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// keyCode → KeyCodes adı ('E', 'SHIFT'...). Tuş yakalama için kullanılır.
export function keyCodeName(code) {
  for (const [name, value] of Object.entries(Phaser.Input.Keyboard.KeyCodes)) {
    if (value === code) return name;
  }
  return null;
}