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

// event sounds: 'bell' (one ding of a crossing's bell), 'whoosh' (something fast going by), 'rumble' (a low roll, as
// of rock or a heavy train) and 'roar' (a jet or a rocket). The noises are a filtered noise buffer; each stays under
// 0.12 gain
let noise = null;
function noiseBuffer() {
  if (noise) return noise;
  const n = audio.sampleRate * 2;
  noise = audio.createBuffer(1, n, audio.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}
// a burst of noise through a filter: its gain rising over `attack` s to `peak`, held, then gone by `dur`
function noiseBurst({ type, freq, to = freq, q = 0.7, peak, attack, dur }) {
  const t0 = audio.currentTime, src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = noiseBuffer(); src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur * 0.6)); g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t0); src.stop(t0 + dur + 0.05);
}
const SOUNDS = {
  bell() {
    // a struck bell: a few inharmonic partials, ringing away
    const t0 = audio.currentTime, out = audio.createGain();
    out.gain.value = 0.07;
    out.connect(audio.destination);
    for (const [f, a, d] of [[1180, 1, 0.9], [2950, 0.45, 0.5], [4400, 0.2, 0.3]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + d + 0.05);
    }
  },
  whoosh: () => noiseBurst({ type: 'bandpass', freq: 400, to: 2400, q: 1.2, peak: 0.1, attack: 0.5, dur: 1.4 }),
  rumble: () => noiseBurst({ type: 'lowpass', freq: 160, to: 90, q: 0.9, peak: 0.11, attack: 0.4, dur: 2.5 }),
  roar: () => noiseBurst({ type: 'lowpass', freq: 900, to: 300, q: 0.6, peak: 0.08, attack: 0.8, dur: 3.5 }),
  // the giant octopus: the sea heaving up as it breaks the surface (a deep swell of water rising and pouring off), and
  // the crash of its arms (or its bulk) hitting the water, with the spray hissing down after it
  surge() {
    noiseBurst({ type: 'lowpass', freq: 120, to: 420, q: 0.8, peak: 0.11, attack: 1.1, dur: 3.2 });
    noiseBurst({ type: 'bandpass', freq: 700, to: 1800, q: 0.7, peak: 0.05, attack: 1.6, dur: 3.4 });
  },
  splash() {
    noiseBurst({ type: 'lowpass', freq: 900, to: 140, q: 0.7, peak: 0.12, attack: 0.03, dur: 1.2 });
    noiseBurst({ type: 'highpass', freq: 2500, to: 4500, q: 0.5, peak: 0.05, attack: 0.15, dur: 2.2 });
  },
};
export function sound(name) {
  audio ||= new AudioContext();
  SOUNDS[name]?.();
}

// teleporting (T): a shimmering tone, rising as you fizz out (falling as you fizz in), `dur` s long. Two soft sines a
// fifth apart, beating against a third detuned a little, trembling quickly, with a breath of high noise sparkling over
// them; it stays under 0.08 gain
export function shimmer(rising = true, dur = 1.5) {
  audio ||= new AudioContext();
  const t0 = audio.currentTime, out = audio.createGain(), wobble = audio.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(0.06, t0 + 0.25);
  out.gain.setValueAtTime(0.06, t0 + dur - 0.35);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  wobble.gain.value = 0.6;
  out.connect(wobble).connect(audio.destination);
  // the tremble: the level swung by a fast low oscillator
  const lfo = audio.createOscillator(), depth = audio.createGain();
  lfo.frequency.setValueAtTime(11, t0); lfo.frequency.linearRampToValueAtTime(rising ? 19 : 7, t0 + dur);
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(wobble.gain);
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  const [lo, hi] = rising ? [1, 2.6] : [2.6, 1];
  for (const [f, type] of [[330, 'sine'], [495, 'sine'], [333, 'triangle']]) {
    const o = audio.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * lo, t0); o.frequency.exponentialRampToValueAtTime(f * hi, t0 + dur);
    o.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noiseBurst({ type: 'bandpass', freq: rising ? 5000 : 9000, to: rising ? 9000 : 5000, q: 2.5, peak: 0.03, attack: 0.3, dur });
}

