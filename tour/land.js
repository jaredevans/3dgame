// A kit's own island ground as a terrain patch: for each point round it, the height of the nearest land and how far off
// the land it is. Pure: kitPlace is { bounds, terrain?, groundAt(lx, lz) } in the kit's own metres.
export const LAND_MIN = -2;   // kit ground below this (local metres) is off its island: its underside, not land (a place may say)
const CELL = 1, BLEND = 26;   // the grid reaches this far past the kit's own ground: terrain.js blends a patch out over 25 m

// On a 1 m grid round the kit's origin, each cell's height at the nearest land and its distance from the land. Computed
// once when the place is built.
export function landSampler(kitPlace, landMin = LAND_MIN) {
  // the grid covers the kit's own terrain (its width, if it says) and the blend round it
  const b = kitPlace.bounds, width = kitPlace.terrain?.userData?.terrain?.width;
  const REACH = Math.ceil((width ? width / 2 : Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)) + BLEND);
  const n = (2 * REACH) / CELL + 1, H = new Float32Array(n * n), D = new Float32Array(n * n), landCells = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const g = kitPlace.groundAt(-REACH + i * CELL, -REACH + j * CELL);
    if (g != null && g >= landMin) { landCells.push(j * n + i); H[j * n + i] = g; D[j * n + i] = 0; } else D[j * n + i] = Infinity;
  }
  // the land's boundary: land cells beside one that isn't (the nearest land to any point off it is one of these)
  const border = landCells.filter((c) => {
    const i = c % n;
    return i === 0 || i === n - 1 || [c - 1, c + 1, c - n, c + n, c - n - 1, c - n + 1, c + n - 1, c + n + 1].some((k) => k < 0 || k >= n * n || D[k] > 0);
  });
  for (let k = 0; k < n * n; k++) {
    if (D[k] === 0) continue;
    const i = k % n, j = (k - i) / n;
    let best = Infinity, bh = 0;
    for (const c of border) {
      const ci = c % n, cj = (c - ci) / n, d = (ci - i) ** 2 + (cj - j) ** 2;
      if (d < best) { best = d; bh = H[c]; }
    }
    D[k] = Math.sqrt(best) * CELL; H[k] = bh;
  }
  const edge = landCells.filter((c) => { const i = c % n; return [c - 1, c + 1, c - n, c + n].some((k) => k >= 0 && k < n * n && D[k] > 0) && i > 0 && i < n - 1; })
    .map((c) => [-REACH + (c % n) * CELL, -REACH + Math.floor(c / n) * CELL]);
  // how far from the origin the land reaches
  const radius = landCells.reduce((r, c) => Math.max(r, Math.hypot(-REACH + (c % n) * CELL, -REACH + Math.floor(c / n) * CELL)), 0) + CELL;
  return {
    edge, radius,
    sample(lx, lz) {
      const i = Math.round((lx + REACH) / CELL), j = Math.round((lz + REACH) / CELL);
      if (i < 0 || j < 0 || i >= n || j >= n) return null;
      const k = j * n + i;
      if (D[k] > 0) return { h: H[k], d: D[k] };
      // a land cell: the kit's ground at the point itself, unless the point has stepped off the island's edge onto
      // its underside (the cell's own height, then)
      const g = kitPlace.groundAt(lx, lz);
      return { h: g != null && g >= landMin ? g : H[k], d: 0 };
    },
  };
}
