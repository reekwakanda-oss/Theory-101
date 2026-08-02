// Server configuration. Everything deployment-specific comes from the
// environment, so nothing secret or host-specific is ever committed.
//
// Note there is deliberately no client SECRET here. Sign in with Google's
// credential flow hands the browser a signed ID token directly, which this
// server verifies against Google's public keys. There is no code exchange, so
// there is no secret to store, rotate, or leak - one whole class of incident
// removed by choosing the flow rather than by guarding it.

import { join } from 'node:path';

const bool = (value, fallback) => (value === undefined ? fallback : value === 'true' || value === '1');
const int = (value, fallback) => (value === undefined ? fallback : Number.parseInt(value, 10));

/** Where the OAuth client id comes from: Google Cloud Console. Public by design. */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

export const PORT = int(process.env.PORT, 8000);
export const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * Secure cookies require HTTPS. Localhost is exempt in every browser, so the
 * default is off for development and MUST be on in production - see
 * assertProductionSafety below, which refuses to start if it is not.
 */
export const SECURE_COOKIES = bool(process.env.SECURE_COOKIES, false);
export const PRODUCTION = process.env.NODE_ENV === 'production';

/** Requests are only accepted from origins we published the app on. */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? `http://localhost:${PORT}`)
  .split(',').map((o) => o.trim()).filter(Boolean);

// --- Storage ----------------------------------------------------------------

/**
 * Supabase, if configured. The project URL is not secret; the service_role key
 * very much is - it BYPASSES row level security and is the database's master
 * key. It is read here and used only by server/supabase.js, and the app's CSP
 * pins connect-src to 'self', so the browser cannot reach supabase.co at all.
 *
 * Do NOT use the `anon` key here. It is subject to RLS, and server/schema.sql
 * deliberately enables RLS with no policies, so every query would return empty
 * and the failure would look like an empty database rather than a wrong key.
 */
/**
 * The project origin. The Supabase dashboard shows the REST endpoint
 * (`https://x.supabase.co/rest/v1/`) as prominently as the project URL, and
 * pasting that one is an easy mistake - supabase.js appends `/rest/v1` itself,
 * so it would have produced `/rest/v1/rest/v1/users` and 404ed on everything.
 * Both forms are accepted rather than one being punished.
 */
export const SUPABASE_URL = (process.env.SUPABASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
export const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
export const SUPABASE_TIMEOUT_MS = int(process.env.SUPABASE_TIMEOUT_SECONDS, 10) * 1000;

/** Both halves or neither - a URL with no key would fail on every request. */
export const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

/** Only used by the SQLite backend, and only when Supabase is not configured. */
export const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), 'server', 'data', 'theory101.db');

export const SESSION_TTL_MS = int(process.env.SESSION_TTL_DAYS, 30) * 24 * 60 * 60 * 1000;
/** A sign-in nonce is single-use and short-lived; it only has to survive the round trip. */
export const NONCE_TTL_MS = 5 * 60 * 1000;

/** Progress is small. Anything larger is a mistake or an attack. */
export const MAX_BODY_BYTES = 64 * 1024;

export const RATE_LIMITS = {
  auth: { limit: 20, windowMs: 10 * 60 * 1000 },   // sign-in attempts per IP
  write: { limit: 120, windowMs: 60 * 1000 },      // progress saves per IP
  read: { limit: 300, windowMs: 60 * 1000 },
  // A backstop only. The real limits on the tutor are per-account and live in
  // SQLite, because this one is per-IP and forgets everything on restart.
  assistant: { limit: 30, windowMs: 60 * 1000 },
};

// --- The tutor --------------------------------------------------------------

/**
 * A real secret, unlike GOOGLE_CLIENT_ID. It never leaves this process: the
 * browser talks to /api/assistant, and the server talks to the provider. The
 * CSP enforces that, so a mistake here cannot silently become a key in the page.
 */
export const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY ?? '';

/** Any OpenAI-compatible endpoint works; Fireworks is just the default. */
export const ASSISTANT_URL = process.env.ASSISTANT_URL
  ?? 'https://api.fireworks.ai/inference/v1/chat/completions';
