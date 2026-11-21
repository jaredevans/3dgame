// The keys you're holding down. Pure, no DOM: the page feeds it keydown / keyup.
// Boarding a train ignores whatever you were already holding (a W held while walking up to it is not throttle)
// until you let go of it and press it again.
export function makeKeys() {
  const held = new Set(), ignored = new Set();
  return {
    down(code) { held.add(code); },
    up(code) { held.delete(code); ignored.delete(code); },
    clear() { held.clear(); ignored.clear(); },
    ignoreHeld() { for (const k of held) ignored.add(k); },
    // held, and pressed since the last ignoreHeld
    has: (code) => held.has(code) && !ignored.has(code),
    ignored: (code) => ignored.has(code),
  };
}
