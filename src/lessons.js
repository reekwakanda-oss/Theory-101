// Lessons (idea #5). Longer-form than intro slides, each ending in an
// identification activity that reuses the same question shape as everything else.

import {
  MAJOR_STEPS, NATURAL_MINOR_STEPS, PROGRESSIONS, TRIADS,
  buildScale, buildTriad, diatonicTriads, midiOf, ascendingFrom, pretty, randomOf, choicesWith,
} from './theory.js';
import { anchorList } from './ui.js';

const TONICS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb'];

/** The lesson states the anchors more tersely than the concept slide does. */
const LESSON_GLOSS = {
  7: 'The leading tone.',
  6: `The relative minor's home.`,
  5: 'The next key clockwise on the circle of fifths.',
  4: 'The next key anticlockwise; your tonic is the 5th of it.',
  3: 'The degree that makes the scale major.',
  2: '',
};

export const LESSONS = [
  {
    id: 'scales',
    title: 'Scales',
    focus: 'scales',
    blurb: 'Major, natural minor, and the relative relationship between them.',
    sections: [
      {
        heading: 'A scale is a formula, not a list',
        body: `<p>There is no need to memorise seven notes for every key. There is one
        formula, applied from a different starting note.</p>
        <p class="formula">Major: W – W – H – W – W – W – H</p>
        <p>Apply it from C using only white keys and you get C D E F G A B. Apply it from G
        and the 7th note has to be raised to F♯ to keep the pattern — which is exactly why
        G major has one sharp.</p>`,
      },
      {
        heading: 'Minor is the same notes, moved',
        body: `<p class="formula">Natural minor: W – H – W – W – H – W – W</p>
        <p>Its 3rd, 6th and 7th degrees sit a semitone lower than major's. The flattened 3rd
        is what your ear hears as "sad".</p>
        <p>Start any major scale on its <strong>6th degree</strong> and you are playing its
        <strong>relative minor</strong> — identical notes, different home. C major and A
        minor are the same seven pitches.</p>`,
      },
      {
        heading: 'Finding a degree without counting',
        body: `<p>Counting W–W–H–W–W–W–H from the tonic works, but it is far too slow to be
        useful mid-song. Split the job in two instead.</p>
        <p><strong>The letter is free.</strong> A scale uses each letter once, in order, so
        degree <em>n</em> always lands on the letter <em>n</em> along from the tonic. The 6th
        of E♭ is <em>some kind of C</em> before you have thought about a single semitone.
        Only the accidental is still open.</p>
        <p><strong>The accidental comes from an anchor.</strong> Every degree sits within one
        step of one you already know:</p>
        <ul>${anchorList(LESSON_GLOSS)}</ul>
        <p>The top of the scale is reached by walking <em>down</em> from the tonic, the bottom
        by walking up, and the 4th and 5th come from the same fifth-relationship you use to
        name keys. The 6th of E♭ is a C, three half steps under E♭ — C natural. Done, without
        a formula.</p>
        <p>In natural minor the 2nd, 4th and 5th are identical; the 3rd, 6th and 7th each sit
        a half step lower. So the 3rd is three half steps <em>above</em> the tonic — the
        relative major's home — and the 7th is a whole step below the tonic rather than
        a half.</p>`,
      },
      {
        heading: 'Why spelling matters',
        body: `<p>E♭ major is spelled E♭ F G A♭ B♭ C D — never D♯ F G G♯ A♯ C D, even though
        those are the same keys on a piano. Each letter name is used exactly once. Getting
        this right is what makes written music readable at a glance.</p>`,
      },
    ],
    activity: {
      title: 'Identify the scale',
      generate() {
        const tonic = randomOf(TONICS);
        const isMinor = Math.random() < 0.5;
        const steps = isMinor ? NATURAL_MINOR_STEPS : MAJOR_STEPS;
        const scale = buildScale(tonic, steps);
        const answer = isMinor ? 'Natural minor' : 'Major';
        return {
          prompt: `Listen to the scale starting on ${pretty(tonic)}. Major or natural minor?`,
          visual: null,
          choices: ['Major', 'Natural minor'],
          answer,
          play: { midis: ascendingFrom([...scale, tonic]), mode: 'melodic', gap: 0.3 },
          autoPlay: true,
        };
      },
    },
  },

  {
    id: 'chords',
    title: 'Chords',
    focus: 'chords',
    blurb: 'How triads are built, and which ones belong to a key.',
    sections: [
      {
        heading: 'Stack thirds',
        body: `<p>Take a scale and skip every other note: 1, 3, 5. That is a
        <strong>triad</strong> — root, third, fifth.</p>
        <p>Four qualities depend on which thirds you stack:</p>
        <ul>
          <li><strong>Major</strong> — major 3rd, then minor 3rd (4 + 3 semitones)</li>
          <li><strong>Minor</strong> — minor 3rd, then major 3rd (3 + 4)</li>
          <li><strong>Diminished</strong> — two minor 3rds (3 + 3)</li>
          <li><strong>Augmented</strong> — two major 3rds (4 + 4)</li>
        </ul>`,
      },
      {
        heading: 'Every key has seven chords',
        body: `<p>Build a triad on each degree of a major scale, using only notes from that
        scale, and the qualities always fall in the same order:</p>
        <p class="formula">I  ii  iii  IV  V  vi  vii°</p>
        <p>Uppercase is major, lowercase is minor, and the 7th is diminished. In C major that
        is C, Dm, Em, F, G, Am, Bdim. This pattern holds in every major key — which is why
        musicians talk in numbers rather than note names.</p>`,
      },
    ],
    activity: {
      title: 'Identify the chord',
      generate() {
        const qualities = ['major', 'minor', 'diminished', 'augmented'];
        const quality = randomOf(qualities);
        const root = randomOf(TONICS);
        const midis = TRIADS[quality].intervals.map((s) => midiOf(root, 4) + s);
        const byEar = Math.random() < 0.6;

        if (byEar) {
          return {
            prompt: 'Listen. What quality is this chord?',
            visual: null,
            choices: qualities.map((q) => TRIADS[q].label),
            answer: TRIADS[quality].label,
            play: { midis, mode: 'harmonic' },
            autoPlay: true,
          };
        }
        const answer = buildTriad(root, quality).map(pretty).join(' – ');
        const pool = qualities.filter((q) => q !== quality)
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
  },

  {
    id: 'progressions',
    title: 'Chord Progressions',
    focus: 'chords',
    blurb: 'Roman numerals, and the handful of progressions worth knowing.',
    sections: [
      {
        heading: 'Numbers travel, note names do not',
        body: `<p>A progression written as <strong>I – V – vi – IV</strong> works in any key.
        In C that's C–G–Am–F; in G it's G–D–Em–C. Same feeling, different pitches. This is
        why numerals are the shared language.</p>`,
      },
      {
        heading: 'The ones worth knowing',
        body: `<ul>
          <li><strong>I – V – vi – IV</strong> — the pop progression, behind an enormous number of hits</li>
          <li><strong>ii – V – I</strong> — the backbone of jazz harmony</li>
          <li><strong>I – IV – V</strong> — folk, blues, early rock</li>
          <li><strong>vi – IV – I – V</strong> — the same pop loop begun on the minor</li>
          <li><strong>I – vi – IV – V</strong> — the 1950s doo-wop turnaround</li>
        </ul>
        <p>The <strong>V</strong> chord wants to resolve to <strong>I</strong>. Almost
        everything in tonal harmony is built on that pull.</p>`,
      },
    ],
    activity: {
      title: 'Identify the progression',
      generate() {
        const tonic = randomOf(['C', 'G', 'F', 'D']);
        const progression = randomOf(PROGRESSIONS);
        const triads = diatonicTriads(tonic);
        const chords = progression.degrees.map((d) => {
          const chord = triads[d];
          return TRIADS[chord.quality].intervals.map((s) => midiOf(chord.root, 4) + s);
        });
        return {
          prompt: `In ${pretty(tonic)} major — which progression is this?`,
          visual: null,
          choices: choicesWith(progression.name, PROGRESSIONS.map((p) => p.name)),
          answer: progression.name,
          playSequence: chords,
          autoPlay: true,
        };
      },
    },
  },
];

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id);
}
