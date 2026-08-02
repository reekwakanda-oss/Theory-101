// Talking to Supabase without the SDK.
//
// Supabase exposes Postgres over PostgREST, which is ordinary HTTP with
// ordinary JSON. `fetch` is built into Node, so this whole file is the client -
// no npm package to install, audit, pin or have compromised. That keeps the
// project's zero-dependency rule intact, which was a stated constraint long
// before Supabase entered the picture.
//
// The service_role key used here BYPASSES ROW LEVEL SECURITY. It is the
// database's master key and must never reach the browser. Two things keep it
// here: it is only ever read from the environment in config.js, and the app's
// Content-Security-Policy pins connect-src to 'self', so the page cannot call
// supabase.co even if a bug tried to.

import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_TIMEOUT_MS } from './config.js';

export class SupabaseError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.detail = detail;
  }
}

const rest = () => `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;

/**
 * One request. Times out rather than pinning a request forever on a database
 * that has stopped answering - the same treatment the tutor's provider gets.
 */
async function call(path, { method = 'GET', body, prefer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${rest()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // Includes the abort. Deliberately does not echo the URL, which carries
    // filter values such as a session token hash.
    throw new SupabaseError(
      error.name === 'AbortError' ? 'The database did not answer in time.' : 'The database is unreachable.',
      { detail: error.name },
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // PostgREST puts the real cause in `message`; keep it for the server log,
    // never for the client. A 401/403 here almost always means the key is wrong
    // or RLS is on with no policy and the key is not service_role.
    throw new SupabaseError('The database rejected the request.', {
      status: response.status,
      detail: parsed?.message ?? parsed?.hint ?? text.slice(0, 200),
    });
  }
  return parsed;
}

/**
 * Values are URL-encoded, so a filter can never break out of its parameter.
 * PostgREST also needs a quoted form for anything containing a comma or a dot;
 * quoting unconditionally is simpler than deciding when it matters.
 */
const eq = (column, value) => `${column}=eq.${encodeURIComponent(String(value))}`;

export const sb = {
  /** Rows matching `filter`, as an array. */
  async select(table, filter = '', columns = '*') {
    const query = [`select=${columns}`, filter].filter(Boolean).join('&');
    return (await call(`/${table}?${query}`)) ?? [];
  },

  /** The first matching row, or null. */
  async one(table, filter, columns = '*') {
    const rows = await sb.select(table, `${filter}&limit=1`, columns);
    return rows[0] ?? null;
  },

  async insert(table, row, { returning = true } = {}) {
    const rows = await call(`/${table}`, {
      method: 'POST',
      body: row,
      prefer: returning ? 'return=representation' : 'return=minimal',
    });
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  },

  /** Insert or update on the primary key. */
  async upsert(table, row, { returning = false } = {}) {
    const rows = await call(`/${table}`, {
      method: 'POST',
      body: row,
      prefer: `resolution=merge-duplicates,${returning ? 'return=representation' : 'return=minimal'}`,
    });
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  },

  async update(table, filter, patch) {
    await call(`/${table}?${filter}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
  },

  async remove(table, filter) {
    await call(`/${table}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' });
  },

  /**
   * Delete and hand back what was deleted, in ONE statement. This is how a
   * single-use nonce stays single-use: a select followed by a delete would let
   * two requests arriving together both see the nonce before either removed it.
   */
  async removeReturning(table, filter, columns = '*') {
    const rows = await call(`/${table}?${filter}&select=${columns}`, {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    return Array.isArray(rows) ? rows : [];
  },

  /** Call a Postgres function. This is how the atomic budget claim happens. */
  async rpc(fn, args) {
    return call(`/rpc/${fn}`, { method: 'POST', body: args });
  },

  eq,
};

/**
 * A cheap round trip, so a misconfigured key is reported at boot rather than on
 * somebody's first sign-in attempt.
 */
export async function pingSupabase() {
  try {
    await sb.select('users', 'limit=1', 'id');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.detail ?? error.message, status: error.status };
  }
}
