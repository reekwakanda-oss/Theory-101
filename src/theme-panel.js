// The stone-and-light panel.
//
// It sits on the LEFT. The tutor already owns the right rail and the
// bottom-right corner, and two sheets fighting for one edge is worse than an
// asymmetry: ask on the right, choose the material on the left.
//
// The swatches are the whole idea. A colour picker that showed flat circles
// would be telling you about a palette, and this world does not have one - it
// has a material and a light. So every material swatch is carved FROM the
// material it offers, using that stone's own derived sheen and shade, with the
// current light burning in it. You are looking at a miniature of the interface
// you would get, not at a colour.
//
// The DOM is built once and then synced in place. Rebuilding it on every change
// would tear focus out of the colour input mid-drag, and dragging that input to
// watch the whole slab change material is the best thing in here.
import {
  MATERIALS, LIGHTS, DEFAULT_THEME, deriveTokens, usableStone,
  currentTheme, setTheme, onThemeChange, isNative,
} from './theme.js';
import { staffSvg } from './ui.js';

let root = null;
let open = false;
let note = '';
const swatches = { stones: [], lights: [] };

const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

// --- Building ---------------------------------------------------------------

function chrome() {
  root.innerHTML = `
    ${''/* The toggle is hidden while open: the panel covers that corner. */}
    <button class="theme-toggle" type="button" data-toggle
            aria-expanded="false" aria-controls="theme-panel">Stone &amp; light</button>
    <section class="theme" id="theme-panel" aria-label="Stone and light" inert>
      <header class="theme-head">
        <h2>Stone &amp; light</h2>
        <button class="theme-close" type="button" data-toggle
                aria-label="Close stone and light">&times;</button>
        <p class="theme-lede">Choose the material and the light.
           Everything else is cut to match, and cut to stay readable.</p>
      </header>

      <div class="theme-scroll">
        <div class="theme-group">
          <h3 class="theme-label" id="theme-material">Material</h3>
          <div class="theme-stones" role="radiogroup" aria-labelledby="theme-material"
               data-stones></div>
          <label class="theme-custom">
            <span>Cut your own</span>
            <span class="theme-custom-chip"><span class="theme-custom-face">
              <input type="color" data-stone-input
                     aria-label="Custom material colour"></span></span>
          </label>
        </div>

        <div class="theme-group">
          <h3 class="theme-label" id="theme-light">Light</h3>
          <div class="theme-lights" role="radiogroup" aria-labelledby="theme-light"
               data-lights></div>
          <label class="theme-custom">
            <span>Cut your own</span>
            <span class="theme-custom-chip"><span class="theme-custom-face">
              <input type="color" data-light-input
                     aria-label="Custom light colour"></span></span>
          </label>
        </div>

        ${''/* Proof, not decoration. DESIGN.md records that the staff once
              borrowed the shadow colour and vanished at 1.4:1, so notation is
              the component most worth showing before you commit to a material.
              This is the REAL staffSvg the drills use, not a mock of it, and
              the pips are the real .pip classes - if a choice broke either,
              it would break here first. */}
        <div class="theme-preview" aria-hidden="true">
          <h3 class="theme-label">In this material</h3>
          ${staffSvg('treble', 'G', 4)}
          <div class="theme-preview-row">
            <div class="pips">
              ${[1, 1, 1, 0, 0].map((on) => `<div class="pip${on ? ' on' : ''}"></div>`).join('')}
            </div>
            <span class="theme-verdict theme-right">Right</span>
            <span class="theme-verdict theme-wrong">Wrong</span>
          </div>
        </div>

        <p class="theme-note" data-note></p>
        <button class="theme-reset" type="button" data-reset>Back to porcelain</button>
      </div>
      <p class="visually-hidden" aria-live="polite" data-live></p>
    </section>`;

  root.querySelectorAll('[data-toggle]').forEach((el) =>
    el.addEventListener('click', () => toggle()));
  root.querySelector('[data-reset]').addEventListener('click', () => {
    note = '';
    setTheme({ ...DEFAULT_THEME });
    announce('Back to porcelain and candlelight.');
  });

  buildStones();
  buildLights();
  wireCustom('[data-stone-input]', (value) => {
    const { hex, adjusted } = usableStone(value);
    // Said plainly rather than silently corrected. A mid-value ground cannot
    // hold readable text at all, so the honest move is to move it and say so.
    note = adjusted
      ? 'That shade sits too near the middle to hold readable text, so it was '
        + 'moved to the nearest material that can.'
      : '';
    setTheme({ stone: hex });
  });
  wireCustom('[data-light-input]', (value) => setTheme({ light: value }));
}

