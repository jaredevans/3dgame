// Auto mode on foot: the way across a town to the departures, and following it with the keys a player would press.
// Pure, no three.js. world: the walk world (walk-world.js) { blocked(x, z, r), inBounds(x, z) }.
//
// findPath is an A* search over a grid of PATH.cell squares (0.5 m: Oceanside's way through has no room on a 1 m grid),
// a job the page slices across frames (slicer.js). A square is open where the walker's body, and a little more
// (PATH.clear), is clear of everything solid at its centre, and its centre and the points half a square round it are
// in bounds (inBounds is a point test: that keeps him off the very rim of the platform and the sea; and it's the costly
// one, working out the ground's height, so it's asked once for each point of a half-square lattice). Squares within
// PATH.soft more of something cost PATH.softCost as much to cross, so the way keeps to the middle of a passage where
// there's room. The squares' path is then cut to a few waypoints where the straight line between them is clear (checked
// every PATH.sample m), and its corners rounded where the rounding is clear too.
import { BODY, RUN } from './walk.js';
import { FOOT_VIEW } from './foot-view.js';

export const PATH = {
  cell: 0.5, clear: 0.02, soft: 0.35, softCost: 2.5,
  margin: 60,          // m round the start and the goal the search may go (Oceanside's way goes 50 m out of its way)
  reach: 1,            // m: a square this close to the goal is there
  sample: 0.1,         // m between the points a straight line is checked at
  longest: 25,         // m: no waypoint is cut further from the one before it than this
  round: 0.8,          // m: a corner is cut back this far (at most a third of either side) to round it
  every: 60,           // a yield every this many squares searched (or line points checked)
  maxCells: 4e6,
};

