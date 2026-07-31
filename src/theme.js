// The lathe.
//
// A theme here is not a palette. The world is one slab of stone lit from
// within, so there are exactly two things to choose - the MATERIAL and the
// LIGHT - and every other value is cut from them: the shadow pair that makes
// the extrusion, all three ink levels, the staff rule, the two verdict hues,
// the six rank tiers.
//
// That is deliberate, and it is the same instinct as the rest of the app.
// theory.js derives every note from semitone arithmetic rather than a lookup
// table, so enharmonic spelling cannot rot. Colour is derived here for the same
// reason: a picker that let you set a background and a text colour separately
// would let you build an unreadable interface on the first click. You cannot
// pick anything here that fails AA, because contrast is not checked after the
// fact - it is the thing being solved for.
//
// Two rules the maths has to respect, both learned from this codebase:
//
//   1. Text is measured against the LIT ground, not the flat stone. .roomlight
//      washes the top of the page with --sheen at 0.5, and DESIGN.md already
//      records that a bare 4.5:1 value "drifts under AA there". So every text
//      solve runs against mix(stone, sheen, 0.5) - the worst ground the room
//      light can produce - and clears the floor everywhere on the page.
//
//   2. Reference lightness first, movement only if needed. Each token starts at
//      the lightness the hand-tuned design already uses and moves away from the
//      ground ONLY until it clears its floor. Without that the solver would
//      "correct" values that were already right and quietly redesign the app.

const STORE_KEY = 'theory101.theme.v1';

// --- Colour ----------------------------------------------------------------

function hexToRgb(hex) {
  const raw = String(hex).trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full.padEnd(6, '0').slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hex2 = (v) => Math.round(v).toString(16).padStart(2, '0');
const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** WCAG relative luminance. The 0.04045 knee is the sRGB transfer curve. */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/**
 * The luminance at which black and white are equally readable:
 * (L+0.05)/0.05 === 1.05/(L+0.05). Everything above this is a light ground and
 * takes dark ink; everything below is a dark ground and takes light ink.
 */
const CROSSOVER = Math.sqrt(0.0525) - 0.05; // 0.179

function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  const S = Math.min(100, Math.max(0, s)) / 100;
  const L = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = L - c / 2;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6];
  return t.map((v) => (v + m) * 255);
}

const rgba = ([r, g, b], a) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/**
 * Walk lightness away from `ground` until the contrast floor is met, starting
 * from the lightness the hand-tuned design already uses.
 *
 * Saturation is only surrendered when lightness alone cannot get there, which
 * happens on a mid-value ground where neither black nor white has much room.
 * usableStone() below keeps the app out of that band, but a custom colour can
 * still ask for it, so the fallback has to exist rather than loop forever.
 */
function solve(h, s, refL, target, ground) {
  // Walk toward whichever end has more contrast left, which is NOT the same as
  // "away from mid-grey". Black and white are equidistant in contrast at
  // luminance 0.179, not 0.5, because the WCAG ratio is not symmetric. Pivoting
  // at 0.5 sent a ground of luminance 0.45 climbing toward white, where only
  // 2.1:1 is available, and it returned near-white text on a pale green stone.
  const step = luminance(ground) < CROSSOVER ? 0.5 : -0.5;
  for (let sat = s; sat >= -1; sat -= 14) {
    const useSat = Math.max(0, sat);
    for (let l = refL; l >= 0 && l <= 100; l += step) {
      const rgb = hslToRgb(h, useSat, l);
      if (contrast(rgb, ground) >= target) return rgb;
    }
  }
  return hslToRgb(h, 0, step > 0 ? 100 : 0);
}

// --- The material ----------------------------------------------------------

/**
 * The relief: how far the sheen rises and the shade sinks from the stone.
 *
 * Not a fixed delta. On a pale stone the sheen has almost nowhere to go before
 * it clips at white, so the shadow carries the extrusion; on a dark stone the
 * shade clips at black instead and the sheen carries it. These two curves
 * reproduce the shipped porcelain pair (#ffffff / #c3cad9) and the shipped
 * blue-hour pair (#313b54 / #161b27) to within a point of lightness, which is
 * how the derived materials end up looking like they were cut by the same hand.
 */
const reliefUp = (l) => Math.min(100 - l, 5 + (100 - l) * 0.04);
const reliefDown = (l) => Math.min(l, 6 + l * 0.085);

/**
 * A mid-value ground cannot hold readable text: at 50% luminance neither black
 * nor white clears 9:1, so the ink ladder collapses and the extrusion goes to
 * mud at the same time. Rather than let someone build that and wonder why it
 * looks broken, the material is pushed to the nearer edge of the band it works
 * in, and the panel says so.
 */
