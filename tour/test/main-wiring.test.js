// Wiring in main.js that no unit test reaches otherwise (it's a page module, not importable in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

// the frame ticks each place with the THREE.Clock's elapsed time: its walkers walk and its figures' mixers run on it.
// A local of the same name in the frame (as the stall clock's frame time once was) hands them undefined, and they stop
// (NaN) without a word
test('main.js has one `clock`, the THREE.Clock the places are ticked with', () => {
  const decls = src.match(/\b(?:const|let|var)\s+clock\b/g) ?? [];
  assert.equal(decls.length, 1, `declared ${decls.length} times`);
  assert.match(src, /const clock = new THREE\.Clock\(\)/);
  assert.match(src, /p\.tick\(clock\.elapsedTime\)/);
});
