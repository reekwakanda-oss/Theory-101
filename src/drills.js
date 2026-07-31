// Dashboard skill drills (idea #3). Ranked and timed.
//
// generate(difficulty) takes the tier from the learner's current rank (1-3), so
// the question pool gets harder as they get faster. Rank is not a speed badge on
// a fixed quiz - Diamond is drawing from genuinely harder material than Bronze.

import {
  MAJOR_STEPS, NATURAL_MINOR_STEPS, TRIADS,
  buildScale, buildTriad, intervalByShort, midiOf, ascendingFrom, pretty, randomOf, choicesWith,
  ordinal, anchorSummary,
} from './theory.js';

const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const TREBLE_RANGE = {
  1: [['E', 4], ['G', 4], ['B', 4], ['D', 5], ['F', 5]], // lines only
  2: [['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4], ['C', 5], ['D', 5], ['E', 5], ['F', 5]],
  3: [['C', 4], ['D', 4], ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4],
      ['C', 5], ['D', 5], ['E', 5], ['F', 5], ['G', 5], ['A', 5]],
};

const BASS_RANGE = {
  1: [['G', 2], ['B', 2], ['D', 3], ['F', 3], ['A', 3]], // lines only
  2: [['G', 2], ['A', 2], ['B', 2], ['C', 3], ['D', 3], ['E', 3], ['F', 3], ['G', 3], ['A', 3]],
  3: [['E', 2], ['F', 2], ['G', 2], ['A', 2], ['B', 2], ['C', 3], ['D', 3],
      ['E', 3], ['F', 3], ['G', 3], ['A', 3], ['B', 3], ['C', 4]],
};

const INTERVAL_POOL = {
  1: ['P5', 'P8', 'M3'],
  2: ['P5', 'P8', 'M3', 'm3', 'P4', 'M2', 'M6'],
  3: ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'],
};

const CHORD_POOL = {
  1: ['major', 'minor'],
  2: ['major', 'minor', 'diminished'],
  3: ['major', 'minor', 'diminished', 'augmented'],
};

const SCALE_TONICS = {
  1: ['C', 'G', 'F'],
  2: ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'],
  3: ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'Db'],
};

function noteDrill(clef, ranges) {
  return (difficulty) => {
    const [note, octave] = randomOf(ranges[difficulty]);
    return {
      prompt: 'Name the note.',
      visual: { type: 'staff', clef, note, octave },
      choices: choicesWith(note, NATURALS),
      answer: note,
      play: { midis: [midiOf(note, octave)], mode: 'harmonic' },
    };
  };
}

export const DRILLS = [
  {
    id: 'note-treble',
    title: 'Treble Clef',
    blurb: 'Read noteheads on the treble staff, faster each rank.',
    hint: 'Treble spaces spell FACE from the bottom up. The lines are E G B D F.',
    focus: 'reading',
    generate: noteDrill('treble', TREBLE_RANGE),
  },
  {
    id: 'note-bass',
    title: 'Bass Clef',
    blurb: 'The same reading drill, on the bass staff.',
    hint: 'Bass lines are G B D F A from the bottom up. The spaces spell A C E G.',
    focus: 'reading',
    generate: noteDrill('bass', BASS_RANGE),
  },
  {
    id: 'interval-ear',
    title: 'Intervals by Ear',
    blurb: 'Hear two notes, name the distance. The pool widens as you rank up.',
    hint: 'Match it to a tune you know. A perfect 5th opens Twinkle Twinkle, a major 3rd opens When the Saints, an octave opens Somewhere Over the Rainbow.',
    focus: 'ear',
    generate(difficulty) {
      const short = randomOf(INTERVAL_POOL[difficulty]);
      const interval = intervalByShort(short);
      const root = randomOf(NATURALS);
      const rootMidi = midiOf(root, 4);
      const pool = INTERVAL_POOL[difficulty].map((s) => intervalByShort(s).name);
      return {
        prompt: 'Name the interval you hear.',
        visual: null,
        choices: choicesWith(interval.name, pool),
        answer: interval.name,
        play: { midis: [rootMidi, rootMidi + interval.semitones], mode: 'melodic' },
        autoPlay: true,
      };
    },
  },
  {
    id: 'chord-ear',
    title: 'Chord Quality',
    blurb: 'Major, minor, diminished, augmented — told apart by sound alone.',
    hint: 'Two questions, not one. The third only tells you bright (major or augmented) or dark (minor or diminished) — each pair shares it. The fifth decides: settled is plain major or minor, pinched inward is diminished, stretched open and hanging is augmented.',
    focus: 'ear',
    generate(difficulty) {
      const pool = CHORD_POOL[difficulty];
      const quality = randomOf(pool);
      const root = randomOf(NATURALS);
      const midis = TRIADS[quality].intervals.map((s) => midiOf(root, 4) + s);
      return {
        prompt: 'Name the chord quality you hear.',
        visual: null,
        choices: pool.map((q) => TRIADS[q].label),
        answer: TRIADS[quality].label,
        play: { midis, mode: 'harmonic' },
        autoPlay: true,
      };
    },
  },
  {
    id: 'scale-degrees',
    title: 'Scale Degrees',
    blurb: 'Name any degree of any scale without counting up from the tonic.',
    hint: `Take the letter first — count letters up from the tonic, never semitones. Then place it from an anchor: ${anchorSummary()}. In minor, drop the 3rd, 6th and 7th a half step.`,
    focus: 'scales',
    generate(difficulty) {
      const tonic = randomOf(SCALE_TONICS[difficulty]);
      const isMinor = difficulty === 3 && Math.random() < 0.4;
      const steps = isMinor ? NATURAL_MINOR_STEPS : MAJOR_STEPS;
      const scale = buildScale(tonic, steps);
      const degree = 2 + Math.floor(Math.random() * 6);
      const answer = pretty(scale[degree - 1]);
      const pool = SCALE_TONICS[3].flatMap((t) => buildScale(t, steps)).map(pretty);
      return {
        prompt: `${ordinal(degree)} degree of ${pretty(tonic)} ${isMinor ? 'natural minor' : 'major'}?`,
        visual: null,
        choices: choicesWith(answer, [...new Set(pool)]),
        answer,
        play: { midis: ascendingFrom(scale), mode: 'melodic', gap: 0.3 },
      };
    },
  },
  {
    id: 'chord-spelling',
    title: 'Chord Spelling',
    blurb: 'Build a triad from its name, with the right letters.',
    hint: 'Letters first: root, skip one, skip one — from C that is always C E G. Then set the semitones: major 4 then 3, minor 3 then 4, diminished 3 then 3, augmented 4 then 4.',
    focus: 'chords',
    generate(difficulty) {
      const roots = SCALE_TONICS[difficulty];
      const qualities = CHORD_POOL[difficulty];
      const root = randomOf(roots);
      const quality = randomOf(qualities);
      const answer = buildTriad(root, quality).map(pretty).join(' – ');
      const pool = ['major', 'minor', 'diminished', 'augmented']
        .filter((q) => q !== quality)
        .map((q) => buildTriad(root, q).map(pretty).join(' – '));
      return {
        prompt: `Spell the ${pretty(root)} ${quality} triad.`,
        visual: null,
        choices: choicesWith(answer, pool),
        answer,
        play: { midis: TRIADS[quality].intervals.map((s) => midiOf(root, 4) + s), mode: 'harmonic' },
      };
    },
  },
];

export function drillById(id) {
  return DRILLS.find((d) => d.id === id);
}
