// Where the tour finds its Polyfork kits. They are self-hosted (never committed to this repo):
// ./kits/ when testing locally, or the owner's server via ?kits=<base url>.

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
export function resolvePartBases(search, { accountCdn = null } = {}) {
  const cdn = new URLSearchParams(search).get('cdn');
  if (cdn) return [slash(cdn)];
  return [...(accountCdn ? [slash(accountCdn)] : []), `${resolveKitBase(search)}parts/`, PUBLIC_CDN];
}
export const PART_BASES = resolvePartBases(globalThis.location?.search ?? '', local);

export function kitUrl(kitId, file, base = KIT_BASE) {
  return `${base}${kitId}/${file}`;
}

export function loadError(url, err) {
  return `Could not load: ${url}${err?.message ? ` (${err.message})` : ''}. Check the connection to the kit server and reload.`;
}
