// Güvenli doğuş noktası: oyuncunun engel (kaya/ağaç) collider'ı veya su içinde
// doğup hareket edememesi sorununu önler. (0,0) çevresinden dışa doğru halka
// halka taranır ve ilk uygun karo merkezi döndürülür.
import { getObjectDef } from '../core/ObjectDefs.js';

const SEARCH_RADIUS = 12; // taranacak karo yarıçapı
const FEET_OFFSET = 34; // su kontrolü ayak yüksekliği (InteractionSystem ile aynı)

// Engel türlerinin kapladığı karoları (chunk'a göre normalize) toplar.
function blockedTiles(generator, tileSize, chunkX, chunkY) {
  const blocked = new Set();
  const perType = generator.generateObjects(chunkX, chunkY);

  for (const [type, list] of Object.entries(perType)) {
    const def = getObjectDef(type);
    if (!def || !def.sprite.collider) continue;
    const size = tileSize * def.sprite.collider;
    const offsetY = def.sprite.colliderOffsetY || 0;

    for (const data of list) {
      const left = Math.floor((data.x - size / 2) / tileSize);
      const right = Math.floor((data.x + size / 2) / tileSize);
      const top = Math.floor((data.y - size / 2 + offsetY) / tileSize);
      const bottom = Math.floor((data.y + size / 2 + offsetY) / tileSize);
      for (let ty = top; ty <= bottom; ty++) {
        for (let tx = left; tx <= right; tx++) blocked.add(`${tx},${ty}`);
      }
    }
  }
  return blocked;
}

export function safeSpawnPoint(generator, terrain, tileSize) {
  const blocked = blockedTiles(generator, tileSize, 0, 0);

  for (let ring = 0; ring <= SEARCH_RADIUS; ring++) {
    for (let row = -ring; row <= ring; row++) {
      for (let col = -ring; col <= ring; col++) {
        // Yalnızca bu halkanın kenarını gez (iç kısım önceki turlarda denendi).
        if (ring > 0 && Math.abs(row) !== ring && Math.abs(col) !== ring) continue;
        if (blocked.has(`${col},${row}`)) continue;
        const x = col * tileSize + tileSize / 2;
        const y = row * tileSize + tileSize / 2;
        if (terrain.isWaterAt(x, y + FEET_OFFSET)) continue;
        return { x, y };
      }
    }
  }
  return { x: tileSize / 2, y: tileSize / 2 };
}