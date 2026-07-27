// Rendering helpers: SVG keyboard, SVG staff, and small chrome pieces.

import { LETTERS, diatonicIndex, CLEF_BOTTOM_LINE, pitchClass, pretty } from './theory.js';

const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Black keys sit after the 1st, 2nd, 4th, 5th and 6th white keys.
const BLACK = [
  { name: 'C#', after: 0 }, { name: 'D#', after: 1 }, { name: 'F#', after: 3 },
  { name: 'G#', after: 4 }, { name: 'A#', after: 5 },
];

/** One octave, with a single key highlighted. `highlight` is a note name like 'C' or 'Eb'. */
export function keyboardSvg(highlight) {
  const w = 42;
  const h = 168;
  const bw = 26;
  const bh = 104;
  const target = highlight ? pitchClass(highlight) : null;

  const whites = WHITE.map((note, i) => {
    const on = target !== null && pitchClass(note) === target;
    return `<rect class="key white${on ? ' on' : ''}" x="${i * w}" y="0"
              width="${w - 2}" height="${h}" rx="5" />`;
  }).join('');

  const blacks = BLACK.map(({ name, after }) => {
    const on = target !== null && pitchClass(name) === target;
    const x = (after + 1) * w - bw / 2 - 1;
    return `<rect class="key black${on ? ' on' : ''}" x="${x}" y="0"
              width="${bw}" height="${bh}" rx="4" />`;
  }).join('');

  return `<svg class="keyboard" viewBox="0 0 ${WHITE.length * w} ${h}"
            role="img" aria-label="One octave of a keyboard">
            ${whites}${blacks}
          </svg>`;
}

/** A single notehead on a five-line staff, with ledger lines where needed. */
export function staffSvg(clef, note, octave) {
  const width = 240;
  const gap = 14; // distance between staff lines
  const top = 34; // y of the top line
  const bottom = top + gap * 4;
  const noteX = 168;

  const lines = [0, 1, 2, 3, 4]
    .map((i) => `<line class="staff-line" x1="14" y1="${top + i * gap}" x2="${width - 10}" y2="${top + i * gap}" />`)
    .join('');

  // Each staff step (line to adjacent space) is half a line gap.
  const steps = diatonicIndex(note, octave) - CLEF_BOTTOM_LINE[clef];
  const y = bottom - (steps * gap) / 2;

  // Ledger lines for anything outside the five lines.
  const ledgers = [];
  for (let s = -2; s >= steps; s -= 2) {
    ledgers.push(bottom - (s * gap) / 2);
  }
  for (let s = 10; s <= steps; s += 2) {
    ledgers.push(bottom - (s * gap) / 2);
  }
  const ledgerMarks = ledgers
    .map((ly) => `<line class="staff-line" x1="${noteX - 17}" y1="${ly}" x2="${noteX + 17}" y2="${ly}" />`)
    .join('');

  const glyph = clef === 'treble' ? '𝄞' : '𝄢';
  const glyphY = clef === 'treble' ? bottom + 12 : top + 30;

  return `<svg class="staff" viewBox="0 0 ${width} ${bottom + 34}"
            role="img" aria-label="A note on the ${clef} staff">
            ${lines}
            <text class="clef" x="22" y="${glyphY}">${glyph}</text>
            ${ledgerMarks}
            <ellipse class="notehead" cx="${noteX}" cy="${y}" rx="9.5" ry="7"
                     transform="rotate(-18 ${noteX} ${y})" />
          </svg>`;
}

export function renderVisual(visual) {
  if (!visual) return '';
  if (visual.type === 'keyboard') return keyboardSvg(visual.highlight);
  if (visual.type === 'staff') return staffSvg(visual.clef, visual.note, visual.octave);
  return '';
}

/** Progress pips - the always-visible finish line the council insisted on. */
export function streakPips(streak, target) {
  const pips = Array.from({ length: target }, (_, i) =>
    `<span class="pip${i < streak ? ' on' : ''}"></span>`
  ).join('');
  return `<div class="pips" aria-label="${streak} of ${target} correct in a row">${pips}</div>`;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export { pretty, LETTERS };
