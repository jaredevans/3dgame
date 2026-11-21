import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStreamer } from '../streamer.js';

// a builder that records what it made and what was let go
const recorder = () => {
  const log = [];
  const build = (id) => async () => { log.push(`+${id}`); return { dispose() { log.push(`-${id}`); } }; };
  return { log, build };
};

test('builders can be a function of the id', async () => {
  const { log, build } = recorder();
  const s = makeStreamer((id) => (id.startsWith('c:') ? build(id) : undefined));
  await s.want(new Set(['c:0,0:4', 'nope']));
  assert.ok(s.has('c:0,0:4'));
  assert.ok(!s.has('nope'));
  assert.deepEqual(s.ids, ['c:0,0:4']);
  assert.deepEqual(log, ['+c:0,0:4']);
});

test('a thing stands in for its replacement until the replacement is in', async () => {
  const { log, build } = recorder();
  let gate = null;
  const held = (id) => async () => { await new Promise((r) => { gate = r; }); return build(id)(); };
  const s = makeStreamer((id) => (id.endsWith(':4') ? held(id) : build(id)), { standIn: (id) => id.slice(0, id.lastIndexOf(':')) });
  await s.want(new Set(['c:0,0:16', 'c:1,0:16']));
  // c:0,0 goes fine; c:1,0 goes out of range altogether
  const p = s.want(new Set(['c:0,0:4']));
  await null; await null;
  assert.ok(s.has('c:0,0:16'), 'the coarse one stays while the fine one builds');
  assert.ok(!s.has('c:1,0:16'), 'what nothing replaces goes at once');
  gate();
  await p;
  assert.ok(s.has('c:0,0:4'));
  assert.ok(!s.has('c:0,0:16'), 'and goes once its replacement is in');
  assert.deepEqual(log, ['+c:0,0:16', '+c:1,0:16', '-c:1,0:16', '+c:0,0:4', '-c:0,0:16']);
});

test('redo rebuilds a live thing, letting the old one go once the new one is in', async () => {
  let n = 0;
  const log = [];
  const s = makeStreamer(() => async () => { const me = ++n; log.push(`+${me}`); return { me, dispose() { log.push(`-${me}`); } }; });
  await s.want(new Set(['a']));
  assert.equal(s.get('a').me, 1);
  await s.redo(['a', 'not-live']);
  assert.equal(s.get('a').me, 2);
  assert.deepEqual(log, ['+1', '+2', '-1']);
  assert.ok(!s.has('not-live'));
});
