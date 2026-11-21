import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStreamer } from '../streamer.js';

test('a build that fails is reported once, named in the result, and not retried', async () => {
  const errors = [];
  let tries = 0;
  const streamer = makeStreamer({
    city: async () => ({ dispose() {} }),
    ocean: async () => { tries++; const e = new Error('404'); e.url = './kits/coast/kit.mjs'; throw e; },
  }, { onError: (e) => errors.push(e.url) });
  const first = await streamer.want(new Set(['city', 'ocean']));
  assert.deepEqual(first.failed, ['ocean']);
  assert.ok(streamer.has('city'));
  assert.ok(streamer.failed('ocean') && !streamer.failed('city'), 'which ids failed can be asked (a train waiting on one says so)');
  // asked again every frame: no second attempt, no second report
  for (let i = 0; i < 5; i++) await streamer.want(new Set(['city', 'ocean']));
  assert.equal(tries, 1);
  assert.deepEqual(errors, ['./kits/coast/kit.mjs']);
});

test('once a load error is showing, later loading text does not cover it', async () => {
  const els = {};
  const el = (id) => (els[id] ??= { id, textContent: '', classList: { set: new Set(), add(c) { this.set.add(c); }, contains(c) { return this.set.has(c); } }, remove() { delete els[id]; } });
  el('loading'); el('loadStep');
  globalThis.document = { getElementById: (id) => els[id] ?? null };
  const { setLoading, showLoadError } = await import('../parts.js');
  showLoadError('Could not load: ./kits/coast/kit.mjs');
  setLoading('shaping the land');
  assert.equal(els.loadStep.textContent, 'Could not load: ./kits/coast/kit.mjs');
  delete globalThis.document;
});
