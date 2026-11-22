import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quietToNonIndexed } from '../three-guards.js';

// Polyfork's part modules call toNonIndexed() on geometry that's already non-indexed, hundreds of times a build, and
// three.js warns each time (then hands back the geometry itself). Guarded, it hands back the same, without the warning;
// an indexed geometry still goes through three's own
test('quietToNonIndexed: a non-indexed geometry comes back as itself without a warning; an indexed one as three makes it', () => {
  let warned = 0, made = 0;
  class Geo {
    constructor(index) { this.index = index; }
    toNonIndexed() {
      if (this.index === null) { warned++; return this; }
      made++; return new Geo(null);
    }
  }
  quietToNonIndexed(Geo.prototype);
  quietToNonIndexed(Geo.prototype);   // twice is once
  const flat = new Geo(null);
  assert.equal(flat.toNonIndexed(), flat);
  assert.equal(warned, 0);
  const indexed = new Geo({ array: [0, 1, 2] });
  const out = indexed.toNonIndexed();
  assert.notEqual(out, indexed);
  assert.equal(out.index, null);
  assert.equal(made, 1);
  // a subclass (ExtrudeGeometry's) takes it from the prototype
  class Extrude extends Geo {}
  const e = new Extrude(null);
  assert.equal(e.toNonIndexed(), e);
  assert.equal(warned, 0);
});

test('main.js guards three\'s toNonIndexed before anything is built', () => {
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ quietToNonIndexed \} from '\.\/three-guards\.js';/);
  const call = src.indexOf('quietToNonIndexed(THREE.BufferGeometry.prototype);'), boot = src.indexOf('async function boot()');
  assert.ok(call > 0 && call < boot, 'not called at the top of main.js');
});
