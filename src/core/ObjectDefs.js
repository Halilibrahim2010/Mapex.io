// Veri odaklı nesne tanımları — tek kaynak: shared/objectDefs.json
// Sunucu da aynı dosyayı okur (server/game/GameData.js), böylece bir nesne
// eklemek için tek yer yeterlidir: JSON'a entry ekle, istemci+sunucu hazır.
//
// Alanlar:
//  kind        : resource | obstacle | harvestable | decor
//  interaction : pickup | hold | none
//  shape       : kaç karo kapladığı (w, h)
//  sprite      : atlas {n} veya {variants} ile seçilir; depth/scale/origin
//  spawn       : deterministik üretim (chance, cells, salt, bigOnly, tex aralığı)
//  harvest     : hold süresi ve vuruş alanı | pickup: alma menzili
//  drop        : kırılınca düşen eşya | stump: kırıldıktan sonra kalan görsel

function substitute(path, value) {
  return path.replace('{n}', String(value));
}

function resolveSprites(def) {
  const s = def.sprite;
  if (!s) return null;
  const variants = s.variants || 1;
  const atlas = [];
  for (let i = 0; i < variants; i++) {
    const value = s.n !== undefined ? s.n : i + 1;
    atlas.push(substitute(s.atlas, value));
  }
  const survivor = def.stump ? substitute(def.stump.atlas, def.stump.n) : null;
  const shadow = def.shadow ? substitute(def.shadow.atlas, def.shadow.n) : null;
  return { atlas, survivor, shadow };
}

function buildEntry(id, raw) {
  const sprite = resolveSprites(raw);
  return {
    ...raw,
    id,
    tileW: raw.shape.w,
    tileH: raw.shape.h,
    pickable: raw.interaction === 'pickup',
    choppable: raw.interaction === 'hold',
    syncable: raw.kind !== 'decor' || Boolean(raw.drop),
    spawnTex: raw.spawn && raw.spawn.texMax > (raw.spawn.texMin || 1)
      ? { min: raw.spawn.texMin || 1, max: raw.spawn.texMax }
      : null,
    textures: sprite ? sprite.atlas : [],
    stumpTexture: sprite ? sprite.survivor : null,
    shadowTexture: sprite ? sprite.shadow : null
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
  if (def.spawnTex) {
    const span = def.spawnTex.max - def.spawnTex.min + 1;
    const index = Math.min(span - 1, Math.floor(rnd() * span));
    return def.textures[def.spawnTex.min - 1 + index];
  }
  return def.textures[Math.min(def.textures.length - 1, Math.floor(rnd() * def.textures.length))];
}