// The Silver Arrow's shape: its cars' lengths, its body's cross-section and its long noses, in metres. Pure maths, no
// three.js: trains/bullet.js lofts its cars from these, and cabs/future.js lines its cab with the same surface.
// A car faces +z, its rear end at z = 0; y = 0 is the formation, as for every vehicle (the rails top it by 0.30 m). The
// body is 3.0 m wide (the Countryside Railway's coaches are 2.9, and its platform faces stand 1.6 m from the line), its
// skirts come down to 0.4 m and hide the running gear, its roof is 3.95 m up (a real one is 3.65 m above the rails).
// Each end car is 19 m of body and an 8 m nose: steep where the driver looks out through its canopy, then a long, low
// bill to its tip.

export const BULLET = {
  car: 25, body: 19, nose: 8, half: 1.5, skirt: 0.4, roof: 3.95, tip: 1.3,
  // the bogie centres, from a car's rear end: a middle car's 17.5 m apart; an end car's under its body
  pivots: { middle: [3.75, 21.25], end: [3.5, 17.5] },
};

// the cars' lengths, front to back: an end car at each end, middle cars between
export const carLengths = (n = 4) => Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? BULLET.body + BULLET.nose : BULLET.car));

const clamp01 = (t) => Math.min(1, Math.max(0, t));
// the body's cross-section at t along the nose (t <= 0 the full body, 1 its tip): its half width, bottom and top
export function section(t) {
  const u = clamp01(t);
  return {
    half: Math.max(0.22, BULLET.half * (1 - u ** 2.4) ** 0.6),
    bottom: BULLET.skirt + 0.55 * u ** 2.2,
    top: BULLET.tip + (BULLET.roof - BULLET.tip) * (1 - u) ** 2.2,
  };
}

// the bands up the side, in the height of the section (0 its bottom, 1 its roof): grey skirts, a blue stripe, the
// window band, and white
export const BANDS = { skirt: 0.145, stripe: [0.32, 0.377], window: [0.493, 0.667] };
// the side's shape: how far out (of the half width) at each height; the last few points round over the roof
const SIDE = [[0, 0.95], [0.145, 0.99], [0.32, 1], [0.377, 1], [0.493, 1], [0.667, 0.985], [0.8, 0.93], [0.9, 0.78], [0.97, 0.45], [1, 0]];
// the canopy: the window band and everything above it, over the steep front of the nose (glass on the shell, glazed in
// the cab)
export const CANOPY = [0.03, 0.45];

// the section at t as a closed ring: from the middle of the underside, up the +x side, over the roof and down the -x
// side back to it. Each point { x, y, v } (v its height in the section, 0..1)
export function ring(t) {
  const { half, bottom, top } = section(t), h = top - bottom;
  const right = [{ x: 0, y: bottom, v: 0 }, ...SIDE.map(([v, s]) => ({ x: half * s, y: bottom + v * h, v }))];
  const left = right.slice(0, -1).reverse().map((p) => ({ x: -p.x, y: p.y, v: p.v }));
  return [...right, ...left];
}

// what a stretch of the side between heights v0 and v1 is, at t along the nose: 'under', 'skirt', 'stripe', 'window',
// 'canopy' or 'white'
export function bandOf(v0, v1, t) {
  const v = (v0 + v1) / 2;
  if (v0 === 0 && v1 === 0) return 'under';
  if (v < BANDS.skirt) return 'skirt';
  if (v > BANDS.stripe[0] && v < BANDS.stripe[1]) return 'stripe';
  if (t >= CANOPY[0] && t <= CANOPY[1] && v > BANDS.window[0]) return 'canopy';
  if (v > BANDS.window[0] && v < BANDS.window[1]) return t > CANOPY[0] ? 'white' : 'window';
  return 'white';
}

// how far out the surface is at height y in the section at t (inside it, for laying a floor)
export function halfAt(t, y) {
  const r = ring(t), n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[i + 1];
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
  }
  return 0;
}

// the driver's cab in the front car: from just behind the nose to the bottom of the canopy's glass, above a raised
// floor; the driver sits in the middle, eyes 1.5 m above the floor, high enough to look down the bill through the canopy
const NOSE_AT = BULLET.body;
export const BULLET_CAB = {
  zBack: NOSE_AT - 2, zFront: NOSE_AT + CANOPY[1] * BULLET.nose, floor: 1.75, roof: BULLET.roof, half: BULLET.half,
  noseAt: NOSE_AT, nose: BULLET.nose,
  eye: [0, 3.25, NOSE_AT - 0.35],
};
