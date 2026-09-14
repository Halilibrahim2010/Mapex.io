// Chunk window helper: visits the (2*dist+1)^2 chunks around (cx, cy).
// Trees, plants and ground chunks all used the same window, so the three
// copies of the nested loop live here now.
export function eachChunkInWindow(cx, cy, dist, fn) {
  for (let dy = -dist; dy <= dist; dy++) {
    for (let dx = -dist; dx <= dist; dx++) {
      if (fn(cx + dx, cy + dy) === false) return;
    }
  }
}
