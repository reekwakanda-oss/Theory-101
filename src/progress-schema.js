// Validation and merging for saved progress.
//
// Progress arrives from the browser, so it is untrusted input like any other.
// This module rebuilds the record field by field from a whitelist rather than
// storing what was sent: unknown keys are dropped, types are enforced, numbers
// are clamped and collections are capped. Nothing reaches the database that
// this file did not construct.

const PROFICIENCIES = new Set(['beginner', 'some', 'confident']);
const FOCUS_AREAS = new Set(['reading', 'ear', 'scales', 'chords']);
/** Content ids are slugs. Anything else is not one of ours. */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;

const LIMITS = {
  entries: 200,      // concepts or drills tracked
  counter: 1e7,      // attempts, correct, streaks
  introIndex: 100,
  times: 40,         // matches the cap the app itself applies
  seconds: 3600,
  rank: 10,
  reviewStage: 20,
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Finite, non-negative, capped. NaN and Infinity never survive. */
function count(value, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Epoch milliseconds, or null. Rejects absurd dates in either direction. */
function timestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const upper = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  if (n > upper) return null;
  return Math.floor(n);
}

function cleanConcept(raw) {
  if (!isObject(raw)) return null;
  return {
    streak: count(raw.streak, LIMITS.counter),
    best: count(raw.best, LIMITS.counter),
    attempts: count(raw.attempts, LIMITS.counter),
    correct: count(raw.correct, LIMITS.counter),
    masteredAt: timestamp(raw.masteredAt),
    reviewStage: count(raw.reviewStage, LIMITS.reviewStage),
    dueAt: timestamp(raw.dueAt),
  };
}

function cleanDrill(raw) {
  if (!isObject(raw)) return null;
  const times = Array.isArray(raw.times)
    ? raw.times
      .map((t) => Number(t))
      .filter((t) => Number.isFinite(t) && t >= 0 && t <= LIMITS.seconds)
      .slice(-LIMITS.times)
    : [];
  return {
    rank: count(raw.rank, LIMITS.rank),
    streak: count(raw.streak, LIMITS.counter),
    best: count(raw.best, LIMITS.counter),
    attempts: count(raw.attempts, LIMITS.counter),
    correct: count(raw.correct, LIMITS.counter),
    times,
  };
}

function cleanEntries(raw, cleaner) {
  const out = {};
  if (!isObject(raw)) return out;
  let kept = 0;
  for (const [id, value] of Object.entries(raw)) {
    if (kept >= LIMITS.entries) break;
    // Reject prototype-polluting keys outright as well as non-slug ids.
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    if (!ID_PATTERN.test(id)) continue;
    const clean = cleaner(value);
    if (clean) {
      out[id] = clean;
      kept += 1;
    }
  }
  return out;
}

/**
 * Rebuild a progress record from untrusted input.
 * Returns null only when the input is not an object at all.
 */
export function validateProgress(raw) {
  if (!isObject(raw)) return null;
  const focus = Array.isArray(raw.focus)
    ? [...new Set(raw.focus.filter((f) => FOCUS_AREAS.has(f)))]
    : [];
  return {
    onboarded: raw.onboarded === true,
    proficiency: PROFICIENCIES.has(raw.proficiency) ? raw.proficiency : null,
    focus,
    introIndex: count(raw.introIndex, LIMITS.introIndex),
    introDone: raw.introDone === true,
    concepts: cleanEntries(raw.concepts, cleanConcept),
    drills: cleanEntries(raw.drills, cleanDrill),
  };
}

// --- Merging ----------------------------------------------------------------

const higher = (a, b) => Math.max(a ?? 0, b ?? 0);
/** The earlier of two moments, ignoring nulls. You mastered it when you did. */
const earlier = (a, b) => (a && b ? Math.min(a, b) : a ?? b ?? null);

function mergeConcept(a, b) {
  const reviewStage = higher(a.reviewStage, b.reviewStage);
  // Keep the schedule of whichever side is further along; if level, the later
  // due date, so merging never makes the app nag sooner than either device did.
  const ahead = (a.reviewStage ?? 0) >= (b.reviewStage ?? 0) ? a : b;
  const dueAt = (a.reviewStage ?? 0) === (b.reviewStage ?? 0)
    ? higher(a.dueAt, b.dueAt) || null
    : ahead.dueAt;
  return {
    streak: higher(a.streak, b.streak),
    best: higher(a.best, b.best),
    attempts: higher(a.attempts, b.attempts),
    correct: higher(a.correct, b.correct),
    masteredAt: earlier(a.masteredAt, b.masteredAt),
    reviewStage,
    dueAt,
  };
}

function mergeDrill(a, b) {
  // Answer times are a history, not a score: interleaving two devices would
  // invent a speed neither achieved. Keep the fuller history intact instead.
  const fuller = (a.attempts ?? 0) >= (b.attempts ?? 0) ? a : b;
  return {
    // Rank is derived, and recomputed on the next answer, so taking the higher
    // value can only be briefly generous - never a silent demotion.
    rank: higher(a.rank, b.rank),
    streak: higher(a.streak, b.streak),
    best: higher(a.best, b.best),
    attempts: higher(a.attempts, b.attempts),
    correct: higher(a.correct, b.correct),
    times: fuller.times ?? [],
  };
}

function mergeEntries(a = {}, b = {}, merger) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[id]) out[id] = b[id];
    else if (!b[id]) out[id] = a[id];
    else out[id] = merger(a[id], b[id]);
  }
  return out;
}

/**
 * Combine the account's record with progress made before signing in.
 * The rule throughout is that merging must never take anything away - a
 * learner who signs in should not watch a rank or a mastered concept vanish.
 */
export function mergeProgress(existing, incoming) {
  return {
    onboarded: existing.onboarded || incoming.onboarded,
    proficiency: existing.proficiency ?? incoming.proficiency,
    focus: [...new Set([...(existing.focus ?? []), ...(incoming.focus ?? [])])],
    introIndex: higher(existing.introIndex, incoming.introIndex),
    introDone: existing.introDone || incoming.introDone,
    concepts: mergeEntries(existing.concepts, incoming.concepts, mergeConcept),
    drills: mergeEntries(existing.drills, incoming.drills, mergeDrill),
  };
}
