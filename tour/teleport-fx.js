// Teleport's sparkles: a column of light round where you stand, gold and pale-blue motes spiralling up through it and
// twinkling, brightest at the line where the figure is dissolving. Everything moves in the shaders (one time uniform):
// a frame writes four numbers and allocates nothing. Timing is teleport.js's.
import * as THREE from 'three';

const MOTES = 320;
const HEIGHT = 2.3, RADIUS = 0.62;   // m: a little taller and wider than the figure

const moteVert = /* glsl */ `
uniform float uTime, uGlow, uCut, uScale;
attribute vec4 aSeed;   // angle, radius, start height, pace: each 0..1
varying float vAlpha;
varying vec3 vColor;
void main() {
  float pace = 0.35 + aSeed.w;
  float h = fract(aSeed.z + uTime * (0.22 + 0.3 * aSeed.w));
  float a = aSeed.x * 6.2832 + uTime * pace * (aSeed.y > 0.5 ? 1.0 : -1.0);
  float r = ${RADIUS.toFixed(2)} * (0.3 + 0.7 * aSeed.y) * (1.0 - 0.3 * h);
  vec4 mv = modelViewMatrix * vec4(cos(a) * r, h * ${HEIGHT.toFixed(2)}, sin(a) * r, 1.0);
  float twinkle = 0.5 + 0.5 * sin(uTime * (8.0 + 9.0 * aSeed.w) + aSeed.x * 47.0);
  float edge = exp(-pow((h - uCut) * 7.0, 2.0));   // the dissolving line
  vAlpha = uGlow * (0.2 + 0.8 * twinkle) * (0.5 + 1.2 * edge) * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.82, 1.0, h));
  vColor = mix(vec3(1.0, 0.82, 0.42), vec3(0.62, 0.88, 1.0), aSeed.y);
  gl_PointSize = min(40.0, uScale * (0.05 + 0.06 * twinkle) / max(0.05, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const moteFrag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float glow = smoothstep(0.5, 0.0, d), core = smoothstep(0.16, 0.0, d);
  gl_FragColor = vec4(vColor * glow + core, glow * vAlpha);
}`;
// the column itself: a faint open cylinder of light, thin bands drifting up it
const columnVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const columnFrag = /* glsl */ `
uniform float uTime, uGlow;
varying vec2 vUv;
void main() {
  float bands = 0.55 + 0.45 * sin(vUv.y * 40.0 - uTime * 9.0) * sin(vUv.x * 31.4 + uTime * 2.0);
  float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.62), uGlow * 0.22 * bands * ends);
}`;

export function makeTeleportFx(scene) {
  const group = new THREE.Group();
  group.name = 'teleport sparkles';
  group.visible = false;
  const uniforms = { uTime: { value: 0 }, uGlow: { value: 0 }, uCut: { value: 0 }, uScale: { value: 300 } };
  const seeds = new Float32Array(MOTES * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));   // (placed in the shader)
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const motes = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: moteVert, fragmentShader: moteFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 24, 1, true).translate(0, HEIGHT / 2, 0),
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uGlow: uniforms.uGlow }, vertexShader: columnVert, fragmentShader: columnFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  for (const o of [motes, column]) { o.frustumCulled = false; o.renderOrder = 10; group.add(o); }
  scene.add(group);
  return {
    group,
    height: HEIGHT,
    // stand the column with its foot at (x, y, z)
    at(x, y, z) { group.position.set(x, y, z); },
    // a frame: time (s), glow (0..1), cut (0..1: how far up the figure the dissolving line is), the drawing buffer's
    // height in pixels (the motes' size on screen follows it)
    update(time, glow, cut, pixels) {
      uniforms.uTime.value = time; uniforms.uGlow.value = glow; uniforms.uCut.value = cut;
      uniforms.uScale.value = pixels;
      group.visible = glow > 0.001;
    },
  };
}
