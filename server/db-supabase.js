// Storage, on Supabase Postgres.
//
// Implements exactly the interface db-sqlite.js exports, so nothing above this
// layer knows which one it is talking to. Run server/schema.sql once in the
// Supabase SQL editor to create the tables this expects.
//
// Two differences from the SQLite backend are real and worth knowing:
//
//   1. `progress.data` is jsonb, not a TEXT blob. PostgREST hands it back as a
//      parsed object, so there is no JSON.parse here and no corrupt-row case -
//      Postgres rejects malformed JSON at write time instead.
//
//   2. The tutor's budget claim is a single Postgres function call. It cannot
//      be a read followed by a write the way SQLite's is, because every step
//      over HTTP is an await and two concurrent posts would both read "cooled
//      down" before either wrote. schema.sql holds a row lock instead, which is
//      correct across several server processes - something SQLite never was.

import { sb } from './supabase.js';

// --- Users ------------------------------------------------------------------

/**
 * Find or create the account for a verified Google identity.
 * Keyed on `sub`, never on email: Google addresses can change, and treating
 * email as the identity lets an address change silently become account
 * takeover of whoever holds it next.
 */
export async function upsertUser({ sub, email, name, picture }) {
  const now = Date.now();
  const existing = await sb.one('users', sb.eq('google_sub', sub));

  if (existing) {
    await sb.update('users', sb.eq('id', existing.id), {
      email: email ?? null, name: name ?? null, picture: picture ?? null, last_seen_at: now,
    });
    return { ...existing, email, name, picture, last_seen_at: now };
  }

  // merge-duplicates on google_sub, so two sign-ins racing on a brand new
  // account cannot produce a duplicate-key error for one of them.
  const created = await sb.upsert('users', {
    google_sub: sub,
    email: email ?? null,
    name: name ?? null,
    picture: picture ?? null,
    created_at: now,
    last_seen_at: now,
  }, { returning: true });

  return created ?? await sb.one('users', sb.eq('google_sub', sub));
}

// --- Sessions ---------------------------------------------------------------

export async function createSession(tokenHash, userId, expiresAt) {
  await sb.insert('sessions', {
    token_hash: tokenHash, user_id: userId, created_at: Date.now(), expires_at: expiresAt,
  }, { returning: false });
}

/** Returns the session's user, or null if unknown or expired. */
export async function sessionUser(tokenHash) {
  // One round trip: PostgREST embeds the joined user when the foreign key is
  // declared, which it is in schema.sql.
  const row = await sb.one('sessions', sb.eq('token_hash', tokenHash),
    'user_id,expires_at,users(google_sub,email,name,picture)');
  if (!row) return null;

  if (row.expires_at <= Date.now()) {
    await sb.remove('sessions', sb.eq('token_hash', tokenHash));
    return null;
  }
  // Flattened to the shape the SQLite join returns, so callers see one shape.
  return {
    user_id: row.user_id,
    expires_at: row.expires_at,
    google_sub: row.users?.google_sub ?? null,
    email: row.users?.email ?? null,
    name: row.users?.name ?? null,
    picture: row.users?.picture ?? null,
  };
}

export async function revokeSession(tokenHash) {
  await sb.remove('sessions', sb.eq('token_hash', tokenHash));
}

/** Used when signing out everywhere, and on account deletion. */
export async function revokeAllSessions(userId) {
  await sb.remove('sessions', sb.eq('user_id', userId));
}

// --- Progress ---------------------------------------------------------------

export async function loadProgress(userId) {
  const row = await sb.one('progress', sb.eq('user_id', userId), 'data,updated_at');
  if (!row) return null;
  return { data: row.data, updatedAt: row.updated_at };
}

export async function saveProgress(userId, data) {
  const now = Date.now();
  await sb.upsert('progress', { user_id: userId, data, updated_at: now });
  return now;
}

// --- Sign-in nonces ---------------------------------------------------------

export async function issueNonce(nonce) {
  await sb.insert('auth_nonces', { nonce, created_at: Date.now() }, { returning: false });
}

/**
 * Consume a nonce. Returns false if it never existed or was already used.
 *
 * The DELETE returns the row it removed, so the read and the consume are one
 * statement. Selecting first and deleting second would let the same nonce be
 * accepted twice by two requests arriving together - which is the entire thing
 * a single-use nonce exists to stop.
 */
export async function consumeNonce(nonce, ttlMs) {
  const rows = await sb.removeReturning('auth_nonces', sb.eq('nonce', nonce), 'created_at');
  const row = rows[0];
  if (!row) return false;
  return Date.now() - row.created_at <= ttlMs;
}

// --- Tutor budget -----------------------------------------------------------

/** Returns { day, used, last_at } or null if this user has never asked. */
export async function assistantUsage(userId) {
  return sb.one('assistant_usage', sb.eq('user_id', userId), 'day,used,last_at');
}

/** Atomic in Postgres via a row lock. See claim_assistant_turn in schema.sql. */
export async function claimTurn(userId, cooldownMs, dailyLimit, day, now) {
  const rows = await sb.rpc('claim_assistant_turn', {
    p_user_id: userId,
    p_cooldown_ms: cooldownMs,
    p_daily_limit: dailyLimit,
    p_day: day,
    p_now: now,
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    // The function is missing or returned nothing. Refuse the turn rather than
    // granting a free one: failing closed on a budget is the only safe way.
    return { ok: false, reason: 'cooldown', used: 0, last_at: now };
  }
  return { ok: row.ok, reason: row.reason ?? null, used: row.used, last_at: row.last_at };
}

export async function releaseTurn(userId) {
  await sb.rpc('release_assistant_turn', { p_user_id: userId });
}

// --- Account deletion -------------------------------------------------------

/** Cascades to sessions, progress and usage. People are entitled to leave. */
export async function deleteAccount(userId) {
  await sb.remove('users', sb.eq('id', userId));
}

// --- Housekeeping -----------------------------------------------------------

export async function purgeExpired(nonceTtlMs) {
  const now = Date.now();
  await sb.remove('sessions', `expires_at=lte.${now}`);
  await sb.remove('auth_nonces', `created_at=lte.${now - nonceTtlMs}`);
}

/** Nothing to close - there is no pool, only fetch. */
export async function close() {}
