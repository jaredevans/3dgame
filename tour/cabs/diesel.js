// A diesel cab interior, in the mainline diesel's own frame (it faces +z; its No. 1 cab is at the +z end).
// Measured from the model: cab between z 4.0 and 6.05 above y 2.0, nose top 3.5 m, cab roof about 4.25 m, body sides ±1.4 m.
// The driver sits on the left (+x) side and looks over the nose through the windscreen.
import * as THREE from 'three';

export const DIESEL_CAB = { zBack: 4.0, zFront: 6.05, floor: 2.0, roof: 4.25, half: 1.36 };

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const M = {
  wall: mat('#d9d2bf'), trim: mat('#2f4f86'), floor: mat('#4b4a47'), desk: mat('#39434d'), dial: mat('#f2efe6'),
  needle: mat('#c8402a'), handle: mat('#1c1c1c'), seat: mat('#5a3d2c'), glassEdge: mat('#20262c'), brass: mat('#b89b4f', { metalness: 0.6, roughness: 0.4 }),
};

function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}

// a wall panel in the y-z plane (side walls) with one window opening, built from four boxes round the hole
function sideWall(x, c, win) {
  const g = new THREE.Group(), t = 0.06, zl = c.zFront - c.zBack, zm = (c.zFront + c.zBack) / 2;
  g.add(box(t, win.y0 - c.floor, zl, M.wall, x, (c.floor + win.y0) / 2, zm));                       // below
  g.add(box(t, c.roof - win.y1, zl, M.wall, x, (win.y1 + c.roof) / 2, zm));                         // above
  g.add(box(t, win.y1 - win.y0, win.z0 - c.zBack, M.wall, x, (win.y0 + win.y1) / 2, (c.zBack + win.z0) / 2));   // behind
  g.add(box(t, win.y1 - win.y0, c.zFront - win.z1, M.wall, x, (win.y0 + win.y1) / 2, (win.z1 + c.zFront) / 2)); // ahead
  return g;
}

export function makeDieselCab() {
  const c = DIESEL_CAB, g = new THREE.Group();
  g.name = 'diesel cab';
  const zm = (c.zFront + c.zBack) / 2, zl = c.zFront - c.zBack;
  g.add(box(c.half * 2, 0.05, zl, M.floor, 0, c.floor, zm));
  g.add(box(c.half * 2, 0.06, zl, M.wall, 0, c.roof, zm));
  // back wall with a door to the engine room
  g.add(box(c.half * 2, c.roof - c.floor, 0.06, M.wall, 0, (c.floor + c.roof) / 2, c.zBack));
  g.add(box(0.75, 1.9, 0.02, M.trim, 0, c.floor + 0.95, c.zBack + 0.04));
  // side windows
  for (const sx of [-1, 1]) g.add(sideWall(sx * c.half, c, { y0: 2.95, y1: 3.85, z0: 4.45, z1: 5.7 }));
  // windscreen: two panes over the nose, framed by pillars, a centre post and a sill
  const fz = c.zFront, sill = 3.42, head = 4.02;
  g.add(box(c.half * 2, sill - c.floor, 0.06, M.wall, 0, (c.floor + sill) / 2, fz));
  g.add(box(c.half * 2, c.roof - head, 0.06, M.wall, 0, (head + c.roof) / 2, fz));
  for (const px of [-c.half + 0.1, 0, c.half - 0.1]) g.add(box(px === 0 ? 0.16 : 0.2, head - sill, 0.08, M.glassEdge, px, (sill + head) / 2, fz));
  g.add(box(c.half * 2, 0.05, 0.12, M.trim, 0, sill, fz - 0.05));
  // the shell is hollow: close the top of the nose just ahead of the windscreen so you can't see down into it
  g.add(box(c.half * 2 + 0.02, 0.05, 0.9, M.trim, 0, sill + 0.03, fz + 0.45));
  // the driver's desk on the left, with a speedometer, a brake handle and a power controller
  const dz = fz - 0.32;
  g.add(box(1.25, 0.55, 0.5, M.desk, 0.66, sill - 0.32, dz).rotateX(-0.25));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), M.dial);
  dial.rotation.x = Math.PI / 2 - 0.5; dial.position.set(0.66, sill - 0.08, dz + 0.06);
  g.add(dial);
  const needle = box(0.012, 0.075, 0.01, M.needle, 0.66, sill - 0.05, dz + 0.04);
  needle.rotation.x = -0.5; g.add(needle);
  g.userData.needle = needle;
  for (const [x, m] of [[0.32, M.handle], [1.0, M.brass]]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), m);
    h.position.set(x, sill - 0.02, dz - 0.05); h.rotation.x = -0.6; g.add(h);
    g.add(box(0.07, 0.07, 0.07, m, x, sill + 0.11, dz - 0.13));
  }
  // the driver's seat
  g.add(box(0.5, 0.08, 0.48, M.seat, 0.66, c.floor + 0.62, fz - 1.05));
  g.add(box(0.5, 0.6, 0.08, M.seat, 0.66, c.floor + 0.95, fz - 1.3));
  g.add(box(0.1, 0.6, 0.1, M.handle, 0.66, c.floor + 0.3, fz - 1.05));
  // the second man's desk on the right, plainer
  g.add(box(1.0, 0.45, 0.45, M.desk, -0.7, sill - 0.3, dz).rotateX(-0.25));

  const seat = new THREE.Vector3(0.66, c.floor + 1.76, fz - 1.15);   // eye height above the floor, behind the desk
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return { group: g, seat, box: c };
}
