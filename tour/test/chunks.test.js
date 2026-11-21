import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunksWanted, chunkGrid, chunksNear, chunkOf } from '../chunks.js';

test('near chunks are fine and far ones coarse', () => {
  const w = chunksWanted(100, 100);
  assert.equal(w.get('c:0,0'), 4);                    // the chunk you're in
  assert.equal(w.get('c:2,0'), 4);                    // 412 m away
  assert.equal(w.get('c:3,0'), 4);                    // 668 m: still within 700
  assert.equal(w.get('c:4,0'), 16);                   // 924 m: coarse
  assert.equal(w.get('c:-17,0'), 16);                 // its near edge at x = -4096: 4196 m
  assert.equal(w.get('c:18,0'), undefined);           // its near edge at 4608, 4508 m: beyond `far`
  assert.ok([...w.values()].every((c) => c === 4 || c === 16));
  // nearest first, so the ground under you is built before the horizon
  const keys = [...w.keys()];
  assert.equal(keys[0], 'c:0,0');
  assert.ok(keys.indexOf('c:1,0') < keys.indexOf('c:4,0'));
  // the options are honoured
  const small = chunksWanted(0, 0, { size: 100, fine: 50, far: 250 });
  assert.equal(small.get('c:0,0'), 4);
  assert.equal(small.get('c:1,0'), 16);
  assert.equal(small.get('c:3,0'), undefined);
});

test('the wanted set moves with you', () => {
  const a = chunksWanted(100, 100), b = chunksWanted(100 + 2000, 100);
  assert.equal(a.get('c:0,0'), 4);
  assert.equal(b.get('c:0,0'), 16);                   // left behind: coarse now
  assert.equal(b.get('c:8,0'), 4);                    // where you are now
  assert.equal(a.get('c:8,0'), 16);
  assert.equal(b.get('c:-17,0'), undefined);          // dropped off behind
  assert.equal(b.get('c:25,0'), 16);                  // and picked up ahead
  assert.equal(a.get('c:25,0'), undefined);
  // the set is bounded: about the disc of `far`, wherever you are
  assert.ok(Math.abs(a.size - b.size) < 40 && a.size < 1100, `${a.size} vs ${b.size}`);
});

test('a chunk id splits into its key, place in the grid and cell size', () => {
  assert.deepEqual(chunkOf('c:-3,7:16'), { key: 'c:-3,7', i: -3, j: 7, cell: 16 });
  assert.equal(chunkOf('city'), null);
  assert.equal(chunkOf('city-ocean'), null);
});

test('chunks near a circle', () => {
  assert.deepEqual([...chunksNear(400, 400, 80)].sort(), ['c:1,1']);
  assert.deepEqual([...chunksNear(500, 300, 80)].sort(), ['c:1,0', 'c:1,1', 'c:2,0', 'c:2,1']);
});

test('building a chunk calls heightAt once per vertex', () => {
  let calls = 0;
  const regions = [];
  const fake = {
    heightAt: (x, z) => { calls++; return x * 0.5; },          // a plain slope: 0.5 up per metre of x
    regionAt: (x, z, h, slope) => {
      assert.ok(h !== undefined && slope !== undefined, 'colouring is given the height and slope');
      regions.push([h, slope]); return 'grass';
    },
  };
  const paint = (col, k) => { col[k] = 1; col[k + 1] = 0.5; col[k + 2] = 0; };
  const g = chunkGrid(fake, 1, 2, 256, 16, paint);
  const n = 256 / 16 + 1, N = n + 2;                   // the grid plus its skirt ring
  assert.equal(g.pos.length, N * N * 3);
  assert.equal(calls, N * N, 'heights once, plus the ring beyond the grid that edge normals need');
  assert.equal(regions.length, N * N);
  assert.ok(regions.every(([, s]) => Math.abs(s - 0.5) < 1e-9), 'slope from the computed heights');
  // placed at chunk (1, 2): x from 256 to 512, z from 512 to 768
  const xs = [], zs = [];
  for (let k = 0; k < g.pos.length; k += 3) { xs.push(g.pos[k]); zs.push(g.pos[k + 2]); }
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], [256, 512, 512, 768]);
  assert.equal(g.idx.length, (N - 1) * (N - 1) * 6);
  assert.equal(g.col[0], 1);
});
