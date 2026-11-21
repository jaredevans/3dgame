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

test('single parts load from the parts folder beside the kits, then Polyfork\'s public CDN', async () => {
  const { resolvePartBases, PUBLIC_CDN } = await import('../config.js');
  assert.deepEqual(resolvePartBases(''), ['./kits/parts/', PUBLIC_CDN]);
  assert.deepEqual(resolvePartBases('?kits=https://example.test/k'), ['https://example.test/k/parts/', PUBLIC_CDN]);
});

test('an account CDN link, when there is one, comes first, then the parts folder and the public CDN', async () => {
  const { resolvePartBases, PUBLIC_CDN } = await import('../config.js');
  assert.deepEqual(resolvePartBases('', { accountCdn: 'https://polyfork.dev/c/abc' }),
    ['https://polyfork.dev/c/abc/', './kits/parts/', PUBLIC_CDN]);
  assert.deepEqual(resolvePartBases('?cdn=https://mirror.test/x', { accountCdn: 'https://polyfork.dev/c/abc/' }),
    ['https://mirror.test/x/'], '?cdn= still means that address only');
});

test('?cdn= loads single parts from there only, with a trailing slash', async () => {
  const { resolvePartBases } = await import('../config.js');
  assert.deepEqual(resolvePartBases('?debug&cdn=https://blocked.invalid/cdn'), ['https://blocked.invalid/cdn/']);
});
