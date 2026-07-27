// The ten intro concepts: one slide, then practice to the threshold.
// Order and content follow SYLLABUS.md.
//
// Each concept exposes generate() -> a question:
//   { prompt, visual, choices, answer, play, hint }

import {
  LETTERS, MAJOR_STEPS, NATURAL_MINOR_STEPS, KEY_SIGNATURES, NOTE_VALUES,
  buildScale, buildTriad, relativeMinor, intervalAbove, intervalByShort,
  pitchClass, midiOf, pretty, dotted, randomOf, choicesWith, TRIADS,
} from './theory.js';

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ENHARMONICS = [
  ['C#', 'Db'], ['D#', 'Eb'], ['F#', 'Gb'], ['G#', 'Ab'], ['A#', 'Bb'],
];

export const CONCEPTS = [
  {
    id: 'keys',
    title: 'Keys & Note Names',
    slide: `
      <p>Western music uses just <strong>seven letter names</strong>: A B C D E F G. After G
      it starts over at A. That's the whole alphabet you need.</p>
      <p>On a keyboard, the black keys come in groups of <strong>two</strong> and
      <strong>three</strong>. That pattern is how you find your place: <strong>C</strong> is
      always the white key immediately to the <em>left</em> of a group of two blacks, and
      <strong>F</strong> is immediately to the left of a group of three.</p>
      <p>Find C and F, and every other note follows.</p>`,
    hint: 'Locate the group of two black keys. The white key just left of it is C.',
    generate() {
      const answer = randomOf(NATURALS);
      return {
        prompt: 'Name the highlighted key.',
        visual: { type: 'keyboard', highlight: answer },
        choices: choicesWith(answer, NATURALS),
        answer,
        play: { midis: [midiOf(answer, 4)], mode: 'harmonic' },
      };
    },
  },

  {
    id: 'accidentals',
    title: 'Sharps, Flats & Enharmonics',
    slide: `
      <p>A <strong>sharp (♯)</strong> raises a note by one semitone — the very next key up,
      black or white. A <strong>flat (♭)</strong> lowers it by one semitone.</p>
      <p>This means the same key has two names. The black key between C and D is
      <strong>C♯</strong> if you got there by going up from C, and <strong>D♭</strong> if you
      came down from D. Same sound, two spellings. These are called
      <strong>enharmonic</strong> equivalents.</p>
      <p>Which name is correct depends on the key you're in — that's concept 9.</p>`,
    hint: 'Sharp goes up one key, flat goes down one. Ask which two letters the key sits between.',
    generate() {
      const [sharp, flat] = randomOf(ENHARMONICS);
      const askSharp = Math.random() < 0.5;
      const given = askSharp ? sharp : flat;
      const answer = askSharp ? flat : sharp;
      const pool = ENHARMONICS.flat().filter((n) => n !== given);
      return {
        prompt: `Which note names the same pitch as ${pretty(given)}?`,
        visual: { type: 'keyboard', highlight: given },
        choices: choicesWith(answer, pool).map(pretty),
        answer: pretty(answer),
        play: { midis: [midiOf(given, 4)], mode: 'harmonic' },
      };
    },
  },

  {
    id: 'staff',
    title: 'The Staff & Clefs',
    slide: `
      <p>Notes are written on a <strong>staff</strong>: five lines and four spaces. Where a
      notehead sits tells you which pitch it is.</p>
      <p>The <strong>clef</strong> anchors it. In <strong>treble clef</strong>, the bottom line
      is <strong>E</strong> and the lines going up spell E–G–B–D–F; the spaces spell
      <strong>F–A–C–E</strong>.</p>
      <p>In <strong>bass clef</strong>, the bottom line is <strong>G</strong>, lines spell
      G–B–D–F–A and spaces spell A–C–E–G.</p>`,
    hint: 'Treble spaces spell FACE from the bottom. Treble bottom line is E; bass bottom line is G.',
    generate() {
      const clef = Math.random() < 0.5 ? 'treble' : 'bass';
      const range = clef === 'treble'
        ? [['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5], ['D', 5], ['E', 5], ['F', 5]]
        : [['G', 2], ['A', 2], ['B', 2], ['C', 3], ['D', 3], ['E', 3], ['F', 3], ['G', 3], ['A', 3]];
      const [note, octave] = randomOf(range);
      return {
        prompt: `Name this note (${clef} clef).`,
        visual: { type: 'staff', clef, note, octave },
        choices: choicesWith(note, NATURALS),
        answer: note,
        play: { midis: [midiOf(note, octave)], mode: 'harmonic' },
      };
    },
  },

  {
    id: 'durations',
    title: 'Note Types & Duration',
    slide: `
      <p>A note's shape tells you how long it lasts. In <strong>4/4 time</strong>, where a
      quarter note gets one beat:</p>
      <ul>
        <li><strong>Whole note</strong> — 4 beats</li>
        <li><strong>Half note</strong> — 2 beats</li>
        <li><strong>Quarter note</strong> — 1 beat</li>
        <li><strong>Eighth note</strong> — ½ beat</li>
        <li><strong>Sixteenth note</strong> — ¼ beat</li>
      </ul>
      <p>A <strong>dot</strong> after a note adds half of its own value again. A dotted half
      note is 2 + 1 = <strong>3 beats</strong>.</p>`,
    hint: 'Each note is half the length of the one above it. A dot adds half the value back.',
    generate() {
      const value = randomOf(NOTE_VALUES.slice(0, 4));
      const isDotted = Math.random() < 0.4;
      const beats = isDotted ? dotted(value.beats) : value.beats;
      const label = (n) => (n === 0.5 ? '½' : n === 0.75 ? '¾' : n === 0.25 ? '¼' : String(n));
      const pool = ['4', '3', '2', '1.5', '1', '½', '¾', '¼', '6'];
      const answer = label(beats);
      return {
        prompt: `In 4/4 time, how many beats does a ${isDotted ? 'dotted ' : ''}${value.name.toLowerCase()} get?`,
        visual: null,
        choices: choicesWith(answer, pool),
        answer,
        play: null,
      };
    },
  },

  {
    id: 'steps',
    title: 'Half Steps & Whole Steps',
    slide: `
      <p>A <strong>half step</strong> (semitone) is the smallest distance in Western music —
      from any key to the very next key, black or white.</p>
      <p>A <strong>whole step</strong> (tone) is two half steps.</p>
      <p>Watch for the two places where white keys are only a half step apart with no black
      key between them: <strong>E→F</strong> and <strong>B→C</strong>. Everywhere else,
      adjacent white keys are a whole step. This asymmetry is why scales need a formula.</p>`,
    hint: 'E→F and B→C are half steps. All other adjacent white keys are whole steps.',
    generate() {
      const pairs = [
        ['C', 'D'], ['D', 'E'], ['E', 'F'], ['F', 'G'], ['G', 'A'], ['A', 'B'], ['B', 'C'],
        ['C', 'C#'], ['E', 'F#'], ['A', 'Bb'], ['G', 'Ab'], ['D', 'Eb'], ['Bb', 'C'],
        ['Eb', 'F'], ['F#', 'G#'], ['Ab', 'A'],
      ];
      const [from, to] = randomOf(pairs);
      const distance = (((pitchClass(to) - pitchClass(from)) % 12) + 12) % 12;
      const answer = distance === 1 ? 'Half step' : 'Whole step';
      return {
        prompt: `${pretty(from)} up to ${pretty(to)} — half step or whole step?`,
        visual: null,
        choices: ['Half step', 'Whole step'],
        answer,
        play: { midis: [midiOf(from, 4), midiOf(to, 4)], mode: 'melodic' },
      };
    },
  },

  {
    id: 'intervals',
    title: 'Intervals',
    slide: `
      <p>An <strong>interval</strong> is the distance between two notes. It has two parts: a
      <strong>number</strong> (how many letter names it spans) and a <strong>quality</strong>
      (major, minor, or perfect).</p>
      <p>Counting from C: C→D is a 2nd, C→E a 3rd, C→G a 5th. Always count the starting note
      as 1.</p>
      <p>Unisons, 4ths, 5ths and octaves are <strong>perfect</strong>. 2nds, 3rds, 6ths and
      7ths are <strong>major</strong> or <strong>minor</strong> — minor is one semitone
      smaller than major.</p>
      <p>Learn these by ear as much as by sight. A perfect 5th is the opening of
      <em>Twinkle Twinkle</em>; a major 3rd is the first two notes of <em>When the Saints</em>.</p>`,
    hint: 'Count letter names inclusively: C to G is C-D-E-F-G = five letters = a 5th.',
    generate() {
      const shorts = ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'P8'];
      const short = randomOf(shorts);
      const root = randomOf(NATURALS);
      const upper = intervalAbove(root, short);
      const interval = intervalByShort(short);
      const byEar = Math.random() < 0.5;
      const pool = shorts.map((s) => intervalByShort(s).name);

      return {
        prompt: byEar
          ? 'Listen, then name the interval.'
          : `What is the interval from ${pretty(root)} up to ${pretty(upper)}?`,
        visual: null,
        choices: choicesWith(interval.name, pool),
        answer: interval.name,
        play: {
          midis: [midiOf(root, 4), midiOf(root, 4) + interval.semitones],
          mode: 'melodic',
        },
        autoPlay: byEar,
      };
    },
  },

  {
    id: 'major-scale',
    title: 'The Major Scale',
    slide: `
      <p>Every major scale follows one formula of whole (W) and half (H) steps:</p>
      <p class="formula">W – W – H – W – W – W – H</p>
      <p>Start on C and apply it using only white keys and you get
      <strong>C D E F G A B</strong>. Start anywhere else and you'll need sharps or flats to
      make the pattern fit.</p>
      <p>Each note is a <strong>degree</strong>, numbered 1–7. The 1st is the
      <strong>tonic</strong> — the note that feels like home.</p>`,
    hint: 'Count up the scale from the tonic: W-W-H-W-W-W-H. The degree number counts the tonic as 1.',
    generate() {
      const tonics = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab'];
      const tonic = randomOf(tonics);
      const degree = 2 + Math.floor(Math.random() * 6); // degrees 2-7
      const scale = buildScale(tonic, MAJOR_STEPS);
      const answer = pretty(scale[degree - 1]);
      const pool = tonics.flatMap((t) => buildScale(t, MAJOR_STEPS)).map(pretty);
      const ordinal = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][degree];
      return {
        prompt: `What is the ${ordinal} degree of ${pretty(tonic)} major?`,
        visual: null,
        choices: choicesWith(answer, [...new Set(pool)]),
        answer,
        play: { midis: scale.map((n) => midiOf(n, 4)), mode: 'melodic', gap: 0.32 },
      };
    },
  },

  {
    id: 'minor-scale',
    title: 'Minor Scales',
    slide: `
      <p>The <strong>natural minor</strong> scale uses a different formula:</p>
      <p class="formula">W – H – W – W – H – W – W</p>
      <p>Compared to major, its 3rd, 6th and 7th degrees are each a semitone lower. That
      flattened 3rd is what makes minor sound darker.</p>
      <p>Every major scale has a <strong>relative minor</strong> that uses exactly the same
      notes, starting from the <strong>6th degree</strong>. C major and A minor share all
      seven notes — only the starting point differs.</p>`,
    hint: 'The relative minor starts on the 6th degree of the major scale — three semitones below the tonic.',
    generate() {
      const tonics = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'];
      const tonic = randomOf(tonics);
      const askRelative = Math.random() < 0.5;

      if (askRelative) {
        const answer = pretty(relativeMinor(tonic));
        const pool = tonics.map((t) => pretty(relativeMinor(t)));
        return {
          prompt: `What is the relative minor of ${pretty(tonic)} major?`,
          visual: null,
          choices: choicesWith(answer, [...new Set(pool)]),
          answer,
          play: { midis: buildScale(relativeMinor(tonic), NATURAL_MINOR_STEPS).map((n) => midiOf(n, 4)), mode: 'melodic', gap: 0.32 },
        };
      }

      const degree = 3 + Math.floor(Math.random() * 5); // degrees 3-7
      const scale = buildScale(tonic, NATURAL_MINOR_STEPS);
      const answer = pretty(scale[degree - 1]);
      const pool = tonics.flatMap((t) => buildScale(t, NATURAL_MINOR_STEPS)).map(pretty);
      const ordinal = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][degree];
      return {
        prompt: `What is the ${ordinal} degree of ${pretty(tonic)} natural minor?`,
        visual: null,
        choices: choicesWith(answer, [...new Set(pool)]),
        answer,
        play: { midis: scale.map((n) => midiOf(n, 4)), mode: 'melodic', gap: 0.32 },
      };
    },
  },

  {
    id: 'key-signatures',
    title: 'Key Signatures',
    slide: `
      <p>Rather than writing an accidental on every note, the sharps or flats a key needs are
      collected at the start of the staff as a <strong>key signature</strong>.</p>
      <p>They always appear in a fixed order.</p>
      <p><strong>Sharps:</strong> F C G D A E B<br>
         <strong>Flats:</strong> B E A D G C F — the same list backwards.</p>
      <p>C major has none. Each step clockwise round the circle of fifths (C→G→D→A…) adds one
      sharp; each step the other way (C→F→B♭→E♭…) adds one flat.</p>`,
    hint: 'Sharps go F C G D A E B. Flats go B E A D G C F. C major has neither.',
    generate() {
      const keys = Object.keys(KEY_SIGNATURES);
      const key = randomOf(keys);
      const { sharps, flats } = KEY_SIGNATURES[key];
      const askCount = Math.random() < 0.5;

      if (askCount) {
        const kind = flats > 0 ? 'flats' : 'sharps';
        const count = flats > 0 ? flats : sharps;
        const answer = String(count);
        return {
          prompt: `How many ${kind} does ${pretty(key)} major have?`,
          visual: null,
          choices: choicesWith(answer, ['0', '1', '2', '3', '4', '5', '6']),
          answer,
          play: { midis: buildScale(key, MAJOR_STEPS).map((n) => midiOf(n, 4)), mode: 'melodic', gap: 0.3 },
        };
      }

      const kind = flats > 0 ? 'flats' : 'sharps';
      const count = flats > 0 ? flats : sharps;
      const answer = pretty(key);
      const pool = keys
        .filter((k) => {
          const sig = KEY_SIGNATURES[k];
          return (flats > 0 ? sig.flats : sig.sharps) !== count || k === key;
        })
        .map(pretty);
      return {
        prompt: count === 0
          ? 'Which major key has no sharps and no flats?'
          : `Which major key has exactly ${count} ${kind}?`,
        visual: null,
        choices: choicesWith(answer, pool),
        answer,
        play: null,
      };
    },
  },

  {
    id: 'triads',
    title: 'Triads',
    slide: `
      <p>A <strong>triad</strong> is three notes stacked in thirds: a <strong>root</strong>, a
      <strong>third</strong>, and a <strong>fifth</strong>. Take a scale and skip every other
      note.</p>
      <p>Four qualities, defined by which thirds you stack:</p>
      <ul>
        <li><strong>Major</strong> — major 3rd then minor 3rd (bright)</li>
        <li><strong>Minor</strong> — minor 3rd then major 3rd (dark)</li>
        <li><strong>Diminished</strong> — two minor 3rds (tense, unstable)</li>
        <li><strong>Augmented</strong> — two major 3rds (floating, unresolved)</li>
      </ul>
      <p>Only the middle note changes between a major and minor triad. One semitone is the
      whole difference between happy and sad.</p>`,
    hint: 'Major = 4 then 3 semitones. Minor = 3 then 4. The root and fifth stay the same.',
    generate() {
      const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'];
      const qualities = ['major', 'minor', 'diminished', 'augmented'];
      const root = randomOf(roots);
      const quality = randomOf(qualities);
      const notes = buildTriad(root, quality);
      const midis = TRIADS[quality].intervals.map((s) => midiOf(root, 4) + s);
      const byEar = Math.random() < 0.5;

      if (byEar) {
        const answer = TRIADS[quality].label;
        return {
          prompt: 'Listen, then name the chord quality.',
          visual: null,
          choices: qualities.map((q) => TRIADS[q].label),
          answer,
          play: { midis, mode: 'harmonic' },
          autoPlay: true,
        };
      }

      const answer = notes.map(pretty).join(' – ');
      const pool = qualities
        .filter((q) => q !== quality)
        .map((q) => buildTriad(root, q).map(pretty).join(' – '));
      return {
        prompt: `Spell the ${pretty(root)} ${quality} triad.`,
        visual: null,
        choices: choicesWith(answer, pool),
        answer,
        play: { midis, mode: 'harmonic' },
      };
    },
  },
];

export const CONCEPT_IDS = CONCEPTS.map((c) => c.id);

export function conceptById(id) {
  return CONCEPTS.find((c) => c.id === id);
}

export function conceptIndex(id) {
  return CONCEPTS.findIndex((c) => c.id === id);
}

/** Proficiency chosen at onboarding decides where the intro starts. */
export function startIndexFor(proficiency) {
  if (proficiency === 'some') return conceptIndex('intervals');
  return 0;
}
