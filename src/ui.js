// Rendering helpers: the carved keyboard, the engraved staff, and small chrome.
//
// Both instruments sit in a well pressed into the stone (the .instrument wrapper
// carries that shadow). Inside it, keys are raised faces and staff lines are cut
// grooves. The highlighted key is lit from beneath rather than filled with accent
// color - see the Keyboard entry in DESIGN.md.

import {
  LETTERS, diatonicIndex, CLEF_BOTTOM_LINE, pitchClass, pretty,
  DEGREE_ANCHORS, ordinal, anchorPhrase,
} from './theory.js';

const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Black keys sit after the 1st, 2nd, 4th, 5th and 6th white keys.
const BLACK = [
  { name: 'C#', after: 0 }, { name: 'D#', after: 1 }, { name: 'F#', after: 3 },
  { name: 'G#', after: 4 }, { name: 'A#', after: 5 },
];

// Gradient and filter ids must be unique per rendered instance.
let uid = 0;
const nextId = () => `t101-${(uid += 1)}`;

/** One octave, with a single key lit from underneath. */
export function keyboardSvg(highlight) {
  const w = 44;
  const h = 176;
  const bw = 27;
  const bh = 108;
  const id = nextId();
  const target = highlight ? pitchClass(highlight) : null;
  const isLit = (note) => target !== null && pitchClass(note) === target;

  // The keybed floor sits behind the keys. The gaps between keys are grooves cut
  // down to it, which is what separates the keys - no strokes, no borders.
  const keybed = `<rect class="keybed" x="0" y="0"
                        width="${WHITE.length * w}" height="${h}" rx="8" />`;

  const whites = WHITE.map((note, i) => {
    const x = i * w + 1.5;
    const kw = w - 3;
    const lit = isLit(note);
    return `
      <rect class="${lit ? 'key-lit-face' : 'key-white'}" x="${x}" y="0"
            width="${kw}" height="${h}" rx="6"
            ${lit ? `fill="url(#${id}-lit)"` : ''} />
      ${lit ? `<ellipse class="key-bloom" cx="${x + kw / 2}" cy="${h - 12}"
                        rx="${kw * 0.52}" ry="20" filter="url(#${id}-blur)" />` : ''}
      <path class="key-edge" d="M${x + 0.6} ${6} V${h - 6}" />
      <path class="key-lip" d="M${x + 5} ${h - 3} H${x + kw - 5}" />`;
  }).join('');

  const blacks = BLACK.map(({ name, after }) => {
    const x = (after + 1) * w - bw / 2;
    const lit = isLit(name);
    return `
      <rect class="${lit ? 'key-lit-face' : 'key-black'}" x="${x}" y="0"
            width="${bw}" height="${bh}" rx="5"
            ${lit ? `fill="url(#${id}-lit)"` : ''} />
      ${lit ? `<ellipse class="key-bloom" cx="${x + bw / 2}" cy="${bh - 10}"
                        rx="${bw * 0.6}" ry="15" filter="url(#${id}-blur)" />` : ''}
      <path class="key-lip" d="M${x + 4} ${bh - 2.5} H${x + bw - 4}" />`;
  }).join('');

  return `<svg class="keyboard" viewBox="0 0 ${WHITE.length * w} ${h}"
            role="img" aria-label="One octave of a keyboard">
            <defs>
              <linearGradient id="${id}-lit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" class="lit-top" />
                <stop offset="1" class="lit-bottom" />
              </linearGradient>
              <filter id="${id}-blur" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>
            ${keybed}${whites}${blacks}
          </svg>`;
}

/** A single notehead on a five-line staff. Lines are cut, not drawn. */
export function staffSvg(clef, note, octave) {
  const width = 250;
  const gap = 15;
  const top = 36;
  const bottom = top + gap * 4;
  const noteX = 176;
  const id = nextId();

  // Each groove is a dark cut with a pale lip directly beneath it.
  const lines = [0, 1, 2, 3, 4].map((i) => {
    const y = top + i * gap;
    return `<line class="staff-cut" x1="16" y1="${y}" x2="${width - 12}" y2="${y}" />
            <line class="staff-lip" x1="16" y1="${y + 1.3}" x2="${width - 12}" y2="${y + 1.3}" />`;
  }).join('');

  const steps = diatonicIndex(note, octave) - CLEF_BOTTOM_LINE[clef];
  const y = bottom - (steps * gap) / 2;

  const ledgers = [];
  for (let s = -2; s >= steps; s -= 2) ledgers.push(bottom - (s * gap) / 2);
  for (let s = 10; s <= steps; s += 2) ledgers.push(bottom - (s * gap) / 2);
  const ledgerMarks = ledgers.map((ly) => `
    <line class="staff-cut" x1="${noteX - 18}" y1="${ly}" x2="${noteX + 18}" y2="${ly}" />
    <line class="staff-lip" x1="${noteX - 18}" y1="${ly + 1.3}" x2="${noteX + 18}" y2="${ly + 1.3}" />`
  ).join('');

  // Clef glyphs vary between system fonts, so centre each on the line it names
  // and size it off the staff rather than trusting font metrics.
  const isTreble = clef === 'treble';
  const glyph = isTreble ? '𝄞' : '𝄢';
  const glyphSize = isTreble ? gap * 5.4 : gap * 3.4;
  const glyphY = isTreble ? bottom - gap * 1.35 : top + gap * 1.15;

  return `<svg class="staff" viewBox="0 0 ${width} ${bottom + 36}"
            role="img" aria-label="A note on the ${clef} staff">
            <defs>
              <filter id="${id}-blur" x="-140%" y="-140%" width="380%" height="380%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>
            ${lines}
            <text class="clef" x="30" y="${glyphY}" font-size="${glyphSize}"
                  dominant-baseline="central" text-anchor="middle">${glyph}</text>
            ${ledgerMarks}
            <ellipse class="note-bloom" cx="${noteX}" cy="${y}" rx="15" ry="12"
                     filter="url(#${id}-blur)" />
            <ellipse class="notehead" cx="${noteX}" cy="${y}" rx="10" ry="7.4"
                     transform="rotate(-18 ${noteX} ${y})" />
          </svg>`;
}

export function renderVisual(visual) {
  if (!visual) return '';
  let svg = '';
  if (visual.type === 'keyboard') svg = keyboardSvg(visual.highlight);
  else if (visual.type === 'staff') svg = staffSvg(visual.clef, visual.note, visual.octave);
  else return '';
  return `<div class="instrument">${svg}</div>`;
}

/** Progress pips: wells pressed into the stone, lit as they fill. */
export function streakPips(streak, target) {
  const pips = Array.from({ length: target }, (_, i) =>
    `<span class="pip${i < streak ? ' on' : ''}"></span>`
  ).join('');
  return `<div class="pips" aria-label="${streak} of ${target} correct in a row">${pips}</div>`;
}

/**
 * The scale-degree anchors as list items. The distances come from
 * DEGREE_ANCHORS, so the concept slide and the Scales lesson cannot drift
 * apart; each supplies its own `gloss` map, which is the part that differs.
 */
export function anchorList(gloss) {
  return DEGREE_ANCHORS.map(({ degree, ...anchor }) => `
    <li><strong>${ordinal(degree)}</strong> — ${anchorPhrase(anchor)}.
      ${gloss[degree]}</li>`).join('');
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export { pretty, LETTERS };
