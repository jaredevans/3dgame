// The land in square chunks on a world grid: which chunks to keep built round you and how fine, and one chunk's mesh as
// plain arrays (terrain-mesh.js wraps them for three.js). Pure, no three.js.
// A chunk's key is 'c:i,j' (it covers x from i * size to (i + 1) * size, z likewise); its id as streamed is
// 'c:i,j:cell', so a chunk whose detail changes is a new id, built before the old one is let go.

export const CHUNK = 256;                      // metres along a chunk's side
export const FINE = 4, COARSE = 16;            // cell sizes, metres

export const chunkKey = (i, j) => `c:${i},${j}`;
export const chunkId = (key, cell) => `${key}:${cell}`;
export function chunkOf(id) {
  const m = /^c:(-?\d+),(-?\d+):(\d+)$/.exec(id);
  return m ? { key: `c:${m[1]},${m[2]}`, i: +m[1], j: +m[2], cell: +m[3] } : null;
}

// how far a point is from chunk (i, j): 0 inside it
const distTo = (x, z, i, j, size) =>
  Math.hypot(Math.max(0, i * size - x, x - (i + 1) * size), Math.max(0, j * size - z, z - (j + 1) * size));

// every chunk within r of a point, with its distance, nearest first
function around(x, z, r, size) {
  const out = [];
  const i0 = Math.floor((x - r) / size), i1 = Math.floor((x + r) / size), j0 = Math.floor((z - r) / size), j1 = Math.floor((z + r) / size);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = distTo(x, z, i, j, size);
    if (d <= r) out.push([chunkKey(i, j), d]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

// the chunks to keep built round (x, z), nearest first: cell FINE within `fine` metres of the chunk, COARSE out to `far`
export function chunksWanted(x, z, { size = CHUNK, fine = 700, far = 4500 } = {}) {
  return new Map(around(x, z, far, size).map(([key, d]) => [key, d <= fine ? FINE : COARSE]));
}

// the keys of every chunk within r of a point
export const chunksNear = (x, z, r, size = CHUNK) => new Set(around(x, z, r, size).map(([key]) => key));

// One chunk's grid as arrays: an (n + 2)^2 grid with a skirt ring dropped 4 m below its neighbour, so neighbours of
// different detail never crack. Heights are worked out once each, on the grid plus one cell beyond it so normals at the
// edges match the neighbour's; colouring is given each vertex's height and slope from them
// (terrain.regionAt(x, z, h, slope)). paint(col, k, region, x, z) writes a vertex's colour at col[k..k+2].
export function chunkGrid(terrain, i, j, size, cell, paint) {
  const x0 = i * size, z0 = j * size, n = Math.round(size / cell) + 1, N = n + 2;
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
  const H = new Float32Array(N * N);
  for (let b = -1; b <= n; b++) for (let a = -1; a <= n; a++) H[(b + 1) * N + (a + 1)] = terrain.heightAt(x0 + a * cell, z0 + b * cell);
  const hAt = (a, b) => H[(b + 1) * N + (a + 1)];
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const gi = Math.min(n - 1, Math.max(0, a - 1)), gj = Math.min(n - 1, Math.max(0, b - 1));
    const x = x0 + gi * cell, z = z0 + gj * cell;
    const skirt = a === 0 || b === 0 || a === N - 1 || b === N - 1;
    const h = hAt(gi, gj), k = (b * N + a) * 3;
    pos[k] = x; pos[k + 1] = h - (skirt ? 4 : 0); pos[k + 2] = z;
    const dx = hAt(gi - 1, gj) - hAt(gi + 1, gj), dz = hAt(gi, gj - 1) - hAt(gi, gj + 1), up = 2 * cell;
    const l = Math.hypot(dx, up, dz);
    nor[k] = dx / l; nor[k + 1] = up / l; nor[k + 2] = dz / l;
    paint(col, k, terrain.regionAt(x, z, h, Math.hypot(dx, dz) / (2 * cell)), x, z);
  }
  const idx = new (N * N > 65535 ? Uint32Array : Uint16Array)((N - 1) * (N - 1) * 6);
  let m = 0;
  for (let b = 0; b < N - 1; b++) for (let a = 0; a < N - 1; a++) {
    const p = b * N + a, q = p + 1, r = p + N, s = r + 1;
    idx[m++] = p; idx[m++] = r; idx[m++] = q; idx[m++] = q; idx[m++] = r; idx[m++] = s;
  }
  return { pos, col, nor, idx };
}
