import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoute } from '../route.js';
import { makeTerrain, BED_DROP } from '../terrain.js';
import { structuresFor, sectionAt, tunnelDepth, TUBE_TOP } from '../structures.js';
import { LEGS, legRoute, worldTerrain } from '../world-data.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
// a straight, level line along +x at 10 m, 1 km long
const flatLine = () => makeRoute([{ x: 0, y: 10, z: 0 }, { x: 500, y: 10, z: 0 }, { x: 1000, y: 10, z: 0 }]);
// ground that is `by` metres off the line's level between x0 and x1 (sharp edges), level with it elsewhere
const ground = (...spans) => (x) => 10 + spans.reduce((h, [x0, x1, by]) => (x >= x0 && x <= x1 ? h + by : h), 0);

test('a valley gets a viaduct', () => {
  const r = flatLine();
  const got = structuresFor(r, ground([400, 500, -15]), {});
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, 'viaduct');
  near(got[0].s0, 390, 2.5, 's0 (padded by 10 m)');
  near(got[0].s1, 510, 2.5, 's1 (padded by 10 m)');
});

test('a ridge gets a tunnel', () => {
  const r = flatLine();
  const got = structuresFor(r, ground([300, 450, 20]), {});
  assert.deepEqual(got.map((s) => s.kind), ['tunnel']);
  near(got[0].s0, 290, 2.5); near(got[0].s1, 460, 2.5);
});

test('short dips get neither', () => {
  const r = flatLine();
  // 30 m of a deep valley (under 40), 50 m of a high ridge (under 60), and a long shallow dip and rise (under 8 and 12)
  assert.deepEqual(structuresFor(r, ground([200, 230, -20], [500, 550, 30], [600, 800, -7], [820, 990, 11]), {}), []);
});

test('sections are padded and merged, and kept off the ends', () => {
  const r = flatLine();
  // two valleys 15 m apart: their padding overlaps, so one viaduct
  const got = structuresFor(r, ground([300, 360, -12], [375, 450, -12]), {});
  assert.equal(got.length, 1);
  near(got[0].s0, 290, 2.5); near(got[0].s1, 460, 2.5);
  // a valley right up to the start: nothing within `ends` of either end
  const off = structuresFor(r, ground([0, 200, -12]), { ends: 125 });
  assert.equal(off.length, 1);
  near(off[0].s0, 125, 0.01); near(off[0].s1, 210, 2.5);
  // and never past the route's ends
  const all = structuresFor(r, ground([0, 1000, -12]), {});
  near(all[0].s0, 0, 0.01); near(all[0].s1, r.length, 0.01);
});

test('forced sections win', () => {
  const r = flatLine();
  const nat = ground([400, 500, -15], [700, 800, 20]);
  // a forced trestle over the valley replaces the viaduct; one over half the tunnel clips it
  const got = structuresFor(r, nat, { forced: [{ kind: 'trestle', s0: 380, s1: 520 }, { kind: 'guideway', s0: 650, s1: 740 }] });
  assert.deepEqual(got.map((s) => [s.kind, Math.round(s.s0), Math.round(s.s1)]), [
    ['trestle', 380, 520], ['guideway', 650, 740], ['tunnel', 740, Math.round(got[2].s1)],
  ]);
  near(got[2].s1, 810, 2.5);
  // forced sections stand even where the ground would not ask for anything, and are given in order
  const plain = structuresFor(r, ground(), { forced: [{ kind: 'viaduct', s0: 600, s1: 700 }, { kind: 'trestle', s0: 100, s1: 160 }] });
  assert.deepEqual(plain.map((s) => s.kind), ['trestle', 'viaduct']);
});

test('sectionAt finds the section a distance lies in', () => {
  const secs = [{ kind: 'tunnel', s0: 100, s1: 200 }, { kind: 'viaduct', s0: 300, s1: 400 }];
  assert.equal(sectionAt(secs, 150).kind, 'tunnel');
  assert.equal(sectionAt(secs, 350).kind, 'viaduct');
  assert.equal(sectionAt(secs, 250), null);
  assert.equal(sectionAt(undefined, 250), null);
});

