// Horns and whistles, made with WebAudio (the basement's whistle, unchanged in sound).
let audio = null;
export function horn(kind) {
  audio ||= new AudioContext();
  const t0 = audio.currentTime, dur = kind === 'steam' ? 0.9 : 1.1;
  const out = audio.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(0.09, t0 + 0.06);
  out.gain.setValueAtTime(0.09, t0 + dur - 0.2);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = kind === 'steam' ? 2600 : 1200;
  out.connect(filter).connect(audio.destination);
  const notes = kind === 'steam' ? [587, 740, 880] : [277, 349];
  for (const f of notes) {
    const o = audio.createOscillator();
    o.type = kind === 'steam' ? 'triangle' : 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.08);
    o.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
}
