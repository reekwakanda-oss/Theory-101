// Music theory primitives.
//
// Everything here is DERIVED from semitone arithmetic rather than tabulated, so
// enharmonic spelling is correct by construction: buildScale('Eb', MAJOR_STEPS)
// yields Eb F G Ab Bb C D, never D# F G G# A# C D. The one hardcoded table is
// KEY_SIGNATURES, which is small enough to verify by eye.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Net semitone shift of an accidental string like '#', 'bb', ''. */
export function accidentalOffset(accidentals) {
  let offset = 0;
  for (const ch of accidentals) {
    if (ch === '#') offset += 1;
    else if (ch === 'b') offset -= 1;
  }
  return offset;
}

/** Pitch class 0-11, where C = 0. */
export function pitchClass(note) {
  const semis = LETTER_SEMITONES[note[0].toUpperCase()] + accidentalOffset(note.slice(1));
  return ((semis % 12) + 12) % 12;
}

/** MIDI number. C4 = 60, A4 = 69. */
export function midiOf(note, octave) {
  return (octave + 1) * 12 + LETTER_SEMITONES[note[0].toUpperCase()] + accidentalOffset(note.slice(1));
}

export function freqOf(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Spell a pitch class using a specific letter, choosing the fewest accidentals. */
export function spellAs(letter, pc) {
  let diff = (((pc - LETTER_SEMITONES[letter]) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  const accidental = diff > 0 ? '#'.repeat(diff) : 'b'.repeat(-diff);
  return letter + accidental;
}

/** Render '#'/'b' as proper musical glyphs for display. */
export function pretty(note) {
  return String(note).replace(/#/g, '♯').replace(/b/g, '♭');
}

// --- Scales -----------------------------------------------------------------

export const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
export const NATURAL_MINOR_STEPS = [2, 1, 2, 2, 1, 2, 2];

/**
 * Build a scale by walking semitone steps while cycling letters, so every
 * scale uses each letter exactly once. That is what makes spelling correct.
 */
export function buildScale(tonic, steps = MAJOR_STEPS) {
  const letterIndex = LETTERS.indexOf(tonic[0].toUpperCase());
  let pc = pitchClass(tonic);
  const scale = [tonic];
  for (let i = 0; i < steps.length - 1; i++) {
    pc = (pc + steps[i]) % 12;
    scale.push(spellAs(LETTERS[(letterIndex + i + 1) % 7], pc));
  }
  return scale;
}

/**
 * How to reach a scale degree without walking the formula up from the tonic -
 * the shortcut the Scale Degrees drill promises. `semitones` is signed and
 * measured from the tonic, so a negative anchor is found by going down.
 *
 * These numbers are stated once here and quoted by every surface that teaches
 * them (the concept slide, the Scales lesson, the drill hint). They were
 * hand-written in all three and had already drifted apart.
 *
 * Ordered as they are taught: down from the tonic first, then the fifths, then
 * up from the tonic. Only the 3rd, 6th and 7th differ in natural minor, each
 * sitting a semitone lower.
 */
export const DEGREE_ANCHORS = [
  { degree: 7, semitones: -1, from: 'below the tonic' },
  { degree: 6, semitones: -3, from: 'below the tonic' },
  { degree: 5, semitones: 7, from: 'above the tonic' },
  { degree: 4, semitones: 5, from: 'above the tonic' },
  { degree: 3, semitones: 4, from: 'above the tonic' },
  { degree: 2, semitones: 2, from: 'above the tonic' },
];

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
const COUNTS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

export function ordinal(degree) {
  return ORDINALS[degree];
}

/** "a half step below the tonic", "seven half steps above the tonic". */
export function anchorPhrase({ semitones, from }) {
  const steps = Math.abs(semitones);
  return steps === 1 ? `a half step ${from}` : `${COUNTS[steps]} half steps ${from}`;
}

/**
 * The same anchors compressed to one line, for hints. Only the first names the
 * tonic; after that "three below" is unambiguous and repeating it grates.
 */
export function anchorSummary(anchors = DEGREE_ANCHORS) {
  return anchors.map((anchor, i) => {
    if (i === 0) return `the ${ordinal(anchor.degree)} sits ${anchorPhrase(anchor)}`;
    const direction = anchor.semitones < 0 ? 'below' : 'above';
    return `the ${ordinal(anchor.degree)} ${COUNTS[Math.abs(anchor.semitones)]} ${direction}`;
  }).join(', ');
}

// --- Intervals --------------------------------------------------------------

export const INTERVALS = [
  { semitones: 0, short: 'P1', name: 'Perfect Unison' },
  { semitones: 1, short: 'm2', name: 'Minor 2nd' },
  { semitones: 2, short: 'M2', name: 'Major 2nd' },
  { semitones: 3, short: 'm3', name: 'Minor 3rd' },
  { semitones: 4, short: 'M3', name: 'Major 3rd' },
  { semitones: 5, short: 'P4', name: 'Perfect 4th' },
  { semitones: 6, short: 'TT', name: 'Tritone' },
  { semitones: 7, short: 'P5', name: 'Perfect 5th' },
  { semitones: 8, short: 'm6', name: 'Minor 6th' },
  { semitones: 9, short: 'M6', name: 'Major 6th' },
  { semitones: 10, short: 'm7', name: 'Minor 7th' },
  { semitones: 11, short: 'M7', name: 'Major 7th' },
  { semitones: 12, short: 'P8', name: 'Perfect Octave' },
];

export function intervalBySemitones(n) {
  return INTERVALS.find((i) => i.semitones === n);
}

export function intervalByShort(short) {
  return INTERVALS.find((i) => i.short === short);
}

// How many letter names an interval spans, which is what makes C-F# a tritone
// (spelled as an augmented 4th) rather than a "Gb".
const LETTER_STEPS = {
  P1: 0, m2: 1, M2: 1, m3: 2, M3: 2, P4: 3, TT: 3,
  P5: 4, m6: 5, M6: 5, m7: 6, M7: 6, P8: 7,
};

/** Spell the note `short` semitones above `root`, with the correct letter. */
export function intervalAbove(root, short) {
  const interval = intervalByShort(short);
  const letterIndex = LETTERS.indexOf(root[0].toUpperCase());
  return spellAs(
    LETTERS[(letterIndex + LETTER_STEPS[short]) % 7],
    (pitchClass(root) + interval.semitones) % 12
  );
}

// --- Triads -----------------------------------------------------------------

export const TRIADS = {
  major: { intervals: [0, 4, 7], suffix: '', label: 'Major' },
  minor: { intervals: [0, 3, 7], suffix: 'm', label: 'Minor' },
  diminished: { intervals: [0, 3, 6], suffix: 'dim', label: 'Diminished' },
  augmented: { intervals: [0, 4, 8], suffix: 'aug', label: 'Augmented' },
};

/** Spell a triad with correct letters (root, third, fifth = every other scale letter). */
export function buildTriad(root, quality) {
  const { intervals } = TRIADS[quality];
  const letterIndex = LETTERS.indexOf(root[0].toUpperCase());
  const rootPc = pitchClass(root);
  return intervals.map((semis, i) =>
    spellAs(LETTERS[(letterIndex + i * 2) % 7], (rootPc + semis) % 12)
  );
}

// --- Keys -------------------------------------------------------------------

export const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
export const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export const KEY_SIGNATURES = {
  C: { sharps: 0, flats: 0 },
  G: { sharps: 1, flats: 0 },
  D: { sharps: 2, flats: 0 },
  A: { sharps: 3, flats: 0 },
  E: { sharps: 4, flats: 0 },
  B: { sharps: 5, flats: 0 },
  'F#': { sharps: 6, flats: 0 },
  F: { sharps: 0, flats: 1 },
  Bb: { sharps: 0, flats: 2 },
  Eb: { sharps: 0, flats: 3 },
  Ab: { sharps: 0, flats: 4 },
  Db: { sharps: 0, flats: 5 },
  Gb: { sharps: 0, flats: 6 },
};

/** Relative minor = 6th degree of the major scale. */
export function relativeMinor(majorTonic) {
  return buildScale(majorTonic, MAJOR_STEPS)[5];
}

/** Relative major = 3rd degree of the natural minor scale. */
export function relativeMajor(minorTonic) {
  return buildScale(minorTonic, NATURAL_MINOR_STEPS)[2];
}

// --- Diatonic harmony -------------------------------------------------------

export const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MAJOR_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'];

/** The seven diatonic triads of a major key. */
export function diatonicTriads(tonic) {
  const scale = buildScale(tonic, MAJOR_STEPS);
  return scale.map((degree, i) => ({
    roman: MAJOR_ROMAN[i],
    root: degree,
    quality: MAJOR_QUALITIES[i],
    notes: buildTriad(degree, MAJOR_QUALITIES[i]),
  }));
}

export const PROGRESSIONS = [
  { name: 'I – V – vi – IV', degrees: [0, 4, 5, 3], note: 'The pop progression. Thousands of songs.' },
  { name: 'ii – V – I', degrees: [1, 4, 0], note: 'The backbone of jazz harmony.' },
  { name: 'I – IV – V', degrees: [0, 3, 4], note: 'Folk, blues, and early rock.' },
  { name: 'vi – IV – I – V', degrees: [5, 3, 0, 4], note: 'The pop progression, started on the minor.' },
  { name: 'I – vi – IV – V', degrees: [0, 5, 3, 4], note: 'The 1950s doo-wop turnaround.' },
];

// --- Staff placement --------------------------------------------------------

/** Diatonic index: counts letter-steps from C0, ignoring accidentals. */
export function diatonicIndex(note, octave) {
  return octave * 7 + LETTERS.indexOf(note[0].toUpperCase());
}

// Bottom line of each clef: treble = E4, bass = G2.
export const CLEF_BOTTOM_LINE = {
  treble: diatonicIndex('E', 4),
  bass: diatonicIndex('G', 2),
};

// --- Note values ------------------------------------------------------------

export const NOTE_VALUES = [
  { name: 'Whole note', beats: 4, glyph: '𝅝' },
  { name: 'Half note', beats: 2, glyph: '𝅗𝅥' },
  { name: 'Quarter note', beats: 1, glyph: '𝅘𝅥' },
  { name: 'Eighth note', beats: 0.5, glyph: '𝅘𝅥𝅮' },
  { name: 'Sixteenth note', beats: 0.25, glyph: '𝅘𝅥𝅯' },
];

/** A dot adds half the note's own value again. */
export function dotted(beats) {
  return beats * 1.5;
}

// --- Utilities --------------------------------------------------------------

export function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Build a 4-option multiple choice set containing `answer`. */
export function choicesWith(answer, pool, count = 4) {
  const distractors = shuffle(pool.filter((x) => x !== answer)).slice(0, count - 1);
  return shuffle([answer, ...distractors]);
}
