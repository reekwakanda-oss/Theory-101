---
name: Theory 101
description: Music theory carved from a single slab of pale stone, lit from within.
colors:
  stone: "#edf0f6"
  shade: "#c3cad9"
  sheen: "#ffffff"
  ink: "#232a3b"
  ink-soft: "#4a5468"
  ink-faint: "#5b6478"
  rule: "#5a6478"
  key-black: "#2b3242"
  glow: "#8a5a12"
  glow-deep: "#5c3c0a"
  right: "#1a6b49"
  wrong: "#a8324c"
  stone-night: "#232a3b"
  shade-night: "#161b27"
  sheen-night: "#313b54"
  ink-night: "#eef1f8"
  rule-night: "#9aa6c2"
  glow-night: "#f2bd6c"
typography:
  display:
    fontFamily: "Candara, Optima, 'Gill Sans Nova', 'Segoe UI Variable Display', sans-serif"
    fontSize: "clamp(2rem, 1.6rem + 2vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.005em"
  title:
    fontFamily: "Candara, Optima, 'Gill Sans Nova', sans-serif"
    fontSize: "clamp(1.15rem, 1.05rem + 0.5vw, 1.4rem)"
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: "'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1rem, 0.96rem + 0.2vw, 1.08rem)"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "'Segoe UI Variable Small', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    letterSpacing: "0.16em"
rounded:
  pebble: "14px"
  slab: "26px"
  well: "20px"
  full: "999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "34px"
  xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.glow}"
    rounded: "{rounded.full}"
    padding: "16px 40px"
  button-primary-hover:
    textColor: "{colors.glow}"
  choice:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pebble}"
    padding: "18px 20px"
  choice-correct:
    textColor: "{colors.right}"
  choice-wrong:
    textColor: "{colors.wrong}"
  card:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slab}"
    padding: "20px"
  slide:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.slab}"
    padding: "34px"
---

# Design System: Theory 101

## Overview

**Creative North Star: "The Lit Slab"**

The entire interface is one continuous piece of pale stone. Nothing sits *on*
the page; everything is carved *out of* it. Panels rise from the surface, wells sink
into it, and the only thing that ever changes color is light — a single warm
candle-amber that appears exactly where the learner is active and nowhere else.

This is neumorphism taken at its word. Conventional soft-UI treats extrusion as a
skin over ordinary components: grey plastic, dual shadows, done. Here the extrusion
*is* the component vocabulary, and the material is not plastic but a cold translucent
stone that glows where it is thin. That glow is the ethereal half of the brief, and
it is load-bearing rather than atmospheric: it marks the active control, fills the
mastery pips, blooms behind a correct answer, and lights the highlighted piano key
from underneath.

The register is deliberately quiet. The product's position is calm over compulsion,
so the surface never flashes, never celebrates, never stacks competing signals. What
it does instead is *warm*. Interaction heats the stone; that is the whole emotional
vocabulary.

**Key Characteristics:**
- One ground color for every surface — panels are never a different color from the page
- Depth comes only from paired offset shadows, never from borders or fills
- One accent hue (candlelight amber) for live state; the two verdict hues and the six
  rank tiers are state marks, not palette
- Flared humanist letterforms, cut into the stone with a paired text-shadow
- Daylight is the primary rendition; the blue-hour rendition is opt-in via `data-theme="dark"` and no longer follows the OS

## Colors

A pale, barely-blue ground carrying one warm light, plus two semantic hues that
appear only on answer feedback, and one token reserved for notation.

### Primary
- **Candlelight Amber** (`#8a5a12` daylight, `#f2bd6c` night): the light inside the stone. Focus rings, lit
  mastery pips, the active rank mark, the bloom behind a correct answer, the lit
  piano key. Never fills a *panel*, and never decorates — but it is the light itself,
  so light-emitting objects (a lit pip, the lit key face, a notehead) are made of it.
  A lighter gold measured 2.18:1 on the pale stone, failing the 3:1 floor for the
  focus ring, the pips and the lit key — hence the deep amber in daylight.

### Secondary
- **Jade Bloom** (`#1a6b49` daylight, `#79d9ae` night): correct answers only.
- **Clay Rose** (`#a8324c` daylight, `#e88fa1` night): wrong answers only. Muted deliberately — a wrong answer
  costs the streak and nothing else, so it must not read as alarm.

### Neutral
- **Porcelain Stone** (`#edf0f6`): the single material. Page ground, every panel,
  every control. Barely blue, and deliberately not soft UI's `#e0e5ec` grey.
- **Deep Shade** (`#c3cad9`) / **Pale Sheen** (`#ffffff`): the shadow pair that
  produces all depth. They fill only where a groove exposes the floor beneath —
  the keybed and an unlit pip.
