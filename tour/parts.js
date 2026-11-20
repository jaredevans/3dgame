// Loading self-hosted Polyfork kit modules and parts. Every failure names the URL it tried.
import { kitUrl } from './config.js';

const modules = new Map();

export function kitModule(kitId, file) {
  const url = kitUrl(kitId, file);
  if (!modules.has(url)) {
    const p = import(new URL(url, location.href).href).catch((err) => {
      modules.delete(url);
      const e = new Error(err?.message ?? String(err));
      e.url = url;
      throw e;
    });
    modules.set(url, p);
  }
  return modules.get(url);
}

export async function part(kitId, key, params = {}) {
  const mod = await kitModule(kitId, `${key}.mjs`);
  const obj = await mod.createAsset(params);
  obj.userData.partKey = key;
  return obj;
}

// ---- the loading screen ----
const $ = (id) => document.getElementById(id);
let errorShown = false;   // once an error is up, later loading steps don't cover it
export function setLoading(text) { const el = $('loadStep'); if (el && !errorShown) el.textContent = text; }
export function showLoadError(msg) {
  const box = $('loading');
  if (!box || errorShown) return;
  box.classList.add('error');
  setLoading(msg);
  errorShown = true;
}
export function hideLoading() { $('loading')?.remove(); }
