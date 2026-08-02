// Storage, on a local SQLite file. node:sqlite ships with Node 22+, so this
// stays dependency-free - nothing from npm to audit, pin, or get compromised.
//
// This is the no-configuration backend: run `node server/server.js` with no
// environment at all and you get a working server with a file on disk. Set
// SUPABASE_URL and db.js picks db-supabase.js instead.
//
// Every function here is `async` even though node:sqlite is synchronous. That
// is not pretence: it is the interface db-supabase.js has to implement, and one
// shared shape means server.js and auth.js do not care which is underneath.
//
// Every query below is parameterised. There is no string concatenation into
// SQL anywhere in this file, and there must never be.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from './config.js';

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// WAL keeps reads from blocking the writer. FULL synchronous means a crash
// cannot lose an acknowledged progress save.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    google_sub    TEXT    NOT NULL UNIQUE,
    email         TEXT,
    name          TEXT,
    picture       TEXT,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
  );

  -- Sessions store only a SHA-256 of the cookie value, never the value itself.
  -- A stolen database therefore does not hand the thief usable sessions.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user  ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS progress (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data        TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- Single-use sign-in nonces. Without these, a captured Google ID token could
  -- be replayed until it expires.
  CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce       TEXT    PRIMARY KEY,
    created_at  INTEGER NOT NULL
  );

  -- Tutor budget. Here rather than in memory because the in-process limiter is
  -- per-IP and forgets everything on restart, and a daily cap that resets every
  -- time the server restarts is not a cap.
  --
  -- ONE row per user, not one per (user, day): a per-day row would have no
  -- last_at on the first request after UTC midnight, so the cooldown could be
  -- skipped once every day.
  CREATE TABLE IF NOT EXISTS assistant_usage (
    user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    day      TEXT    NOT NULL,   -- 'YYYY-MM-DD', UTC
    used     INTEGER NOT NULL,
    last_at  INTEGER NOT NULL
  );
`);

// --- Users ------------------------------------------------------------------

const findUser = db.prepare('SELECT * FROM users WHERE google_sub = ?');
const insertUser = db.prepare(`
  INSERT INTO users (google_sub, email, name, picture, created_at, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?)`);
const touchUser = db.prepare(`
  UPDATE users SET email = ?, name = ?, picture = ?, last_seen_at = ? WHERE id = ?`);

/**
 * Find or create the account for a verified Google identity.
 * Keyed on `sub`, never on email: Google addresses can change, and treating
 * email as the identity lets an address change silently become account
 * takeover of whoever holds it next.
 */
export async function upsertUser({ sub, email, name, picture }) {
  const now = Date.now();
  const existing = findUser.get(sub);
  if (existing) {
    touchUser.run(email ?? null, name ?? null, picture ?? null, now, existing.id);
    return { ...existing, email, name, picture, last_seen_at: now };
  }
  const result = insertUser.run(sub, email ?? null, name ?? null, picture ?? null, now, now);
  return findUser.get(sub) ?? { id: result.lastInsertRowid, google_sub: sub, email, name, picture };
}

// --- Sessions ---------------------------------------------------------------

const insertSession = db.prepare(
  'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
const selectSession = db.prepare(`
  SELECT s.user_id, s.expires_at, u.google_sub, u.email, u.name, u.picture
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ?`);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const deleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

export async function createSession(tokenHash, userId, expiresAt) {
  insertSession.run(tokenHash, userId, Date.now(), expiresAt);
}

/** Returns the session's user, or null if unknown or expired. */
export async function sessionUser(tokenHash) {
  const row = selectSession.get(tokenHash);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    deleteSession.run(tokenHash);
    return null;
  }
  return row;
}

export async function revokeSession(tokenHash) {
  deleteSession.run(tokenHash);
}

/** Used when signing out everywhere, and on account deletion. */
export async function revokeAllSessions(userId) {
  deleteUserSessions.run(userId);
}

// --- Progress ---------------------------------------------------------------

const selectProgress = db.prepare('SELECT data, updated_at FROM progress WHERE user_id = ?');
const upsertProgressRow = db.prepare(`
  INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);

