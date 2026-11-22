import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeFor, KEY_CODES, REPEATS } from '../touch.js';

test('every key the tour page shows can be tapped: each <kbd> label has a key code', () => {
  const html = readFileSync(new URL('../../tour.html', import.meta.url), 'utf8');
  const labels = [...html.matchAll(/<kbd>(.*?)<\/kbd>/g)].map((m) => m[1]);
  assert.ok(labels.length > 15);
  for (const l of labels) assert.ok(codeFor(l), `no key for <kbd>${l}</kbd>`);
});

test('the labels map to the codes main.js reads', () => {
  assert.equal(codeFor('W'), 'KeyW');
  assert.equal(codeFor(' ↑ '), 'ArrowUp');
  assert.equal(codeFor('Space'), 'Space');
  assert.equal(codeFor('Shift'), 'ShiftLeft');
  assert.equal(codeFor('Esc'), 'Escape');
  assert.equal(codeFor('3'), 'Digit3');
  assert.equal(codeFor(5), 'Digit5', 'a teleport list number');
  assert.equal(codeFor('nothing'), null);
  assert.equal(codeFor(undefined), null);
});

test('only the keys counted per keydown repeat while held', () => {
  for (const c of REPEATS) assert.ok(Object.values(KEY_CODES).includes(c));
  assert.ok(REPEATS.has('KeyW') && !REPEATS.has('KeyE') && !REPEATS.has('Space'));
});

test('K, shown in the panel to hide the HUD, can be tapped too', () => {
  assert.equal(codeFor('K'), 'KeyK');
});
