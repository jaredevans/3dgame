// A route: a smooth open curve through control points, parameterised by distance along it (metres).
// Pure maths, no three.js, so Node can test it.
// Conventions (as the basement): yaw = atan2(dx, dz), so heading +z is 0 and +x is pi/2; pitch is the climb angle.
// offsetAt(s, d) is d metres to the LEFT of the direction of travel (heading +z, left is +x).

function catmullRom(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom (alpha 0.5): no cusps or overshoot loops between unevenly spaced points
  const d = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => {
    const w = (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w };
  };
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function makeRoute(points, { step = 1 } = {}) {
  if (points.length < 2) throw new Error('a route needs at least two points');
  const n = points.length;
  // phantom end points by quadratic extrapolation, so the curve keeps its bend right to the ends (a straight stays straight)
  const extrapolate = (a, b, c) => c
    ? { x: 3 * a.x - 3 * b.x + c.x, y: 3 * a.y - 3 * b.y + c.y, z: 3 * a.z - 3 * b.z + c.z }
    : { x: 2 * a.x - b.x, y: 2 * a.y - b.y, z: 2 * a.z - b.z };
  const P = (i) => {
    if (i < 0) return extrapolate(points[0], points[1], points[2]);
    if (i >= n) return extrapolate(points[n - 1], points[n - 2], points[n - 3]);
    return points[i];
  };
  // dense polyline, then its cumulative length
  const dense = [{ ...points[0] }];
  for (let i = 0; i < n - 1; i++) {
    const chord = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y, points[i + 1].z - points[i].z);
    const k = Math.max(4, Math.ceil(chord / 0.2));
    for (let j = 1; j <= k; j++) dense.push(catmullRom(P(i - 1), P(i), P(i + 1), P(i + 2), j / k));
  }
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const length = cum[cum.length - 1];

  // resample every `step` metres into an even table
  const count = Math.max(2, Math.ceil(length / step) + 1);
  const ds = length / (count - 1);
  const xs = new Float64Array(count), ys = new Float64Array(count), zs = new Float64Array(count);
  for (let i = 0, j = 0; i < count; i++) {
    const s = i * ds;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const w = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    xs[i] = dense[j].x + (dense[j + 1].x - dense[j].x) * w;
    ys[i] = dense[j].y + (dense[j + 1].y - dense[j].y) * w;
    zs[i] = dense[j].z + (dense[j + 1].z - dense[j].z) * w;
  }
  // heading and pitch at every table point, from central differences
  const yaws = new Float64Array(count), pitches = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a], dz = zs[b] - zs[a];
    yaws[i] = Math.atan2(dx, dz);
    pitches[i] = Math.atan2(dy, Math.hypot(dx, dz));
  }

  function at(s, out = {}) {
    s = Math.min(length, Math.max(0, s));
    const f = s / ds, i = Math.min(count - 2, Math.floor(f)), w = f - i;
    out.x = xs[i] + (xs[i + 1] - xs[i]) * w;
    out.y = ys[i] + (ys[i + 1] - ys[i]) * w;
    out.z = zs[i] + (zs[i + 1] - zs[i]) * w;
    out.yaw = wrap(yaws[i] + wrap(yaws[i + 1] - yaws[i]) * w);
    out.pitch = pitches[i] + (pitches[i + 1] - pitches[i]) * w;
    return out;
  }
  function offsetAt(s, d, out = {}) {
    at(s, out);
    out.x += Math.cos(out.yaw) * d;
    out.z -= Math.sin(out.yaw) * d;
    return out;
  }
  function minRadius(window = 10) {
    const k = Math.max(1, Math.round(window / ds));
    let best = Infinity;
    for (let i = 0; i + k < count; i++) {
      const turn = Math.abs(wrap(yaws[i + k] - yaws[i]));
      if (turn > 1e-9) best = Math.min(best, (k * ds) / turn);
    }
    return best;
  }
  function maxGrade(window = 10) {
    const k = Math.max(1, Math.round(window / ds));
    let best = 0;
    for (let i = 0; i + k < count; i++) {
      const run = Math.hypot(xs[i + k] - xs[i], zs[i + k] - zs[i]);
      if (run > 1e-9) best = Math.max(best, Math.abs(ys[i + k] - ys[i]) / run);
    }
    return best;
  }
  return { length, at, offsetAt, minRadius, maxGrade, points };
}

// The same route driven the other way: s runs from the far end, heading turned round, the left side swapped.
export function reverseRoute(route) {
  const L = route.length;
  function at(s, out = {}) {
    route.at(L - s, out);
    out.yaw = wrap(out.yaw + Math.PI);
    out.pitch = -out.pitch;
    return out;
  }
  function offsetAt(s, d, out = {}) {
    route.offsetAt(L - s, -d, out);
    out.yaw = wrap(out.yaw + Math.PI);
    out.pitch = -out.pitch;
    return out;
  }
  return { length: L, at, offsetAt, minRadius: route.minRadius, maxGrade: route.maxGrade, reversed: route };
}
