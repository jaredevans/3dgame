// Hiding and showing the HUD: the help panel of keys and the title in the corner. The button by "◂ Basement", or K, or
// tapping its key in the panel (tour/touch.js), hides them, so the view is clear (on a phone held upright the panel covers
// half of it); the button, or K, brings them back. What's still needed while it's hidden stays: the prompt, the speed and
// throttle panel, the map, the teleport list. Your choice is remembered in this browser.
const KEY = 'tour.hudHidden';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const write = (hidden) => { try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* (private mode: not kept) */ } };

export function hudToggle(doc = document, win = window) {
  const button = doc.getElementById('hudToggle');
  const set = (hidden) => {
    doc.body.classList.toggle('hud-off', hidden);
    button.textContent = hidden ? 'Show HUD' : 'Hide HUD';
    button.setAttribute('aria-pressed', String(hidden));
    write(hidden);
  };
  const flip = () => set(!doc.body.classList.contains('hud-off'));
  set(read());
  button.addEventListener('click', flip);
  win.addEventListener('keydown', (e) => { if (e.code === 'KeyK' && !e.repeat) flip(); });
}

if (globalThis.document?.getElementById('hudToggle')) hudToggle();
