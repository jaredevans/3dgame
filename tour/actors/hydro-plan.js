// The hydroplane race off the Seaside Excursion's coast (owner, 2026-11-23): two unlimited hydroplanes lapping a course
// the length of the coast between Downtown City and Oceanside, close in under the cliffs: east along an inner lane
// (HYDRO.inner m off the waterline), round a turn, west along an outer one (HYDRO.outer), round again. Flat out on the
// straights, slowing for the turns. Pure: no three.js, so Node tests it.
//
// The race keeps its own clock wherever you are. Going out along the coast (the train's out run, or the speedboat) it's
// timed to you: its clock runs up to HYDRO.trim faster or slower so that the leader comes past you, going your way on
// the inner lane, as you reach HYDRO.pass (in leg-s; the train's director shot is there: events.js). Too far out to
// trim, it's put right in one go, but only while neither where the boats are nor where they'd go is in sight.

export const HYDRO = {
  s0: 380, s1: 1720,       // leg-s of the course's two turns: clear of the speedboat's way out of the City and into Oceanside, and of Oceanside's whales
  inner: 25, outer: 70,    // m off the waterline: the eastbound lane, the westbound one (the turns' diameter between)
  sub: 6,                  // m either side of its lane's middle each boat keeps to
  step: 5,                 // m between the course's points
  smooth: 4,               // passes of smoothing over its points (no corners where the turns meet the lanes)
  top: 46,                 // m/s on the straights (165 km/h)
  grip: 24,                // m/s² it pulls round a turn at the most
  brake: 14, drive: 9,     // m/s² it slows into a turn, gathers speed out of it
  pass: { train: 500, ride: 740 },   // leg-s where the leader comes past you going out (train; speedboat)
  cruise: { train: 27.5, ride: 24.6 },   // m/s you're reckoned to get up to, gathering speed at `gather` m/s²
  gather: { train: 1.1, ride: 3 },
  trim: [0.7, 1.35],       // the race's clock's rate, at the slowest and fastest, while timed to you
  jump: 4,                 // s the race may be out before it's put right in one go (unseen)
  near: 30,                // m short of the pass the timing lets go
  duel: { gap: 0.3, swing: 0.25, rate: 0.08 },   // s the second boat runs behind the first (gap ± swing, swinging at rate)
};