// a ride's engine, looping while you ride (ride-run.js): engine(kind) -> { start(), stop(), set(level, burn) }, level 0..1
// the ride's speed against its cruise, raising its pitch and its loudness a little; burn 0..1 how hard a balloon's
// burners are burning (0 for the rest). 'car': the flying car's soft hum, two
// low tones a little apart and a breath of air over them; it stays under 0.05 gain. 'boat': the outboard's roar, two
// rasping saws a little out of tune with each other (they beat), its throb, and the hiss of spray over it, rising
// with its speed; under 0.07. 'balloon': the jets' whine, two high tones a little apart over a low turbine hum and the
// rush of their exhaust, rising with their thrust; and the burners' whoosh in bursts, a deep roar of noise, as hard as
// set()'s `burn` says they burn (the runner gives it from the ride's own clock); under 0.07. A kind with no sound of its
// own yet is silent
const ENGINES = {
  car: { tones: [[92, 'sine', 1], [185, 'triangle', 0.35]], cut: 700, air: { freq: 900, q: 0.8, gain: 0.25 }, gain: 0.045, pitch: [0.85, 1.15], idle: 0.45 },
  boat: { tones: [[58, 'sawtooth', 1], [61, 'sawtooth', 0.8], [117, 'square', 0.18]], cut: 650, air: { freq: 2600, q: 0.5, gain: 0.55 }, gain: 0.065, pitch: [0.7, 1.35], idle: 0.3 },
  balloon: {
    tones: [[1480, 'sine', 0.22], [1497, 'sine', 0.18], [2960, 'triangle', 0.05], [96, 'sawtooth', 0.35]], cut: 4200,
    air: { freq: 1400, q: 0.6, gain: 0.5 }, gain: 0.04, pitch: [0.8, 1.12], idle: 0.25,
    burner: { freq: 260, to: 520, q: 0.7, gain: 0.07 },
  },
};
const QUIET = { start() {}, stop() {}, set() {} };
export function engine(kind) {
  const k = ENGINES[kind];
  if (!k) return QUIET;
  let nodes = null;
  return {
    start() {
      if (nodes) return;
      audio ||= new AudioContext();
      const t0 = audio.currentTime, out = audio.createGain(), filter = audio.createBiquadFilter();
      out.gain.setValueAtTime(0, t0);
      out.gain.linearRampToValueAtTime(k.gain * k.idle, t0 + 0.8);
      filter.type = 'lowpass'; filter.frequency.value = k.cut;
      filter.connect(out).connect(audio.destination);
      const oscs = k.tones.map(([f, type, level]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.value = f * k.pitch[0]; g.gain.value = level;
        o.connect(g).connect(filter); o.start(t0);
        return { o, f };
      });
      const air = audio.createBufferSource(), bp = audio.createBiquadFilter(), ag = audio.createGain();
      air.buffer = noiseBuffer(); air.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = k.air.freq; bp.Q.value = k.air.q; ag.gain.value = k.air.gain;
      air.connect(bp).connect(ag).connect(out); air.start(t0);
      // the burners: a roar of low noise, straight out (not through the engine's level), silent until they fire
      let burn = null;
      if (k.burner) {
        const src = audio.createBufferSource(), lp = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = noiseBuffer(); src.loop = true;
        lp.type = 'lowpass'; lp.frequency.value = k.burner.freq; lp.Q.value = k.burner.q; g.gain.value = 0;
        src.connect(lp).connect(g).connect(audio.destination); src.start(t0);
        burn = { src, lp, g };
      }
      nodes = { out, oscs, air, burn };
    },
    set(level, burning = 0) {
      if (!nodes) return;
      const t = audio.currentTime, u = Math.min(1, Math.max(0, level));
      nodes.out.gain.setTargetAtTime(k.gain * (k.idle + (1 - k.idle) * u), t, 0.3);
      for (const { o, f } of nodes.oscs) o.frequency.setTargetAtTime(f * (k.pitch[0] + (k.pitch[1] - k.pitch[0]) * u), t, 0.3);
      if (nodes.burn) {
        // as hard as the burners burn now, the roar opening up as it swells
        const b = Math.min(1, Math.max(0, burning)), B = k.burner;
        nodes.burn.g.gain.setTargetAtTime(B.gain * b, t, 0.06);
        nodes.burn.lp.frequency.setTargetAtTime(B.freq + (B.to - B.freq) * b, t, 0.1);
      }
    },
    stop() {
      if (!nodes) return;
      const t = audio.currentTime, { out, oscs, air, burn } = nodes;
      nodes = null;
      out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.25);
      for (const { o } of oscs) o.stop(t + 1.5);
      air.stop(t + 1.5);
      if (burn) { burn.g.gain.cancelScheduledValues(t); burn.g.gain.setTargetAtTime(0, t, 0.2); burn.src.stop(t + 1.5); }
    },
  };
}
