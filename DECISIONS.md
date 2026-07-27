# Decisions

Where [`ideas`](ideas) and the council verdict disagreed, and how it was settled.

## Resolved

**1. v1 has sound — playback only.**
Three advisors independently landed on audio as the blocking question. Idea #3 asks for
identifying notes "on clefs and sound," so this was never really optional. Web Audio
oscillators; no MIDI, no microphone, no pitch detection.

**2. The aesthetic is a token set, not an activity.**
All of "ethereal" lives in `styles/tokens.css` — one palette, one type scale, one motion
rule. The council was unanimous that an open-ended visual system with no completion
signal is where solo projects lose weeks. Calm is a real differentiator in a category
full of streaks and badges, but it's expressed through restraint.

**3. "Practice till perfection" became a visible threshold.**
5 correct in a row, counter always on screen, total concept count always visible.

**4. Ranks stay — rendered calmly.**
The council recommended no badges or XP, arguing the calm register was the wedge. Idea #3
explicitly asks for iron → diamond tiers. **Your call wins.** The synthesis: ranks are
real and require both accuracy *and* speed, but they render as a small tier mark and a
progress line — no confetti, no streak fires, no XP numbers. Progression you can feel,
not a slot machine.

**5. Nobody is forced through the intro.**
Idea #4 says "if they pick that." Proficiency selection on the welcome screen routes
confident users straight to the dashboard.

## Blind spots the council caught — and how they're handled

**Nobody verifies the theory is correct.**
Two reviewers flagged this independently: a solo builder authoring theory content with no
review step risks shipping confidently wrong pedagogy. Mitigation — everything in
`src/theory.js` is *derived*, not tabulated: scales come from semitone arithmetic plus
letter-cycling, so enharmonic spelling is correct by construction (E♭ major yields
`E♭ F G A♭ B♭ C D`, never `D♯ F G G♯ A♯ C D`). Key signatures are the one hardcoded
table, small enough to verify by eye.

**"Mastery" had no forgetting model.**
Three reviewers caught that the gate was forward-only — master concept 3, lose it by
concept 10, no mechanism to revisit. Mastered concepts now re-enter a review queue on a
spaced schedule (1d → 3d → 7d → 21d) and the dashboard surfaces what is *due*.

**The failure state was undesigned.**
This is where "ethereal" and "mastery-gated" actually collide: a gate that won't open
does not feel dreamy, it feels stuck. After 2 wrong answers on a concept a hint appears;
after 3, the slide reopens beside the question. The streak resets — nothing else is taken
away. No lives, no penalties, no lockout.

**Binary gating may be the wrong pedagogy.**
Acknowledged, not solved. Understanding an interval is fuzzy and improves with spaced
exposure; it isn't pass/fail. `STREAK_TARGET` is a single constant in `src/mastery.js` so
the model can be swapped for a confidence-weighted one without touching the views.

## Deferred

Recorded, not built:

- Ear training as its own track (currently folded into concepts 6 and 10 plus two drills)
- Rhythm tapping input, sight-reading drills
- Seventh chords, inversions, modes, harmonic & melodic minor
- Accounts and cross-device sync
- Teacher mode: assignable concept sets, class progress view
- The mastery loop decoupled from music content as a general engine

The last two came from the Expansionist advisor, whom the peer-review round unanimously
voted the weakest response — for scoping a platform onto a repo with zero commits.
Revisit only once v1 has real users.
