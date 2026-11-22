// Spray and foam: a pool of soft white points in the world's frame, each flung out with a velocity, falling (or
// floating, with no gravity) and fading over its life; the boat's wake and bow spray, the octopus's splashes. One Points
// per pool, its arrays made once: nothing is allocated as it plays.
import * as THREE from 'three';
import { SEA_LEVEL } from '../world-data.js';

// a soft round dot, drawn once and shared
let dot = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

// count: the pool's size (the oldest is reused when it's full); size: a point's size in metres; life: seconds (a
// particle's own may be given); gravity: m/s² (0: foam that lies on the water, drifting and fading)
export function makeSpray({ count, size, life, gravity, name = 'spray', opacity = 1 }) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), col = new Float32Array(count * 4);
  const age = new Float32Array(count).fill(1), span = new Float32Array(count).fill(life), fall = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, opacity,
  }));
  points.name = name;
  points.frustumCulled = false;   // (moved by hand, all over)
  points.renderOrder = 2;         // over the sea, which is transparent too
  points.visible = false;
  let next = 0, live = 0;
  const spray = {
    points,
    // one particle at (x, y, z) flung at (vx, vy, vz), living `t` s (life if not given), falling or not
    emit(x, y, z, vx, vy, vz, t = life, falls = true) {
      const i = next;
      next = (next + 1) % count;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      age[i] = 0; span[i] = t; fall[i] = falls ? gravity : 0;
      col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
      live = count;
    },
    // a burst of n round (x, y, z): up and out speeds [lo, hi] m/s, spread `r` m round it
    burst(x, y, z, n, up, out, r = 1) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 2 * Math.PI, o = out[0] + Math.random() * (out[1] - out[0]), d = Math.random() * r;
        spray.emit(x + Math.cos(a) * d, y, z + Math.sin(a) * d, Math.cos(a) * o, up[0] + Math.random() * (up[1] - up[0]), Math.sin(a) * o, life * (0.7 + Math.random() * 0.6));
      }
    },
    update(dt) {
      if (!live) return;
      let any = false;
      for (let i = 0; i < count; i++) {
        if (age[i] >= span[i]) { col[i * 4 + 3] = 0; continue; }
        any = true;
        age[i] += dt;
        vel[i * 3 + 1] -= fall[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        // foam slows on the water; spray that falls back in is gone
        if (!fall[i]) { const k = Math.exp(-dt * 1.5); vel[i * 3] *= k; vel[i * 3 + 2] *= k; }
        const k = age[i] / span[i];
        col[i * 4 + 3] = pos[i * 3 + 1] < SEA_LEVEL - 0.3 ? 0 : Math.min(1, 1.5 * (1 - k));
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (!any) live = 0;
      points.visible = live > 0;
    },
    clear() { age.fill(1); span.fill(0); live = 0; points.visible = false; },
    dispose() { geo.dispose(); points.material.dispose(); },
  };
  return spray;
}
