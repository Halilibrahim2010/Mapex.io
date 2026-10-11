// Uretim tarifleri - tek kaynak: shared/crafting.json
// Tarif dosyasi SADECE ne girer / ne cikar bilgisini tutar:
//   { "id": "stick",
//     "inputs": [{ "itemId": "wood", "count": 1 }],
//     "output": { "itemId": "stick", "count": 1 } }
// Esya gorunumu (isim, ikon, sprite) objectDefs.json'da tanimlanir.
// Tarifin girdisi/ciktisi objectDefs'te yoksa tarif gecersiz sayilir ve
// yuklenmez (sessizce atlanir).
import { getObjectDef } from "./ObjectDefs.js";

let craftingData = null;

function isValidRecipe(recipe) {
  if (!recipe || typeof recipe.id !== "string" || !recipe.id) return false;
  if (!recipe.output || typeof recipe.output.itemId !== "string") return false;
  if (
    !Array.isArray(recipe.inputs) ||
    recipe.inputs.length < 1 ||
    recipe.inputs.length > 4
  )
    return false;
  for (const input of recipe.inputs) {
    if (!input || typeof input.itemId !== "string") return false;
    if (!Number.isInteger(input.count) || input.count < 1) return false;
    // Girdi objectDefs'te tanimli olmali (ikon/isim oradan gelir).
    try {
      if (!getObjectDef(input.itemId)) return false;
    } catch (error) {
      return false;
    }
  }
  if (!Number.isInteger(recipe.output.count) || recipe.output.count < 1)
    return false;
  // Cikti objectDefs'te tanimli olmali.
  try {
    if (!getObjectDef(recipe.output.itemId)) return false;
  } catch (error) {
    return false;
  }
  return true;
}

function buildCraftingData(source) {
  const recipes = [];
  const byId = new Map();
  for (const recipe of source.recipes || []) {
    if (!isValidRecipe(recipe)) continue;
    const entry = {
      id: recipe.id,
      inputs: recipe.inputs.map((input) => ({
        itemId: input.itemId,
        count: input.count,
      })),
      output: { itemId: recipe.output.itemId, count: recipe.output.count },
    };
    recipes.push(entry);
    byId.set(entry.id, entry);
  }
  return { source, version: source.version || 1, recipes, byId };
}

export function loadCraftingData(source) {
  if (craftingData) return craftingData;
  if (source) {
    craftingData = buildCraftingData(source);
    return craftingData;
  }
  throw new Error(
    "loadCraftingData(): veri kaynağı yok (crafting.json yüklenmeli)",
  );
}

export async function ensureCraftingData() {
  if (craftingData) return craftingData;
  const response = await fetch("shared/crafting.json");
  if (!response.ok)
    throw new Error("crafting.json yüklenemedi: " + response.status);
  craftingData = buildCraftingData(await response.json());
  return craftingData;
}

export function getCraftingData() {
  if (!craftingData)
    throw new Error("loadCraftingData()/ensureCraftingData() önce çağrılmalı");
  return craftingData;
}

// Tüm tarifler (üretim menüsünün üst paneli).
export function craftingRecipes() {
  return getCraftingData().recipes;
}

export function getRecipe(id) {
  return getCraftingData().byId.get(id) || null;
}

// Tarif listesinde gosterilecek ad: ciktinin objectDefs'teki adi.
export function craftingOutputName(recipe, labelOf) {
  return labelOf(recipe.output.itemId);
}

// Tarif listesinde gosterilecek ikon: ciktinin objectDefs'teki ikonu.
export function craftingOutputIcon(recipe, iconOf) {
  return iconOf(recipe.output.itemId);
}

// Slotlardaki girdilerle eşleşen tarifi bulur (sıra + adet birebir).
// slots: [{ itemId, count } | null x4]
export function matchRecipe(slots) {
  const norm = (slots || []).map((slot) =>
    slot && slot.itemId
      ? { itemId: slot.itemId, count: Math.floor(slot.count) || 0 }
      : null,
  );
  while (norm.length < 4) norm.push(null);
  for (const recipe of getCraftingData().recipes) {
    let ok = true;
    for (let i = 0; i < 4; i++) {
      const want = recipe.inputs[i] || null;
      const got = norm[i];
      if (!want && !got) continue;
      if (!want || !got) {
        ok = false;
        break;
      }
      if (want.itemId !== got.itemId || got.count < want.count) {
        ok = false;
        break;
      }
    }
    if (ok) return recipe;
  }
  return null;
}