test('how deep into a tunnel a distance is: from its nearer portal, 0 outside one', () => {
  const secs = [{ kind: 'viaduct', s0: 50, s1: 90 }, { kind: 'tunnel', s0: 100, s1: 200 }];
  assert.equal(tunnelDepth(secs, 60), 0);
  assert.equal(tunnelDepth(secs, 99), 0);
  assert.equal(tunnelDepth(secs, 110), 10);
  assert.equal(tunnelDepth(secs, 185), 15);
  assert.equal(tunnelDepth(undefined, 150), 0);
});

test('terrain stays natural over a tunnel and the bed resumes past its portals', () => {
  const r = flatLine();
  // a hill 40 m above the line over x 300..600
  const hill = { kind: 'ridge', leg: 'l', s0: 250, s1: 650, rise: 40, half: 40, fade: 80, ease: 60 };
  const bare = makeTerrain({ routes: [r], legs: { l: r }, features: [hill], base: 8, seed: 3 });
  r.sections = structuresFor(r, bare.natural, {});
  assert.deepEqual(r.sections.map((s) => s.kind), ['tunnel']);
  const t = makeTerrain({ routes: [r], legs: { l: r }, features: [hill], base: 8, seed: 3 });
  const [tn] = r.sections;
  // over the tunnel (well inside its portals) the ground is the land, at every lateral offset
  for (let s = tn.s0 + 40; s <= tn.s1 - 40; s += 20) {
    for (const d of [-6, 0, 6]) { const p = r.offsetAt(s, d); near(t.heightAt(p.x, p.z), t.natural(p.x, p.z), 1e-9, `s=${s} d=${d}`); }
    const p = r.at(s);
    assert.ok(t.heightAt(p.x, p.z) >= p.y + TUBE_TOP + 1, `ground over the tube at s=${s}`);
  }
  // past each portal the bed is back
  for (const s of [tn.s0 - 3, tn.s0 - 20, tn.s1 + 3, tn.s1 + 20]) {
    for (const d of [-4, 0, 4]) { const p = r.offsetAt(s, d); near(t.heightAt(p.x, p.z), r.at(s).y - BED_DROP, 0.01, `s=${s} d=${d}`); }
  }
  // just inside a portal the ground clears the tube's roof
  for (const s of [tn.s0 + 1, tn.s1 - 1]) { const p = r.at(s); assert.ok(t.heightAt(p.x, p.z) >= p.y + TUBE_TOP + 1, `just inside, s=${s}`); }
  // the mouth: once the tunnel's structures stand, a ground cell straddling each portal over the bore is left out of the
  // mesh (and the chunks round the portals are built again); one beside it and one wholly outside are not. Until then,
  // and once they are gone again, the hillside keeps every cell.
  const mouth = (s, d) => { const p = r.offsetAt(s, d); return t.holeCell(p.x - 2, p.z - 2, 4); };
  t.takeDirty();
  assert.ok(!mouth(tn.s0, 0) && !mouth(tn.s1, 0), 'no portal built: no hole');
  { const p = r.at(tn.s0); assert.ok(t.holeCell(p.x - 2, p.z - 2, 4, r), 'asked of the route itself: the cell its portal will fill'); }
  t.addStructures(r);
  assert.ok(mouth(tn.s0, 0) && mouth(tn.s1, 0), 'cells across the portals');
  assert.ok(!mouth(tn.s0 - 10, 0) && !mouth(tn.s0 + 10, 0) && !mouth(tn.s0, 25), 'cells off the portals');
  const p0 = r.at(tn.s0), key = `c:${Math.floor(p0.x / 256)},${Math.floor(p0.z / 256)}`;
  assert.ok(t.takeDirty().has(key), 'the portal\'s chunk is built again');
  t.removeStructures(r);
  assert.ok(!mouth(tn.s0, 0), 'taken away again');
  assert.ok(t.takeDirty().has(key));
  // a chunk's skirt never hangs into the bore
  const mid = r.at((tn.s0 + tn.s1) / 2);
  assert.ok(t.skirtFloor(mid.x, mid.z) >= mid.y + TUBE_TOP, 'skirt floor over the tube');
  assert.equal(t.skirtFloor(mid.x, mid.z + 200), -Infinity);
});

