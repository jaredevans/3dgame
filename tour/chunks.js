// The land in pieces on a world grid: which pieces to keep built round you and how fine, and one piece's mesh as plain
// arrays, built a few heights at a time (terrain-mesh.js wraps them for three.js). Pure, no three.js.
//
// Within 1500 m of you the land is 256 m chunks, key 'c:i,j' (x from i * 256 to (i + 1) * 256, z likewise): cell 4
// within 700 m, and out to 1500 m beside the line (the corridor: within 300 m of a built route or a built place); cell 8
// otherwise. Beyond 1500 m it is 512 m tiles, key 't:I,J', cell 16, out to 4500 m. A tile is either one coarse piece or
// split into its four chunks, so no ground is built twice. A piece streams as 'key:cell'; pieces that replace one another
// share their 512 m tile ('T:I,J'), and a tile's new pieces show together, once all are in, as its old ones go.

export const CHUNK = 256;                      // metres along a chunk's side; a tile is two chunks
export const FINE = 4, MID = 8, COARSE = 16;   // cell sizes, metres
export const SLOPE_D = FINE;                   // colouring's slope is over ±this beside the line, at every detail

export const chunkKey = (i, j) => `c:${i},${j}`;
export const chunkId = (key, cell) => `${key}:${cell}`;
export function chunkOf(id, size = CHUNK) {
  const m = /^([ct]):(-?\d+),(-?\d+):(\d+)$/.exec(id);
  if (!m) return null;
  const i = +m[2], j = +m[3], big = m[1] === 't';
  const keys = big ? [chunkKey(2 * i, 2 * j), chunkKey(2 * i + 1, 2 * j), chunkKey(2 * i, 2 * j + 1), chunkKey(2 * i + 1, 2 * j + 1)] : [chunkKey(i, j)];
  const tile = big ? `T:${i},${j}` : `T:${Math.floor(i / 2)},${Math.floor(j / 2)}`;
  return { key: `${m[1]}:${i},${j}`, i, j, cell: +m[4], size: big ? 2 * size : size, tile, keys };
}

// how far a point is from square (i, j) of side `size`: 0 inside it
const distTo = (x, z, i, j, size) =>
  Math.hypot(Math.max(0, i * size - x, x - (i + 1) * size), Math.max(0, j * size - z, z - (j + 1) * size));

// every square of side `size` within r of a point, with its distance
function around(x, z, r, size) {
  const out = [];
  const i0 = Math.floor((x - r) / size), i1 = Math.floor((x + r) / size), j0 = Math.floor((z - r) / size), j1 = Math.floor((z + r) / size);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = distTo(x, z, i, j, size);
    if (d <= r) out.push([i, j, d]);
  }
  return out;
}

// the pieces to keep built round (x, z), nearest first: Map key -> cell
export function chunksWanted(x, z, { size = CHUNK, fine = 700, mid = 1500, far = 4500, corridor = new Set() } = {}) {
  const out = [];
  for (const [I, J, d] of around(x, z, far, 2 * size)) {
    if (d > mid) { out.push([`t:${I},${J}`, d, COARSE]); continue; }
    for (const [i, j] of [[2 * I, 2 * J], [2 * I + 1, 2 * J], [2 * I, 2 * J + 1], [2 * I + 1, 2 * J + 1]]) {
      const key = chunkKey(i, j), dc = distTo(x, z, i, j, size);
      out.push([key, dc, dc <= fine || corridor.has(key) ? FINE : MID]);
    }
  }
  return new Map(out.sort((a, b) => a[1] - b[1]).map(([key, , cell]) => [key, cell]));
}

// the keys of every chunk within r of a point
export const chunksNear = (x, z, r, size = CHUNK) => new Set(around(x, z, r, size).map(([i, j]) => chunkKey(i, j)));

// the line's corridor: every chunk within `reach` of these points { x, z, r? } (r: a footprint's radius round it)
export function corridorKeys(points, reach = 300, size = CHUNK) {
  const keys = new Set();
  for (const p of points) for (const k of chunksNear(p.x, p.z, reach + (p.r ?? 0), size)) keys.add(k);
  return keys;
}

