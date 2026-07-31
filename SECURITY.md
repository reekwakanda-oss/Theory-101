# Security model

Theory 101 stores one thing about a person: how far through a music theory
course they are. That is not sensitive data, but it is *their* data, and the
account attached to it is a real Google identity. This document records how it
is protected and — just as importantly — what is deliberately not protected.

## What is stored

| Data | Where | Why |
|------|-------|-----|
| Google `sub` (an opaque id) | `users.google_sub` | The stable account key |
| Email, display name | `users` | Shown in the UI so you know which account you are in |
| Progress (streaks, ranks, answer times) | `progress.data` | The product |
| SHA-256 of each session token | `sessions.token_hash` | Sign-in state |
| Tutor questions used today, last ask time | `assistant_usage` | Enforcing the cooldown and daily cap |

**Not stored:** passwords (there are none), Google access or refresh tokens,
ID tokens after verification, IP addresses, or any analytics. There is no
third-party tracking, and no avatar is loaded, so no image request tells Google
which page is open. **Tutor conversations are not stored anywhere** — the thread
lives in the browser tab and dies with it.

## What leaves this server

Two third parties, both only when you opt in.

**Google**, when you choose to sign in. Standard Sign in with Google.

**The model provider** (Fireworks by default), when you ask the tutor a
question. Each request carries:

- what you typed;
- the app's own teaching text for the screen you are on — the concept slide or
  drill hint, read from this server's copy, not sent by your browser;
- the current question, its choices, and its correct answer, which is included
  so the tutor can steer *around* it.

It carries **nothing identifying**: no email, no name, no Google subject, no
account id, no session token. That is enforced by the shape of the code —
`askTutor()` in [`server/assistant.js`](server/assistant.js) never receives the
user object, so none of it is even in scope at the call site.

The provider's own retention and training policy applies to anything you type
into the tutor. That policy has not been audited here. Do not type anything
into it you would not paste into a third-party website, because that is what it
is.

## Identity

Sign-in uses Google Identity Services' credential flow. The browser receives a
**signed ID token** from Google and posts it here; the server verifies it and
issues its own session.

**There is no OAuth client secret.** The credential flow has no code exchange,
so there is no secret to store, rotate, or leak. The client id is public by
design. That removes an entire class of incident rather than guarding against
it.

### What the server checks on every token

Implemented in [`server/auth.js`](server/auth.js). Each of these is load-bearing;
dropping any one of them breaks authentication:

1. **`alg` is pinned to RS256 *before* a key is loaded.** Trusting the token's
   own choice is the classic JWT break — `"alg":"none"` skips verification, and
   `"HS256"` tricks a naive verifier into using Google's *public* key as an
   HMAC secret, which anybody can also do.
2. **Signature** verified against Google's published JWKS, fetched fresh and
   cached for the lifetime Google specifies, with one refetch on an unknown
   `kid` to survive key rotation.
3. **`iss`** is one of Google's two issuer strings.
4. **`aud` equals our client id.** Without this, an ID token minted for *any*
   other Google application would be accepted — and those are handed out to
   every site a user signs into.
5. **`exp` / `iat`** within a two-minute clock-skew allowance.
6. **`email_verified`** is not false, so nobody can claim an address they do
   not control.
7. **`nonce`** matches a single-use value this server issued minutes earlier.

Steps 1–7 run behind one function, `verifySignIn()`, which consumes the nonce
*before* verifying. Verifying alone would only prove the token carries the
nonce it was handed, not that we ever issued it — so the two steps are not
separable by a future caller.

### Identity is keyed on `sub`, never email

Google addresses can change, and a corporate address can be reassigned to a new
person. Treating email as the identity would let an address change silently
become account takeover. This is covered by a test.

## Sessions

- 256 bits from `randomBytes(32)`. Guessing is infeasible, so no stretching is
  needed.
- **Only a SHA-256 of the token is stored.** A stolen database is not a set of
  working sessions — the same reasoning as hashing passwords.
- Delivered as `HttpOnly; SameSite=Lax; Path=/; Max-Age=…`, plus `Secure` when
  `SECURE_COOKIES=true`.
- **HttpOnly is the important one.** The session is unreadable from JavaScript,
  so an XSS bug cannot exfiltrate it. Keeping the session in `localStorage` —
  the obvious shortcut — gives that protection up completely.
- A fresh token is issued on every sign-in, so a token planted before login
  cannot be elevated by logging in (session fixation).
- Logout deletes the row, so the token is dead server-side, not merely dropped
  by the browser.

## Request handling

