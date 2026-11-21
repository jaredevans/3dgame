// Horns and whistles, made with WebAudio (the basement's whistle, unchanged in sound).
// steam: a three-note whistle; diesel: a two-tone horn; bullet: the Silver Arrow's bright, airy two-note horn, rising
// a little as it sounds; future: the Metro Glide's soft three-note chime, each note ringing out.
let audio = null;
const KINDS = {
  steam: { dur: 0.9, cut: 2600, wave: 'triangle', notes: [587, 740, 880], gain: 0.09 },
  diesel: { dur: 1.1, cut: 1200, wave: 'sawtooth', notes: [277, 349], gain: 0.09 },
  bullet: { dur: 1.3, cut: 3200, wave: 'square', notes: [659, 831], gain: 0.05, rise: 1.03 },
  future: { dur: 1.2, cut: 2400, wave: 'sine', notes: [784, 988, 1175], gain: 0.12, chime: 0.28 },
};
export function horn(kind) {
  audio ||= new AudioContext();
  const k = KINDS[kind] ?? KINDS.diesel, t0 = audio.currentTime, dur = k.dur;
  const out = audio.createGain();
  out.gain.setValueAtTime(0, t0);
  if (k.chime) out.gain.linearRampToValueAtTime(k.gain, t0 + 0.02);
  else {
    out.gain.linearRampToValueAtTime(k.gain, t0 + 0.06);
    out.gain.setValueAtTime(k.gain, t0 + dur - 0.2);
    out.gain.linearRampToValueAtTime(0, t0 + dur);
  }
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = k.cut;
  out.connect(filter).connect(audio.destination);
  k.notes.forEach((f, i) => {
    const o = audio.createOscillator();
    o.type = k.wave;
    if (k.chime) {
      // a chime: each note struck in turn and left to ring away
      const at = t0 + i * k.chime, g = audio.createGain();
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.015); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.frequency.setValueAtTime(f, at);
      o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.05);
      return;
    }
    o.frequency.setValueAtTime(f * 0.97, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.08);
    if (k.rise) o.frequency.linearRampToValueAtTime(f * k.rise, t0 + dur);
    o.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  });
}