- **Rule** (`#5a6478` daylight, `#9aa6c2` night): staff and ledger lines. Notation is
  content, so it gets its own token and never borrows the shadow color.
- **Key Black** (`#2b3242` daylight, `#12161f` night): the piano's black keys, which
  stay black in either light.
- **Deep Slate** (`#232a3b`): primary text.
- **Slate Vapor** (`#4a5468`): secondary text. **Dim Vapor** (`#5b6478`): tertiary,
  held at 5.4:1 — deliberate margin, because the room light lifts the ground near the
  top of the page and a 4.5:1 value drifts under AA there.
- **Blue-Hour Stone** (`#232a3b`): the same material at night. Preserved in full as
  an opt-in rendition, not wired to `prefers-color-scheme`.

### Named Rules

**The One Material Rule.** Every surface is the same color as the page. A panel that
needs its own background color has failed to be carved and must be re-solved with
shadow.

**The Light Means Live Rule.** Candlelight amber marks only what is currently active
or achieved. If amber appears on something the learner cannot act on or has not
earned, it is decoration and must be removed.

**The Notation Is Content Rule.** Staff lines, ledger lines and noteheads are things
the learner must READ, not chrome. They use `--rule` and `--glow`, never the shadow
pair. Borrowing `--shade` for staff lines put them at roughly 1.4:1 and made the staff
invisible — the exact failure this rule exists to prevent.

**The AA Floor Rule.** Soft UI's habit of tonal, low-contrast text is refused
outright. Body and secondary text hold ≥4.5:1 against the stone; the shadow pair
carries the softness instead.

## Typography

**Display Font:** Candara (with Optima, Gill Sans Nova, Segoe UI Variable Display)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Label Font:** Segoe UI Variable Small

**Character:** Candara and Optima share flared stems and a humanist axis — letterforms
that read as *cut* rather than printed, which is exactly right for a surface carved
from stone. Both ship on their respective platforms, so the incised character survives
with no webfont request and no render-blocking load. Body copy drops to the system UI
face, because an Operate surface wants a workhorse for instructions and choices.

### Hierarchy
- **Display** (400, `clamp(2rem, 1.6rem + 2vw, 3.25rem)`, 1.1): screen titles only.
- **Title** (400, `clamp(1.15rem, 1.05rem + 0.5vw, 1.4rem)`, 1.25): panel and tile names.
- **Body** (400, `clamp(1rem, 0.96rem + 0.2vw, 1.08rem)`, 1.62): explanation slides,
  held to 62–70ch.
- **Label** (600, `0.8rem`, `0.16em`, uppercase): the eyebrow and rank marks only.

### Named Rules

**The Question Is Display Rule.** The practice prompt is set in the display face at
title scale or above. It is the one thing on screen the learner must read, and it
outranks the screen title.

**The Cut Letter Rule.** Every display-face string carries the incised text-shadow
(`--incised`) — a crisp sheen highlight directly below the glyph with a faint shadow
above, which is how a groove reads in daylight; the night rendition inverts it, because
there the glyph is lighter than the ground. Type that sits flat on the stone has not been carved, and the flared stems
alone do not do it.

## Layout

A single centered column, max `58rem`, with generous vertical rhythm (`--sp-xl`
between major regions, `--sp-md` inside a group). More space above a heading than
below it, always.

Panels are wide and few; the page never becomes a grid of equal cards. Drill and
lesson tiles use `repeat(auto-fit, minmax(17rem, 1fr))` and are visually distinguished
by their extrusion state, not by color.

Below `34rem` the column takes `--sp-md` gutters, choice grids collapse to two
columns, and shadow offsets shrink by roughly a third so the extrusion still reads at
small scale instead of swallowing the control.

## Elevation & Depth

Depth is the entire visual system. There are no borders, no dividers, and no fills —
only two shadows per element, one cold and offset down-right, one pale and offset
up-left. Reversing them inverts the form from raised to pressed, and that inversion is
how state is communicated.

### Shadow Vocabulary
- **Raised** (`box-shadow: -6px -6px 14px var(--sheen), 8px 8px 20px var(--shade)`):
  anything the learner can act on. Buttons, choices, tiles, cards.
- **Pressed** (`box-shadow: inset -5px -5px 12px var(--sheen), inset 6px 6px 14px var(--shade)`):
  containers that hold content, selected chips, and any control being held down.
- **Settled** (raised at ~60% offset): the resting state of large reading panels, so a
  slide does not shout as loudly as a button.
- **Warm** (`box-shadow: 0 0 24px var(--glow-halo)`, token `--warm`): the ethereal
  layer, and the single hover treatment. One radius everywhere — seven different glow
  sizes is scatter, not a system. Always added to a real offset shadow on a surface.
