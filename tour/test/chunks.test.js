import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunksWanted, chunkGrid, chunkJob, runFor, chunksNear, chunkOf, corridorKeys } from '../chunks.js';
import { makeTerrain } from '../terrain.js';

// every 256 m cell a set of ids covers, with how many times
function coverage(ids) {
  const seen = new Map();
  for (const id of ids) for (const k of chunkOf(id).keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  return seen;
}
const ids = (w) => [...w].map(([key, cell]) => `${key}:${cell}`);

test('near chunks are fine, then mid, and far ones coarse in big tiles', () => {
  const w = chunksWanted(100, 100);
  assert.equal(w.get('c:0,0'), 4);                    // the chunk you're in
  assert.equal(w.get('c:3,0'), 4);                    // 668 m: still within 700
  assert.equal(w.get('c:4,0'), 8);                    // 924 m: mid
  assert.equal(w.get('c:5,0'), 8);                    // 1180 m
  assert.equal(w.get('c:7,0'), 8);                    // 1692 m, but its 512 m tile (x 1536..2048) starts within 1500 m
  assert.equal(w.get('t:3,0'), undefined);            // ...so that tile is split, not coarse
  assert.equal(w.get('t:4,0'), 16);                   // tile x 2048..2560, 1948 m: coarse, one 512 m tile
  assert.equal(w.get('c:8,0'), undefined);            // (not also as 256 m chunks)
  assert.equal(w.get('t:-9,0'), 16);                  // tile x -4608..-4096: 4196 m
  assert.equal(w.get('t:8,0'), 16);                   // x 4096..4608: 3996 m
  assert.equal(w.get('t:9,0'), undefined);            // x 4608..: 4508 m, beyond `far`
  assert.ok([...w].every(([k, c]) => (k.startsWith('c:') ? c === 4 || c === 8 : c === 16)));
  // nearest first, so the ground under you is built before the horizon
  const keys = [...w.keys()];
  assert.equal(keys[0], 'c:0,0');
  assert.ok(keys.indexOf('c:1,0') < keys.indexOf('c:4,0') && keys.indexOf('c:4,0') < keys.indexOf('t:4,0'));
  // far fewer pieces than 256 m chunks all the way out
  assert.ok(w.size < 420, `${w.size}`);
});

test('the line keeps its ground fine out to the mid range', () => {
  const corridor = new Set(['c:5,0', 'c:8,0']);
  const w = chunksWanted(100, 100, { corridor });
  assert.equal(w.get('c:5,0'), 4);                    // 1180 m, but beside the line
  assert.equal(w.get('c:4,0'), 8);                    // not beside it
  assert.equal(w.get('t:4,0'), 16);                   // beyond 1500 m even the line's ground is coarse
});

test('every bit of ground out to `far` is covered exactly once', () => {
  for (const [x, z] of [[100, 100], [-37, 911], [2000, -300]]) {
    const seen = coverage(ids(chunksWanted(x, z, { corridor: new Set(['c:1,1', 'c:6,0']) })));
    assert.ok([...seen.values()].every((n) => n === 1), 'no ground built twice');
    for (const k of chunksNear(x, z, 4100)) assert.equal(seen.get(k), 1, `${k} covered near (${x}, ${z})`);
  }
});

test('the wanted set moves with you', () => {
  const a = chunksWanted(100, 100), b = chunksWanted(100 + 2000, 100);
  assert.equal(a.get('c:0,0'), 4);
  assert.equal(a.get('c:2,0'), 4);
  assert.equal(b.get('c:2,0'), 8);                    // left behind: mid now (1332 m)
  assert.equal(b.get('t:0,0'), 16);                   // and further back, a coarse tile (1588 m)
  assert.equal(b.get('c:8,0'), 4);                    // where you are now
  assert.equal(a.get('t:4,0'), 16);
  assert.equal(b.get('t:-9,0'), undefined);           // dropped off behind
  assert.equal(b.get('t:12,0'), 16);                  // and picked up ahead
  assert.equal(a.get('t:12,0'), undefined);
  assert.ok(Math.abs(a.size - b.size) < 30, `${a.size} vs ${b.size}`);
});

test('the line\'s corridor: chunks within 300 m of its points (or of a place\'s footprint)', () => {
  const k = corridorKeys([{ x: 400, z: 400 }, { x: 2000, z: 2000, r: 100 }]);
  assert.ok(k.has('c:1,1') && k.has('c:0,1') && k.has('c:2,1'));   // 144 m and 112 m away
  assert.ok(!k.has('c:3,1'));                                       // 368 m
  assert.ok(k.has('c:9,7') && !k.has('c:10,7'));                     // 304 m from the footprint's centre: within 300 m of its edge; 560 m is not
});

test('a chunk id splits into its key, place, size, cell and the ground it covers', () => {
  assert.deepEqual(chunkOf('c:-3,7:8'), { key: 'c:-3,7', i: -3, j: 7, cell: 8, size: 256, tile: 'T:-2,3', keys: ['c:-3,7'] });
  assert.deepEqual(chunkOf('t:-2,3:16'), { key: 't:-2,3', i: -2, j: 3, cell: 16, size: 512, tile: 'T:-2,3', keys: ['c:-4,6', 'c:-3,6', 'c:-4,7', 'c:-3,7'] });
  assert.equal(chunkOf('city'), null);
  assert.equal(chunkOf('city-ocean'), null);
});

test('chunks near a circle', () => {
  assert.deepEqual([...chunksNear(400, 400, 80)].sort(), ['c:1,1']);
  assert.deepEqual([...chunksNear(500, 300, 80)].sort(), ['c:1,0', 'c:1,1', 'c:2,0', 'c:2,1']);
});

const counting = () => {
  const t = { calls: 0, regions: [] };
  t.heightAt = (x, z) => { t.calls++; return x * 0.5; };          // a plain slope: 0.5 up per metre of x
  t.regionAt = (x, z, h, slope) => {
    assert.ok(h !== undefined && slope !== undefined, 'colouring is given the height and slope');
    t.regions.push(slope); return 'grass';
  };
  return t;
};
const paint = (col, k) => { col[k] = 1; col[k + 1] = 0.5; col[k + 2] = 0; };

test('building a chunk calls heightAt once per vertex', () => {
  for (const cell of [4, 8, 16]) for (const nearLine of [undefined, () => true]) {
    const fake = counting();
    const g = chunkGrid(fake, { x0: 256, z0: 512, size: 256, cell, paint, nearLine });
    const n = 256 / cell + 1, N = n + 2;                 // the grid plus its skirt ring
    assert.equal(g.pos.length, N * N * 3);
    // the ring beyond the grid that edge normals need is the skirt ring's count. Beside the line a vertex coarser than
    // a fine chunk also takes four more heights, for its slope over the same ±4 m a fine chunk's grid gives it, so the
    // line's ground keeps its colours when its detail changes
    const extra = nearLine && cell !== 4 ? 4 * N * N : 0;
    assert.equal(fake.calls, N * N + extra, `cell ${cell}${nearLine ? ' beside the line' : ''}`);
    assert.ok(fake.regions.every((s) => Math.abs(s - 0.5) < 1e-9), 'slope from the heights');
    const xs = [], zs = [];
    for (let k = 0; k < g.pos.length; k += 3) { xs.push(g.pos[k]); zs.push(g.pos[k + 2]); }
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], [256, 512, 512, 768]);
    assert.equal(g.idx.length, (N - 1) * (N - 1) * 6);
  }
});

