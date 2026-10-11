// Uretim tarifleri: tek kaynak shared/crafting.json.
// Tarif dosyasi SADECE ne girer / ne cikar bilgisini tutar; esya gorunumu
// objectDefs.json'da tanimlanir. Istemci src/core/Crafting.js'i kullanir.
const fs = require('fs');
const path = require('path');
const GameData = require('./GameData');

const jsonPath = path.join(__dirname, '..', '..', 'shared', 'crafting.json');
let data = null;

function isValidRecipe(recipe) {
  if (!recipe || typeof recipe.id !== 'string' || !recipe.id) return false;
  if (!recipe.output || typeof recipe.output.itemId !== 'string') return false;
  if (!Array.isArray(recipe.inputs) || recipe.inputs.length < 1 || recipe.inputs.length > 4) return false;
  for (const input of recipe.inputs) {
    if (!input || typeof input.itemId !== 'string') return false;
    if (!Number.isInteger(input.count) || input.count < 1) return false;
    // Girdi objectDefs'te tanimli olmali.
    if (!GameData.def(input.itemId)) return false;
  }
  if (!Number.isInteger(recipe.output.count) || recipe.output.count < 1) return false;
  // Cikti objectDefs'te tanimli olmali (ikon/isim/sprite oradan gelir).
  if (!GameData.def(recipe.output.itemId)) return false;
  return true;
}

function load() {
  if (data) return data;
  const source = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const recipes = [];
  const byId = new Map();
  for (const recipe of source.recipes || []) {
    if (!isValidRecipe(recipe)) continue;
    const entry = {
      id: recipe.id,
      inputs: recipe.inputs.map((input) => ({ itemId: input.itemId, count: input.count })),
      output: { itemId: recipe.output.itemId, count: recipe.output.count }
    };
    recipes.push(entry);
    byId.set(entry.id, entry);
  }
  data = { source, version: source.version || 1, recipes, byId };
  return data;
}

function recipes() {
  return load().recipes;
}

function getRecipe(id) {
  return load().byId.get(id) || null;
}

// Slotlardaki girdilerle eşleşen tarifi bulur (sıra + adet birebir).
// slots: [{ itemId, count } | null x4]
function matchRecipe(slots) {
  const norm = (slots || []).map((slot) =>
    slot && slot.itemId ? { itemId: slot.itemId, count: Math.floor(slot.count) || 0 } : null
  );
  while (norm.length < 4) norm.push(null);
  for (const recipe of recipes()) {
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const want = recipe.inputs[i] || null;
      const got = norm[i];
      if (!want && !got) continue;
      if (!want || !got) { ok = false; break; }
      if (want.itemId !== got.itemId || got.count < want.count) { ok = false; break; }
    }
    if (ok) return recipe;
  }
  return null;
}

module.exports = { recipes, getRecipe, matchRecipe };
