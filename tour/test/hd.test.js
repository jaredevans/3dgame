// HD editions: which of the trains' cars has one, and whether the tour uses them (hd-switch.js, pure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIN_SPECS, HD_EDITIONS } from '../trains/specs.js';
import { isAccountCdn, hdOn, hdCarUrl } from '../hd-switch.js';

const ACCOUNT = 'https://polyfork.dev/c/tok123/';
const bases = (first) => [first, './kits/parts/', 'https://polyfork.dev/cdn/'];

test('each kit car with an HD edition names its catalogue asset; the diesel and the Silver Arrow have none', () => {
  assert.deepEqual(HD_EDITIONS, {
    'passenger-carriage': 'passenger-carriage-de9d58',
    'brake-coach': 'brake-coach-f83456',
    'coal-tender': 'coal-tender-0e3647',
    'tank-locomotive': 'tank-steam-locomotive-314bb1',
    'tender-locomotive': 'tender-steam-locomotive-8e2a82',
    'guideway-rail-shuttle': 'guideway-rail-shuttle-3d67d7',
  });
  assert.equal(HD_EDITIONS['mainline-diesel'], undefined);
  assert.equal(TRAIN_SPECS.westFuture.cars, undefined, 'the Silver Arrow is built in code');
  // every car of the HD trains has one: the Highland Climber, the Canyon Express and the Metro Glide are HD throughout
  for (const id of ['oceanMountain', 'mountainWest', 'futureCity']) {
    for (const [key] of TRAIN_SPECS[id].cars) assert.ok(HD_EDITIONS[key], `${TRAIN_SPECS[id].name}: ${key}`);
  }
  // the Seaside Excursion's coaches are; its diesel stays flat
  assert.deepEqual(TRAIN_SPECS.cityOcean.cars.map(([key]) => !!HD_EDITIONS[key]), [false, true, true, true]);
});

test('an account CDN link is told by its /c/<token>/ path', () => {
  assert.equal(isAccountCdn(ACCOUNT), true);
  assert.equal(isAccountCdn('https://polyfork.dev/cdn/'), false, "Polyfork's public CDN");
  assert.equal(isAccountCdn('./kits/parts/'), false);
  assert.equal(isAccountCdn('http://127.0.0.1:8765/kits/parts/'), false);
  assert.equal(isAccountCdn('https://mirror.test/c/'), false, 'no token');
  assert.equal(isAccountCdn(undefined), false);
});

test('HD is on when the first part base is the account CDN, and ?hd=0 turns it off', () => {
  assert.equal(hdOn('', bases(ACCOUNT)), true);
  assert.equal(hdOn('?debug', bases(ACCOUNT)), true);
  assert.equal(hdOn('?debug&hd=1', bases(ACCOUNT)), true);
  assert.equal(hdOn('?hd=0', bases(ACCOUNT)), false);
  assert.equal(hdOn('?debug&hd=0', bases(ACCOUNT)), false);
  assert.equal(hdOn('?hd=off', bases(ACCOUNT)), false);
  // no tour/local.js: the parts folder comes first
  assert.equal(hdOn('', ['./kits/parts/', 'https://polyfork.dev/cdn/']), false);
  // ?cdn= replaces every base with that address
  assert.equal(hdOn('?cdn=https://mirror.test/x', ['https://mirror.test/x/']), false);
  assert.equal(hdOn('', []), false);
});

test("a car's HD module is <account CDN><asset id>-hd.mjs, only while HD is on and only for a car that has one", () => {
  assert.equal(hdCarUrl('passenger-carriage', { on: true, bases: bases(ACCOUNT) }), `${ACCOUNT}passenger-carriage-de9d58-hd.mjs`);
  assert.equal(hdCarUrl('guideway-rail-shuttle', { on: true, bases: bases(ACCOUNT) }), `${ACCOUNT}guideway-rail-shuttle-3d67d7-hd.mjs`);
  assert.equal(hdCarUrl('mainline-diesel', { on: true, bases: bases(ACCOUNT) }), null);
  assert.equal(hdCarUrl('passenger-carriage', { on: false, bases: bases(ACCOUNT) }), null);
  // on, but the first base isn't the account's (it is never built from another base)
  assert.equal(hdCarUrl('passenger-carriage', { on: true, bases: bases('./kits/parts/') }), null);
});

