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
