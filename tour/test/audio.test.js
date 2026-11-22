// The sound's one piece of logic Node can reach (audio.js): quiet while the tab is hidden. A stand-in AudioContext
// records what it's told.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const calls = [], made = [];
globalThis.AudioContext = class {
  constructor() { this.state = 'running'; made.push(this); }
  suspend() { calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  resume() { calls.push('resume'); this.state = 'running'; return Promise.resolve(); }
};
const { hideSound, sound } = await import('../audio.js');

test('the sound is suspended while the tab is hidden and resumed when it\'s shown, and only what it suspended', () => {
  hideSound(true);   // nothing made yet: nothing to do (and no context made for it)
  assert.deepEqual(calls, []);
  sound('none');     // (the first sound makes the context)
  hideSound(true);
  assert.deepEqual(calls, ['suspend']);
  hideSound(true);   // (already)
  hideSound(false);
  assert.deepEqual(calls, ['suspend', 'resume']);
  hideSound(false);
  assert.deepEqual(calls, ['suspend', 'resume'], 'resumed twice');
  // suspended by the browser (waiting for a first click), not by being hidden: shown again, it's left to the click
  assert.equal(made.length, 1, 'one context');
  made[0].state = 'suspended';
  hideSound(true);
  hideSound(false);
  assert.deepEqual(calls, ['suspend', 'resume'], 'resumed what the browser held');
});