export async function loadProgress(userId) {
  const row = selectProgress.get(userId);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data), updatedAt: row.updated_at };
  } catch {
    // Corrupt row: treat as empty rather than crashing the request.
    return null;
  }
}

export async function saveProgress(userId, data) {
  const now = Date.now();
  upsertProgressRow.run(userId, JSON.stringify(data), now);
  return now;
}

// --- Sign-in nonces ---------------------------------------------------------

const insertNonce = db.prepare('INSERT INTO auth_nonces (nonce, created_at) VALUES (?, ?)');
const takeNonce = db.prepare('DELETE FROM auth_nonces WHERE nonce = ? RETURNING created_at');
const deleteOldNonces = db.prepare('DELETE FROM auth_nonces WHERE created_at <= ?');

export async function issueNonce(nonce) {
  insertNonce.run(nonce, Date.now());
}

/** Consume a nonce. Returns false if it never existed or was already used. */
export async function consumeNonce(nonce, ttlMs) {
  const row = takeNonce.get(nonce);
  if (!row) return false;
  return Date.now() - row.created_at <= ttlMs;
}

// --- Tutor budget -----------------------------------------------------------

const selectUsage = db.prepare('SELECT day, used, last_at FROM assistant_usage WHERE user_id = ?');
const upsertUsage = db.prepare(`
  INSERT INTO assistant_usage (user_id, day, used, last_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    day = excluded.day, used = excluded.used, last_at = excluded.last_at`);

/** Returns { day, used, last_at } or null if this user has never asked. */
export async function assistantUsage(userId) {
  return selectUsage.get(userId) ?? null;
}

/**
 * Take one turn from this account's budget, atomically.
 *
 * There is deliberately NO `await` between reading the row and writing it back.
 * node:sqlite is synchronous and Node is single-threaded, so that sequence
 * cannot interleave with another in-flight request. Introduce an await here and
 * two concurrent posts will both sail past the cooldown.
 *
 * The decision lives in the storage layer rather than in assistant.js precisely
 * because that guarantee is a property of the STORE. Postgres cannot make it
 * this way and uses a row lock instead; see claim_assistant_turn in schema.sql.
 */
export async function claimTurn(userId, cooldownMs, dailyLimit, day, now) {
  const row = selectUsage.get(userId) ?? null;

  if (row && now - row.last_at < cooldownMs) {
    return { ok: false, reason: 'cooldown', used: row.used, last_at: row.last_at };
  }

  // A new UTC day resets the count, but never the cooldown: last_at is carried
  // by the same row, so midnight is not a free pass.
  const used = row && row.day === day ? row.used : 0;
  if (used >= dailyLimit) {
    return { ok: false, reason: 'daily', used, last_at: row?.last_at ?? 0 };
  }

  upsertUsage.run(userId, day, used + 1, now);
  return { ok: true, reason: null, used: used + 1, last_at: now };
}

/**
 * Give a turn back when the provider failed - the learner got nothing for it.
 * last_at is deliberately NOT rewound, so a failing provider cannot be retried
 * in a tight loop.
 */
export async function releaseTurn(userId) {
  const row = selectUsage.get(userId);
  if (!row || row.used <= 0) return;
  upsertUsage.run(userId, row.day, row.used - 1, row.last_at);
}

// --- Account deletion -------------------------------------------------------

const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');

/** Cascades to sessions and progress. People are entitled to leave completely. */
export async function deleteAccount(userId) {
  deleteUser.run(userId);
}

// --- Housekeeping -----------------------------------------------------------

export async function purgeExpired(nonceTtlMs) {
  deleteExpiredSessions.run(Date.now());
  deleteOldNonces.run(Date.now() - nonceTtlMs);
}

export async function close() {
  db.close();
}

export { db };