export function usableStone(hex) {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb);
  const lum = luminance(rgb);
  if (lum >= 0.4 || lum <= 0.0667) return { hex: rgbToHex(rgb), adjusted: false };

  // Nearer edge in luminance, then binary-search the lightness that reaches it.
  const wantLight = lum > 0.22;
  const target = wantLight ? 0.4 : 0.0667;
  let lo = wantLight ? l : 0;
  let hi = wantLight ? 100 : l;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hslToRgb(h, s, mid)) < target) lo = mid;
    else hi = mid;
  }
  return { hex: rgbToHex(hslToRgb(h, s, wantLight ? hi : lo)), adjusted: true };
}

/** Reference lightnesses, taken straight from the two hand-tuned renditions. */
const REF = {
  light: { ink: 18, soft: 35, faint: 41, rule: 39, key: 21, right: 26, wrong: 42,
           iron: 39, bronze: 36, silver: 38, platinum: 28, diamond: 45 },
  dark: { ink: 95, soft: 75, faint: 65, rule: 68, key: 9, right: 66, wrong: 74,
          iron: 67, bronze: 60, silver: 82, platinum: 70, diamond: 81 },
};

/** Hue and saturation are identity; only lightness is negotiable. */
const HUES = {
  right: [157, 61], wrong: [345, 54], iron: [222, 16], bronze: [30, 52],
  silver: [220, 18], platinum: [175, 56], diamond: [224, 45],
};

/**
 * Everything, from two colours.
 *
 * Returns only the tokens that actually depend on the choice. The shadow
 * vocabulary, --warm, --incised and --glow-text are all written in terms of
 * these in tokens.css, so they follow for free - the token system was already
 * shaped for this and needed no rework.
 */
export function deriveTokens(stoneHex, lightHex) {
  const stone = hexToRgb(stoneHex);
  const [sh, ss, sl] = rgbToHsl(stone);
  const dark = luminance(stone) < CROSSOVER;

  const sheen = hslToRgb(sh, ss, sl + reliefUp(sl));
  const shade = hslToRgb(sh, ss, sl - reliefDown(sl));

  // Rule 1: text is measured against the ground the room light actually makes.
  const lit = mix(stone, sheen, 0.5);
  const ref = dark ? REF.dark : REF.light;
  const inkSat = Math.min(ss, 26);

  const [lh, ls, ll] = rgbToHsl(hexToRgb(lightHex));
  // A light on a dark ground has to read as a light SOURCE, not as tinted text,
  // so at night it starts bright and is held to a much higher floor. That is
  // not a fudge to match the hand-tuned #f2bd6c: it is why that value is bright
  // in the first place. Meeting only the 4.7 text floor put a dull ochre on the
  // blue-hour stone, which is the one rendition where the glow carries the most.
  // 7.3 is not a taste call: it is what the shipped night amber (#f2bd6c)
  // measures against its own lit ground, so the floor is the design's, read off
  // the design rather than guessed at.
  const glow = dark ? solve(lh, ls, Math.max(ll, 60), 7.3, lit)
                    : solve(lh, ls, ll, 4.7, lit);
  // The dimmed light, for a control that has bottomed out. Darker in either
  // rendition - which is MORE contrast in daylight and LESS at night, exactly
  // as the hand-tuned pair behaves - then floored so it stays readable.
  const glowDeep = solve(lh, ls, rgbToHsl(glow)[2] * (dark ? 0.76 : 0.67), 4.6, lit);

  const tone = (name, target) => solve(HUES[name][0], HUES[name][1], ref[name], target, lit);
  const right = tone('right', 4.8);
  const wrong = tone('wrong', 4.8);

  return {
    '--stone': rgbToHex(stone),
    '--sheen': rgbToHex(sheen),
    '--shade': rgbToHex(shade),

    '--ink': rgbToHex(solve(sh, inkSat, ref.ink, 8.5, lit)),
    '--ink-soft': rgbToHex(solve(sh, inkSat, ref.soft, 5.6, lit)),
    '--ink-faint': rgbToHex(solve(sh, inkSat, ref.faint, 4.7, lit)),
    // Notation is content, so the staff gets its own solve rather than
    // borrowing the shadow colour - the bug The Notation Is Content Rule exists
    // to prevent.
    '--rule': rgbToHex(solve(sh, inkSat, ref.rule, 4.8, lit)),
    '--key-black': rgbToHex(hslToRgb(sh, Math.min(ss, 22), ref.key)),

    '--glow': rgbToHex(glow),
    '--glow-deep': rgbToHex(glowDeep),
    '--glow-halo': rgba(glow, dark ? 0.3 : 0.26),
    '--glow-edge': rgba(dark ? glow : glowDeep, 0.55),

    '--right': rgbToHex(right),
    '--right-halo': rgba(right, dark ? 0.28 : 0.22),
    '--wrong': rgbToHex(wrong),
    '--wrong-halo': rgba(wrong, dark ? 0.26 : 0.2),

    '--iron': rgbToHex(tone('iron', 4.6)),
    '--bronze': rgbToHex(tone('bronze', 4.6)),
    '--silver': rgbToHex(tone('silver', 4.6)),
    '--gold': rgbToHex(glow), // the earned tier IS the light
    '--platinum': rgbToHex(tone('platinum', 4.6)),
    '--diamond': rgbToHex(tone('diamond', 4.6)),
    __dark: dark,
  };
}

