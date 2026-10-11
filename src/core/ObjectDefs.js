// Veri odaklı nesne tanımları — tek kaynak: shared/objectDefs.json
// Sunucu da aynı dosyayı okur (server/game/GameData.js), böylece bir nesne
// eklemek için tek yer yeterlidir: JSON'a entry ekle, istemci+sunucu hazır.
//
// Alanlar:
//  kind        : resource | obstacle | harvestable | decor
//  interaction : pickup | hold | none
//  shape       : kaç karo kapladığı (w, h)
//  sprite      : atlas {n} veya {variants} ile seçilir; depth/scale/origin
//  variants    : isteğe bağlı varyant overrides (aynı nesnenin farklı PNG'leri
//                farklı collider/shape taşıyabilir) — resolveVariant ile okunur.
//  spawn       : deterministik üretim (chance, cells, salt, bigOnly, tex aralığı)
//  harvest     : hold süresi ve vuruş alanı | pickup: alma menzili
//  drop        : kırılınca düşen eşya | stump: kırıldıktan sonra kalan görsel

function substitute(path, value) {
  return path.replace('{n}', String(value));
}

// Sprite çözümleme: sprite artık açık "textures" listesi taşır (atlas şablonu
// yok). stump/shadow/terrain için substitute hâlâ kullanılır (onlar ayrı,
// tek/çok görsel üreten alt-yapılar). textures listesi doğrudan okunur.
function resolveSprites(def) {
  const atlas = def.sprite && def.sprite.textures ? def.sprite.textures : [];
  const survivor = def.stump ? substitute(def.stump.atlas, def.stump.n) : null;
  const shadow = def.shadow ? substitute(def.shadow.atlas, def.shadow.n) : null;
  // Kütük kalıntısının kendi gölgesi olabilir; atlas'ı yoksa nesnenin gölge
  // atlası kullanılır (JSON'da yalnızca {n} verilmesi yeterli olsun).
  const stumpShadow = def.stump && def.stump.shadow
    ? substitute((def.stump.shadow.atlas || def.shadow.atlas), def.stump.shadow.n)
    : null;
  return { atlas, survivor, shadow, stumpShadow };
}

function readFootprint(raw) {
  return raw && (raw.footprint || raw.shape) ? (raw.footprint || raw.shape) : { w: 1, h: 1 };
}

// Varyant çözümleyici: texture yoluna göre def.variants[] listesinden eşleşen
// varyantı bulur. Yoksa null döner (tüketici root'a fallback yapar).
// Varyant alanı hem footprint hem sprite.collider gibi alanları override edebilir —
// böylece log1–log4 gibi aynı nesnenin farklı PNG'leri farklı box collider /
// footprint taşıyabilir.
export function resolveVariant(def, texture) {
  if (!def || !def.variants || !def.variants.length || !texture) return null;
  for (const variant of def.variants) {
    if (variant.texture === texture) return variant;
  }
  return null;
}

// Nesnenin efektif footprint'ı: varyantta tanımlıysa onu, yoksa root'u döndürür.
export function resolveFootprint(def, texture) {
  const v = resolveVariant(def, texture);
  if (v && (v.footprint || v.shape)) return v.footprint || v.shape;
  return def ? (def.footprint || def.shape || { w: 1, h: 1 }) : { w: 1, h: 1 };
}

// Back-compat: eski kodlar hâlâ resolveShape çağırabiliyor.
export const resolveShape = resolveFootprint;

// Nesnenin efektif collider'ı: varyantta tanımlıysa onu, yoksa def.sprite'ı
// döndürür. Tüketici artık "box" (w,h,angle,offsetY) okur; box yoksa çarpışma yok.
export function resolveCollider(def, texture) {
  const v = resolveVariant(def, texture);
  if (v && v.sprite && v.sprite.box) return v.sprite;
  return def && def.sprite ? def.sprite : null;
}

// Nesnenin efektif groundOffset'i (sprite merkezi ile yer çizgisi arası mesafe):
// varyantta tanımlıysa onu, yoksa root sprite'ı, o da yoksa 0 döndürür.
// Böylece Log1–Log4 gibi aynı nesnenin farklı PNG'leri farklı yer çizgisine
// oturabilir.
export function resolveGroundOffset(def, texture) {
  const v = resolveVariant(def, texture);
  if (v && v.sprite && v.sprite.groundOffset !== undefined) return v.sprite.groundOffset;
  return def && def.sprite && def.sprite.groundOffset !== undefined
    ? def.sprite.groundOffset : 0;
}

