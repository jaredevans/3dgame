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

// Polyfork's free per-part CDN, for the few parts whose kit isn't self-hosted (the suburbs' Neighborhood Pathways houses)
export const CDN = 'https://polyfork.dev/cdn/';

export function kitUrl(kitId, file, base = KIT_BASE) {
  return `${base}${kitId}/${file}`;
}

export function loadError(url, err) {
  return `Could not load: ${url}${err?.message ? ` (${err.message})` : ''}. Check the connection to the kit server and reload.`;
}
