// Sunucunun tüm asset dosyalarını HTTP üzerinden servis ettiğini doğrular.
// Çalıştırmak için sunucu açık olmalı:  node test/http-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const base = process.env.BASE_URL || 'http://localhost:12090';
const data = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'objectDefs.json'), 'utf8'));

const sub = (p, v) => p.replace('{n}', String(v));
const files = new Set();
files.add(sub(data.terrain.ground.atlas, data.terrain.ground.n));
for (let i = 1; i <= (data.terrain.grass.variants || 1); i++) files.add(sub(data.terrain.grass.atlas, i));
for (const obj of Object.values(data.objects)) {
  // sprite artık açık textures listesi taşır (atlas şablonu yok).
  for (const t of (obj.sprite && obj.sprite.textures) || []) files.add(t);
  if (obj.stump) files.add(sub(obj.stump.atlas, obj.stump.n));
  if (obj.shadow) files.add(sub(obj.shadow.atlas, obj.shadow.n));
}
for (let i = 1; i <= data.characters.count; i++) {
  files.add(`assets/Characters/Char ${i}/${data.characters.files[(i - 1) % data.characters.files.length]}`);
}
for (const p of Object.values(data.ui)) files.add(p);

let fails = 0;
for (const file of files) {
  const url = `${base}/${encodeURI(file)}`;
  let status = 0;
  try {
    const res = await fetch(url);
    status = res.status;
  } catch (error) {
    status = -1;
  }
  if (status !== 200) {
    console.log(`EKSİK ${status}  ${file}`);
    fails++;
  }
}
console.log(`Kontrol edilen: ${files.size} dosya, eksik: ${fails}`);
process.exit(fails === 0 ? 0 : 1);