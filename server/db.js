// Which storage backend is in play.
//
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and the app runs on Supabase
// Postgres; set neither and it runs on a local SQLite file exactly as before.
// Nothing else in the server knows the difference - auth.js, server.js and
// assistant.js import from here and see one async interface either way.
//
// The import is dynamic on purpose. A static import of db-sqlite.js would open
// a database handle and create server/data/ even when Supabase is configured
// and the file would never be read.

import { USE_SUPABASE } from './config.js';

const backend = USE_SUPABASE
  ? await import('./db-supabase.js')
  : await import('./db-sqlite.js');

export const {
  // Users
  upsertUser,
  // Sessions
  createSession, sessionUser, revokeSession, revokeAllSessions,
  // Progress
  loadProgress, saveProgress,
  // Sign-in nonces
  issueNonce, consumeNonce,
  // Tutor budget
  assistantUsage, claimTurn, releaseTurn,
  // Account
  deleteAccount,
  // Housekeeping
  purgeExpired, close,
} = backend;

/** Which one is actually running, for the boot banner and for tests. */
export const BACKEND = USE_SUPABASE ? 'supabase' : 'sqlite';
