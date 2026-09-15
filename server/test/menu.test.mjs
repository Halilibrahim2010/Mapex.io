// Menünün karakter ızgarasını doldurduğunu ve "OYUNA GİR" butonunun
// mapex:start olayını yaydığını doğrular (jsdom yerine minimal DOM stub'ı).
// Çalıştır:  node server/test/menu.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`, detail === undefined ? '' : detail);
    failed++;
  }
}

// --- Minimal DOM stub ------------------------------------------------------
function makeEl(id) {
  return {
    id,
    children: [],
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    handlers: {},
    title: '',
    textContent: '',
    innerHTML: '',
    value: '',
    appendChild(child) { this.children.push(child); },
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
    fire(type, event = {}) { for (const fn of this.handlers[type] || []) fn(event); },
    focus() {}
  };
}

const els = {
  'char-grid': makeEl('char-grid'),
  'char-big': makeEl('char-big'),
  'char-name': makeEl('char-name'),
  'menu-overlay': makeEl('menu-overlay'),
  'name-input': makeEl('name-input'),
  'name-submit': makeEl('name-submit')
};

global.document = {
  getElementById: (id) => els[id] || null,
  querySelectorAll: () => [],
  createElement: () => makeEl('thumb'),
  addEventListener: () => {},
  readyState: 'complete'
};

const dispatched = [];
global.window = {
  addEventListener: (type, fn) => { (global.window._handlers[type] ||= []).push(fn); },
  _handlers: {},
  dispatchEvent: (event) => { dispatched.push(event); return true; },
  location: { hostname: 'localhost' }
};
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
global.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path.join(root, 'shared', 'objectDefs.json'), 'utf8')) });

// --- Test ------------------------------------------------------------------
const { initMenu } = await import(new URL('../../src/ui/Menu.js', import.meta.url).href);
await initMenu();

const data = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'objectDefs.json'), 'utf8'));
check('karakter ızgarası dolduruldu', els['char-grid'].children.length === data.characters.count, els['char-grid'].children.length);
check('büyük önizleme ayarlandı', String(els['char-big'].style.backgroundImage).includes('Character'), els['char-big'].style.backgroundImage);
check('karakter adı yazıldı', els['char-name'].textContent.length > 0, els['char-name'].textContent);
check('isim alanı odaklandı', true);

els['name-submit'].fire('click');
check('OYUNA GİR butonu mapex:start yaydı', dispatched.some((e) => e.type === 'mapex:start'), dispatched.map((e) => e.type));
check('başlangıç isteği oyuncu adı içeriyor', dispatched[0]?.detail?.name !== undefined, dispatched[0]?.detail);
check('başlangıç isteği karakter içeriyor', dispatched[0]?.detail?.char === 1, dispatched[0]?.detail);

console.log(failed === 0 ? 'Menü testi geçti' : `Menü testi BAŞARISIZ (${failed})`);
process.exit(failed === 0 ? 0 : 1);