test("an animal's zones are its colour knobs' defaults, for the zones its -params.json says what they're made of", async () => {
  const { animalDress } = await import('../hd-switch.js');
  const params = {
    coat: { type: 'color', default: '#b88a53' }, hoof: { type: 'color', default: '#493321' },
    eye: { type: 'color', default: '#211b12' }, withers: { type: 'range', default: 1.2 },
  };
  const materials = { coat: { kind: 'fur', finish: 'short' }, hoof: { kind: 'keratin', finish: 'natural' } };
  assert.deepEqual(animalDress({ params, materials }), {
    zones: { coat: '#b88a53', hoof: '#493321' }, materials,
  }, 'eye has no material named: left out');
  // none named (the wild horse): guessed from the knobs, if a guesser is given
  const guess = (p) => Object.fromEntries(Object.keys(p).filter((k) => p[k].type === 'color').map((k) => [k, { kind: 'fur', guessed: true }]));
  assert.deepEqual(animalDress({ params }, guess).zones, { coat: '#b88a53', hoof: '#493321', eye: '#211b12' });
  assert.equal(animalDress({ params }), null, 'nothing to dress it with');
  assert.equal(animalDress(null), null);
  assert.equal(animalDress({ params: { withers: { type: 'range' } }, materials: {} }), null);
});

test("the HD materials' environment follows the daylight: full by day, dim at night and in a tunnel", async () => {
  const { envLevel } = await import('../hd-switch.js');
  const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ± ${tol}, got ${a}`);
  // stage()'s hemisphere light (its strength and its sky colour, linear): by day 0.92 white, at night 0.7 deep blue
  near(envLevel(0.92, { r: 1, g: 1, b: 1 }), 1, 0.001, 'day');
  const night = envLevel(0.7, { r: 0.0865, g: 0.1274, b: 0.3419 });
  assert.ok(night > 0.05 && night < 0.15, `night ${night}`);
  near(envLevel(0.92 * 0.15, { r: 1, g: 1, b: 1 }), 0.15, 0.001, 'dimmed 85% in a tunnel');
  assert.equal(envLevel(0, { r: 1, g: 1, b: 1 }), 0);
  assert.ok(envLevel(5, { r: 1, g: 1, b: 1 }) <= 1.2, 'never far over day');
  assert.equal(envLevel(0.9123, { r: 1, g: 1, b: 1 }), 0.99, 'in steps of 1%: written only as it changes');
});

// the materials engine makes each kind of surface's maps on first use (a coat's fur takes ~75 ms): the HD animals' are
// made at boot, behind the loading screen, so no actor's build stalls a frame on them. That needs every animal the
// actors load named here
test('every animal the actors load is one whose HD maps are made at boot', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { HD_ANIMALS } = await import('../hd-switch.js');
  const dir = new URL('../actors/', import.meta.url);
  const loaded = new Set();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/loadAnimal\('([^']+)'\)/g)) loaded.add(m[1]);
  }
  assert.ok(loaded.size >= 4, `found ${[...loaded]}`);
  for (const id of loaded) assert.ok(HD_ANIMALS.includes(id), `${id} is not in HD_ANIMALS`);
});

// an HD load from the account CDN that hangs (the host never answers) must not stall a build for ever: it's given up on
// after a while and the flat model is built instead
test('withTimeout settles with the promise, or rejects once the time is up (marked as a timeout)', async () => {
  const { withTimeout } = await import('../hd-switch.js');
  assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('404')), 50), /404/);
  const hung = new Promise(() => {});
  const t0 = Date.now();
  await assert.rejects(withTimeout(hung, 30, 'the coach'), (err) => err.timeout === true && /the coach/.test(err.message) && /30 ms/.test(err.message));
  assert.ok(Date.now() - t0 < 1000);
  // a late answer after the time is up changes nothing (no unhandled rejection either)
  let late;
  const slow = new Promise((r, j) => { late = j; });
  await assert.rejects(withTimeout(slow, 10), (err) => err.timeout === true);
  late(new Error('too late'));
  await new Promise((r) => setTimeout(r, 5));
});

test("the account CDN's link is masked in messages", async () => {
  const { maskAccount } = await import('../hd-switch.js');
  assert.equal(maskAccount('https://polyfork.dev/c/abc123/deer-base.glb isn\'t self-hosted'), "<account CDN>/deer-base.glb isn't self-hosted");
  assert.equal(maskAccount('failed: http://10.255.255.1/c/x/a-hd.mjs and https://polyfork.dev/c/y/b.mjs'), 'failed: <account CDN>/a-hd.mjs and <account CDN>/b.mjs');
  assert.equal(maskAccount('./kits/parts/deer-base.glb from https://polyfork.dev/cdn/deer-base.glb'), './kits/parts/deer-base.glb from https://polyfork.dev/cdn/deer-base.glb');
});
