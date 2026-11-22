// The map: the ring seen from above, north (-z) up, drawn on a 2D canvas only while it is open. mapFrame is pure.
import { legRoute, PLACES, RING } from './world-data.js';

// fit `points` into w x h with `pad` round them: one scale on both axes, centred, north (-z) up
export function mapFrame(points, { w, h, pad }) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const scale = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-6), (h - 2 * pad) / Math.max(z1 - z0, 1e-6));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  return { scale, toScreen: (x, z) => [w / 2 + (x - cx) * scale, h / 2 + (z - cz) * scale] };
}

const SAMPLE = 25;   // metres between a route's drawn points
const CREAM = '#f4ead8', GOLD = '#ffd98a', RED = '#ff4d3d', GREEN = '#4ade80';

export function makeMap(canvas) {
  const ctx = canvas.getContext('2d');
  const lines = RING.legs.map((id) => {
    const r = legRoute(id), pts = [], out = {};
    for (let s = 0; s < r.length + SAMPLE; s += SAMPLE) { const p = r.at(Math.min(s, r.length), out); pts.push({ x: p.x, z: p.z }); }
    return { id, pts };
  });
  const all = [...lines.flatMap((l) => l.pts), ...RING.places.map((id) => PLACES[id].centre)];
  const api = { open: false, toggle() { api.open ? api.close() : (api.open = true, canvas.classList.add('on')); }, close() { api.open = false; canvas.classList.remove('on'); } };

  api.draw = ({ you, leg = null, place = null, departure = null }) => {
    if (!api.open) return;
    const size = Math.round(Math.min(innerWidth, innerHeight) * 0.8), dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr) { canvas.width = canvas.height = size * dpr; canvas.style.width = canvas.style.height = `${size}px`; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#141b24e6';
    ctx.beginPath(); ctx.roundRect(0, 0, size, size, 16); ctx.fill();
    const f = mapFrame(all, { w: size, h: size, pad: size * 0.14 });
    ctx.lineWidth = 3; ctx.lineJoin = ctx.lineCap = 'round';
    for (const l of [...lines].sort((a, b) => (a.id === leg) - (b.id === leg))) {   // the current leg on top
      ctx.strokeStyle = l.id === leg ? GOLD : CREAM;
      ctx.beginPath();
      l.pts.forEach((p, i) => { const [px, py] = f.toScreen(p.x, p.z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
    }
    ctx.font = '600 14px "Avenir Next", "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const id of RING.places) {
      const [px, py] = f.toScreen(PLACES[id].centre.x, PLACES[id].centre.z);
      ctx.fillStyle = id === place ? GOLD : '#2b3747'; ctx.strokeStyle = CREAM; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = CREAM; ctx.fillText(PLACES[id].name, px, py - 16);
    }
    if (departure) {   // a green flag on a pole, and what leaves from there
      const [px, py] = f.toScreen(departure.x, departure.z);
      ctx.strokeStyle = GREEN; ctx.fillStyle = GREEN; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py - 22); ctx.lineTo(px + 14, py - 17); ctx.lineTo(px, py - 12); ctx.fill();
      const left = px + 18 + ctx.measureText(departure.label).width > size - 8;   // keep the label on the map
      ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(departure.label, left ? px - 6 : px + 18, left ? py - 28 : py - 14); ctx.textAlign = 'center';
    }
    const [yx, yy] = f.toScreen(you.x, you.z);   // you: a red dot with a tick the way you face (yaw 0 = +z = down the map)
    ctx.fillStyle = RED; ctx.strokeStyle = RED; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(yx, yy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(yx, yy); ctx.lineTo(yx + Math.sin(you.yaw) * 16, yy + Math.cos(you.yaw) * 16); ctx.stroke();
  };
  return api;
}
