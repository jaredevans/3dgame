// Whether the tour uses Polyfork's HD editions, and where a car's is. Pure, no three.js.
// HD editions come from the owner's Polyfork account CDN (https://polyfork.dev/c/<token>/, named in the gitignored
// tour/local.js: config.js puts it first in the part bases). HD is on when that link is configured; ?hd=0 turns it off
// (to compare, or on a slow machine). ?cdn= replaces every base, so it turns HD off too.
import { HD_EDITIONS } from './trains/specs.js';
import { maskAccount } from './config.js';

// a base is the account CDN by its /c/<token>/ path
export const isAccountCdn = (base) => typeof base === 'string' && /^https?:\/\/[^/]+\/c\/[^/]+\/$/.test(base);

const OFF = new Set(['0', 'off', 'false', 'no']);
export function hdOn(search, bases) {
  const hd = new URLSearchParams(search).get('hd');
  if (hd !== null && OFF.has(hd.toLowerCase())) return false;
  return isAccountCdn(bases?.[0]);
}

// a kit car's HD module, <account CDN><asset id>-hd.mjs, or null (HD off, or no HD edition of that part)
export function hdCarUrl(key, { on, bases, editions = HD_EDITIONS }) {
  const id = editions[key];
  if (!on || !id || !isAccountCdn(bases?.[0])) return null;
  return `${bases[0]}${id}-hd.mjs`;
}

// how an HD animal is dressed (Polyfork's materials engine, dressByAlbedo): its colour zones found by their albedo, the
// colour knobs' defaults (the GLB is built at its defaults), for the zones its -params.json says what they're made of; or
// if it says for none, what guess(params) makes of its knobs (materials.mjs guessMaterials). -> { zones, materials } or
// null (nothing to dress it with)
export function animalDress(json, guess = null) {
  const params = json?.params ?? {};
  const materials = json?.materials ?? guess?.(params) ?? {};
  const zones = {};
  for (const [zone, p] of Object.entries(params)) if (p?.type === 'color' && p.default && materials[zone]) zones[zone] = p.default;
  return Object.keys(zones).length ? { zones, materials } : null;
}

// how strong the HD materials' environment is now, 0..1.2 of its daytime strength, in steps of 1%: from stage()'s
// hemisphere light as it is after the time of day and the tunnel dimmer (its strength times its sky colour's luminance,
// linear), over its daytime 0.92 white
const DAY_HEMI = 0.92;
export function envLevel(intensity, { r, g, b }) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Math.round(Math.min(1.2, Math.max(0, (intensity * lum) / DAY_HEMI)) * 100) / 100;
}

// the animals the actors load (loadAnimal): dressed in HD, the maps their materials need are made at boot (hd.js)
export const HD_ANIMALS = ['deer-base', 'cow-base', 'saddled-horse-da86d3', 'wild-horse-047e93', 'herring-gull-base', 'dolphin-base', 'octopus-base', 'crow-base', 'stingray-base', 'grouper-base'];

// promise, or a rejection once `ms` have passed without it settling (err.timeout true): a load from a host that never
// answers is given up on, not waited on for ever. What it does after that is ignored
export function withTimeout(promise, ms, what = 'it') {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${what} took longer than ${ms} ms`);
      err.timeout = true;
      reject(err);
    }, ms);
  });
  promise.catch(() => {});   // a rejection after the time is up is nobody's
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// a message with the owner's account CDN link (https://host/c/<token>/) masked: it is never printed
export { maskAccount };   // (the account CDN's link, hidden from anything shown or logged: config.js)

// a JSON file at `url`, given `ms` (withTimeout: a host that never answers rejects marked as a timeout, so firstOf skips
// that base from then on, and the fetch is aborted). An answer that isn't ok is a failure naming its status (fetch
// doesn't throw on a 404). The timeout's message names the file, not the URL (it may be the account CDN's)
export function jsonWithin(url, ms, fetcher = globalThis.fetch) {
  const ctl = new AbortController(), file = String(url).slice(String(url).lastIndexOf('/') + 1);
  const got = (async () => {
    const r = await fetcher(url, { signal: ctl.signal });
    if (!r.ok) { const e = new Error(`${r.status} from ${maskAccount(url)}`); e.url = url; throw e; }
    return r.json();
  })();
  return withTimeout(got, ms, file).catch((err) => { if (err?.timeout) ctl.abort(); throw err; });
}
