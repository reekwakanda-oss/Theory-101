# Theory 101 — Product Spine

The content spine, written before any code (per the council's "one thing to do first").
Implements the five ideas in [`ideas`](ideas), with the council's verdict used to resolve
the open questions.

## The flow

```
Welcome  →  pick proficiency  →  ┌─ Complete beginner → Intro slides (10 concepts) ─┐
                                 │                                                  ├→  Dashboard
                                 └─ Some experience / Confident ────────────────────┘
                                                                                        │
                                                            ┌───────────────────────────┴──────────┐
                                                            │                                      │
                                                        Skill drills                           Lessons
                                                     (ranked, timed)                    (scales, chords,
                                                                                        progressions)
```

---

## 1. Welcome & proficiency (idea #1)

First screen. Pick a starting point, then pick which skills to focus on.

| Proficiency | Starts at | Rationale |
|-------------|-----------|-----------|
| Complete beginner | Intro slides, concept 1 | Full path |
| Some experience | Intro slides, concept 5 (Intervals) | Skips notation basics |
| Confident | Dashboard directly | Never forced through the intro |

Focus areas are multi-select: **Reading notation**, **Ear training**, **Scales & keys**,
**Chords & harmony**. The dashboard orders itself by what was picked. Nothing is hidden —
selection changes emphasis, not access.

## 2. Intro slides — the ten concepts (ideas #2, #4)

One slide per concept, then practice until the threshold. Starts exactly where idea #2
asks: what notes are, how they're played, and the types of notes.

| # | Concept | Slide teaches | Practice question | Sound |
|---|---------|---------------|-------------------|-------|
| 1 | Keys & Note Names | 7 letters A–G repeat; black-key groups of 2 and 3 orient you | Highlighted key → name it | optional |
| 2 | Sharps, Flats & Enharmonics | `#` raises a semitone, `b` lowers one; one pitch, two names | "Same pitch as C♯?" | optional |
| 3 | The Staff & Clefs | 5 lines, 4 spaces; treble and bass anchor points | Notehead on a staff → name it | optional |
| 4 | Note Types & Duration | Whole, half, quarter, eighth, sixteenth; dots add half again | "How many beats is a dotted half in 4/4?" | optional |
| 5 | Half Steps & Whole Steps | The atom of Western music: 1 semitone vs 2 | "C → D: half or whole?" | optional |
| 6 | Intervals | Distance = number + quality (M3, P5, …) | Name it by sight **and by ear** | **required** |
| 7 | The Major Scale | W-W-H-W-W-W-H, then how to name a degree *without* running it: letter first, then the nearest anchor | "5th degree of E♭ major?" | optional |
| 8 | Minor Scales | Natural minor + the relative minor relationship; the same anchors with 3, 6, 7 lowered | "Relative minor of G major?" | optional |
| 9 | Key Signatures | Order of sharps (F C G D A E B) and flats (B E A D G C F) | "How many sharps in A major?" | optional |
| 10 | Triads | Stacked thirds: major, minor, diminished, augmented | Spell it, **or hear it and name the quality** | **required** |

**Threshold to advance:** 5 correct in a row. Always visible on screen. The council was
explicit that "till perfection" with no visible finish line reads as an open-ended chore
rather than a lesson.

## 3. Dashboard (ideas #3, #4)

The hub after the intro — or immediately, for confident users. Two columns:

**Skill drills** (ranked, timed):
- Treble Clef — read noteheads on the treble staff
- Bass Clef — the same drill, on the bass staff
- Intervals by Ear — hear two notes, name the distance
- Chord Quality — major, minor, diminished, augmented, by sound alone
- Scale Degrees — name any degree without counting up from the tonic
- Chord Spelling — build a triad from its name, with the right letters

**Lessons** (idea #5): Scales · Chords · Chord Progressions

Each drill tile shows its current rank and what the next rank needs.

Every drill carries a **method hint**, shown after two wrong answers in a row. A drill has
no slide to reopen, so the hint is the entire failure state — it has to teach the technique,
not restate the question. Scale Degrees is the reason this exists: its tile promises naming
a degree *without counting up from the tonic*, which is only a fair promise if the method
is taught somewhere. It is now taught in concept 7, expanded in the Scales lesson, and
recalled by the drill hint.

## 4. Ranks (idea #3)

Six tiers. Advancement requires **both accuracy and speed** — getting quicker at
identifying more complex material is the whole point of idea #3.

| Rank | Streak | Median answer time | Difficulty pool |
|------|--------|--------------------|-----------------|
| Iron | — | — | Simple |
| Bronze | 5 | — | Simple |
| Silver | 10 | < 6.0s | + moderate |
| Gold | 15 | < 4.5s | + moderate |
| Platinum | 20 | < 3.0s | + complex |
| Diamond | 25 | < 2.0s | Full pool |

**Difficulty scales with rank.** At Iron/Bronze an interval drill uses P5, P8, M3.
At Diamond it uses tritones, minor 9ths, and compound intervals. The questions get
harder as you get faster — rank is not just a speed badge on a fixed quiz.

Ranks render in the calm register: a small tier mark and a progress line, not
confetti, streak fires, or XP counters.

## 5. Lessons (idea #5)

Longer-form than intro slides, each ending in an identification activity.

- **Scales** — major, natural minor, relative pairs, and finding any degree from an anchor rather than by counting. Activity: identify a scale by ear or by its notes.
- **Chords** — triad qualities, then how they're built from scale degrees. Activity: identify a chord by ear or by its spelling.
- **Chord progressions** — roman numerals in major (I ii iii IV V vi vii°), and the progressions worth knowing (I–V–vi–IV, ii–V–I, 12-bar blues). Activity: hear a progression, name the numerals.

---

## The audio decision

**v1 has sound. Playback only.**

- **In:** a synthesized piano voice built with the Web Audio API — any note, interval,
  chord, or progression, melodic or harmonic. No audio files, no asset pipeline.
- **Out:** MIDI input, microphone input, pitch detection, full notation rendering.

Concepts 6 and 10 and half the drills are defined by how things *sound* — teaching them
silently would make this a flashcard app. But MIDI and pitch detection are what turn a
two-week project into a six-month one. A synthesized piano splits the difference: it
sounds like the instrument the theory is taught on, with nothing to download.

## Scope boundaries for v1

Written down rather than discovered mid-build:

- ~~No accounts, no backend. Progress lives in `localStorage`.~~
  **Revised.** Optional Google sign-in was added so progress survives a lost
  device and follows a learner between them. The boundary that replaced it:
  `localStorage` stays authoritative for the running app, so accounts are
  strictly additive — nothing is gated behind signing in, nothing blocks on the
  network, and the app still runs on a static host with no server at all. See
  [SECURITY.md](SECURITY.md).
- No sight-reading beyond naming a single notehead.
- No modes, no seventh chords, no inversions, no harmonic/melodic minor.
- Rhythm is taught (concept 4) but not tapped — no rhythm input.
