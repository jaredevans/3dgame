// Loading self-hosted Polyfork kit modules and parts. Every failure names the URL it tried.
import { kitUrl, CDN } from './config.js';

// modules by URL, each imported once. A load that hangs can be given up on (forgetPending(), when the build it was for
// stalled): it's forgotten, and the next load of that URL imports it afresh under a query (?retry=n), since the browser's
// own module map would hand back the same hung import for the same URL. href(url) is the URL to import it by now (a kit's
// buildKit given moduleUrl imports its parts by the same). One that failed is tried again on the next load.
export function makeModules(importer) {
  const loads = new Map();   // url -> { promise, settled }
  const fresh = new Map();   // url -> how many times it was given up on
  const href = (url) => (fresh.get(url) ? `${url}${url.includes('?') ? '&' : '?'}retry=${fresh.get(url)}` : url);
  return {
    href,
    load(url) {
      if (!loads.has(url)) {
        const entry = { settled: false };
        entry.promise = importer(href(url)).then((m) => { entry.settled = true; return m; }, (err) => {
          entry.settled = true;
          if (loads.get(url) === entry) loads.delete(url);
          const e = new Error(err?.message ?? String(err));
          e.url = url;
          throw e;
        });
        loads.set(url, entry);
      }
      return loads.get(url).promise;
    },
    forgetPending() {
      for (const [url, entry] of loads) if (!entry.settled) { loads.delete(url); fresh.set(url, (fresh.get(url) ?? 0) + 1); }
    },
  };
}
const modules = makeModules((href) => import(href));
const absolute = (url) => new URL(url, location.href).href;

export function kitModule(kitId, file) { return modules.load(absolute(kitUrl(kitId, file))); }
// the URL a kit's module is to be imported by now (see makeModules)
export const kitModuleHref = (kitId, file) => modules.href(absolute(kitUrl(kitId, file)));
// give up on the imports still pending: the next load of each fetches afresh
export const forgetPending = () => modules.forgetPending();

export async function part(kitId, key, params = {}) {
  const mod = await kitModule(kitId, `${key}.mjs`);
  const obj = await mod.createAsset(params);
  obj.userData.partKey = key;
  return obj;
}

// a part from Polyfork's CDN by its asset id (as index.html loads its town's): its module loaded once
export async function cdnPart(assetId, params = {}) {
  const obj = await (await modules.load(`${CDN}${assetId}.mjs`)).createAsset(params);
  obj.userData.partKey = assetId;
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
