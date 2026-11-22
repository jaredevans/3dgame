// Where the tour finds its Polyfork kits. They are self-hosted (never committed to this repo):
// ./kits/ when testing locally, or the owner's server via ?kits=<base url>; or built from the owner's Polyfork account
// CDN (KIT_CDN, below), as the published site is.
import { KIT_IDS } from './kit-ids.js';

export function resolveKitBase(search) {
  const base = new URLSearchParams(search).get('kits') || './kits/';
  return base.endsWith('/') ? base : base + '/';
}

export const KIT_BASE = resolveKitBase(globalThis.location?.search ?? '');

export const KITS = {
  city: 'nyc-city-kit-fbca88',
  ocean: 'coast-and-boardwalk-d883fd',
  mountain: 'alpine-and-snow-092f66',
  west: 'frontier-town-a0085b',
  future: 'chrome-arcology-transit-kit-87a0e1',
  railway: 'countryside-railway-9b4c57',
  nature: 'nature-forest-kit-f29d6a',
};

// Single Polyfork parts, for the few whose kit isn't self-hosted (the suburbs' Neighborhood Pathways houses, the events'
// animals and props), tried in turn:
//   1. the owner's Polyfork account CDN (https://polyfork.dev/c/<token>/), if tour/local.js names it as `accountCdn`.
//      That file is gitignored: the link is the owner's, never committed to this public repo (tour/local.example.js
//      shows the shape). Without it this step is skipped.
//   2. self-hosted beside the kits, in <kits>/parts/ (scripts/extract-parts.mjs copies the ones the tour uses out of the
//      owner's Polyfork catalogue);
//   3. Polyfork's free public CDN, for any not copied yet.
// ?cdn=<base url> loads them from there only (a mirror, or a dead host to check the tour carries on without them).
export const PUBLIC_CDN = 'https://polyfork.dev/cdn/';
const slash = (base) => (base.endsWith('/') ? base : base + '/');
const local = await import('./local.js').then((m) => m.default ?? m, () => ({}));
// The kits built from the owner's Polyfork account CDN instead of a kits/ folder: for a site that has none (the
// published one, whose deploy job writes tour/local.js with `kits: 'cdn'` beside the link), or ?kits=cdn to try it here.
// Each kit's layout and ground, and its parts by their Polyfork ids (kit-ids.js), come from there, and so do kit.mjs,
// stage.mjs and clips.mjs. Polyfork says the link is safe in a page (it only reads files); it's still kept out of this
// repo. Without the link, the folder. -> the link, or null
export function resolveKitCdn(search, { accountCdn = null, kits = null } = {}) {
  const asked = new URLSearchParams(search).get('kits');
  return (asked ? asked === 'cdn' : kits === 'cdn') && accountCdn ? slash(accountCdn) : null;
}
const SEARCH = globalThis.location?.search ?? '';
export const KIT_CDN = resolveKitCdn(SEARCH, local);
if (!KIT_CDN && (new URLSearchParams(SEARCH).get('kits') === 'cdn' || local.kits === 'cdn')) {
  console.warn('kits from the CDN need an account CDN link in tour/local.js: using ./kits/');
}

export function resolvePartBases(search, { accountCdn = null } = {}) {
  const cdn = new URLSearchParams(search).get('cdn');
  if (cdn) return [slash(cdn)];
  return [...(accountCdn ? [slash(accountCdn)] : []), `${resolveKitBase(search)}parts/`, PUBLIC_CDN];
}
export const PART_BASES = resolvePartBases(SEARCH, local);

// the modules every kit shares, which the CDN serves once for all of them
const SHARED = new Set(['kit.mjs', 'stage.mjs', 'clips.mjs', 'city.mjs']);

// a kit's file: in its folder, or (cdn) where the account CDN serves it: the shared modules, the kit's layout (with its
// parts' ids and its ground: a different shape from the folder's LAYOUT.json, places.js reads both), a part by its id.
// A part key the kit doesn't have throws
export function kitUrl(kitId, file, base = KIT_BASE, cdn = KIT_CDN, ids = KIT_IDS) {
  if (!cdn) return `${base}${kitId}/${file}`;
  if (SHARED.has(file)) return `${cdn}${file}`;
  if (file === 'LAYOUT.json') return `${cdn}kit-${kitId}-layout.json`;
  const id = ids[kitId]?.[file.replace(/\.mjs$/, '')];
  if (!file.endsWith('.mjs') || !id) throw new Error(`${kitId} has no ${file} on the CDN (node scripts/kit-ids.mjs lists its parts)`);
  return `${cdn}${id}.mjs`;
}

// the account CDN's link, hidden from anything shown or logged
export const maskAccount = (text) => String(text).replace(/https?:\/\/[^\s/]+\/c\/[^\s/]+\//g, '<account CDN>/');

export function loadError(url, err) {
  return maskAccount(`Could not load: ${url}${err?.message ? ` (${err.message})` : ''}. Check the connection to the kit server and reload.`);
}
