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
  if (!s || !s.collider) continue;
  check(`engel yer çizgisi tanımlı: ${id}`, Number.isFinite(s.groundOffset), s.groundOffset);
  check(`engel collider genişliği var: ${id}`, Number.isFinite(s.colliderW), s.colliderW);
  check(`engel collider yüksekliği var: ${id}`, Number.isFinite(s.colliderH), s.colliderH);
  check(`engel collider oranı makul: ${id}`,
    s.colliderW > 8 && s.colliderW <= 64 && s.colliderH > 6 && s.colliderH <= 32,
    `${s.colliderW}x${s.colliderH}`);
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