- **Emitted bloom** (a blurred amber shape, no offset): reserved for objects that
  *are* light — the lit pip, the lit key face, the notehead. These carry no offset
  shadow because a light source casts none.

### Named Rules

**The Press Inverts Rule.** Active and selected states invert the shadow pair rather
than changing color. A pressed thing is genuinely pressed.

**The Bloom Earns Its Place Rule.** A zero-offset glow on a *surface* is decoration
unless it marks live state: hover, focus, the answered choice, the due-for-review
tile. Objects that are themselves light — the lit pip, the lit key, the notehead —
are the exception, because a light source has nothing to cast a shadow with.

## Shapes

Generously soft, never circular except where the object is genuinely round. Choices
and chips are pebbles (`14px`); cards and slides are slabs (`26px`); content wells are
`20px`; pips, rank marks and the Play control are `999px`.

The piano keyboard and the staff keep their real proportions — those are instruments,
not widgets, and rounding them into pebbles would be the world eating the content.

## Components

### Buttons
- **Shape:** fully round (`999px`), generous padding (`16px 40px`).
- **Primary:** stone ground, candlelight amber label, raised shadow pair. The color
  never fills — the light is in the text and the bloom.
- **Hover / Focus:** bloom fades in over 240ms; focus-visible adds a 2px amber ring.
- **Active:** inverts to pressed and the label dims slightly, as if the key bottomed out.

### Chips
- **Style:** stone pebble, raised when unselected, **pressed when selected**, with the
  label shifting from secondary vapor to full-strength ink and, on the welcome screen
  only, to amber — chips there are a live selection.
- No checkmarks, no fills. Selection is felt as depth.

### Cards / Containers
- **Corner:** slab (`26px`). **Background:** the stone. **Border:** none, ever.
- **Shadow:** settled for reading panels, raised for interactive tiles.
- **Padding:** `--sp-lg` (34px), tightening to `--sp-md` under 34rem.

### Choices (signature)
- Raised pebbles in a responsive grid. On answer they do not change background: the
  correct one blooms jade and the chosen-wrong one blooms clay rose, each inverting to
  pressed so the answer feels committed rather than merely colored.

### The Keyboard (signature)
White keys are faces raised out of a keybed floor; the grooves between them are cut down to that darker floor, so no stroke or outline is needed. Black keys are wells cut deeper still, each catching a sheen lip at its base.
The highlighted key is lit from beneath: a stone-to-amber gradient down the face with
a blurred bloom under it, so the light reads as passing *through* the stone. This is the clearest expression of the north
star and the component the world exists to serve.

### The Staff (signature)
Staff lines are engraved: a hairline of shade with a hairline of sheen directly below,
so the line reads as cut into the surface. The notehead is a raised amber pebble with
its own bloom. The clef is incised in the display face.

### Progress Pips
Small round wells, pressed into the stone. Filling one lights it amber with a bloom.
The learner reads distance-to-mastery as *how much of the row is lit*.

### Rank Marks
A pill-shaped pressed well with the tier name in label type. Only the earned tier
carries amber; unearned tiers stay in vapor. Tier color is a hue shift on the mark's
text and bloom, never a filled badge.

## Do's and Don'ts

### Do:
- **Do** carve every new surface from the same stone color and let shadow do the work.
- **Do** invert the shadow pair for pressed, selected and active states.
- **Do** hold body and secondary text at ≥4.5:1 against the ground (**The AA Floor Rule**).
- **Do** reserve candlelight amber for live or earned state (**The Light Means Live Rule**).
- **Do** shrink shadow offsets on small screens so extrusion still reads.
- **Do** keep instruments (keyboard, staff) in true proportion.

### Don't:
- **Don't** give a panel its own background color or border, or use a gradient to fake
  elevation or tint a surface. A gradient that renders *light passing through the
  stone* — the lit key face, the room light — is this world's own material and is
  correct; the ban is on gradient-as-decoration, not on luminosity.
- **Don't** put a zero-offset glow on a surface that isn't live. Objects that are
  themselves light are exempt (see **The Bloom Earns Its Place Rule**).
- **Don't** reach for the conventional soft-UI grey (`#e0e5ec`) — the light rendition
  is a cool moonstone, deliberately not that value.
- **Don't** add a second *accent*. Jade and clay rose are verdict state and the six
  rank tiers are status marks; neither is licence for a decorative second hue.
- **Don't** animate more than the one authored moment (the material warming); scattered
  hover effects at assorted radii are not this world's motion — use `--warm`.
- **Don't** let amber appear on inert prose. Emphasis inside a slide is weight and
  brightness, never light.
- **Don't** separate adjacent objects with a stroke. The keyboard's keys are divided by
  grooves cut to a darker keybed, not by outlines.
