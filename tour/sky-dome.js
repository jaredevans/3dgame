// The sky you see: a dome that follows the camera, with a soft gradient, the sun and its glow, two layers of drifting
// clouds, stars after dark, and distance haze (scene fog in the horizon colour) so far land melts into the sky.
import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;   // always at the far plane
  }`;

const fragmentShader = /* glsl */`
  uniform vec3 zenith, horizon, sunColor, sunDir;
  uniform float cloudCover, haze, stars, time, night;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
    if (h < 0.0) col = horizon;
    float sd = max(dot(d, sunDir), 0.0);
    // the sun (or moon) and its glow; the glow warms the horizon round it
    col += sunColor * (smoothstep(0.9993, 0.99965, sd) * 3.0 + pow(sd, 10.0) * 0.28 * (1.0 - night * 0.7));
    col = mix(col, horizon, haze * exp(-max(h, 0.0) * 9.0));
    // stars
    if (stars > 0.0 && h > 0.0) {
      vec3 cell = floor(d * 380.0);
      float r = hash(cell);
      col += vec3(step(0.9982, r) * stars * smoothstep(0.02, 0.25, h) * (0.6 + 0.4 * sin(time * 2.0 + r * 50.0)));
    }
    // clouds on a high plane: big soft cumulus and a thinner, slower, higher layer
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12);
      float n = fbm(uv * 1.4 + time * vec2(0.010, 0.004));
      float c = smoothstep(1.0 - cloudCover - 0.12, 1.0 - cloudCover + 0.22, n);
      float n2 = fbm(uv * 0.45 + 4.0 - time * vec2(0.003, 0.002));
      c = max(c, 0.45 * smoothstep(0.62, 0.9, n2) * cloudCover * 1.6);
      float shade = fbm(uv * 1.4 + 0.15 + time * vec2(0.010, 0.004));
      vec3 lit = mix(vec3(1.0), sunColor, 0.35) * mix(1.0, 0.18, night);
      vec3 dark = mix(horizon, zenith, 0.35) * 0.85;
      vec3 cc = mix(lit, dark, smoothstep(0.35, 0.8, shade) * 0.55);
      cc += sunColor * pow(sd, 6.0) * 0.5 * (1.0 - night);
      col = mix(col, cc, c * smoothstep(0.0, 0.12, h) * 0.95);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function makeSkyDome(scene, camera) {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, cloudCover: { value: 0.4 }, haze: { value: 0.3 }, stars: { value: 0 },
    time: { value: 0 }, night: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.scale.setScalar(1000);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  scene.background = null;
  scene.fog = new THREE.Fog(0xcfe4f1, 350, 4600);

  const now = { stage: -1 };
  return {
    uniforms,
    // sky: from skyAt(); sunDir: the direction the key light shines from
    update(sky, sunDir, dt) {
      dome.position.copy(camera.position);
      uniforms.time.value += dt;
      uniforms.zenith.value.setRGB(...sky.zenith, THREE.SRGBColorSpace);
      uniforms.horizon.value.setRGB(...sky.horizon, THREE.SRGBColorSpace);
      uniforms.sunColor.value.setRGB(...sky.sun, THREE.SRGBColorSpace);
      uniforms.cloudCover.value = sky.cloudCover;
      uniforms.haze.value = sky.haze;
      uniforms.stars.value = sky.stars;
      uniforms.night.value = Math.max(0, (sky.stage - 0.6) / 0.4);
      // the disc goes where our schedule puts the sun, so the light and the sky agree
      const el = THREE.MathUtils.degToRad(sky.sunElevationDeg), az = THREE.MathUtils.degToRad(sky.sunAzimuthDeg);
      uniforms.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      if (sunDir) sunDir.copy(uniforms.sunDir.value);
      scene.fog.color.copy(uniforms.horizon.value);
      return now;
    },
  };
}
