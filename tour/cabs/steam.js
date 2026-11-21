// A steam cab interior, in the locomotive's own frame (it faces +z; its cab is at the rear, looking forward along the
// boiler). Measured from the Countryside Railway models with rays cast through their shells, as Phase 1 measured the
// diesel (see the report for the profiles):
//  tank-locomotive (the Highland Climber's saddle tank): footplate 1.66; cab between its back sheet (z -3.40..-3.35,
//    the coal bunker behind it) and its spectacle plate (z -1.45..-1.40); roof 3.86 inside, 4.14 outside; side sheets
//    at x ±1.13..1.18, open for the doorway at z -3.05..-2.55 and cut away above 2.94 forward to -2.0; the firebox
//    backhead stands 0.45 m into the cab (to z -1.85) for |x| < 0.55, up to 3.2. Ahead, the boiler (0.6 m round, top
//    3.28) runs into the saddle tank (from z -0.6, 1.18 wide at its sides, 1.0 at 3.3, top 3.7).
//  tender-locomotive (the Canyon Express): footplate 2.04; open at the back (the tender behind, z -5.8); spectacle
//    plate at z -3.30..-3.25; roof 4.10 inside, 4.46 outside; side sheets at x ±1.24..1.28 from z -4.85, cut away above
//    3.0 back of -4.1; backhead to z -3.65 for |x| < 0.9, up to 4.0. Ahead, the boiler is 0.92 m round, top 4.06.
// The driver stands on the left (+x), looking through the spectacle window beside the boiler.
import * as THREE from 'three';

export const STEAM_CABS = {
  tank: {
    zBack: -3.42, zFront: -1.4, floor: 1.66, roof: 3.86, half: 1.15,
    door: [-3.05, -2.55], cut: { y: 2.94, z1: -2.0 },
    backhead: { half: 0.55, top: 3.2, z: -1.85 },
    spectacle: { x0: 0.62, x1: 1.07, y0: 3.0, y1: 3.66 },
    backWall: true,
    eye: [0.98, 3.48, -2.45],
  },
  tender: {
    zBack: -5.8, zFront: -3.25, floor: 2.04, roof: 4.1, half: 1.26,
    door: [-5.8, -4.85], cut: { y: 3.0, z0: -4.85, z1: -4.1 },
    backhead: { half: 0.9, top: 4.0, z: -3.65 },
    // the window opened up to the boiler's side (0.9 at the driver's eye) and nearly to the roof, and the driver standing
    // a little nearer it (still level with the side cut-out), so the line past the boiler fills more of the view (the real
    // plate's window is 0.26 m wide)
    spectacle: { x0: 0.9, x1: 1.2, y0: 3.1, y1: 3.98 },
    backWall: false,
    eye: [1.06, 3.74, -4.45],
  },
};
// which cab each locomotive model has
export const STEAM_MODELS = { 'tank-locomotive': 'tank', 'tender-locomotive': 'tender' };

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const M = {
  sheet: mat('#3b2a24'), inner: mat('#6e5a43'), floor: mat('#3a3631'), roof: mat('#4d4136'),
  black: mat('#1d1d1f', { roughness: 0.6 }), iron: mat('#2b2d30', { metalness: 0.5, roughness: 0.5 }),
  brass: mat('#c2a04f', { metalness: 0.7, roughness: 0.35 }), copper: mat('#b8673a', { metalness: 0.6, roughness: 0.4 }),
  dial: mat('#efeadc'), needle: mat('#b0281a'), glass: mat('#9fc7d8', { transparent: true, opacity: 0.35, roughness: 0.1 }),
  wood: mat('#6b4a2c'), fire: new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff6a10', emissiveIntensity: 2.2 }),
};

function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3)), m);
  b.position.set(x, y, z);
  return b;
}
function cyl(r, len, m, x, y, z, axis = 'y', seg = 16) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  if (axis === 'z') c.rotation.x = Math.PI / 2;
  if (axis === 'x') c.rotation.z = Math.PI / 2;
  c.position.set(x, y, z);
  return c;
}
// a box spanning two corners (x0..x1, y0..y1, z0..z1)
const span = (m, x0, x1, y0, y1, z0, z1) => box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

// a pressure gauge facing back into the cab
function gauge(x, y, z, r = 0.075) {
  const g = new THREE.Group();
  g.add(cyl(r + 0.012, 0.04, M.brass, 0, 0, 0, 'z', 20), cyl(r, 0.045, M.dial, 0, 0, -0.003, 'z', 20));
  const n = box(0.008, r * 0.8, 0.006, M.needle, 0.02, 0.015, -0.03);
  n.rotation.z = -0.7;
  g.add(n);
  g.position.set(x, y, z);
  return g;
}

