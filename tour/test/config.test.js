import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKitBase, kitUrl, loadError } from '../config.js';

test('KIT_BASE defaults to ./kits/', () => {
  assert.equal(resolveKitBase(''), './kits/');
});

test('KIT_BASE takes ?kits= and adds a trailing slash', () => {
  assert.equal(resolveKitBase('?kits=https://example.test/k'), 'https://example.test/k/');
  assert.equal(resolveKitBase('?kits=https://example.test/k/'), 'https://example.test/k/');
});

test('kitUrl joins base, kit and file', () => {
  assert.equal(kitUrl('coast-and-boardwalk-d883fd', 'kit.mjs', './kits/'), './kits/coast-and-boardwalk-d883fd/kit.mjs');
});

test('loadError names the URL', () => {
  const msg = loadError('./kits/x/y.mjs', new Error('404'));
  assert.match(msg, /Could not load/);
  assert.ok(msg.includes('./kits/x/y.mjs'));
});