test('ground under a viaduct is the land, held clear of the deck, and the bed resumes past its ends', () => {
  const r = flatLine();
  const dip = { kind: 'valley', x0: 450, z0: -300, x1: 450, z1: 300, floor: 1, half: 40, fade: 40, ease: 50 };
  const bare = makeTerrain({ routes: [r], features: [dip], base: 8, seed: 3 });
  r.sections = structuresFor(r, bare.natural, {});
  assert.deepEqual(r.sections.map((s) => s.kind), ['viaduct']);
  const t = makeTerrain({ routes: [r], features: [dip], base: 8, seed: 3 });
  const [v] = r.sections;
  for (let s = v.s0 + 30; s <= v.s1 - 30; s += 10) for (const d of [-6, 0, 6]) {
    const p = r.offsetAt(s, d);
    near(t.heightAt(p.x, p.z), Math.min(t.natural(p.x, p.z), 10 - 2.5), 1e-9, `s=${s} d=${d}`);
  }
  for (const s of [v.s0 - 3, v.s1 + 3]) { const p = r.at(s); near(t.heightAt(p.x, p.z), 10 - BED_DROP, 0.01, `s=${s}`); }
  // under the deck, the ground never comes up to it
  for (let s = v.s0; s <= v.s1; s += 1) { const p = r.at(s); assert.ok(t.heightAt(p.x, p.z) <= 10 - BED_DROP + 1e-9, `s=${s}`); }
  // the valley holds its floor and leaves the land alone far from it
  near(bare.natural(450, 150), 1, 0.01);
  near(bare.natural(450, 900), makeTerrain({ base: 8, seed: 3 }).natural(450, 900), 1e-9);
});

// ---- the world's sections ----
const legIds = Object.keys(LEGS);
worldTerrain();   // works out every leg's sections

test("Phase 1's line has no structures", () => {
  assert.deepEqual(legRoute('city-ocean').sections, []);
});

test('each leg has the structures its scenery calls for', () => {
  const kinds = (id) => legRoute(id).sections.map((s) => s.kind);
  assert.ok(kinds('ocean-mountain').includes('tunnel') && kinds('ocean-mountain').includes('viaduct'), kinds('ocean-mountain').join());
  // the tunnel bursts straight out onto the viaduct
  const om = legRoute('ocean-mountain').sections, ti = om.findIndex((s) => s.kind === 'tunnel');
  assert.equal(om[ti + 1]?.kind, 'viaduct');
  assert.ok(om[ti + 1].s0 - om[ti].s1 <= 40, `${(om[ti + 1].s0 - om[ti].s1).toFixed(0)} m between the tunnel and the viaduct`);
  assert.ok(kinds('mountain-west').includes('trestle'), kinds('mountain-west').join());
  const gw = legRoute('west-future').sections.filter((s) => s.kind === 'guideway');
  assert.ok(gw.reduce((a, s) => a + s.s1 - s.s0, 0) >= 1500, 'a long guideway across the desert');
  assert.ok(kinds('future-city').includes('viaduct'), kinds('future-city').join());
});

test('sections are in order, apart, on the line and off the platforms', () => {
  for (const id of legIds) {
    const r = legRoute(id), secs = r.sections;
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i];
      assert.ok(['viaduct', 'tunnel', 'trestle', 'guideway'].includes(s.kind), `${id}: ${s.kind}`);
      assert.ok(s.s0 >= 125 && s.s1 <= r.length - 125 && s.s1 > s.s0, `${id} ${s.kind} ${s.s0.toFixed(0)}..${s.s1.toFixed(0)}`);
      if (i) assert.ok(s.s0 >= secs[i - 1].s1, `${id}: sections overlap at ${s.s0.toFixed(0)}`);
    }
  }
});

test('every tunnel is buried and every bridge stands clear of its ground', () => {
  const t = worldTerrain();
  for (const id of legIds) {
    const r = legRoute(id);
    for (const sec of r.sections) for (let s = sec.s0 + 0.5; s <= sec.s1 - 0.5; s += 4) {
      const p = r.at(s);
      for (const d of [-5, -2.5, 0, 2.5, 5]) {
        const q = r.offsetAt(s, d), h = t.heightAt(q.x, q.z);
        if (sec.kind === 'tunnel') assert.ok(h >= p.y + TUBE_TOP + 0.5, `${id} tunnel s=${s.toFixed(0)} d=${d}: ground ${(h - p.y).toFixed(1)} m above the line`);
        else assert.ok(h <= p.y - BED_DROP + 1e-6, `${id} ${sec.kind} s=${s.toFixed(0)} d=${d}: ground ${(h - p.y).toFixed(2)} m`);
      }
    }
  }
});
