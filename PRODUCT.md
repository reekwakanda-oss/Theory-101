# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adult self-learners teaching themselves music theory. Typically people who already
play or listen seriously — often by ear — and want the underlying language rather
than another instrument tutorial. A meaningful share have tried gamified music apps
(Yousician, Simply Piano) and bounced off the streak-and-badge pressure.

They work alone, at a computer, in short voluntary sessions with no teacher, no
deadline and nothing external compelling them to return.

## Product Purpose

Teach the fundamentals of music theory — from note names through triads — so a
learner can read, name and hear the basic structures of Western music.

Success is a learner who can name an interval by ear, spell a triad, and read a
notehead on either clef without counting up from the tonic.

## Positioning

Mastery is gated on a **visible, defined threshold** (five correct in a row, counter
always on screen) rather than an open-ended "practise until perfect", and mastery
**decays** into a spaced review queue instead of being permanent. Drill ranks require
accuracy *and* speed, and the question pool genuinely widens as rank rises — so a
Diamond drill draws from harder material than a Bronze one, rather than being the
same quiz timed.

The register is calm. No streaks to defend, no timers the learner did not ask for,
no punishment for a wrong answer beyond resetting the streak.

## Operating Context

Solo, self-directed, browser-based, short sessions. Sound is essential: intervals and
chord qualities are taught by ear as well as by sight, so the learner needs audio
output. Progress is per-browser; there is no login and nothing syncs between devices.

## Capabilities and Constraints

**Confirmed functionality**
- Welcome screen: choose proficiency (beginner / some experience / confident) and
  focus areas. Confident users skip the introduction entirely.
- Ten introduction concepts, one explanation slide each, then practice to threshold.
- Dashboard hub: six ranked skill drills, three lessons, and a review-due queue.
- Six rank tiers: iron, bronze, silver, gold, platinum, diamond.
- Lessons on scales, chords, and chord progressions, each ending in an activity.

**Technical constraints**
- No build step, no framework, no dependencies. Vanilla ES modules served over HTTP.
- Audio is Web Audio synthesis only: a synthesized piano voice, no audio files, no
  MIDI, no microphone, no pitch detection.
- Progress persists in `localStorage`. No accounts, no backend.
- Music theory is derived from semitone arithmetic, never hardcoded lookup tables,
  so enharmonic spelling stays correct by construction.

**Terminology**
Concepts (the ten introduction units), drills (ranked timed practice), lessons
(longer form with an activity), mastery (five correct in a row), review (spaced
re-check of a mastered concept).

**Explicitly out of scope for v1**
Sight-reading beyond a single notehead; rhythm input; seventh chords, inversions,
modes, harmonic and melodic minor; accounts; teacher mode.

## Brand Commitments

Name: **Theory 101**.

Voice: plain, unhurried, second person. States what a thing is rather than selling
it. Never congratulatory beyond the moment ("5 in a row. That one's yours.").

**Binding visual constraint (user-supplied, this session):** the interface is to be
rebuilt in a **neumorphic, ethereal** design language. Recorded here as given;
[DESIGN.md](DESIGN.md) owns how it is expressed.

## Evidence on Hand

- `ideas` — the user's original five product notes.
- `SYLLABUS.md` — the full content spine: every concept, drill and lesson.
- `DECISIONS.md` — resolved product decisions and the reasoning behind them.
- Working implementation in `src/` and `styles/`, verified in a real browser.

There are no users, no usage data, no testimonials and no press. Future work must
not fabricate any. The project has not shipped publicly.

## Product Principles

1. **The finish line is always visible.** A learner can see how far they are from
   advancing at every moment. Hidden criteria are a bug.
2. **A wrong answer costs the streak and nothing else.** Hints appear before the
   learner is stuck; the explanation reopens when they struggle. Nothing ever locks.
3. **Knowledge decays, and the product admits it.** Mastery re-enters review rather
   than being banked permanently.
4. **Difficulty rises with skill, not just speed.** Rank must mean harder material.
5. **Calm over compulsion.** Progression the learner can feel, never a slot machine.

## Accessibility & Inclusion

**WCAG AA is a requirement**, confirmed this session.

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text), non-text UI affordances ≥ 3:1.
- Fully keyboard navigable with visible focus on every interactive element.
- `prefers-reduced-motion` honored.
- Audio is never the sole channel for a required answer: every ear question keeps a
  replay control, and no concept is gated behind audio alone.

**Known tension:** neumorphism conventionally relies on very low-contrast, tonal
surfaces and shadow-only affordances, which fails AA on both text and control
boundaries. AA wins. The neumorphic language must be carried by form, depth and
material rather than by low contrast.