export const ASSISTANT_MODEL = process.env.ASSISTANT_MODEL
  ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct';

export const ASSISTANT_COOLDOWN_MS = int(process.env.ASSISTANT_COOLDOWN_SECONDS, 10) * 1000;
export const ASSISTANT_DAILY_LIMIT = int(process.env.ASSISTANT_DAILY_LIMIT, 40);
export const ASSISTANT_TIMEOUT_MS = int(process.env.ASSISTANT_TIMEOUT_SECONDS, 20) * 1000;
/** Short answers are the product, not a saving: a tutor that lectures is worse. */
export const ASSISTANT_MAX_TOKENS = int(process.env.ASSISTANT_MAX_TOKENS, 350);

/**
 * Canned replies for tests and demos, so the whole path can be exercised
 * without spending credits. Values: 'true' | 'leak' | 'slow' | 'fail'.
 * Refused in production by assertProductionSafety.
 */
export const ASSISTANT_FAKE = process.env.ASSISTANT_FAKE ?? '';

export const ASSISTANT_ENABLED = Boolean(FIREWORKS_API_KEY) || Boolean(ASSISTANT_FAKE);

/**
 * Fail fast rather than run insecurely. A misconfigured production server that
 * boots happily is far more dangerous than one that refuses to.
 *
 * CAREFUL: server.js decides fatal-vs-warning by testing whether a message
 * contains the literal word "production". A message that merely mentions
 * production in passing will stop the server from starting. Word warnings so
 * they avoid it, and make anything genuinely fatal say it.
 */
export function assertProductionSafety() {
  const problems = [];
  if (!GOOGLE_CLIENT_ID) {
    problems.push('GOOGLE_CLIENT_ID is not set - sign-in cannot work. See README "Setting up Google sign-in".');
  }
  if (!ASSISTANT_ENABLED) {
    // Warning only - the app is fully usable without the tutor.
    problems.push('FIREWORKS_API_KEY is not set - the tutor will report itself unavailable. See README "Setting up the tutor".');
  }
  if (PRODUCTION && ASSISTANT_FAKE) {
    problems.push('ASSISTANT_FAKE must never be set in production - the tutor would answer with canned text.');
  }
  if (PRODUCTION && !SECURE_COOKIES) {
    problems.push('NODE_ENV=production requires SECURE_COOKIES=true, or session cookies travel in the clear.');
  }
  if (PRODUCTION && ALLOWED_ORIGINS.some((o) => o.startsWith('http://') && !o.includes('localhost'))) {
    problems.push('An insecure http:// origin is allowed in production. Sessions would be interceptable.');
  }
  // Half-configured Supabase is worse than none: the server would start on
  // SQLite while the operator believed it was writing to Postgres.
  if (SUPABASE_URL && !SUPABASE_SERVICE_ROLE_KEY) {
    problems.push('SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is not, so storage silently fell back to the local SQLite file. Set both or neither.');
  }
  if (SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_URL) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY is set but SUPABASE_URL is not, so storage silently fell back to the local SQLite file. Set both or neither.');
  }
  // The anon key is a JWT whose payload names the role. Catching this here
  // turns a baffling "everything is empty" into one clear line at boot.
  if (USE_SUPABASE && !looksLikeServiceRole(SUPABASE_SERVICE_ROLE_KEY)) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY does not look like a service_role key. The anon key is subject to row level security, which schema.sql enables with no policies, so every query would come back empty.');
  }
  return problems;
}

/** Decodes the unverified payload purely to read `role`. Never trusted for auth. */
function looksLikeServiceRole(key) {
  // Supabase's newer `sb_secret_...` keys are not JWTs at all, so a missing
  // payload segment proves nothing. Only an explicitly non-service_role JWT is
  // worth warning about.
  const payload = key.split('.')[1];
  if (!payload) return true;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).role === 'service_role';
  } catch {
    return true; // unreadable is not proof of anything
  }
}