function normalizeVariant(variant) {
  if (!variant || typeof variant !== 'object') return variant;
  const footprint = variant.footprint || variant.shape || { w: 1, h: 1 };
  return { ...variant, footprint, shape: footprint };
}

function buildEntry(id, raw) {
  const sprite = resolveSprites(raw);
  const { shape, footprint: rawFootprint, variants, ...rest } = raw;
  const footprint = readFootprint(raw);
  return {
    ...rest,
    id,
    footprint,
    shape: footprint,
    variants: Array.isArray(variants) ? variants.map(normalizeVariant) : [],
    tileW: footprint.w,
    tileH: footprint.h,
    pickable: raw.interaction === 'pickup',
    choppable: raw.interaction === 'hold',
    syncable: raw.kind !== 'decor' || Boolean(raw.drop),
    textures: sprite ? sprite.atlas : [],
    stumpTexture: sprite ? sprite.survivor : null,
    shadowTexture: sprite ? sprite.shadow : null,
    stumpShadowTexture: sprite ? sprite.stumpShadow : null
  };
}

export function defineObjectDefs(source) {
  const defs = {};
  for (const [id, raw] of Object.entries(source.objects)) {
    defs[id] = buildEntry(id, raw);
  }
  return defs;
}

// Tek kaynaklı oyun verisi: hem istemci hem sunucu bunu kullanır.
let gameData = null;

function buildGameData(source) {
  const stats = source.stats || [];
  return {
    source,
    tileSize: source.tileSize,
    chunkSize: source.chunkSize,
    inventorySlots: source.inventorySlots,
    inventoryMaxStack: source.inventoryMaxStack,
    render: source.render,
    terrain: source.terrain,
    stats,
    characters: source.characters,
    ui: source.ui,
    defs: defineObjectDefs(source)
  };
}

// Preload sahnesi JSON'u Phaser cache'ine indirdiği için veri buradan verilir;
// başka bir çağrı yeri eksikse dosya yolu üzerinden çekilir.
// Not: `source` verildiğinde senkron çalışır (Phaser create içinden çağrılır).
export function loadGameData(source) {
  if (gameData) return gameData;
  if (source) {
    gameData = buildGameData(source);
    return gameData;
  }
  throw new Error('loadGameData(): veri kaynağı yok (objectDefs.json yüklenmeli)');
}

// Veri henüz yüklenmediyse dosyadan çeker (menü gibi Phaser dışı yerler için).
export async function ensureGameData() {
  if (gameData) return gameData;
  const response = await fetch('shared/objectDefs.json');
  if (!response.ok) throw new Error('objectDefs.json yüklenemedi: ' + response.status);
  gameData = buildGameData(await response.json());
  return gameData;
}

export function getGameData() {
  if (!gameData) throw new Error('loadGameData()/ensureGameData() önce çağrılmalı');
  return gameData;
}

export function getObjectDef(id) {
  return getGameData().defs[id] || null;
}

export function objectDefs() {
  return getGameData().defs;
}

// Sprite atlasını önceden yüklemek için gereken dosya listesi.
export function spriteFileList() {
  const data = getGameData();
  const files = new Set([substitute(data.terrain.ground.atlas, data.terrain.ground.n)]);
  const grass = data.terrain.grass;
  for (let i = 1; i <= (grass.variants || 1); i++) files.add(substitute(grass.atlas, i));
  for (const def of Object.values(data.defs)) {
    for (const file of def.textures) files.add(file);
    if (def.stumpTexture) files.add(def.stumpTexture);
    if (def.shadowTexture) files.add(def.shadowTexture);
    if (def.stumpShadowTexture) files.add(def.stumpShadowTexture);
  }
  return Array.from(files);
}

// Sayaç tanımları JSON'dan gelir; kodda sabit sayaç adı geçmez.
export function emptyStats() {
  const result = {};
  for (const stat of getGameData().stats) result[stat.id] = 0;
  return result;
}

export function statsList() {
  return getGameData().stats;
}

// Karakter ve arayüz asset tanımları JSON'dan gelir.
export function getCharacters() {
  return getGameData().characters;
}

export function getInterface() {
  return getGameData().ui;
}

// Bir nesne için deterministik doku seçimi (rnd: 0..1 üreten fonksiyon).
export function pickTexture(def, rnd) {
  if (!def.textures.length) return def.id;
  return def.textures[Math.min(def.textures.length - 1, Math.floor(rnd() * def.textures.length))];
}