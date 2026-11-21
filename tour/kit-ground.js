// A kit's own ground as a lookup: the height a ray cast straight down from above would find on its terrain, as the
// kit's groundAt() finds it, but from a grid of the triangles under each point rather than a test of every triangle (a
// few microseconds a point, not a millisecond on the Alpine kit's 44,000). Pure, no three.js: kitGround() in places.js
// hands it the triangles.

// tris: flat [ax, ay, az, bx, by, bz, cx, cy, cz, ...] in the frame you query, each wound as its mesh draws it; a ray
// from above meets only faces turned up towards it (front faces: three.js's FrontSide; pass a BackSide mesh's triangles
// reversed). -> { at(x, z) -> the highest such face's height there, or null off them all }
export function groundIndex(tris, { cell = 2 } = {}) {
  const keep = [];
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], az = tris[t + 2], bx = tris[t + 3], bz = tris[t + 5], cx = tris[t + 6], cz = tris[t + 8];
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0) keep.push(t);   // (b - a) x (c - a) points up
  }
  // each kept triangle in every cell its outline's box touches
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of keep) for (let k = 0; k < 9; k += 3) {
    x0 = Math.min(x0, tris[t + k]); x1 = Math.max(x1, tris[t + k]); z0 = Math.min(z0, tris[t + k + 2]); z1 = Math.max(z1, tris[t + k + 2]);
  }
  if (!keep.length) return { at: () => null, count: 0 };
  const nx = Math.floor((x1 - x0) / cell) + 1, nz = Math.floor((z1 - z0) / cell) + 1;
  const cells = Array.from({ length: nx * nz }, () => []);
  // each triangle's own values, ready for the point test: a, the edges b - a and c - a, and 1 / their cross product
  const T = new Float64Array(keep.length * 10);
  keep.forEach((t, k) => {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const ex = tris[t + 3] - ax, ey = tris[t + 4] - ay, ez = tris[t + 5] - az, fx = tris[t + 6] - ax, fy = tris[t + 7] - ay, fz = tris[t + 8] - az;
    T.set([ax, ay, az, ex, ey, ez, fx, fy, fz, 1 / (ex * fz - ez * fx)], k * 10);
    const i0 = Math.floor((Math.min(ax, ax + ex, ax + fx) - x0) / cell), i1 = Math.floor((Math.max(ax, ax + ex, ax + fx) - x0) / cell);
    const j0 = Math.floor((Math.min(az, az + ez, az + fz) - z0) / cell), j1 = Math.floor((Math.max(az, az + ez, az + fz) - z0) / cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(k);
  });
  const EPS = 1e-9;
  return {
    count: keep.length,
    at(x, z) {
      const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
      if (i < 0 || j < 0 || i >= nx || j >= nz) return null;
      let best = null;
      for (const k of cells[j * nx + i]) {
        const o = k * 10, px = x - T[o], pz = z - T[o + 2];
        const u = (px * T[o + 8] - pz * T[o + 6]) * T[o + 9], v = (T[o + 3] * pz - T[o + 5] * px) * T[o + 9];
        if (u < -EPS || v < -EPS || u + v > 1 + EPS) continue;
        const y = T[o + 1] + u * T[o + 4] + v * T[o + 7];
        if (best === null || y > best) best = y;
      }
      return best;
    },
  };
}