// from { x, z } (where he stands), to { x, z } -> a generator that returns { points: [{ x, z }] (from first, the last
// within PATH.reach of to), cells: [{ x, z }] (the squares' centres it went through), searched } or null (no way within
// the margin)
export function* findPath(world, from, to, options = {}) {
  const o = { ...PATH, ...options }, r = BODY + o.clear, cell = o.cell;
  // the squares are on the world's own grid, wherever the search starts: the same way is found from anywhere (Oceanside's
  // only way through, between a tuft of marram grass and a beach hut, leaves his body 0.2 m of room, along z = -190)
  const x0 = Math.floor((Math.min(from.x, to.x) - o.margin) / cell) * cell, z0 = Math.floor((Math.min(from.z, to.z) - o.margin) / cell) * cell;
  const nx = Math.ceil((Math.max(from.x, to.x) + o.margin - x0) / cell) + 1;
  const nz = Math.ceil((Math.max(from.z, to.z) + o.margin - z0) / cell) + 1;
  const N = nx * nz;
  if (N > o.maxCells) return null;
  const cx = (i) => x0 + (i % nx) * cell, cz = (i) => z0 + Math.floor(i / nx) * cell;
  // in bounds, on the half-square lattice (u, v): square (ix, iz)'s centre is (2 ix + 1, 2 iz + 1). 0 not asked yet,
  // 1 in, 2 out
  const half = cell / 2, lu = 2 * nx + 1, lv = 2 * nz + 1, lattice = new Uint8Array(lu * lv);
  const inb = (u, v) => {
    if (u < 0 || v < 0 || u >= lu || v >= lv) return false;
    const k = u + v * lu;
    if (!lattice[k]) lattice[k] = world.inBounds(x0 - half + u * half, z0 - half + v * half) ? 1 : 2;
    return lattice[k] === 1;
  };
  // round a lattice point: it and the four half a square from it
  const inside = (u, v) => inb(u, v) && inb(u - 1, v) && inb(u + 1, v) && inb(u, v - 1) && inb(u, v + 1);
  // any point (x, z) where he may stand: the lattice points round it in bounds, clear of everything
  const open = (x, z) => {
    const u = (x - x0 + half) / half, v = (z - z0 + half) / half, u0 = Math.floor(u), v0 = Math.floor(v);
    return inb(u0, v0) && inb(u0 + 1, v0) && inb(u0, v0 + 1) && inb(u0 + 1, v0 + 1) && !world.blocked(x, z, r);
  };
  // a square: 0 not looked at yet, 1 open, 2 open but close to something, 3 shut
  const state = new Uint8Array(N);
  const look = (i) => {
    if (!state[i]) {
      const x = cx(i), z = cz(i);
      state[i] = !inside(2 * (i % nx) + 1, 2 * Math.floor(i / nx) + 1) ? 3 : !world.blocked(x, z, r + o.soft) ? 1 : !world.blocked(x, z, r) ? 2 : 3;
    }
    return state[i];
  };
  const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N), parent = new Int32Array(N).fill(-1);
  // a binary heap of squares by f, with each one's place in it (-1: not in it)
  const heap = new Int32Array(N), at = new Int32Array(N).fill(-1);
  let n = 0;
  const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; at[heap[a]] = a; at[heap[b]] = b; };
  const up = (k) => { while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; swap(p, k); k = p; } };
  const down = (k) => {
    for (;;) {
      const l = 2 * k + 1, rr = l + 1;
      let m = k;
      if (l < n && f[heap[l]] < f[heap[m]]) m = l;
      if (rr < n && f[heap[rr]] < f[heap[m]]) m = rr;
      if (m === k) return;
      swap(k, m); k = m;
    }
  };
  const h = (i) => Math.max(0, Math.hypot(cx(i) - to.x, cz(i) - to.z) - o.reach);
  const push = (i) => { if (at[i] < 0) { heap[n] = i; at[i] = n; n++; up(n - 1); } else up(at[i]); };
  const pop = () => { const i = heap[0]; n--; at[i] = -1; if (n) { heap[0] = heap[n]; at[heap[0]] = 0; down(0); } return i; };

  // start on the nearest open square of the four round him (he's standing there: the nearest if none is)
  const ix = Math.floor((from.x - x0) / cell), iz = Math.floor((from.z - z0) / cell);
  let start = -1, best = Infinity;
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = ix + dx + (iz + dz) * nx, d = Math.hypot(cx(i) - from.x, cz(i) - from.z);
    const score = d + (look(i) === 3 ? 100 : 0);
    if (score < best) { best = score; start = i; }
  }
  if (state[start] === 3) state[start] = 2;
  g[start] = 0; f[start] = h(start); push(start);
  let goal = -1, searched = 0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (n) {
    const i = pop();
    if (Math.hypot(cx(i) - to.x, cz(i) - to.z) <= o.reach) { goal = i; break; }
    if (++searched % o.every === 0) yield;
    const ix = i % nx, iz = Math.floor(i / nx);
    for (const [dx, dz] of DIRS) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jx + jz * nx, s = look(j);
      if (s === 3) continue;
      // no corner cut on a diagonal, and close to something, the way between the two centres is clear too
      if (dx && dz && (look(ix + dx + iz * nx) === 3 || look(ix + jz * nx) === 3)) continue;
      if ((s === 2 || state[i] === 2) && !(inside(2 * ix + 1 + dx, 2 * iz + 1 + dz) && !world.blocked((cx(i) + cx(j)) / 2, (cz(i) + cz(j)) / 2, r))) continue;
      const step = cell * (dx && dz ? Math.SQRT2 : 1) * (s === 2 ? o.softCost : 1);
      if (g[i] + step >= g[j]) continue;
      g[j] = g[i] + step; f[j] = g[j] + h(j); parent[j] = i;
      push(j);
    }
  }
  if (goal < 0) return null;
  const cells = [];
  for (let i = goal; i >= 0; i = parent[i]) cells.push({ x: cx(i), z: cz(i) });
  cells.reverse();
  const raw = [{ x: from.x, z: from.z }, ...cells];

  // the straight line a -> b is clear for him (but for the first 0.3 m from where he stands)
  let checked = 0;
  function* clearLine(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), k = Math.ceil(len / o.sample);
    for (let j = 1; j <= k; j++) {
      const x = a.x + ((b.x - a.x) * j) / k, z = a.z + ((b.z - a.z) * j) / k;
      if (++checked % o.every === 0) yield;
      if (Math.hypot(x - from.x, z - from.z) < 0.3) continue;
      if (!open(x, z)) return false;
    }
    return true;
  }
  // cut to the waypoints a straight line can join: from each, as far on as a clear line reaches (found by doubling the
  // step, then halving it), no further than PATH.longest. (Two neighbouring squares are joined as the search joined
  // them: the way between them was checked there wherever either is close to something)
  const fits = function* (a, j) { return Math.hypot(raw[j].x - raw[a].x, raw[j].z - raw[a].z) <= o.longest && (yield* clearLine(raw[a], raw[j])); };
  const points = [raw[0]];
  for (let a = 0; a < raw.length - 1;) {
    let good = a + 1, step = 1;
    while (good + step < raw.length && (yield* fits(a, good + step))) { good += step; step *= 2; }
    for (step = Math.floor(step / 2); step >= 1; step = Math.floor(step / 2)) if (good + step < raw.length && (yield* fits(a, good + step))) good += step;
    points.push(raw[good]);
    a = good;
  }
  // round each corner, where the short cut across it is clear
  const rounded = [points[0]];
  for (let k = 1; k < points.length - 1; k++) {
    const a = rounded[rounded.length - 1], p = points[k], b = points[k + 1];
    const la = Math.hypot(a.x - p.x, a.z - p.z), lb = Math.hypot(b.x - p.x, b.z - p.z), c = Math.min(o.round, la / 3, lb / 3);
    const q = { x: p.x + ((a.x - p.x) * c) / la, z: p.z + ((a.z - p.z) * c) / la };
    const s = { x: p.x + ((b.x - p.x) * c) / lb, z: p.z + ((b.z - p.z) * c) / lb };
    if (c > 0.05 && (yield* clearLine(q, s))) rounded.push(q, s); else rounded.push(p);
  }
  if (points.length > 1) rounded.push(points[points.length - 1]);
  return { points: rounded, cells, searched };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// following a path with the keys: W (and Shift: he runs) when facing near enough towards a point `ahead` m on along the