// One piece's grid, a vertex at a time (a generator: each next() works out one height, or colours one vertex; it
// returns { pos, col, nor, idx }).
// An (n + 2)^2 grid with a skirt ring dropped `skirt` metres below its neighbour, so neighbours of different detail
// never crack. Heights are worked out once each, on the grid plus one cell beyond it so normals at the edges match the
// neighbour's; colouring is given each vertex's height and slope (terrain.regionAt(x, z, h, slope)). The slope is from
// the grid, except where nearLine(x, z) says the line is near and the cell is coarser than SLOPE_D: there it is taken
// over ±SLOPE_D as a fine chunk would, so the line's ground keeps its colours as the detail changes (four more heights).
// paint(col, k, region, x, z) writes a vertex's colour at col[k..k+2].
export function* chunkJob(terrain, { x0, z0, size, cell, paint, nearLine = null, skirt = 4 }) {
  const n = Math.round(size / cell) + 1, N = n + 2;
  const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
  const H = new Float32Array(N * N);
  // a height at a time: one can be slow (a place's own ground, a feature's search for its line), and a slice keeps to
  // its budget only if it can stop between them
  for (let b = -1; b <= n; b++) {
    for (let a = -1; a <= n; a++) { H[(b + 1) * N + (a + 1)] = terrain.heightAt(x0 + a * cell, z0 + b * cell); yield; }
  }
  const hAt = (a, b) => H[(b + 1) * N + (a + 1)];
  const steady = cell !== SLOPE_D && nearLine;
  const f = Math.fround, D = SLOPE_D;
  for (let b = 0; b < N; b++) {
    for (let a = 0; a < N; a++) {
      const gi = Math.min(n - 1, Math.max(0, a - 1)), gj = Math.min(n - 1, Math.max(0, b - 1));
      const x = x0 + gi * cell, z = z0 + gj * cell;
      const edge = a === 0 || b === 0 || a === N - 1 || b === N - 1;
      const h = hAt(gi, gj), k = (b * N + a) * 3;
      // a skirt never hangs into a tunnel's bore (terrain.skirtFloor: how low it may go there)
      const drop = edge ? Math.min(skirt, Math.max(0, h - (terrain.skirtFloor?.(x, z) ?? -Infinity))) : 0;
      pos[k] = x; pos[k + 1] = h - drop; pos[k + 2] = z;
      const dx = hAt(gi - 1, gj) - hAt(gi + 1, gj), dz = hAt(gi, gj - 1) - hAt(gi, gj + 1), up = 2 * cell;
      const l = Math.hypot(dx, up, dz);
      nor[k] = dx / l; nor[k + 1] = up / l; nor[k + 2] = dz / l;
      const slope = steady && nearLine(x, z)
        ? Math.hypot(f(terrain.heightAt(x + D, z)) - f(terrain.heightAt(x - D, z)), f(terrain.heightAt(x, z + D)) - f(terrain.heightAt(x, z - D))) / (2 * D)
        : Math.hypot(dx, dz) / (2 * cell);
      paint(col, k, terrain.regionAt(x, z, h, slope), x, z);
      yield;
    }
  }
  // the ground cells across a tunnel's portals are left out at the finest detail (terrain.holeCell): the portal fills them
  const holed = cell <= FINE && terrain.holeCell ? (a, b) => a >= 1 && b >= 1 && a < n && b < n
    && terrain.holeCell(x0 + (a - 1) * cell, z0 + (b - 1) * cell, cell) : () => false;
  const idx = new (N * N > 65535 ? Uint32Array : Uint16Array)((N - 1) * (N - 1) * 6);
  let m = 0;
  for (let b = 0; b < N - 1; b++) for (let a = 0; a < N - 1; a++) {
    if (holed(a, b)) continue;
    const p = b * N + a, q = p + 1, r = p + N, s = r + 1;
    idx[m++] = p; idx[m++] = r; idx[m++] = q; idx[m++] = q; idx[m++] = r; idx[m++] = s;
  }
  return { pos, col, nor, idx: m === idx.length ? idx : idx.slice(0, m) };
}

// run a job for about `ms`: its result if it finished, else undefined (call again to go on)
export function runFor(job, ms, now = () => performance.now()) {
  const t0 = now();
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
    if (now() - t0 >= ms) return undefined;
  }
}

// a whole piece at once
export function chunkGrid(terrain, opts) {
  const job = chunkJob(terrain, opts);
  for (;;) { const r = job.next(); if (r.done) return r.value; }
}
