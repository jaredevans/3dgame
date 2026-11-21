import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKeys } from '../keys.js';

test('boarding ignores keys already held', () => {
  const keys = makeKeys();
  keys.down('KeyW');                       // walking up to the train
  assert.equal(keys.has('KeyW'), true);
  keys.ignoreHeld();                       // board: W is still down
  assert.equal(keys.has('KeyW'), false);
  assert.equal(keys.ignored('KeyW'), true, 'its auto-repeat is not a throttle step');
  keys.down('KeyW');                       // auto-repeat while still held
  assert.equal(keys.has('KeyW'), false);
  keys.up('KeyW');
  keys.down('KeyW');                       // a fresh press counts
  assert.equal(keys.ignored('KeyW'), false);
  assert.equal(keys.has('KeyW'), true);
});

test('keys pressed after boarding count, and blur lets go of everything', () => {
  const keys = makeKeys();
  keys.down('KeyW'); keys.ignoreHeld();
  keys.down('Space');
  assert.equal(keys.has('Space'), true);
  keys.clear();
  assert.equal(keys.has('Space'), false);
  keys.down('KeyW');
  assert.equal(keys.has('KeyW'), true);
});
