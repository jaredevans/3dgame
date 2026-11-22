// Guards on three.js for what the kits' own modules do. Pure (handed the prototype), so Node can test it.

// Polyfork's part modules (their prep()/bake() helpers, in kits/ and on the CDNs: not ours to edit) call toNonIndexed()
// on geometry that's already non-indexed, ~1,400 times at boot and hundreds more each place streamed in, and three.js
// warns each time before handing back the geometry itself. Guarded, a non-indexed geometry is handed back the same,
// without the warning; an indexed one goes through three's own, as before
export function quietToNonIndexed(proto) {
  if (proto.toNonIndexed.quiet) return;
  const own = proto.toNonIndexed;
  const quiet = function toNonIndexed() { return this.index === null ? this : own.call(this); };
  quiet.quiet = true;
  proto.toNonIndexed = quiet;
}
