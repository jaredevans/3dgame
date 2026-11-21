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
