# Theory 101

Learn music theory one concept at a time, then practise until it's yours.

An ethereal, calm alternative to streak-driven music apps. One slide per concept,
practice to a visible threshold, then ranked drills and longer lessons.

## Running it

No build step, no dependencies. Because it uses ES modules, it needs to be served
over HTTP rather than opened as a `file://` path:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

## How it works

**Welcome** — pick a starting proficiency and the areas you want to work on.
Confident users go straight to the dashboard; nobody is forced through the intro.

**Introduction** — ten concepts, in order, from note names to triads. Each is one
slide of explanation followed by practice. Advance at **5 correct in a row**, with
the counter always visible.

**Dashboard** — six ranked skill drills and three lessons. Concepts you mastered a
while ago resurface here when they're due for review.

**Ranks** — iron → bronze → silver → gold → platinum → diamond. Advancing needs both
accuracy and speed, and the question pool gets harder at each tier, so a Diamond
interval drill is drawing from genuinely harder material than a Bronze one.

## Layout

| Path | What's in it |
|------|--------------|
| `SYLLABUS.md` | The content spine — every concept, drill and lesson |
| `DECISIONS.md` | Why the product is shaped this way, and what was deferred |
| `ideas` | The original product notes |
| `src/theory.js` | Music theory primitives. Derived, not tabulated |
| `src/concepts.js` | The ten intro concepts: slide + question generator |
| `src/drills.js` | Ranked skill drills, difficulty-tiered |
| `src/lessons.js` | Scales, chords, chord progressions |
| `src/mastery.js` | Gating threshold and spaced review schedule |
| `src/ranks.js` | Tier thresholds and speed measurement |
| `src/quiz.js` | Shared question runner used by all three |
| `src/audio.js` | Web Audio playback — synthesized, no files |
| `src/ui.js` | SVG keyboard and staff rendering |
| `src/views.js` | Screens |
| `styles/tokens.css` | The entire visual identity |

## Design notes

**All theory is derived, not tabulated.** Scales come from semitone arithmetic plus
letter-cycling, so enharmonic spelling is correct by construction — `buildScale('Eb')`
gives `Eb F G Ab Bb C D`, never `D# F G G# A# C D`. This matters because a wrong
lookup table teaches confident nonsense.

**The failure state is designed.** After two wrong answers a hint appears; after three,
the explanation reopens beside the question. A wrong answer costs the streak and
nothing else. No lives, no penalties, no lockout — a gate that won't open is the one
thing guaranteed to break a calm mood.

**Every drill teaches a method, not a fact.** A drill has no slide to reopen, so its hint
carries the whole technique. Scale Degrees claims you can name a degree without counting up
from the tonic — so concept 7 teaches how (take the letter first, then reach for the nearest
anchor: the 7th sits a half step under the tonic, the 6th three under, the 5th seven above),
the Scales lesson works it through, and the drill hint recalls it. A drill that asks for a
shortcut nobody was taught is just a slower quiz.

**Mastery decays.** Concepts re-enter a review queue on a spaced schedule
(1 → 3 → 7 → 21 days), because a forward-only gate lets you "master" concept 3 and lose
it by concept 10.

**The aesthetic is a constraint, not a canvas.** Everything visual lives in
`styles/tokens.css`. Restyling the whole app means editing one file.

**Two renditions of one material.** Daylight (pale porcelain) is the default. The
blue-hour rendition is preserved in full and is opt-in — it deliberately does *not*
follow `prefers-color-scheme`, because the dark blue ground made the interface heavy
and the staff hard to read. To use it, set the attribute on the root element:

```html
<html lang="en" data-theme="dark">
```

**Notation is content, not chrome.** Staff lines, ledger lines and noteheads use the
`--rule` and `--glow` tokens, never the shadow pair. Styling them with `--shade` put
them at roughly 1.4:1 against the ground and made the staff invisible.

## Scope

v1 has **playback only** — a synthesized piano voice for any note, interval, chord or
progression. It is additive synthesis rather than samples: partials decay at
different rates, sit slightly sharp of whole multiples (string stiffness), and open
with a hammer transient. No audio files, so nothing to download and it works offline.

No MIDI input, no microphone, no pitch detection, no notation rendering
beyond a single notehead. Progress is stored in `localStorage`; there are no accounts
and no backend.
