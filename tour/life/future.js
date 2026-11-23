// The Futuristic place's living things (owner, 2026-11-23): its outdoor screens (the Chrome Arcology kit's two holo
// billboards, kept out of its merged meshes for this: world-data.js `keep`) show a close-up of a geisha's face, drawn
// here and animated: her head swaying a little, her eyes looking about, and a slow wink every few seconds, on a neon
// ground with scanlines and a flicker. One canvas, drawn GEISHA.fps times a second, shared by both screens.
import * as THREE from 'three';

// the screen's face on the billboard, in its own frame (measured: its four panels together, facing its +z)
const SCREEN = { x: [-1.74, 1.74], y: [0.81, 3.49], z: 0.345 };
const GEISHA = { w: 512, h: 394, fps: 12, wink: 4.5, winkFor: 0.5 };

// her face at t s, on ctx
export function drawGeisha(ctx, t) {
  const W = GEISHA.w, H = GEISHA.h;
  // the neon ground: magenta to deep blue, a glow behind her
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2a0a3d'); bg.addColorStop(0.5, '#4a0f5c'); bg.addColorStop(1, '#0b1b4a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, W * 0.55);
  glow.addColorStop(0, 'rgba(255,80,170,0.45)'); glow.addColorStop(1, 'rgba(255,80,170,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.save();
  // her head: swaying a little
  ctx.translate(W / 2, H * 0.6);
  ctx.rotate(0.04 * Math.sin(t * 0.6));
  const S = H / 394;
  ctx.scale(S, S);
  // her hair behind: a broad dark mass, the buns at either side of her crown
  ctx.fillStyle = '#0d0a10';
  ctx.beginPath(); ctx.ellipse(0, -70, 170, 150, 0, 0, Math.PI * 2); ctx.fill();
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 120, -170, 78, 62, sx * 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(0, -205, 95, 55, 0, 0, Math.PI * 2); ctx.fill();
  // the hairpins (kanzashi): gold sticks, red flowers dangling
  ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 5;
  for (const [x0, y0, x1, y1] of [[-150, -200, -60, -150], [150, -200, 60, -150], [-30, -260, 20, -170]]) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  for (const [x, y, r] of [[-155, -205, 16], [155, -205, 16], [-35, -262, 13], [-172, -180, 9], [172, -180, 9]]) {
    ctx.fillStyle = '#d4183d'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  // her face: white, a little blush
  ctx.fillStyle = '#f7f1ec';
  ctx.beginPath(); ctx.ellipse(0, 0, 118, 150, 0, 0, Math.PI * 2); ctx.fill();
  for (const sx of [-1, 1]) {
    const blush = ctx.createRadialGradient(sx * 62, 40, 2, sx * 62, 40, 40);
    blush.addColorStop(0, 'rgba(240,120,140,0.45)'); blush.addColorStop(1, 'rgba(240,120,140,0)');
    ctx.fillStyle = blush; ctx.beginPath(); ctx.arc(sx * 62, 40, 40, 0, Math.PI * 2); ctx.fill();
  }
  // her hair over the top of her head, framing her forehead down to a small peak in its middle
  ctx.fillStyle = '#0d0a10';
  ctx.beginPath();
  ctx.moveTo(-124, -30); ctx.quadraticCurveTo(-124, -165, 0, -165); ctx.quadraticCurveTo(124, -165, 124, -30);
  ctx.quadraticCurveTo(70, -100, 12, -96); ctx.lineTo(0, -84); ctx.lineTo(-12, -96); ctx.quadraticCurveTo(-70, -100, -124, -30);
  ctx.fill();
  // her brows: fine and high
  ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 18, -50); ctx.quadraticCurveTo(sx * 50, -66, sx * 82, -50); ctx.stroke(); }
  // her eyes: almond, lined black, a red flick at their outer corners, looking about; her left one winking
  const look = { x: 6 * Math.sin(t * 0.37), y: 2 * Math.sin(t * 0.53) };
  const wk = (t % GEISHA.wink) / GEISHA.winkFor, wink = wk < 1 ? Math.sin(Math.PI * wk) : 0;
  for (const sx of [-1, 1]) {
    const cx = sx * 50, cy = -18, open = sx < 0 ? 1 - wink : 1;
    ctx.fillStyle = '#d81e3a';
    ctx.beginPath(); ctx.moveTo(cx + sx * 34, cy - 2); ctx.lineTo(cx + sx * 52, cy - 12); ctx.lineTo(cx + sx * 34, cy + 4); ctx.fill();
    if (open > 0.15) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, 34, 14 * open, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#fffdf8'; ctx.fillRect(cx - 40, cy - 20, 80, 40);
      ctx.fillStyle = '#2b1a14'; ctx.beginPath(); ctx.arc(cx + look.x, cy + look.y, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx + look.x, cy + look.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(cx + look.x - 3, cy + look.y - 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // the lash line: an arch over the open eye, a curve down where it's shut
    ctx.strokeStyle = '#0d0a10'; ctx.lineWidth = 5;
    ctx.beginPath();
    if (open > 0.15) ctx.ellipse(cx, cy, 34, 14 * open, 0, Math.PI, Math.PI * 2);
    else { ctx.moveTo(cx - 34, cy); ctx.quadraticCurveTo(cx, cy + 12, cx + 34, cy); }
    ctx.stroke();
  }
  // her nose: a faint line
  ctx.strokeStyle = 'rgba(180,140,130,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(4, 10); ctx.quadraticCurveTo(10, 38, 0, 44); ctx.stroke();
  // her lips: a small painted red bow, a smile coming as she winks
  const smile = 4 * wink;
  ctx.fillStyle = '#c8102e';
  ctx.beginPath();
  ctx.moveTo(-22, 82 - smile); ctx.quadraticCurveTo(-10, 70, 0, 76); ctx.quadraticCurveTo(10, 70, 22, 82 - smile);
  ctx.quadraticCurveTo(0, 98, -22, 82 - smile); ctx.fill();
  ctx.restore();
  // scanlines and a flicker
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const flick = 0.06 + 0.06 * Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.1));
  ctx.fillStyle = `rgba(120,220,255,${flick})`; ctx.fillRect(0, 0, W, H);
  // a neon frame
  ctx.strokeStyle = '#ff4fb4'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, W - 10, H - 10);
}

export async function buildFutureLife({ place }) {
  const group = new THREE.Group();
  group.name = 'Futuristic life';
  const boards = place.kitPlace.of?.('holo-billboard-frame') ?? [];
  if (!boards.length || typeof document === 'undefined') return { group, update() {} };
  const canvas = document.createElement('canvas');
  canvas.width = GEISHA.w; canvas.height = GEISHA.h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const geo = new THREE.PlaneGeometry(SCREEN.x[1] - SCREEN.x[0], SCREEN.y[1] - SCREEN.y[0]);
  for (const b of boards) {
    // (its floating holo panels, over the screen, hidden: they cut across her face)
    b.traverse((o) => { if (o.isMesh && o.name.startsWith('holo-panel')) o.visible = false; });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'geisha screen';
    m.position.set((SCREEN.x[0] + SCREEN.x[1]) / 2, (SCREEN.y[0] + SCREEN.y[1]) / 2, SCREEN.z);
    b.add(m);
  }
  drawGeisha(ctx, 0);
  tex.needsUpdate = true;
  let t = 0, due = 0;
  return {
    group,
    update(dt) {
      t += dt; due -= dt;
      if (due > 0) return;
      due = 1 / GEISHA.fps;
      drawGeisha(ctx, t);
      tex.needsUpdate = true;
    },
  };
}
