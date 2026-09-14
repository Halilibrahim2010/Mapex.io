// Data-driven object definitions — server-side compatible & deterministic
// Her nesne türü için tek bir entry — class yerine veri
// Deterministic: her client aynı nesneleri görür (server sync)

export const OBJECT_DEFS = {
  // === KÜÇÜK TAŞ (1x1, alınabilir) ===
  stone: {
    id: 'stone',
    name: 'Stone',
    category: 'stone',
    tileW: 1, tileH: 1,
    pickable: true,
    maxStack: 99,
    icon: 'stone_1',
    onBreak: null,
    // Server sync fields
    syncable: true,
    seedSalt: 1,
    // Deterministic spawn params
    spawnProbability: 0.252,
    cellCount: 1,
    isBig: false
  },

  // === BÜYÜK TAŞ (2x2, alınamaz — ağır) ===
  rock: {
    id: 'rock',
    name: 'Rock',
    category: 'stone',
    tileW: 2, tileH: 2,
    pickable: false,
    maxStack: 0,
    icon: 'stone_7',
    onBreak: null,
    // Server sync fields
    syncable: true,
    seedSalt: 2,
    // Deterministic spawn params
    spawnProbability: 0.10,
    cellCount: 2,
    isBig: true
  },

  // === ODUN (1x1, alınabilir) ===
  wood: {
    id: 'wood',
    name: 'Wood',
    category: 'resource',
    tileW: 1, tileH: 1,
    pickable: true,
    maxStack: 99,
    icon: 'log',
    onBreak: null,
    // Server sync fields
    syncable: true,
    seedSalt: 3,
    spawnProbability: 0,
    cellCount: 1,
    isBig: false
  },

  // === AĞAÇ (2x2, alınamaz directly — kırınca odun drop) ===
  tree1: {
    id: 'tree1',
    name: 'Tree',
    category: 'tree',
    tileW: 2, tileH: 2,
    pickable: false,
    maxStack: 0,
    icon: 'tree1',
    onBreak: 'wood',
    breakTime: 8,
    // Server sync fields
    syncable: true,
    seedSalt: 4,
    spawnProbability: 0.25,
    cellCount: 2,
    isBig: true
  },

  tree2: {
    id: 'tree2',
    name: 'TreeTrunk',
    category: 'tree',
    tileW: 1, tileH: 1,
    pickable: false,
    maxStack: 0,
    icon: 'tree2',
    onBreak: null,
    // Server sync fields
    syncable: true,
    seedSalt: 5,
    spawnProbability: 0,
    cellCount: 1,
    isBig: false
  }
};

// Helper: ID'den def bul
export function getObjectDef(id) {
  return OBJECT_DEFS[id] || null;
}

// Helper: pickable mi?
export function isPickable(id) {
  const def = OBJECT_DEFS[id];
  return def ? def.pickable : false;
}

// Helper: Kategoriyi döndür (stone, tree, resource)
export function getCategory(id) {
  const def = OBJECT_DEFS[id];
  return def ? def.category : null;
}

// Helper: Server sync gerekiyor mu?
export function isSyncable(id) {
  const def = OBJECT_DEFS[id];
  return def ? def.syncable : false;
}