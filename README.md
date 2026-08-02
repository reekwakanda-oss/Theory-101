# Theory 101

Learn music theory one concept at a time, then practise until it's yours.

An ethereal, calm alternative to streak-driven music apps. One slide per concept,
practice to a visible threshold, then ranked drills and longer lessons.

## Running it

No build step and no npm dependencies — not for the app, and not for the server
either. Node 22+ supplies everything used (`node:sqlite`, `node:crypto`,
`node:http`, `fetch`), so there is nothing to install and nothing in the supply
chain to audit. That holds even with Supabase configured: it is reached over
plain HTTP rather than through its SDK.

```bash
node server/server.js
```

Then open <http://localhost:8000>.

The app runs perfectly well without sign-in; the server will say so on startup
and progress stays on the device. A plain static host (`python -m http.server`)
also still works — you just lose accounts.

### Storing progress in Supabase (optional)

By default the server keeps everything in a local SQLite file and needs no
setup. To use Supabase Postgres instead:

1. In the Supabase dashboard, open **SQL Editor → New query**, paste all of
   [`server/schema.sql`](server/schema.sql), and run it. It is idempotent.
2. Copy two values into `.env`:
   - `SUPABASE_URL` — **Settings → Data API → Project URL**. Not secret.
   - `SUPABASE_SERVICE_ROLE_KEY` — **Settings → API Keys → `service_role`**.
     Very secret: it bypasses row level security. Not the `anon` key — that one
     is subject to RLS, which `schema.sql` enables with no policies, so every
     query would come back empty and look like an empty database.
3. Check it:

   ```bash
   node --env-file-if-exists=.env server/check-supabase.mjs
   ```

   This verifies the connection, that all five tables and both functions exist,
   and — if you also set `SUPABASE_ANON_KEY` — that the public key genuinely
   **cannot** read your tables. It writes nothing.

4. Start with `node --env-file-if-exists=.env server/server.js`. The banner
   reports which backend is live and pings it once, so a wrong key or an unrun
   schema shows up immediately rather than on someone's first sign-in.

Set both variables or neither; setting one is reported at boot rather than
silently falling back to SQLite. Still no npm dependencies — Supabase is reached
over its PostgREST HTTP API with the built-in `fetch`.

### Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Add your origin (e.g. `http://localhost:8000`) under both **Authorised
   JavaScript origins** and **Authorised redirect URIs**.
3. Copy the client id — there is **no client secret to copy**, and none is
   needed; see [SECURITY.md](SECURITY.md).

```bash
cp .env.example .env          # then paste your client id in
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com node server/server.js
```

In production, `NODE_ENV=production` and `SECURE_COOKIES=true` are both
required — the server refuses to start otherwise rather than run with sessions
exposed.

### Setting up the tutor

Optional. Without a key the tutor never appears and nothing else changes.

1. Get an API key from [Fireworks AI](https://fireworks.ai) — or any
   OpenAI-compatible provider; the endpoint and model are both env vars.
2. Put it in `.env` (see [`.env.example`](.env.example)) and run:

```bash
node --env-file-if-exists=.env server/server.js
```

Check `ASSISTANT_MODEL` against your provider's dashboard — model slugs change.

**The key is a real secret**, unlike the Google client id: it stays on the
server, the browser only ever talks to `/api/assistant`, and the
Content-Security-Policy blocks the page from reaching the provider at all. See
[SECURITY.md](SECURITY.md).

To try it without spending credits, `ASSISTANT_FAKE=true` returns canned
replies (`leak`, `slow` and `fail` exercise the other paths). The server
refuses to start with it set in production.

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
| `src/auth.js` | Sign-in from the browser's side |
| `src/assistant.js` | The tutor panel |
| `src/assistant-context.js` | Turns the current screen into data the tutor can read |
| `server/assistant.js` | The prompt, the answer guardrail, and the per-account budget |
| `src/sync.js` | Mirrors local progress to the signed-in account |
| `src/progress-schema.js` | Validation and merge rules, shared with the server |
| `server/server.js` | HTTP routing, security headers, static files |
| `server/auth.js` | Google token verification and sessions |
| `server/db.js` | Picks the storage backend; one async interface either way |
| `server/db-sqlite.js` | The default backend: a local SQLite file, no setup |
| `server/db-supabase.js` | The Supabase backend, same interface |
| `server/supabase.js` | PostgREST over `fetch`. The whole client, no SDK |
| `server/schema.sql` | The Postgres schema, RLS lockdown, and the atomic budget claim |
| `supabasetest.mjs` | One storage contract, run against both backends |
| `SECURITY.md` | What is protected, how, and what deliberately isn't |
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
beyond a single notehead.

**The tutor reads the app's state, not your screen.** There is no screen
capture and no vision model — the app already knows exactly which question is
up, what you got wrong, and what it taught you, so it sends that instead of a
picture. It is cheaper, exact, and nothing leaves the page that the app did not
already have. The server looks up the slides and hints from its own copy, so
the tutor cannot teach a different method than the lesson just did: the
scale-degree anchors in its prompt come from the very same `anchorSummary()`
call the slide and the drill hint use.

**It will not give you the answer.** The correct answer is in its prompt
precisely so it can steer around it, and a post-check catches a reply that
names the answer or eliminates its way to it. It is on-demand only — it never
opens itself when you get something wrong, because the hint-then-slide
escalation is the designed teaching and a chatbot barging in would replace it.

**Accounts are optional and additive.** Progress lives in `localStorage` and
that stays authoritative for the running app, so nothing ever blocks on the
network and the whole thing works signed out, offline, or on a static host.
Signing in with Google mirrors that record to an account so it follows you
between devices. Work done before signing in is *merged* into the account
rather than replaced — merging is strictly additive, so a rank or a mastered
concept can never disappear by signing in. The security model is written up in
[SECURITY.md](SECURITY.md), including what it deliberately does not defend
against.
