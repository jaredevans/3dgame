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
  assert.equal(kitUrl('coast-and-boardwalk-d883fd', 'kit.mjs', './kits/', null), './kits/coast-and-boardwalk-d883fd/kit.mjs');
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

test('the kits come from the account CDN only when asked (local.js kits: cdn, or ?kits=cdn) and there is a link', async () => {
  const { resolveKitCdn } = await import('../config.js');
  const acct = { accountCdn: 'https://polyfork.dev/c/abc' };
  assert.equal(resolveKitCdn('', acct), null, 'a link alone keeps the folder');
  assert.equal(resolveKitCdn('', { ...acct, kits: 'cdn' }), 'https://polyfork.dev/c/abc/');
  assert.equal(resolveKitCdn('?kits=cdn', acct), 'https://polyfork.dev/c/abc/');
  assert.equal(resolveKitCdn('?kits=https://example.test/k', { ...acct, kits: 'cdn' }), null, '?kits=<url> means that folder');
  assert.equal(resolveKitCdn('?kits=cdn', {}), null, 'no link: the folder');
});

test('built from the CDN, a kit\'s files are where the CDN serves them: shared modules, its layout, its parts by id', async () => {
  const { kitUrl } = await import('../config.js');
  const cdn = 'https://polyfork.dev/c/abc/', ids = { 'k-1': { 'tunnel-portal': 'tunnel-portal-4ac9f3' } };
  assert.equal(kitUrl('k-1', 'stage.mjs', './kits/', cdn, ids), `${cdn}stage.mjs`);
  assert.equal(kitUrl('k-1', 'kit.mjs', './kits/', cdn, ids), `${cdn}kit.mjs`);
  assert.equal(kitUrl('k-1', 'LAYOUT.json', './kits/', cdn, ids), `${cdn}kit-k-1-layout.json`);
  assert.equal(kitUrl('k-1', 'tunnel-portal.mjs', './kits/', cdn, ids), `${cdn}tunnel-portal-4ac9f3.mjs`);
  assert.throws(() => kitUrl('k-1', 'nothing-here.mjs', './kits/', cdn, ids), /k-1 has no nothing-here\.mjs/);
  assert.equal(kitUrl('k-1', 'tunnel-portal.mjs', './kits/', null, ids), './kits/k-1/tunnel-portal.mjs', 'no CDN: the folder');
});

test('a load error never shows the account link', () => {
  const msg = loadError('https://polyfork.dev/c/abc123/stage.mjs', new Error('404'));
  assert.ok(!msg.includes('abc123'));
  assert.match(msg, /<account CDN>\/stage\.mjs/);
});

test('every kit has its parts in the key-to-id table, and (where the kits are here) all of them', async () => {
  const { KITS } = await import('../config.js');
  const { KIT_IDS } = await import('../kit-ids.js');
  const { existsSync, readFileSync } = await import('node:fs');
  for (const kit of Object.values(KITS)) {
    assert.ok(Object.keys(KIT_IDS[kit] ?? {}).length > 40, `${kit} is in the table`);
    for (const id of Object.values(KIT_IDS[kit])) assert.match(id, /^[a-z0-9-]+-[0-9a-f]{6}$/);
    const parts = new URL(`../../kits/${kit}/PARTS.json`, import.meta.url);
    if (!existsSync(parts)) continue;
    const keys = Object.keys(JSON.parse(readFileSync(parts, 'utf8'))).filter((k) => k !== 'terrain');
    assert.deepEqual(Object.keys(KIT_IDS[kit]).sort(), keys.sort(), `${kit}: run node scripts/kit-ids.mjs`);
  }
});