/** One radio, carved from the material it offers. */
function buildStones() {
  const box = root.querySelector('[data-stones]');
  swatches.stones = MATERIALS.map((material) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'stone-swatch';
    el.setAttribute('role', 'radio');
    el.dataset.stone = material.stone;
    // NOT data-note: the note paragraph below uses that, and a swatch appears
    // earlier in the document, so querySelector('[data-note]') found the button
    // and wrote the note text into it - erasing Porcelain's own contents.
    el.dataset.blurb = material.note;
    el.innerHTML = '<span class="stone-swatch-pip" aria-hidden="true"></span>';
    const name = document.createElement('span');
    name.className = 'stone-swatch-name';
    name.textContent = material.name;
    el.appendChild(name);
    el.addEventListener('click', () => {
      note = material.note;
      setTheme({ stone: material.stone });
      announce(`${material.name}.`);
    });
    box.appendChild(el);
    return el;
  });
  rove(box, swatches.stones);
}

function buildLights() {
  const box = root.querySelector('[data-lights]');
  swatches.lights = LIGHTS.map((light) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'light-pip';
    el.setAttribute('role', 'radio');
    el.dataset.light = light.light;
    el.innerHTML = '<span class="light-pip-well" aria-hidden="true"></span>';
    const name = document.createElement('span');
    name.className = 'light-pip-name';
    name.textContent = light.name;
    el.appendChild(name);
    el.addEventListener('click', () => {
      setTheme({ light: light.light });
      announce(`${light.name} light.`);
    });
    box.appendChild(el);
    return el;
  });
  rove(box, swatches.lights);
}

/**
 * Roving tabindex: the group is one tab stop and the arrows move within it,
 * which is what a radio group is supposed to do. Selection follows focus, so
 * arrowing through the materials previews each one on the whole app.
 */
function rove(box, items) {
  box.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = items[(at + step + items.length) % items.length];
    next.focus();
    next.click();
  });
}

function wireCustom(selector, apply) {
  const input = root.querySelector(selector);
  // `input` fires continuously while the picker is dragged, which is the point:
  // the entire app re-materialises under the pointer. `change` is what gets
  // announced, so a screen reader is not read a hundred intermediate colours.
  input.addEventListener('input', () => apply(input.value));
  input.addEventListener('change', () => announce(`Custom colour ${input.value}.`));
}

// --- Syncing ----------------------------------------------------------------

/**
 * Update every swatch in place for the current choice.
 *
 * Each material swatch derives its OWN full token set with the current light,
 * so what you see in a swatch is exactly the relationship you would get: that
 * stone's relief, that stone's ink, that light burning in it.
 */
function sync() {
  const theme = currentTheme();
  const chosenStone = swatches.stones.find((el) => eq(el.dataset.stone, theme.stone));
  const chosenLight = swatches.lights.find((el) => eq(el.dataset.light, theme.light));

  for (const el of swatches.stones) {
    const t = deriveTokens(el.dataset.stone, theme.light);
    el.style.setProperty('--sw-stone', t['--stone']);
    el.style.setProperty('--sw-sheen', t['--sheen']);
    el.style.setProperty('--sw-shade', t['--shade']);
    el.style.setProperty('--sw-ink', t['--ink']);
    el.style.setProperty('--sw-glow', t['--glow']);
    el.style.setProperty('--sw-halo', t['--glow-halo']);
    select(el, el === chosenStone, swatches.stones, chosenStone);
  }

  for (const el of swatches.lights) {
    const t = deriveTokens(theme.stone, el.dataset.light);
    el.style.setProperty('--sw-glow', t['--glow']);
    el.style.setProperty('--sw-halo', t['--glow-halo']);
    select(el, el === chosenLight, swatches.lights, chosenLight);
  }

  root.querySelector('[data-stone-input]').value = theme.stone;
  root.querySelector('[data-light-input]').value = theme.light;
  // A custom colour matches no swatch, so it gets its own line.
  root.querySelector('[data-note]').textContent =
    note || chosenStone?.dataset.blurb || 'A material of your own.';
  root.querySelector('[data-reset]').hidden = isNative(theme) && eq(theme.stone, DEFAULT_THEME.stone);
}

/** aria-checked plus the roving tabindex, kept together so they cannot drift. */
function select(el, on, group, chosen) {
  el.setAttribute('aria-checked', on ? 'true' : 'false');
  // With nothing selected (a custom colour), the first item takes the tab stop
  // so the group is still reachable.
  el.tabIndex = on || (!chosen && el === group[0]) ? 0 : -1;
}

function announce(text) {
  const live = root?.querySelector('[data-live]');
  if (live) live.textContent = text;
}

// --- Behaviour --------------------------------------------------------------

function toggle(next = !open) {
  open = next;
  const panel = root.querySelector('.theme');
  const button = root.querySelector('.theme-toggle');
  panel.classList.toggle('open', open);
  // The panel covers this corner, so the toggle would otherwise sit invisible
  // underneath it and still be reachable by Tab.
  button.hidden = open;
  if (open) panel.removeAttribute('inert');
  else panel.setAttribute('inert', '');
  button.setAttribute('aria-expanded', String(open));
  if (open) (root.querySelector('[aria-checked="true"]') ?? panel).focus();
  else button.focus();
}

export function mountThemePanel() {
  root = document.getElementById('theme-root');
  if (!root) return;
  chrome();
  sync();
  onThemeChange(sync);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) toggle(false);
  });
}
