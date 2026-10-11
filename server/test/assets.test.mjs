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

loadGameData(json);

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

// Kütük: ağaçla aynı mekanikte kırılabilir olmalı ama TAM %30 daha hızlı.
// Bu kural oyun dengesinin parçası; veri değişirse test uyarır.
const tree = getObjectDef('tree');
const log = getObjectDef('log');
check('kütük tanımlı', Boolean(log), log);
check('kütük kırılabilir', log && log.choppable, log && log.interaction);
check('kütük 4 farklı görsel kullanır', log && log.textures.length === 4, log && log.textures);
if (tree && log) {
  const expected = tree.harvest.holdTime * 0.7;
  check('kütük ağaçtan %30 hızlı kırılır',
    Math.abs(log.harvest.holdTime - expected) < 0.01,
    `ağaç ${tree.harvest.holdTime}s → kütük ${log.harvest.holdTime}s (beklenen ${expected}s)`);
  check('kütük odun verir', log.drop && log.drop.itemId === 'wood', log.drop);
  check('kütük ağaçtan küçük ayak izli', log.shape.w < tree.shape.w, `${log.shape.w} < ${tree.shape.w}`);
}

// Gölge: Shadow klasörü 1..6 arası büyüyen leke içerir; her gölge tanımı
// geçerli bir dosyaya ve makul bir boyuta işaret etmeli.
const shadowDefs = Object.entries(objectDefs()).filter(([, d]) => d.shadowTexture);
check('en az bir nesnede gölge var', shadowDefs.length > 0,
  shadowDefs.map(([id]) => id).join(', '));
// Çarpışma kutusu: engel türleri yer çizgisine oturan bir ayak izi tanımlamalı.
// groundOffset olmadan nesne havada durur ve gölge/collider aşağı kayar.
for (const [id, def] of Object.entries(objectDefs())) {
  const s = def.sprite;
  if (!s || !s.box) continue;
  const b = s.box;
  check(`engel yer çizgisi tanımlı: ${id}`, Number.isFinite(s.groundOffset), s.groundOffset);
  check(`engel box genişliği var: ${id}`, Number.isFinite(b.w), b.w);
  check(`engel box yüksekliği var: ${id}`, Number.isFinite(b.h), b.h);
  check(`engel box oranı makul: ${id}`,
    b.w > 8 && b.w <= 128 && b.h > 6 && b.h <= 128,
    `${b.w}x${b.h}`);
}

// Varyant overrides: aynı nesnenin farklı PNG'leri farklı collider/shape
// taşıyabilir (örn. kütük Log1–Log4). Her varyant: texture mevcut, shape
// pozitif, collider makul aralıkta olmalı.
for (const [id, def] of Object.entries(objectDefs())) {
  if (!def.variants || !def.variants.length) continue;
  const seen = new Set();
  for (const v of def.variants) {
    const tag = `varyant: ${id} ${v.texture ? v.texture.split('/').pop() : '?'}`;
    check(`${tag} texture mevcut`, v.texture && def.textures.includes(v.texture), v.texture);
    check(`${tag} tekrarsız`, !seen.has(v.texture), v.texture);
    if (v.texture) seen.add(v.texture);
    check(`${tag} shape geçerli`, v.shape && v.shape.w > 0 && v.shape.h > 0, v.shape);
    if (v.sprite && v.sprite.box) {
      const box = v.sprite.box;
      const maxDim = Math.max(box.w, box.h);
      const minDim = Math.min(box.w, box.h);
      check(`${tag} box makul`,
        Number.isFinite(box.w) && Number.isFinite(box.h) &&
        box.w > 8 && box.h > 6 &&
        maxDim <= 128 && minDim >= 6,
        `${box.w}x${box.h}`);
    }
  }
  // Varyant sayısı, texture sayısını aşmamalı (yanlış yolları engeller).
  check(`varyant sayısı tutarlı: ${id}`, def.variants.length <= def.textures.length,
    `${def.variants.length} <= ${def.textures.length}`);
}

// Kütük varyantları: 4 PNG de tanımlı olmalı, Log3 yatay / Log4 dikey shape
// (kullanıcı tanımı: log3 4x1 yerine gerçek ölçüye göre, log4 dikey).
const logDef = getObjectDef('log');
if (logDef && logDef.variants && logDef.variants.length) {
  check('kütük 4 varyant tanımlı', logDef.variants.length === 4, logDef.variants.length);
  const v3 = logDef.variants.find(v => v.texture && v.texture.includes('Log3'));
  const v4 = logDef.variants.find(v => v.texture && v.texture.includes('Log4'));
  check('log3 yatay shape', v3 && v3.shape.w > v3.shape.h, v3 && v3.shape);
  check('log4 dikey shape', v4 && v4.shape.h > v4.shape.w, v4 && v4.shape);
}

// Gölge offsetY artık YER ÇİZGİSİNDEN ölçülür: büyük değer gölgeyi aşağı
// kaydırır (bildirilen hata). Hiçbir gölge 8px'den fazla kaymamalı.
for (const [id, def] of shadowDefs) {
  check(`gölge aşağı kaymıyor: ${id}`, (def.shadow.offsetY || 0) <= 8, def.shadow.offsetY);
}

// Ağaç, istenen şekilde en büyük gölgeyi (6.png) kullanmalı.
check('ağaç gölgesi 6.png kullanır', tree && tree.shadow && tree.shadow.n === 6,
  tree && tree.shadow);

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