test('a coarse tile colours the line\'s ground as the fine chunk there does', () => {
  // real ground with a hill, so slope matters: compare regions at the shared points
  const t = makeTerrain({ base: 8, seed: 3, features: [{ kind: 'massif', x: 300, z: 300, r: 500, h: 140 }] });
  const regions = (cell, size, nearLine) => {
    const out = new Map();
    const tt = { heightAt: t.heightAt, regionAt: (x, z, h, s) => { const r = t.regionAt(x, z, h, s); out.set(`${x},${z}`, r); return r; } };
    chunkGrid(tt, { x0: 0, z0: 0, size, cell, paint, nearLine });
    return out;
  };
  const fine = regions(4, 256), coarse = regions(16, 512, () => true);
  let same = 0, n = 0;
  for (const [k, r] of coarse) if (fine.has(k)) { n++; if (fine.get(k) === r) same++; }
  assert.ok(n > 200);
  assert.equal(same, n, `${n - same} of ${n} points differ`);
});

test('a chunk builds a few rows at a time, and comes out the same', () => {
  const t = makeTerrain({ base: 8, seed: 3 });
  const whole = chunkGrid(t, { x0: 0, z0: 0, size: 256, cell: 8, paint });
  let clock = 0;
  const now = () => clock++;                           // each look at the clock costs a millisecond
  const job = chunkJob(t, { x0: 0, z0: 0, size: 256, cell: 8, paint });
  let slices = 0, out;
  while (!(out = runFor(job, 4, now))) slices++;
  assert.ok(slices > 10, `${slices} slices`);
  assert.deepEqual(out.pos, whole.pos);
  assert.deepEqual(out.col, whole.col);
});

test('a fine chunk leaves out the cells a portal fills, and its skirt stops over a tunnel', () => {
  const flat = { heightAt: () => 20, regionAt: () => 'grass' };
  const paint = () => {};
  const n = 64 / 4 + 1, N = n + 2, all = (N - 1) * (N - 1) * 6;
  // one hole, at the cell whose corner is (8, 12)
  const holed = { ...flat, holeCell: (x, z, size) => x === 8 && z === 12 && size === 4 };
  assert.equal(chunkGrid(holed, { x0: 0, z0: 0, size: 64, cell: 4, paint }).idx.length, all - 6);
  assert.equal(chunkGrid(holed, { x0: 0, z0: 0, size: 64, cell: 8, paint }).idx.length, (64 / 8 + 2) ** 2 * 6, 'coarser pieces keep every cell');
  // skirts hang 4 m below their edge, but no lower than the floor there
  const floored = { ...flat, skirtFloor: (x) => (x < 32 ? 18.5 : -Infinity) };
  const g = chunkGrid(floored, { x0: 0, z0: 0, size: 64, cell: 4, paint, skirt: 4 });
  const ys = (a, b) => g.pos[(b * N + a) * 3 + 1];
  assert.equal(ys(3, 0), 18.5);
  assert.equal(ys(N - 3, 0), 16);
  assert.equal(ys(3, 3), 20);
});