export function makeSteamCab(model = 'tank') {
  const c = STEAM_CABS[model];
  if (!c) throw new Error(`no steam cab for '${model}'`);
  const g = new THREE.Group();
  g.name = `steam cab (${model})`;
  const t = 0.05, { zBack: zb, zFront: zf, floor: fl, roof: rf, half: hw } = c;

  // floor and roof, the roof a little arched with a spine
  g.add(span(M.floor, -hw, hw, fl - 0.04, fl, zb, zf));
  g.add(span(M.roof, -hw - 0.05, hw + 0.05, rf, rf + t, zb - 0.05, zf + 0.02));
  g.add(span(M.iron, -0.08, 0.08, rf - 0.06, rf, zb, zf));
  for (const z of [zb + 0.3, (zb + zf) / 2, zf - 0.15]) g.add(span(M.iron, -hw, hw, rf - 0.05, rf, z - 0.03, z + 0.03));

  // the side sheets: closed behind the doorway, open for it, then up to the cut-out and full height ahead of it
  for (const sx of [-1, 1]) {
    const x0 = sx * hw - (sx > 0 ? t : 0), x1 = x0 + t;
    const [d0, d1] = c.door, cutBack = c.cut.z0 ?? d1;
    if (d0 > zb + 0.01) g.add(span(M.sheet, x0, x1, fl, rf, zb, d0));
    g.add(span(M.sheet, x0, x1, fl, c.cut.y, d1, zf));                 // below the cut-out
    g.add(span(M.sheet, x0, x1, c.cut.y, rf, c.cut.z1, zf));           // ahead of it, up to the roof
    if (cutBack > d1 + 0.01) g.add(span(M.sheet, x0, x1, c.cut.y, rf, d1, cutBack));
    g.add(span(M.wood, x0 - sx * 0.02, x1 - sx * 0.02, c.cut.y - 0.02, c.cut.y + 0.05, cutBack, c.cut.z1));   // the armrest
    // a grab rail either side of the doorway
    for (const z of [d0 + 0.06, d1 - 0.06]) if (z > zb + 0.05) g.add(cyl(0.018, 1.1, M.brass, sx * (hw - 0.08), fl + 1.05, z));
  }

  // the spectacle plate: full width, with a window either side of the boiler
  const sp = c.spectacle, pz0 = zf - t, pz1 = zf;
  g.add(span(M.sheet, -hw, hw, fl, sp.y0, pz0, pz1));
  g.add(span(M.sheet, -hw, hw, sp.y1, rf, pz0, pz1));
  g.add(span(M.sheet, -sp.x0, sp.x0, sp.y0, sp.y1, pz0, pz1));
  for (const sx of [-1, 1]) {
    g.add(span(M.sheet, sx > 0 ? sp.x1 : -hw, sx > 0 ? hw : -sp.x1, sp.y0, sp.y1, pz0, pz1));
    const wx = sx * (sp.x0 + sp.x1) / 2, ww = sp.x1 - sp.x0, wh = sp.y1 - sp.y0, wy = (sp.y0 + sp.y1) / 2;
    // a brass frame round the glass
    g.add(box(ww + 0.06, 0.03, 0.03, M.brass, wx, sp.y0, pz0 - 0.01), box(ww + 0.06, 0.03, 0.03, M.brass, wx, sp.y1, pz0 - 0.01));
    g.add(box(0.03, wh, 0.03, M.brass, wx - ww / 2, wy, pz0 - 0.01), box(0.03, wh, 0.03, M.brass, wx + ww / 2, wy, pz0 - 0.01));
    g.add(box(ww, wh, 0.01, M.glass, wx, wy, pz0 + 0.02));
  }

  // the back: a tank engine's back sheet, with small windows over its bunker; a tender engine is open to its tender
  if (c.backWall) {
    const wy0 = 3.25, wy1 = 3.62;
    g.add(span(M.sheet, -hw, hw, fl, wy0, zb, zb + t), span(M.sheet, -hw, hw, wy1, rf, zb, zb + t));
    for (const [a, b] of [[-hw, -0.75], [-0.35, 0.35], [0.75, hw]]) g.add(span(M.sheet, a, b, wy0, wy1, zb, zb + t));
    for (const sx of [-1, 1]) g.add(span(M.glass, sx > 0 ? 0.35 : -0.75, sx > 0 ? 0.75 : -0.35, wy0, wy1, zb + 0.02, zb + 0.03));
  } else {
    g.add(span(M.iron, -hw * 0.8, hw * 0.8, fl - 0.02, fl + 0.01, zb - 0.45, zb));   // the fall plate to the tender
  }

  // the firebox backhead: a rounded-topped face standing into the cab, the firehole glowing in it
  const bh = c.backhead, bz0 = bh.z, bz1 = zf - t, bd = bz1 - bz0, top = bh.top - bh.half * 0.5;
  g.add(span(M.black, -bh.half, bh.half, fl, top, bz0, bz1));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(bh.half, bh.half, bd, 24, 1, false, -Math.PI / 2, Math.PI), M.black);
  crown.rotation.x = -Math.PI / 2;   // its round half upwards, its length along the cab
  crown.scale.set(1, 1, 0.5);        // flattened: rising half its width above the face's straight sides
  crown.position.set(0, top, bz0 + bd / 2);
  g.add(crown);
  const fy = fl + 0.62;
  g.add(span(M.iron, -0.3, 0.3, fy - 0.2, fy + 0.2, bz0 - 0.04, bz0));        // the firehole door's frame
  g.add(span(M.fire, -0.22, 0.22, fy - 0.14, fy + 0.14, bz0 - 0.045, bz0 - 0.035));
  for (const sx of [-1, 1]) g.add(sx > 0 ? span(M.iron, 0.04, 0.26, fy - 0.16, fy + 0.16, bz0 - 0.07, bz0 - 0.05) : span(M.iron, -0.26, -0.04, fy - 0.16, fy + 0.16, bz0 - 0.07, bz0 - 0.05));   // its two doors
  g.add(span(M.fire, -0.04, 0.04, fy - 0.15, fy + 0.15, bz0 - 0.075, bz0 - 0.06));   // the glow between its doors, ajar
  g.add(span(M.fire, -bh.half * 0.6, bh.half * 0.6, fl, fl + 0.01, bz0 - 0.7, bz0));  // and on the floor before it
  // the regulator: a brass handle swinging across the top of the backhead
  const ry = top + bh.half * 0.25, regulator = new THREE.Group();
  regulator.add(cyl(0.05, 0.08, M.brass, 0, 0, 0, 'z'), cyl(0.022, 0.55, M.brass, 0.27, 0, -0.05, 'x'), cyl(0.03, 0.12, M.wood, 0.56, 0, -0.05, 'x'));
  regulator.position.set(0.05, ry, bz0 - 0.05);
  regulator.rotation.z = -0.35;
  g.add(regulator);
  g.userData.regulator = regulator;
  // gauges: boiler pressure and the brake's vacuum on top, the water gauge glasses either side of the firehole
  g.add(gauge(-0.17, ry + 0.02, bz0 - 0.08), gauge(0.17, ry + 0.02, bz0 - 0.08));
  for (const sx of [-1, 1]) {
    const x = sx * (bh.half - 0.12);
    g.add(cyl(0.022, 0.42, M.glass, x, fy + 0.55, bz0 - 0.05), cyl(0.03, 0.04, M.brass, x, fy + 0.33, bz0 - 0.05), cyl(0.03, 0.04, M.brass, x, fy + 0.77, bz0 - 0.05));
  }
  // pipes and valves on the backhead: the injectors' steam valves, in copper
  for (const sx of [-1, 1]) {
    g.add(cyl(0.02, bh.half * 0.9, M.copper, sx * bh.half * 0.45, top - 0.05, bz0 - 0.04, 'x'));
    g.add(cyl(0.045, 0.03, M.brass, sx * (bh.half - 0.06), top - 0.05, bz0 - 0.07, 'z'));
  }

  // the driver's side (+x): the reverser on its pedestal, the vacuum brake handle under the spectacle window, a seat
  const dx = c.eye[0], ez = c.eye[2];
  g.add(span(M.iron, dx - 0.12, dx + 0.06, fl, fl + 0.95, bz0 - 0.15, bz0 - 0.03));    // the reverser's pedestal
  g.add(cyl(0.13, 0.03, M.iron, dx - 0.03, fl + 1.02, bz0 - 0.09, 'z', 20));            // its wheel
  g.add(cyl(0.015, 0.2, M.brass, dx - 0.03, fl + 1.02, bz0 - 0.12, 'z'));
  const brake = new THREE.Group();
  brake.add(cyl(0.04, 0.1, M.brass, 0, 0, 0, 'x'), cyl(0.016, 0.3, M.black, 0, -0.14, -0.05));
  brake.position.set(sp.x1 - 0.05, sp.y0 - 0.25, zf - t - 0.08);
  brake.rotation.x = -0.4;
  g.add(brake);
  g.add(gauge(sp.x1 - 0.08, sp.y0 - 0.45, zf - t - 0.04, 0.06));                         // the brake's vacuum gauge
  g.add(span(M.wood, dx - 0.2, dx + 0.12, fl + 0.85, fl + 0.9, ez - 0.25, ez + 0.1));    // a tip-up seat on the side sheet
  g.add(span(M.iron, hw - 0.12, hw - 0.06, fl + 0.4, fl + 0.88, ez - 0.1, ez));
  // the fireman's side: a shovel on the floor and the injector's handle
  const shovel = span(M.iron, -0.45, -0.2, fl + 0.02, fl + 0.05, bz0 - 0.9, bz0 - 0.55);
  shovel.rotation.y = 0.3;
  g.add(shovel, cyl(0.015, 0.9, M.wood, -0.62, fl + 0.05, bz0 - 1.2, 'z'));
  g.add(cyl(0.035, 0.25, M.brass, -(sp.x0 + sp.x1) / 2, sp.y0 - 0.3, zf - t - 0.12, 'z'));

  const seat = new THREE.Vector3(...c.eye);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== M.glass; o.receiveShadow = true; } });
  return { group: g, seat, box: { zBack: zb, zFront: zf, floor: fl, roof: rf, half: hw } };
}
