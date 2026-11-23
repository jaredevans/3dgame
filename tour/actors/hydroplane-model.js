// An unlimited hydroplane, made here (owner, 2026-11-23: Polyfork has none): 9.4 m long, 4.3 m across its sponsons. A
// flat "picklefork" deck, its two sponsons running forward either side of the enclosed cockpit, the hull's planing
// shoe under its back half, the turbine's cowl behind the cockpit with its air scoop, and a tail fin carrying a wing,
// its race number on the fin. Facing +z, its origin on the water under it. Original liveries (no sponsors).
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, flatShading: true, ...extra });

// the deck's outline from above, (x, z): its stern, out to the sponsons, the tunnel between them, the cockpit's nose
const DECK = [[-1.0, -4.6], [1.0, -4.6], [2.15, 0.4], [2.15, 4.7], [1.6, 4.7], [1.45, 1.8], [0.55, 1.8], [0.45, 3.6],
  [-0.45, 3.6], [-0.55, 1.8], [-1.45, 1.8], [-1.6, 4.7], [-2.15, 4.7], [-2.15, 0.4]];

function numberTexture(text, ink, ground) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = ground; g.fillRect(0, 0, 128, 128);
  g.fillStyle = ink; g.font = 'bold 86px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// livery: { hull, trim, cowl, number }; -> { object, stern: Vector3 (the turbine's thrust, the rooster tail's root),
// bows: [Vector3, Vector3] (the sponsons' tips), all in its own frame }
export function makeHydroplane({ hull = '#f4f3ee', trim = '#d0202a', cowl = trim, number = '7', ink = '#111111' } = {}) {
  const object = new THREE.Group();
  object.name = `hydroplane ${number}`;
  const hullMat = mat(hull), trimMat = mat(trim), cowlMat = mat(cowl), dark = mat('#1b1d22', { roughness: 0.7 });
  const glass = mat('#16202c', { roughness: 0.1, metalness: 0.6 });
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; object.add(mesh); return mesh; };
  // the deck, 0.35 m thick, its top 0.45 m over the water
  const shape = new THREE.Shape(DECK.map(([x, z]) => new THREE.Vector2(x, -z)));
  const deck = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  deck.rotateX(-Math.PI / 2);
  add(deck, hullMat, 0, 0.1, 0);
  // the sponsons under its front corners, a stripe down their outsides
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.55, 0.4, 4.3), dark, sx * 1.875, -0.05, 2.55);
    add(new THREE.BoxGeometry(0.04, 0.2, 4.4), trimMat, sx * 2.17, 0.3, 2.5);
  }
  // the planing shoe under the hull's back half
  add(new THREE.BoxGeometry(1.5, 0.3, 4.4), dark, 0, -0.05, -2.4);
  // the cockpit: a capsule lying forward, its dark canopy over the front
  const pod = new THREE.CapsuleGeometry(0.46, 1.7, 4, 10);
  pod.rotateX(Math.PI / 2);
  add(pod, trimMat, 0, 0.62, 2.35);
  const canopy = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1, 0.75, 1.9);
  add(canopy, glass, 0, 0.82, 2.55);
  // the turbine's cowl behind it, its scoop over the front, the exhaust at the back
  const c = new THREE.CapsuleGeometry(0.42, 2.6, 4, 10);
  c.rotateX(Math.PI / 2);
  c.scale(1.1, 1, 1);
  add(c, cowlMat, 0, 0.75, -1.6);
  add(new THREE.BoxGeometry(0.5, 0.35, 0.6), dark, 0, 1.18, -0.3);
  const exhaust = new THREE.CylinderGeometry(0.22, 0.26, 0.4, 10);
  exhaust.rotateX(Math.PI / 2);
  add(exhaust, dark, 0, 0.72, -3.55);
  // the tail: a fin, its number either side, and the wing over it
  add(new THREE.BoxGeometry(0.08, 1.35, 1.05), hullMat, 0, 1.08, -4.0);
  const num = new THREE.MeshBasicMaterial({ map: numberTexture(number, ink, hull), toneMapped: false });
  for (const sx of [-1, 1]) {
    const p = add(new THREE.PlaneGeometry(0.85, 0.85), num, sx * 0.045, 1.05, -4.0);
    p.rotation.y = sx * Math.PI / 2;
    p.castShadow = false;
  }
  add(new THREE.BoxGeometry(2.7, 0.07, 0.75), trimMat, 0, 1.8, -4.1);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.4, 0.6), trimMat, sx * 1.35, 1.65, -4.1);
  return {
    object,
    stern: new THREE.Vector3(0, 0.25, -4.7),
    bows: [new THREE.Vector3(-1.875, 0, 4.6), new THREE.Vector3(1.875, 0, 4.6)],
  };
}
