// Tapping the HUD on a phone or tablet: every key it shows (each <kbd> in the help panel and the teleport list), the
// prompt ("… (E)") and each place in the teleport list send the game that key, as if it were typed. The page listens for
// keys only (main.js), so a tap is a keydown while your finger is down and a keyup when it lifts: the keys you hold
// (throttle, walking, turning, brake, run) are held as long as you hold them, and throttle and walking repeat as a held
// key does on a keyboard. Each finger is its own key, so you can hold W and tap Space. No three.js: Node tests the labels.

// a key's label as the HUD shows it -> the KeyboardEvent code main.js reads
export const KEY_CODES = {
  W: 'KeyW', S: 'KeyS', A: 'KeyA', D: 'KeyD', E: 'KeyE', H: 'KeyH', V: 'KeyV', M: 'KeyM', Z: 'KeyZ', X: 'KeyX', T: 'KeyT', K: 'KeyK',
  '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight',
  Space: 'Space', Shift: 'ShiftLeft', Esc: 'Escape',
  1: 'Digit1', 2: 'Digit2', 3: 'Digit3', 4: 'Digit4', 5: 'Digit5',
};
export const codeFor = (label) => KEY_CODES[String(label ?? '').trim()] ?? null;

// the keys a keyboard repeats while held that the game counts each time (main.js steps the throttle on each W / S
// keydown, repeats included): held down, they repeat after REPEAT.delay ms, every REPEAT.every ms
export const REPEATS = new Set(['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown']);
export const REPEAT = { delay: 350, every: 70 };

// the key a tapped element stands for, or null: a <kbd> by its label; a place in the teleport list by its number; the
// prompt by the key it names at its end, "(E)"
export function keyOf(el) {
  if (!el?.closest) return null;
  const kbd = el.closest('kbd');
  if (kbd) return codeFor(kbd.textContent);
  const li = el.closest('#teleportList li');
  if (li) return li.classList.contains('here') ? null : codeFor(li.querySelector('kbd')?.textContent);
  const prompt = el.closest('#prompt');
  if (prompt) return codeFor(prompt.textContent.match(/\((\w+)\)\s*$/)?.[1]);
  return null;
}

export function tapKeys(doc = document, win = window) {
  const down = new Map();   // pointerId -> { code, timer }
  const send = (type, code, repeat = false) => win.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true }));
  const lift = (id) => {
    const k = down.get(id);
    if (!k) return;
    down.delete(id);
    clearTimeout(k.timer); clearInterval(k.timer);
    send('keyup', k.code);
  };
  doc.addEventListener('pointerdown', (e) => {
    const code = keyOf(e.target);
    if (!code) return;
    e.preventDefault();   // (no text selection, no focus, no click after)
    lift(e.pointerId);
    const k = { code, timer: 0 };
    down.set(e.pointerId, k);
    send('keydown', code);
    if (REPEATS.has(code)) k.timer = setTimeout(() => { k.timer = setInterval(() => send('keydown', code, true), REPEAT.every); }, REPEAT.delay);
    e.target.setPointerCapture?.(e.pointerId);   // (its lift comes back here even if the finger slides off)
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) doc.addEventListener(type, (e) => lift(e.pointerId));
  win.addEventListener('blur', () => { for (const id of [...down.keys()]) lift(id); });
}

if (globalThis.document && globalThis.window) tapKeys();
