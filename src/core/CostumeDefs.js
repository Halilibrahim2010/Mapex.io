// Kıyafet tanımları ve veri erişimi: shared/costumeDefs.json dosyasından beslenir.
let cachedCostumes = null;
let currentCostumeId = 1;
let currentCharacterName = '';

export async function ensureCostumeData() {
  if (cachedCostumes) return cachedCostumes;
  try {
    const res = await fetch('shared/costumeDefs.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedCostumes = data.costumes || [];
  } catch (err) {
    cachedCostumes = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      charKey: `char${i + 1}`,
      name: `Karakter ${i + 1}`,
      category: 'Maceracı',
      color: '#ffffff'
    }));
  }
  return cachedCostumes;
}

export function getCostumes() {
  return cachedCostumes || [];
}

export function getCostumeById(id) {
  const costumes = getCostumes();
  return costumes.find((c) => c.id === Number(id)) || costumes[0] || {
    id: 1,
    charKey: 'char1',
    name: 'Altın Saçlı Çocuk',
    category: 'Maceracı',
    color: '#f1c40f'
  };
}

export function getSelectedCostumeId() {
  return currentCostumeId;
}

export function setSelectedCostumeId(id) {
  const num = Number(id);
  if (Number.isFinite(num) && num >= 1 && num <= 18) {
    currentCostumeId = num;
  }
}

export function getSelectedCharacterName() {
  return currentCharacterName;
}

export function setSelectedCharacterName(name) {
  currentCharacterName = String(name || '').trim();
}
