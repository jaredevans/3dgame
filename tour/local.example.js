// Copy this file to tour/local.js (gitignored) to load the tour's single Polyfork parts from your own Polyfork account's
// CDN first. Its link is `cdn_base` from https://polyfork.dev/api/me (or the Polyfork MCP's who_am_i). It's tied to your
// account: keep it in tour/local.js, never in a committed file.
export default {
  // kits: 'cdn',   // build the kits from the account CDN too, as the published site does (no kits/ folder needed)
  accountCdn: 'https://polyfork.dev/c/<your-cdn-token>/',
};
