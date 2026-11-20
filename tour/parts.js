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
export function setLoading(text) { const el = $('loadStep'); if (el) el.textContent = text; }
export function showLoadError(msg) {
  const box = $('loading');
  if (!box) return;
  box.classList.add('error');
  setLoading(msg);
}
export function hideLoading() { $('loading')?.remove(); }
