// Veri katmanı testi: shared/objectDefs.json'daki tanımların tutarlılığı.
// Çalıştırma: node server/test/assets.test.js  (sunucu gerektirmez)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'objectDefs.json'), 'utf8'));

const objectDefsUrl = pathToFileURL(path.join(root, 'src', 'core', 'ObjectDefs.js')).href;
const { loadGameData, spriteFileList, objectDefs, statsList, emptyStats, getObjectDef, getCharacters, getInterface } =
  await import(objectDefsUrl);

await loadGameData(json);

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

// Her nesne tanımı zorunlu alanları taşımalı.
for (const [id, def] of Object.entries(objectDefs())) {
  check(`tanım geçerli: ${id}`, def.shape && def.shape.w > 0 && def.shape.h > 0, def.shape);
  check(`etkileşim geçerli: ${id}`, ['pickup', 'hold', 'none'].includes(def.interaction), def.interaction);
  check(`tür geçerli: ${id}`, ['resource', 'obstacle', 'harvestable', 'decor'].includes(def.kind), def.kind);
}

// Sayaç tanımları envanterde karşılığı olan nesneye işaret etmeli.
for (const stat of statsList()) {
  check(`sayaç kaynağı tanımlı: ${stat.id}`, Boolean(getObjectDef(stat.resource)), stat.resource);
  check(`sayaç başlangıcı sıfır: ${stat.id}`, emptyStats()[stat.id] === 0, emptyStats());
}

// JSON'da geçen her sprite dosyası diskte olmalı (veri → asset tutarlılığı).
const files = spriteFileList();
const missing = files.filter((file) => !fs.existsSync(path.join(root, file)));
check('tüm sprite dosyaları mevcut', missing.length === 0, missing);

// Toplanabilir her nesnenin envanter ikonu (texture) olmalı.
for (const [id, def] of Object.entries(objectDefs())) {
  if (!def.pickable) continue;
  check(`toplanabilir ikonu var: ${id}`, def.textures.length > 0, def.textures);
}

// Karakter spritesheet'leri diskte olmalı.
const characters = getCharacters();
check('karakter sayısı tanımlı', characters && characters.count > 0, characters);
if (characters && characters.count > 0) {
  const charFiles = [];
  for (let i = 1; i <= characters.count; i++) {
    const file = characters.files[(i - 1) % characters.files.length];
    charFiles.push(`assets/Characters/Char ${i}/${file}`);
  }
  const missingChars = charFiles.filter((file) => !fs.existsSync(path.join(root, file)));
  check('tüm karakter dosyaları mevcut', missingChars.length === 0, missingChars);
}

// Arayüz asset'leri diskte olmalı.
for (const [key, file] of Object.entries(getInterface())) {
  check(`arayüz dosyası mevcut: ${key}`, fs.existsSync(path.join(root, file)), file);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`, r.ok ? '' : JSON.stringify(r.detail));
console.log(`\n${results.length - failed.length}/${results.length} test geçti`);
process.exit(failed.length ? 1 : 0);