// leg he's on from where he is beside it (so he keeps to the line itself, where a passage is narrow), A or D to turn
// towards it (on the spot when facing well off it). step(p { x, z, yaw }, dt, out) writes the keys { fwd, right, run }
// into out (the same object every frame) and says how it's going: 'going', 'arrived' (at the last waypoint) or 'stuck'
// (no nearer the end along the path for `stuck` s); 'idle' with no path. He runs (Shift) but for the last stride or two
// to each waypoint
export function makeFollower({ reach = 0.3, ahead = 0.8, arrive = 0.5, aim = 0.4, stuck = 3, progress = 0.5 } = {}) {
  let pts = null, i = 1, best = Infinity, still = 0;
  let rest = new Float64Array(0);   // the path's length on from each waypoint to its end
  return {
    set(points) {
      pts = points; i = 1; best = Infinity; still = 0;
      if (rest.length < points.length) rest = new Float64Array(points.length);
      rest[points.length - 1] = 0;
      for (let k = points.length - 2; k >= 0; k--) rest[k] = rest[k + 1] + Math.hypot(points[k + 1].x - points[k].x, points[k + 1].z - points[k].z);
    },
    clear() { pts = null; },
    get path() { return pts; },
    // how far there is still to go along it (from the last step)
    get left() { return best; },
    step(p, dt, out) {
      out.fwd = 0; out.right = 0; out.run = true;
      if (!pts) return 'idle';
      if (pts.length < 2) return 'arrived';
      while (i < pts.length - 1 && Math.hypot(pts[i].x - p.x, pts[i].z - p.z) < reach) i++;
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - p.x, b.z - p.z);
      if (i === pts.length - 1 && d < arrive) return 'arrived';
      const left = d + rest[i];
      if (left < best - progress) { best = left; still = 0; } else if ((still += dt) >= stuck) return 'stuck';
      // the point to make for: `ahead` on from where he is along the leg a -> b (b itself near its end)
      const lx = b.x - a.x, lz = b.z - a.z, len = Math.hypot(lx, lz) || 1;
      const along = Math.min(len, Math.max(0, ((p.x - a.x) * lx + (p.z - a.z) * lz) / len) + ahead);
      const dx = a.x + (lx * along) / len - p.x, dz = a.z + (lz * along) / len - p.z;
      const err = wrap(Math.atan2(dx, dz) - p.yaw);   // + : the way is to his left (turning left raises yaw)
      const band = Math.max(0.04, FOOT_VIEW.turn * Math.min(0.1, Math.max(0, dt)));
      out.right = Math.abs(err) <= band ? 0 : err > 0 ? -1 : 1;
      out.fwd = Math.abs(err) < aim ? 1 : 0;
      // a stride or two from a waypoint he walks, so a long frame's stride doesn't carry him past it into a wall
      out.run = d > RUN * Math.min(0.1, dt) * 2;
      return 'going';
    },
  };
}
