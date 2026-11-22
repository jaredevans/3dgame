// Loading kit modules (parts.js): a load that hangs can be given up on, and the next try fetches afresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeModules } from '../parts.js';

const settle = () => new Promise((r) => setTimeout(r, 0));

// an import that hangs: the browser keeps it pending, and so would a cache of its promise, so a retry would wait on the
// same hung import for ever. Given up on (the build it was for stalled), it's forgotten, and the next load imports a
// fresh URL (a query on it: the browser's own module map holds the hung one by its URL)
test('a hung import, once forgotten, is fetched afresh on the next load; one that came in is kept', async () => {
  const asked = [], answer = {};
  const modules = makeModules((href) => { asked.push(href); return href in answer ? Promise.resolve(answer[href]) : new Promise(() => {}); });
  answer['http://x/kit/a.mjs'] = 'A';
  assert.equal(await modules.load('http://x/kit/a.mjs'), 'A');
  const hung = modules.load('http://x/kit/b.mjs');
  assert.equal(modules.load('http://x/kit/b.mjs'), hung, 'one import for both while it is pending');
  modules.forgetPending();
  answer['http://x/kit/b.mjs?retry=1'] = 'B';
  assert.equal(modules.href('http://x/kit/b.mjs'), 'http://x/kit/b.mjs?retry=1', 'what a kit given moduleUrl imports now');
  assert.equal(await modules.load('http://x/kit/b.mjs'), 'B');
  assert.equal(await modules.load('http://x/kit/a.mjs'), 'A');
  assert.equal(modules.href('http://x/kit/a.mjs'), 'http://x/kit/a.mjs', 'one that came in keeps its URL');
  assert.deepEqual(asked, ['http://x/kit/a.mjs', 'http://x/kit/b.mjs', 'http://x/kit/b.mjs?retry=1']);
  void hung; await settle();
});

test('a failed import names its URL and is tried again on the next load', async () => {
  let n = 0;
  const modules = makeModules(() => (++n === 1 ? Promise.reject(new Error('404')) : Promise.resolve('ok')));
  await assert.rejects(modules.load('http://x/c.mjs'), (e) => e.url === 'http://x/c.mjs' && /404/.test(e.message));
  assert.equal(await modules.load('http://x/c.mjs'), 'ok');
});

test('firstOf loads from the first base that has the file, saying so when it falls back', async () => {
  const { firstOf } = await import('../parts.js');
  const have = new Set(['https://cdn.test/b.mjs', './kits/parts/a.mjs']);
  const load = async (url) => { if (!have.has(url)) throw new Error(`404 ${url}`); return url; };
  const said = [];
  const bases = ['./kits/parts/', 'https://cdn.test/'];
  assert.equal(await firstOf(bases, 'a.mjs', load, (...a) => said.push(a)), './kits/parts/a.mjs');
  assert.deepEqual(said, [], 'found where wanted: nothing said');
  assert.equal(await firstOf(bases, 'b.mjs', load, (...a) => said.push(a)), 'https://cdn.test/b.mjs');
  assert.deepEqual(said, [['https://cdn.test/b.mjs', './kits/parts/b.mjs']]);
  await assert.rejects(firstOf(bases, 'c.mjs', load), /404 https:\/\/cdn\.test\/c\.mjs/, 'none has it: the last error');
});

// a part taken from a later base is said once; the base it wanted first may be the owner's account CDN, whose link is
// never printed
test("a part that fell back is said once, the account CDN's link masked", async () => {
  const { fellBack } = await import('../parts.js');
  const said = [], warn = console.warn;
  console.warn = (...a) => said.push(a.join(' '));
  try {
    fellBack('http://x/kits/parts/a-1.glb', 'https://polyfork.dev/c/tok999/a-1.glb');
    fellBack('http://x/kits/parts/a-1.glb', 'https://polyfork.dev/c/tok999/a-1.glb');
  } finally { console.warn = warn; }
  assert.equal(said.length, 1);
  assert.ok(!said[0].includes('tok999'), said[0]);
  assert.match(said[0], /<account CDN>\/a-1\.glb/);
  assert.match(said[0], /http:\/\/x\/kits\/parts\/a-1\.glb/);
});

// the account CDN comes first when it's configured: a host that never answers is given up on after a while and the next
// base tried (said as a fallback), and isn't waited on again; the last base is waited on as long as it takes (a slow
// but working connection still gets its part)
test('firstOf gives up on a hanging base (all but the last) and falls through; the last base may take its time', async () => {
  const { firstOf } = await import('../parts.js');
  const asked = [], said = [];
  const never = new Promise(() => {});
  const load = (url) => {
    asked.push(url);
    if (url.startsWith('https://hang.test/')) return never;
    if (url.startsWith('https://slow.test/')) return new Promise((r) => setTimeout(() => r(url), 120));
    return Promise.resolve(url);
  };
  const skip = new Set();
  const t0 = Date.now();
  assert.equal(await firstOf(['https://hang.test/c/t/', './kits/parts/'], 'a.mjs', load, (...a) => said.push(a), { wait: 0.03, skip }), './kits/parts/a.mjs');
  assert.ok(Date.now() - t0 < 500, 'given up on within the limit');
  assert.deepEqual(said, [['./kits/parts/a.mjs', 'https://hang.test/c/t/a.mjs']], 'a timed-out base counts as a fallback');
  // it isn't waited on again: the next part goes straight to the next base
  asked.length = 0;
  const t1 = Date.now();
  assert.equal(await firstOf(['https://hang.test/c/t/', './kits/parts/'], 'b.mjs', load, () => {}, { wait: 0.03, skip }), './kits/parts/b.mjs');
  assert.deepEqual(asked, ['./kits/parts/b.mjs']);
  assert.ok(Date.now() - t1 < 25);
  // the last base has no limit: a slow one still answers
  assert.equal(await firstOf(['https://hang.test/c/t/', 'https://slow.test/'], 'c.mjs', load, () => {}, { wait: 0.03, skip }), 'https://slow.test/c.mjs');
  assert.equal(await firstOf(['https://slow.test/'], 'd.mjs', load, () => {}, { wait: 0.03, skip: new Set() }), 'https://slow.test/d.mjs');
  // a base that's only slow (but not the last) is given up on too, for the next one
  assert.equal(await firstOf(['https://slow.test/', './kits/parts/'], 'e.mjs', load, () => {}, { wait: 0.03, skip: new Set() }), './kits/parts/e.mjs');
});