// --- What you can choose ----------------------------------------------------

// `native` marks the two renditions tokens.css already carries by hand. Picking
// one with the default light writes NOTHING and lets the stylesheet stand, so
// the shipped design is reproduced exactly rather than approximately. The other
// four materials are cut by the maths above.
export const MATERIALS = [
  { id: 'porcelain', name: 'Porcelain', stone: '#edf0f6', native: 'light',
    note: 'The original. Barely blue, the airiest the material goes.' },
  { id: 'bone', name: 'Bone', stone: '#f2ece1',
    note: 'Warm ivory. Reads like paper under a lamp.' },
  { id: 'sage', name: 'Sage', stone: '#e6ece6',
    note: 'Cool green-grey, the quietest of the pale stones.' },
  { id: 'quartz', name: 'Quartz', stone: '#f3ebee',
    note: 'Pale rose. The warmest light rendition.' },
  { id: 'bluehour', name: 'Blue hour', stone: '#232a3b', native: 'dark',
    note: 'The same stone at night.' },
  { id: 'basalt', name: 'Basalt', stone: '#2a2724',
    note: 'Warm dark. Volcanic rather than cold.' },
];

// Hues are kept clear of the two verdict colours - jade at 157 and clay rose at
// 345 - so a light can never be mistaken for "correct" or "wrong".
export const LIGHTS = [
  { id: 'candlelight', name: 'Candlelight', light: '#8a5a12' },
  { id: 'copper', name: 'Copper', light: '#a04a16' },
  { id: 'ice', name: 'Ice', light: '#0f6b86' },
  { id: 'violet', name: 'Violet', light: '#6a3fa8' },
];

export const DEFAULT_THEME = { stone: MATERIALS[0].stone, light: LIGHTS[0].light };

const nativeFor = (stoneHex) =>
  MATERIALS.find((m) => m.native && m.stone.toLowerCase() === String(stoneHex).toLowerCase())?.native;

/** True when tokens.css can be left to speak for itself. */
export function isNative(theme) {
  return Boolean(nativeFor(theme.stone)) && theme.light.toLowerCase() === DEFAULT_THEME.light;
}

// --- State ------------------------------------------------------------------

let theme = { ...DEFAULT_THEME };
const listeners = new Set();

export const currentTheme = () => ({ ...theme });

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function read() {
  // Own key, plain localStorage - deliberately NOT the progress record.
  // validateProgress() rebuilds that record from a whitelist and drops unknown
  // keys, and sync.js runs every remote payload through it, so a theme stored
  // there would be wiped on the next reconcile. It is also a per-device
  // preference: the same account on a bright laptop and a dark phone should not
  // be forced into one rendition.
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_THEME };
    return {
      stone: usableStone(saved.stone ?? DEFAULT_THEME.stone).hex,
      light: /^#[0-9a-f]{6}$/i.test(saved.light ?? '') ? saved.light : DEFAULT_THEME.light,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function write() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(theme));
  } catch {
    /* private browsing - the choice simply does not outlive the tab */
  }
}

const OWNED = Object.keys(deriveTokens(DEFAULT_THEME.stone, DEFAULT_THEME.light))
  .filter((key) => key.startsWith('--'));

/**
 * Paint the choice onto <html>.
 *
 * Custom properties are set through CSSOM rather than a style attribute, so
 * this needs no style-src exemption in the Content-Security-Policy.
 */
export function applyTheme(next = theme, root = document.documentElement) {
  const native = nativeFor(next.stone);
  if (isNative(next)) {
    for (const key of OWNED) root.style.removeProperty(key);
    if (native === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    return;
  }
  const tokens = deriveTokens(next.stone, next.light);
  // data-theme carries --incised (which inverts on a dark ground) and
  // color-scheme, so form controls and scrollbars follow the material too.
  if (tokens.__dark) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  for (const key of OWNED) root.style.setProperty(key, tokens[key]);
}

export function setTheme(patch) {
  const merged = { ...theme, ...patch };
  if (patch.stone) merged.stone = usableStone(patch.stone).hex;
  if (merged.stone === theme.stone && merged.light === theme.light) return theme;
  theme = merged;
  write();
  applyTheme();
  for (const fn of listeners) fn(currentTheme());
  return theme;
}

export const resetTheme = () => setTheme({ ...DEFAULT_THEME });

// Applied at module evaluation, before main.js gets to render, so the material
// is already on the page rather than arriving as a flash of the default one.
if (typeof document !== 'undefined') {
  theme = read();
  applyTheme();
}