// the course: its points round the loop (x, z), each one's way along it, how fast a boat goes there and when it gets
// there from the start (the inner lane's west end), and, on the inner lane, its leg-s.
//   route: the leg's (in leg-s); shore(s): m from the line out to the waterline at leg-s s; side: the sea's side (+1 left)
export function hydroCourse(route, shore, side = 1, H = HYDRO) {
  const P = {};
  const lane = (s, off) => {
    // (the waterline's distance averaged over 120 m, so the lanes don't follow every inlet)
    let w = 0, n = 0;
    for (let d = -60; d <= 60; d += 20) { w += shore(Math.min(route.length, Math.max(0, s + d))); n++; }
    route.at(s, P);
    const l = side * (w / n + off);
    return { x: P.x + Math.cos(P.yaw) * l, z: P.z - Math.sin(P.yaw) * l, s };
  };
  const pts = [];
  const n = Math.ceil((H.s1 - H.s0) / H.step);
  for (let k = 0; k <= n; k++) pts.push(lane(H.s0 + (H.s1 - H.s0) * k / n, H.inner));
  const turn = (a, b, fwd) => {   // a half circle from a to b, bulging out along fwd
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, r = Math.hypot(b.x - a.x, b.z - a.z) / 2;
    const ux = (a.x - cx) / r, uz = (a.z - cz) / r;
    let fx = -uz, fz = ux;
    if (fx * fwd.x + fz * fwd.z < 0) { fx = -fx; fz = -fz; }
    const m = Math.max(4, Math.ceil(Math.PI * r / H.step));
    for (let k = 1; k < m; k++) {
      const t = Math.PI * k / m;
      pts.push({ x: cx + r * (Math.cos(t) * ux + Math.sin(t) * fx), z: cz + r * (Math.cos(t) * uz + Math.sin(t) * fz), s: null });
    }
  };
  const ahead = (s, sign) => { route.at(s, P); return { x: sign * Math.sin(P.yaw), z: sign * Math.cos(P.yaw) }; };
  const innerEnd = pts.length - 1;
  turn(pts[innerEnd], lane(H.s1, H.outer), ahead(H.s1, 1));
  for (let k = n; k >= 0; k--) pts.push({ ...lane(H.s0 + (H.s1 - H.s0) * k / n, H.outer), s: null });
  turn(pts[pts.length - 1], pts[0], ahead(H.s0, -1));
  // smoothed round the loop, the inner lane's straight kept to its leg-s
  const N = pts.length;
  for (let pass = 0; pass < H.smooth; pass++) {
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      pts[i].x = (xs[a] + 2 * xs[i] + xs[b]) / 4;
      pts[i].z = (zs[a] + 2 * zs[i] + zs[b]) / 4;
    }
  }
  // lengths, ways, the bend (1/m), and the speeds: as fast as it can go round each bend, slowed into it and gathering
  // speed out of it (twice round, so the start's ends meet)
  const d = new Float64Array(N + 1), yaw = new Float64Array(N), bend = new Float64Array(N), v = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[(i + 1) % N];
    d[i + 1] = d[i] + Math.hypot(q.x - p.x, q.z - p.z);
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    yaw[i] = Math.atan2(b.x - a.x, b.z - a.z);
  }
  const seg = (i) => d[i + 1] - d[i];
  for (let i = 0; i < N; i++) {
    const turnBy = wrap(yaw[(i + 1) % N] - yaw[(i - 1 + N) % N]), len = seg(i) + seg((i - 1 + N) % N);
    bend[i] = len > 0 ? turnBy / len : 0;
    v[i] = Math.min(H.top, Math.sqrt(H.grip / Math.max(1e-6, Math.abs(bend[i]))));
  }
  for (let round = 0; round < 2; round++) {
    for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * H.brake * seg(i))); }
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * H.drive * seg(i))); }
  }
  const time = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) time[i + 1] = time[i] + seg(i) / ((v[i] + v[(i + 1) % N]) / 2);
  const length = d[N], lap = time[N];
  const find = (arr, x) => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= x) lo = m; else hi = m - 1; } return lo; };
  return {
    pts, length, lap, innerEnd,
    // where a boat is `tau` s round the lap, `off` m to the left of the course's middle: into out { x, z, yaw, v, bend }
    at(tau, off = 0, out = {}) {
      const t = ((tau % lap) + lap) % lap, i = find(time, t), j = (i + 1) % N;
      const u = (t - time[i]) / Math.max(1e-9, time[i + 1] - time[i]);
      const p = pts[i], q = pts[j], y = yaw[i] + wrap(yaw[j] - yaw[i]) * u;
      out.x = p.x + (q.x - p.x) * u + Math.cos(y) * off;
      out.z = p.z + (q.z - p.z) * u - Math.sin(y) * off;
      out.yaw = y; out.v = v[i] + (v[j] - v[i]) * u; out.bend = bend[i] + (bend[j] - bend[i]) * u;
      return out;
    },
    // when (s round the lap) a boat on the inner lane is abreast of leg-s s
    timeAt(s) {
      const c = Math.min(innerEnd, Math.max(0, (s - H.s0) / (H.s1 - H.s0) * innerEnd)), i = Math.min(innerEnd - 1, Math.floor(c));
      return time[i] + (time[i + 1] - time[i]) * (c - i);
    },
    wrapTime: (t) => ((t % lap) + 1.5 * lap) % lap - lap / 2,   // a difference in time round the lap, in -lap/2..lap/2
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// a frame of the race: st { tau, t } (the race's clock, and its own time) on by dt; you (`legS`, `dir`, `v`, `ride`)
// timed to while going out short of the pass. canJump(tauNow, tauThen): whether it may be put right in one go (neither
// in sight). -> st, with st.timed (it's being timed to you) and st.k (its clock's rate this frame)
export function raceStep(st, course, { dt, legS = null, dir = null, v = 0, ride = false, canJump = () => false }, H = HYDRO) {
  st.t += dt;
  let k = 1;
  st.timed = false;
  if (legS !== null && dir === 'out') {
    const pass = ride ? H.pass.ride : H.pass.train, left = pass - legS;
    if (left > H.near) {
      const eta = etaOf(left, Math.abs(v), ride ? H.cruise.ride : H.cruise.train, ride ? H.gather.ride : H.gather.train);
      const err = course.wrapTime(course.timeAt(pass) - eta - st.tau);
      st.timed = true;
      if (Math.abs(err) > H.jump && canJump(st.tau, st.tau + err)) st.tau += err;
      else k = Math.min(H.trim[1], Math.max(H.trim[0], 1 + err / Math.max(2, eta)));
    }
  }
  st.k = k;
  st.tau = (st.tau + k * dt) % course.lap;
  return st;
}

// s to go `left` m from v m/s, gathering speed at a m/s² up to `top` (or on at v, if it's faster)
export function etaOf(left, v, top, a) {
  if (v >= top) return left / v;
  const run = (top * top - v * v) / (2 * a);
  if (left <= run) return (Math.sqrt(v * v + 2 * a * left) - v) / a;
  return (top - v) / a + (left - run) / top;
}

// how far (s) the second boat runs behind the first at race time t
export const duelGap = (t, H = HYDRO) => H.duel.gap + H.duel.swing * Math.sin(t * H.duel.rate * 2 * Math.PI);
