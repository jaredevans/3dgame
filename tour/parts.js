// Loading self-hosted Polyfork kit modules and parts. Every failure names the URL it tried.
import { kitUrl, PART_BASES } from './config.js';
import { maskAccount, withTimeout } from './hd-switch.js';

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

// a part from a module at a URL of its own (an HD edition, hd.js), its module loaded once; key names it as the kit part
// it stands in for. A load that fails is thrown, naming the URL (and tried again next time)
export async function urlPart(url, key, params = {}) {
  const mod = await modules.load(url);
  const obj = await mod.createAsset(params);
  obj.userData.partKey = key;
  return obj;
}

// load(url) from each base in turn until one works: the account CDN if configured, the parts folder beside the kits, then
// Polyfork's public CDN. Taken from a later base, onFallback(url) says so (the part wasn't copied out of the catalogue);
// if none works, the last base's error is thrown. Every base but the last is given `wait` s: one that hasn't answered by
// then (a host that never answers) is given up on, and skipped from then on (`skip`, the page's); the last base is waited
// on as long as it takes, so a slow but working connection still gets its part. -> what load returned
export const BASE_WAIT = 15;
const slowBases = new Set();
export async function firstOf(bases, file, load, onFallback = () => {}, { wait = BASE_WAIT, skip = slowBases } = {}) {
  let err = null;
  for (const [i, base] of bases.entries()) {
    const last = i === bases.length - 1;
    if (!last && skip.has(base)) continue;
    try {
      const got = await (last ? load(`${base}${file}`) : withTimeout(load(`${base}${file}`), wait * 1000, file));
      if (i > 0) onFallback(`${base}${file}`, `${bases[0]}${file}`);
      return got;
    } catch (e) {
      if (e?.timeout) skip.add(base);
      err = e;
    }
  }
  throw err;
}
const warned = new Set();
// a part not self-hosted yet is said once: run scripts/extract-parts.mjs to copy it beside the kits (the account CDN's
// link, when that was the base it wanted, masked: it's never printed)
export const fellBack = (url, wanted) => {
  if (warned.has(wanted)) return;
  warned.add(wanted);
  console.warn(maskAccount(`${wanted} isn't self-hosted (run node scripts/extract-parts.mjs): loaded from ${url}`));
};
export const partBases = () => PART_BASES.map(absolute);

// a single part by its Polyfork asset id (as index.html loads its town's): its module loaded once, from the parts folder
// beside the kits, or Polyfork's public CDN if it isn't there
export async function cdnPart(assetId, params = {}) {
  const mod = await firstOf(partBases(), `${assetId}.mjs`, (url) => modules.load(url), fellBack);
  const obj = await mod.createAsset(params);
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
