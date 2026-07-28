// Web Audio playback. Synthesized only - no audio files, no MIDI, no microphone.
// See SYLLABUS.md for why the line is drawn here.
//
// The voice is an additive piano rather than a plain oscillator. Four things do
// the work, and all of them are things a synth tone gets wrong:
//
//   1. No sustain. A struck string decays from the instant it is hit; a plateau
//      followed by a release is the single biggest "synth" tell.
//   2. Partials decay at different rates. The upper harmonics die away much
//      faster than the fundamental, so the tone darkens as it rings.
//   3. Inharmonicity. Real strings are stiff, so partials sit slightly SHARP of
//      whole multiples. Perfectly harmonic partials fuse into an organ.
//   4. A hammer transient. A short filtered noise burst at onset gives the
//      attack its knock.

import { freqOf } from './theory.js';

let ctx = null;
let master = null;
let noiseBuffer = null;

/** AudioContext must be created or resumed inside a user gesture. */
export function ensureAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    // A gentle shelf keeps hundreds of drill repetitions from getting brittle.
    master = ctx.createGain();
    master.gain.value = 0.9;
    const tame = ctx.createBiquadFilter();
    tame.type = 'highshelf';
    tame.frequency.value = 3200;
    tame.gain.value = -5;
    master.connect(tame);
    tame.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioReady() {
  return ctx !== null && ctx.state === 'running';
}

/** One short burst of noise, reused for every hammer strike. */
function hammerNoise() {
  if (!noiseBuffer) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

const PARTIALS = 9;
/** String stiffness. Real pianos run ~0.0001 (bass) to ~0.001 (treble). */
const INHARMONICITY = 0.0004;

/** The level of a single struck note. */
const NOTE_GAIN = 0.5;

/**
 * Notes sounding at once would sum and clip, so a chord is scaled down until
 * it is about as loud as one note. Only for notes that actually overlap - a
 * melodic run must not be quietened just because it is long.
 */
function chordGain(count) {
  return NOTE_GAIN / Math.max(1, Math.sqrt(count));
}

/**
 * Notes meant to sound together still don't land together - a player's fingers
 * arrive a few milliseconds apart, and a chord struck at one exact instant is
 * the other big synth tell. Only for simultaneous notes; melodic ones are
 * already separated by their gap.
 */
function strikeOffset(index) {
  return index * 0.007;
}

/**
 * A single struck note.
 * `duration` is when the key is released and the damper falls, not the length
 * of the sound - a note may still be ringing when the damper arrives.
 */
function pianoNote(midi, startAt, duration, gain = 0.5) {
  const f0 = freqOf(midi);

  // Low strings ring far longer than high ones.
  const decay = 2.4 * Math.pow(440 / f0, 0.55);
  const noteOff = startAt + duration;
  const damper = 0.16;
  const attackEnd = startAt + 0.004;

  for (let n = 1; n <= PARTIALS; n++) {
    const freq = n * f0 * Math.sqrt(1 + INHARMONICITY * n * n);
    if (freq > 15000) break;

    // Amplitude falls with partial number; a touch of variation per note keeps
    // repeated pitches from sounding mechanically identical.
    const amp = gain * Math.pow(n, -1.4) * (0.9 + Math.random() * 0.2);
    const partialDecay = decay / (1 + 0.6 * (n - 1));

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const decayEnd = attackEnd + partialDecay;
    const floor = Math.max(amp * 0.0005, 0.00001);

    // The damper falls at key release, or the string dies first, whichever comes
    // sooner. Everything here is an explicit ramp on purpose: a setTargetAtTime
    // scheduled after an exponentialRampToValueAtTime CANCELS that ramp in
    // Chromium, which silently flattens the decay into a sustained synth tone.
    const dampAt = Math.min(noteOff, decayEnd);
    const progress = (dampAt - attackEnd) / (decayEnd - attackEnd);
    const levelAtDamp = Math.max(amp * Math.pow(floor / amp, progress), 0.00001);

    env.gain.setValueAtTime(0.0001, startAt);
    env.gain.linearRampToValueAtTime(amp, attackEnd);   // hammer contact
    env.gain.exponentialRampToValueAtTime(levelAtDamp, dampAt);
    env.gain.exponentialRampToValueAtTime(0.00001, dampAt + damper);

    osc.connect(env);
    env.connect(master);
    osc.start(startAt);
    osc.stop(dampAt + damper + 0.05);
  }

  // The knock of the hammer itself.
  const noise = ctx.createBufferSource();
  const noiseEnv = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noise.buffer = hammerNoise();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = Math.min(f0 * 3.5, 6000);
  noiseFilter.Q.value = 0.8;
  noiseEnv.gain.setValueAtTime(gain * 0.12, startAt);
  noiseEnv.gain.exponentialRampToValueAtTime(0.00001, startAt + 0.05);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseEnv);
  noiseEnv.connect(master);
  noise.start(startAt);
  noise.stop(startAt + 0.06);
}

/**
 * Play MIDI notes.
 * mode 'harmonic' sounds them together, 'melodic' one after another.
 */
export function playMidi(midis, { mode = 'harmonic', duration = 0.85, gap = 0.5 } = {}) {
  if (!ensureAudio()) return;
  const now = ctx.currentTime + 0.05;

  if (mode === 'melodic') {
    // One note at a time, so each sounds at full level however long the run is.
    midis.forEach((midi, i) => pianoNote(midi, now + i * gap, duration, NOTE_GAIN));
    return;
  }
  const gain = chordGain(midis.length);
  midis.forEach((midi, i) => pianoNote(midi, now + strikeOffset(i), duration, gain));
}

/** Play a sequence of chords, e.g. a progression. */
export function playSequence(chords, { duration = 0.9, gap = 1.0 } = {}) {
  if (!ensureAudio()) return;
  const now = ctx.currentTime + 0.05;
  chords.forEach((midis, chordIndex) => {
    const gain = chordGain(midis.length);
    const strikeAt = now + chordIndex * gap;
    midis.forEach((midi, i) => pianoNote(midi, strikeAt + strikeOffset(i), duration, gain));
  });
}

/** Total wall-clock seconds a call to playMidi/playSequence will occupy. */
export function durationOf(count, { mode = 'harmonic', duration = 0.85, gap = 0.5 } = {}) {
  return mode === 'melodic' ? (count - 1) * gap + duration + 0.3 : duration + 0.3;
}
