// Web Audio playback. Synthesized only - no audio files, no MIDI, no microphone.
// See SYLLABUS.md for why the line is drawn here.

import { freqOf } from './theory.js';

let ctx = null;

/** AudioContext must be created or resumed inside a user gesture. */
export function ensureAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioReady() {
  return ctx !== null && ctx.state === 'running';
}

/**
 * A single tone with a soft envelope. Triangle wave with a lowpass reads as
 * warm rather than piercing, which matters when a drill plays hundreds of them.
 */
function tone(midi, startAt, duration, gain = 0.22) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.value = freqOf(midi);

  filter.type = 'lowpass';
  filter.frequency.value = 2600;

  const attack = 0.015;
  const release = 0.28;
  amp.gain.setValueAtTime(0, startAt);
  amp.gain.linearRampToValueAtTime(gain, startAt + attack);
  amp.gain.setValueAtTime(gain, startAt + duration);
  amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);

  osc.connect(filter);
  filter.connect(amp);
  amp.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + release + 0.02);
}

/**
 * Play MIDI notes.
 * mode 'harmonic' sounds them together, 'melodic' one after another.
 */
export function playMidi(midis, { mode = 'harmonic', duration = 0.85, gap = 0.5 } = {}) {
  if (!ensureAudio()) return;
  const now = ctx.currentTime + 0.05;
  const gain = mode === 'harmonic' ? 0.22 / Math.max(1, Math.sqrt(midis.length)) : 0.22;

  midis.forEach((midi, i) => {
    const startAt = mode === 'melodic' ? now + i * gap : now;
    tone(midi, startAt, duration, gain);
  });
}

/** Play a sequence of chords, e.g. a progression. */
export function playSequence(chords, { duration = 0.9, gap = 1.0 } = {}) {
  if (!ensureAudio()) return;
  const now = ctx.currentTime + 0.05;
  chords.forEach((midis, chordIndex) => {
    const gain = 0.22 / Math.max(1, Math.sqrt(midis.length));
    midis.forEach((midi) => tone(midi, now + chordIndex * gap, duration, gain));
  });
}

/** Total wall-clock seconds a call to playMidi/playSequence will occupy. */
export function durationOf(count, { mode = 'harmonic', duration = 0.85, gap = 0.5 } = {}) {
  return mode === 'melodic' ? (count - 1) * gap + duration + 0.3 : duration + 0.3;
}
