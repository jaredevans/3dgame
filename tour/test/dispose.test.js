// Letting go of what's taken out of the scene (dispose.js): its geometries, materials and textures are freed, except
// those something still in the scene draws with (a kit's part copies share them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { release } from '../dispose.js';

const res = (kind) => { const r = { kind, disposed: 0, dispose() { r.disposed++; } }; if (kind === 'texture') r.isTexture = true; return r; };
const node = (props = {}, children = []) => {
  const n = { ...props, children, parent: null, traverse(f) { f(n); for (const c of n.children) c.traverse(f); },
    removeFromParent() { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; } };
  for (const c of children) c.parent = n;
  return n;
};

test("frees what only the removed things use, keeps what the scene still draws with, and takes them out", () => {
  const sharedGeo = res('geometry'), sharedMat = res('material'), sharedTex = res('texture');
  const ownGeo = res('geometry'), ownTex = res('texture'), ownMat = Object.assign(res('material'), { map: ownTex, normalMap: sharedTex });
  const uniTex = res('texture'), shaderMat = Object.assign(res('material'), { uniforms: { tex: { value: uniTex }, k: { value: 2 } } });
  const inst = node({ isMesh: true, isInstancedMesh: true, geometry: ownGeo, material: [ownMat, shaderMat] });
  inst.dispose = () => { inst.instancesFreed = true; };
  const bones = res('skeleton'), person = node({ isMesh: true, isSkinnedMesh: true, skeleton: bones });
  const gone = node({}, [node({ isMesh: true, geometry: sharedGeo, material: sharedMat }), inst, person]);
  const live = node({ isMesh: true, geometry: sharedGeo, material: Object.assign(sharedMat, { map: sharedTex }) });
  const scene = node({}, [gone, live]);
  release([gone], scene);
  assert.ok(!scene.children.includes(gone), 'taken out of the scene');
  assert.equal(ownGeo.disposed, 1); assert.equal(ownMat.disposed, 1); assert.equal(shaderMat.disposed, 1);
  assert.equal(ownTex.disposed, 1, 'a texture on a material'); assert.equal(uniTex.disposed, 1, 'a texture in a uniform');
  assert.ok(inst.instancesFreed, "an InstancedMesh's instance buffers");
  assert.equal(bones.disposed, 1, "a skinned figure's bones (their texture)");
  assert.equal(sharedGeo.disposed, 0); assert.equal(sharedMat.disposed, 0); assert.equal(sharedTex.disposed, 0);
});

test('two things let go together that share a resource free it once', () => {
  const geo = res('geometry'), mat = res('material');
  const a = node({ isMesh: true, geometry: geo, material: mat }), b = node({ isMesh: true, geometry: geo, material: mat });
  const scene = node({}, [a, b]);
  release([a, b], scene);
  assert.equal(geo.disposed, 1); assert.equal(mat.disposed, 1);
  assert.equal(scene.children.length, 0);
});

// pulling away lets go of a place, its stations, a leg and a train in one go: they're taken out of the scene at once,
// and freed together later (at a standstill), walking the scene once for all of them, not once each
test('things let go are taken out at once and freed together, the scene walked once', async () => {
  const { makeUnloader } = await import('../dispose.js');
  const geos = [res('geometry'), res('geometry'), res('geometry')];
  const things = geos.map((g) => node({ isMesh: true, geometry: g, material: res('material') }));
  const scene = node({}, [...things]);
  let walks = 0;
  const traverse = scene.traverse;
  scene.traverse = (f) => { walks++; traverse(f); };
  const unload = makeUnloader();
  unload.add(things[0], things[1]); unload.add(things[2]);
  assert.equal(scene.children.length, 0, 'out of the scene at once');
  assert.equal(geos[0].disposed, 0, 'not freed yet');
  assert.equal(unload.pending, 3);
  unload.flush(scene);
  assert.deepEqual(geos.map((g) => g.disposed), [1, 1, 1]);
  assert.equal(walks, 1, 'the scene walked once');
  unload.flush(scene);
  assert.equal(walks, 1, 'nothing to free: not walked');
});
