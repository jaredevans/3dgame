// The sky across the ring: one lap is one day. Pure data and maths, no three.js.
// Ring position: 0 Downtown City, 1 Oceanside, 2 Mountain, 3 Wild West, 4 Futuristic, 5 back to City (= 0).
// stage: the 0..1 value for Polyfork stage().setTime (day -> golden -> dusk -> night).

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const K = (at, stage, zenith, horizon, sunElevationDeg, sunAzimuthDeg, cloudCover, haze, sun, stars = 0) =>
  ({ at, stage, zenith: hex(zenith), horizon: hex(horizon), sunElevationDeg, sunAzimuthDeg, cloudCover, haze, sun: hex(sun), stars });

export const SKY_KEYS = [
  K(0.0, 0.04, '#3f86cf', '#cfe4f1', 32, 110, 0.38, 0.30, '#fff4dc'),          // City: bright morning, puffy clouds
  K(1.0, 0.00, '#3a80d2', '#d5e8f3', 50, 145, 0.42, 0.25, '#fffaf0'),          // Oceanside: late morning, sparkling sea
  K(1.5, 0.00, '#3478cd', '#d9e7ef', 62, 180, 0.30, 0.20, '#ffffff'),          // midday, high wisps
  K(2.0, 0.06, '#3b7dc9', '#dfe9ee', 50, 215, 0.22, 0.14, '#fff6e6'),          // Mountain: crisp early afternoon
  K(2.6, 0.33, '#4e77b6', '#f1c98d', 17, 250, 0.35, 0.30, '#ffd7a0'),          // golden afternoon
  K(2.9, 0.52, '#3d5193', '#f4985c', 4, 268, 0.45, 0.35, '#ffb070'),           // sunset over the red rock
  K(3.4, 0.74, '#1d2754', '#c06a5e', -6, 285, 0.35, 0.30, '#ff9a6a', 0.3),     // dusk
  K(4.0, 1.00, '#060a1c', '#1a2148', -30, 300, 0.15, 0.20, '#c8d4ff', 1),      // Futuristic: night, stars
  K(4.5, 0.86, '#122047', '#5d6298', -10, 80, 0.20, 0.25, '#ffc8a8', 0.5),     // pre-dawn blue
  K(4.8, 0.55, '#4a6aa8', '#f3a97b', 3, 95, 0.30, 0.30, '#ffc890', 0.05),      // sunrise behind the skyline
];

const lerp = (a, b, t) => a + (b - a) * t;

export function skyAt(pos) {
  const p = ((pos % 5) + 5) % 5;
  let i = SKY_KEYS.length - 1;
  while (i > 0 && SKY_KEYS[i].at > p) i--;
  const a = SKY_KEYS[i], b = SKY_KEYS[(i + 1) % SKY_KEYS.length];
  const span = (b.at > a.at ? b.at : b.at + 5) - a.at, t = (p - a.at) / span;
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'at') continue;
    out[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t);
  }
  return out;
}

// a ring position eased a fraction k of the way from `from` to `to`, the short way round (the ring closes at 5 = 0: out of
// the Metro Glide's leg into City the sky goes on across sunrise, not back through the day). Not wrapped: skyAt is.
export function towards(from, to, k) {
  const d = ((((to - from) % 5) + 7.5) % 5) - 2.5;
  return from + d * k;
}

const PLACE_AT = { city: 0, ocean: 1, mountain: 2, west: 3, future: 4 };
const LEG_AT = { 'city-ocean': 0, 'ocean-mountain': 1, 'mountain-west': 2, 'west-future': 3, 'future-city': 4 };

// where: { place } or { leg, fraction 0..1 along it from its first place to its second }
export function ringPosition(where) {
  if (where.place) return PLACE_AT[where.place];
  return LEG_AT[where.leg] + Math.min(1, Math.max(0, where.fraction));
}
