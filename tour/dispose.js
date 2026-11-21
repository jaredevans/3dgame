// Letting go of things taken out of the scene: the GPU's copies of their geometries, materials and textures, a skinned
// figure's bone texture and an InstancedMesh's instance buffers, all freed (three.js keeps them until told), except
// those something still in the scene draws with: a kit's part copies share them, and freeing one in use would have it
// uploaded and compiled again on the next frame. Pure: it needs only traverse(), each mesh's geometry and material (or
// materials), the textures on a material (its properties, or a shader material's uniforms) and a skinned mesh's
// skeleton.

const texturesOf = (m) => {
  const out = [];
  for (const v of Object.values(m)) if (v?.isTexture) out.push(v);
  for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) out.push(u.value);
  return out;
};

function resourcesOf(roots) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), instanced = [];
  for (const root of roots) root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) { materials.add(m); for (const t of texturesOf(m)) textures.add(t); }
    if (o.isInstancedMesh) instanced.push(o);
    if (o.skeleton) skeletons.add(o.skeleton);   // a skinned figure's bone texture
  });
  return { geometries, materials, textures, skeletons, instanced };
}

// take roots out of the scene and free what they alone used; keep: the scene (what's still drawn)
export function release(roots, keep) {
  for (const r of roots) r.removeFromParent();
  const mine = resourcesOf(roots), live = resourcesOf(keep ? [keep] : []);
  for (const kind of ['geometries', 'materials', 'textures', 'skeletons']) for (const x of mine[kind]) if (!live[kind].has(x)) x.dispose();
  for (const im of mine.instanced) im.dispose();
}