| Risk | Mitigation |
|------|-----------|
| CSRF | `SameSite=Lax` **and** an `Origin` allowlist on every mutating request |
| XSS | CSP with **no `unsafe-inline` on `script-src`** and no `unsafe-eval` anywhere; the app has no inline scripts, so that costs nothing |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| SQL injection | Every statement is prepared and parameterised; no string is ever concatenated into SQL |
| Path traversal | Resolved paths must stay inside the project root; `server/`, `.git`, and all dotfiles are unreachable |
| Prototype pollution | `__proto__`, `constructor` and `prototype` keys are rejected by the progress validator |
| Brute force / flooding | Per-IP rate limits on sign-in, reads and writes |
| Oversized payloads | 64 KB cap; the request is abandoned mid-read and the connection closed |
| Provider key exposure | The key is read from the environment by the server only. `connect-src 'self'` in the CSP means the page *cannot* call the provider even if a future change tried to — **never add the provider host to that directive** |
| Tutor cost abuse | Signed-in only; a 10s cooldown and a daily cap per **account**, held in SQLite so a restart does not reset them; the turn is claimed *before* the provider call; `max_tokens` capped; a per-IP backstop on top |
| Prompt injection | Rules live in `system` turns and your text is the only `user` turn; every field is length-capped and stripped of newlines and control characters, so a crafted question cannot forge a section of the prompt. Not solved — see the limits below |
| Model output | Rendered with `textContent`, never `innerHTML`. It is never stored, never routed, never evaluated |

## Untrusted input

Progress arrives from a browser, so it is treated as hostile.
[`src/progress-schema.js`](src/progress-schema.js) does not store what it is
sent — it **rebuilds the record field by field from a whitelist**. Unknown keys
are dropped, types are enforced, numbers are clamped, `NaN`/`Infinity`/negatives
collapse to zero, and collections are capped.

The progress row is always keyed by the **session's** user. No user id from a
request body is ever read, so there is no object to make a reference to
insecurely.

## Deployment requirements

The server **refuses to start** if `NODE_ENV=production` and cookies are not
`Secure`, or if an insecure `http://` origin is allowed in production. A
misconfigured server that boots happily is more dangerous than one that stops.

```bash
NODE_ENV=production
SECURE_COOKIES=true
ALLOWED_ORIGINS=https://your.domain
GOOGLE_CLIENT_ID=…apps.googleusercontent.com
```

**HTTPS is required in production.** Without it the session cookie travels in
the clear and everything above is moot.

## Known limits — read this before trusting it further

This is a portfolio project, honestly scoped. It is *not* hardened for
high-value data, and these gaps are deliberate rather than overlooked:

- **Rate limiting is per-process and in-memory.** It resets on restart and does
  not work across multiple instances. Behind a load balancer, use a shared
  store.
- **`Origin` is trusted for CSRF.** Sound for browsers, but a non-browser client
  can set any header it likes. The check exists to stop *browsers* being used
  as a weapon, which is what CSRF is.
- **The client IP comes from the socket**, not `X-Forwarded-For`. Behind a proxy
  every request appears to come from one address, and rate limits would apply
  globally. Handle this at the proxy, or add trusted-proxy parsing.
- **The database is not encrypted at rest.** Protect it with file permissions
  and disk encryption.
- **No audit log, no anomaly detection, no 2FA** (Google supplies its own).
- **No CSRF token** beyond `SameSite` + `Origin`. Adding double-submit tokens
  would be the next step if this ever held anything sensitive.
- **Sessions do not rotate periodically**, only on sign-in.
- **The tutor's answers are not checked for correctness.** The prompt is grounded
  in the app's own teaching and the anchors are interpolated from the same
  function the lessons use, so it cannot contradict them on that point — but it
  is a language model and it can still be wrong. The slides and hints are the
  authority; the tutor is not.
- **Prompt injection is mitigated, not solved.** Someone can probably talk the
  model into saying something it should not, including the answer. The
  `revealsAnswer` check catches the obvious shapes — naming the answer, or
  eliminating everything else — and not the clever ones. The blast radius is
  bounded: the reply is text on that learner's own screen, and cheating at a
  practice drill only cheats them.
- **The daily cap is per account**, so N accounts is N caps. Sign-in raises the
  cost of abuse; it does not eliminate it.
- **Tutor usage is capped, not budgeted.** The limit counts questions, not
  tokens. Worst case per user per day is `ASSISTANT_DAILY_LIMIT × ASSISTANT_MAX_TOKENS`
  output tokens — work that out for your expected user count before exposing it.
- **`style-src` allows `'unsafe-inline'`.** Google's sign-in script injects
  inline CSS into the page and the button renders broken without it. A hash
  would pin to Google's current stylesheet and break silently on their next
  change. `script-src` remains strict, which is the directive that stops code
  from running; inline CSS alone cannot execute JavaScript. Removing the Google
  button would remove this concession.

## Reporting

This is a learning project with no production deployment.

The tutor has a committed test suite covering the budget, the answer guardrail,
and the endpoint's refusals. It spends no credits — the provider is faked:

```bash
node --test assistanttest.mjs
```

The auth and session work was verified the same way, but those harnesses were
written in a scratch directory and are **not committed** — an earlier version of
this file pointed at `authtest.mjs` and `servertest.mjs` as though they were
here, which was wrong. If you are reusing the auth code, write your own before
trusting it; `assistanttest.mjs` shows the shape (spawn the server against a
temp `DB_PATH`, insert a session row directly, exercise the endpoint over HTTP).
