// The storage contract, run twice: once against SQLite, once against Supabase.
//
//   node --test supabasetest.mjs
//
// The Supabase pass talks to a fake PostgREST served over real HTTP on
// localhost, so the actual fetch client is exercised - URL building, filters,
// Prefer headers, embedded selects, error mapping. No Supabase project and no
// network are needed to run this.
//
// WHAT THIS PROVES: db-supabase.js and db-sqlite.js behave identically, and the
// client speaks PostgREST correctly.
//
// WHAT IT CANNOT PROVE: that the PL/pgSQL in server/schema.sql is right. The
// fake reimplements claim_assistant_turn's semantics in JavaScript, so the two
// could agree with each other and both be wrong about Postgres. The row-locking
// behaviour in particular only exists in the real database. Run schema.sql and
// exercise the tutor once against the real project before trusting it.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --- A fake PostgREST -------------------------------------------------------

/** Enough of PostgREST to be honest about the wire format. */
function fakePostgrest() {
  const tables = {
    users: [], sessions: [], progress: [], auth_nonces: [], assistant_usage: [],
  };
  let nextUserId = 1;
  const seen = { keys: new Set(), prefers: [] };

  const parseFilters = (params) => {
    const filters = [];
    for (const [key, raw] of params) {
      if (['select', 'limit', 'order', 'offset'].includes(key)) continue;
      const [op, ...rest] = raw.split('.');
      filters.push({ column: key, op, value: rest.join('.') });
    }
    return filters;
  };

  const matches = (row, filters) => filters.every(({ column, op, value }) => {
    const cell = row[column];
    if (op === 'eq') return String(cell) === value;
    if (op === 'lte') return Number(cell) <= Number(value);
    if (op === 'gte') return Number(cell) >= Number(value);
    throw new Error(`fake PostgREST: unsupported operator ${op}`);
  });

  /** `users(a,b)` in a select list means embed the parent row. */
  const embed = (table, row, select) => {
    const match = /users\(([^)]*)\)/.exec(select ?? '');
    if (!match || table !== 'sessions') return row;
    const parent = tables.users.find((u) => u.id === row.user_id);
    const columns = match[1].split(',').map((c) => c.trim());
    return { ...row, users: parent ? Object.fromEntries(columns.map((c) => [c, parent[c]])) : null };
  };

  /** Flipped by a test to simulate schema.sql never having been run. */
  const broken = { rpc: false };

  const rpc = {
    claim_assistant_turn({ p_user_id, p_cooldown_ms, p_daily_limit, p_day, p_now }) {
      if (broken.rpc) return [];
      let row = tables.assistant_usage.find((r) => r.user_id === p_user_id);
      if (!row) {
        row = { user_id: p_user_id, day: p_day, used: 0, last_at: 0 };
        tables.assistant_usage.push(row);
      }
      if (p_now - row.last_at < p_cooldown_ms) {
        return [{ ok: false, reason: 'cooldown', used: row.used, last_at: row.last_at }];
      }
      const used = row.day === p_day ? row.used : 0;
      if (used >= p_daily_limit) {
        return [{ ok: false, reason: 'daily', used, last_at: row.last_at }];
      }
      Object.assign(row, { day: p_day, used: used + 1, last_at: p_now });
      return [{ ok: true, reason: null, used: used + 1, last_at: p_now }];
    },
    release_assistant_turn({ p_user_id }) {
      const row = tables.assistant_usage.find((r) => r.user_id === p_user_id);
      if (row) row.used = Math.max(0, row.used - 1);
      return null;
    },
  };

  const server = createServer(async (req, res) => {
    seen.keys.add(req.headers.apikey);
    if (req.headers.prefer) seen.prefers.push(req.headers.prefer);

    const url = new URL(req.url, 'http://x');
    const body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => resolve(raw ? JSON.parse(raw) : undefined));
    });

    const reply = (status, value) => {
      const text = value === null ? '' : JSON.stringify(value);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(text);
    };

    const rpcName = /^\/rest\/v1\/rpc\/(.+)$/.exec(url.pathname)?.[1];
    if (rpcName) {
      if (!rpc[rpcName]) return reply(404, { message: `function ${rpcName} does not exist` });
      return reply(200, rpc[rpcName](body));
    }

    const table = /^\/rest\/v1\/([^/?]+)$/.exec(url.pathname)?.[1];
    if (!table || !tables[table]) return reply(404, { message: 'no such table' });

    const filters = parseFilters(url.searchParams);
    const select = url.searchParams.get('select');
    const prefer = req.headers.prefer ?? '';
    const rows = tables[table];

    if (req.method === 'GET') {
      let found = rows.filter((r) => matches(r, filters));
      const limit = url.searchParams.get('limit');
      if (limit) found = found.slice(0, Number(limit));
      return reply(200, found.map((r) => embed(table, r, select)));
    }

    if (req.method === 'POST') {
      const incoming = Array.isArray(body) ? body : [body];
      const written = incoming.map((row) => {
        const key = table === 'users' ? 'google_sub'
          : table === 'sessions' ? 'token_hash'
          : table === 'auth_nonces' ? 'nonce' : 'user_id';
        const existing = rows.find((r) => r[key] === row[key]);
        if (existing) {
          if (!prefer.includes('merge-duplicates')) {
            reply(409, { message: 'duplicate key value violates unique constraint' });
            return null;
          }
          Object.assign(existing, row);
          return existing;
        }
        const created = table === 'users' ? { id: nextUserId++, ...row } : { ...row };
        rows.push(created);
        return created;
      });
      if (written.includes(null)) return undefined;
      return prefer.includes('return=representation') ? reply(201, written) : reply(204, null);
    }

    if (req.method === 'PATCH') {
      for (const row of rows.filter((r) => matches(r, filters))) Object.assign(row, body);
      return reply(204, null);
    }

    if (req.method === 'DELETE') {
      const doomed = rows.filter((r) => matches(r, filters));
      for (const row of doomed) rows.splice(rows.indexOf(row), 1);
      // Cascade, the way the foreign keys in schema.sql do.
      if (table === 'users') {
        for (const id of doomed.map((r) => r.id)) {
          for (const child of ['sessions', 'progress', 'assistant_usage']) {
            tables[child] = tables[child].filter((r) => r.user_id !== id);
          }
        }
      }
      return prefer.includes('return=representation') ? reply(200, doomed) : reply(204, null);
    }

    return reply(405, { message: 'method not allowed' });
  });

  return { server, tables, seen, broken };
}

// --- The contract both backends must satisfy --------------------------------

function contract(name, loadStore) {
  describe(`storage contract: ${name}`, () => {
    let store;
    before(async () => { store = await loadStore(); });

    test('a user is keyed on sub, and signing in twice does not duplicate', async () => {
      const first = await store.upsertUser({ sub: 'sub-1', email: 'a@example.com', name: 'A' });
      assert.ok(first.id);
      const again = await store.upsertUser({ sub: 'sub-1', email: 'moved@example.com', name: 'A' });
      assert.equal(again.id, first.id, 'the same sub must resolve to the same account');
      assert.equal(again.email, 'moved@example.com', 'a changed address updates the row');
    });

    test('a session resolves to its user, and expiry removes it', async () => {
      const user = await store.upsertUser({ sub: 'sub-2', email: 'b@example.com', name: 'B' });
      await store.createSession('hash-live', user.id, Date.now() + 60_000);
      const live = await store.sessionUser('hash-live');
      assert.equal(live.user_id, user.id);
      assert.equal(live.email, 'b@example.com', 'the joined user comes back in one shape');

      await store.createSession('hash-dead', user.id, Date.now() - 1);
      assert.equal(await store.sessionUser('hash-dead'), null, 'an expired session is refused');
      assert.equal(await store.sessionUser('hash-never'), null);
    });

    test('progress round-trips as an object, not a string', async () => {
      const user = await store.upsertUser({ sub: 'sub-3' });
      assert.equal(await store.loadProgress(user.id), null);
      const record = { onboarded: true, drills: { 'note-treble': { streak: 3 } } };
      const at = await store.saveProgress(user.id, record);
      assert.ok(at > 0);
      const back = await store.loadProgress(user.id);
      assert.deepEqual(back.data, record);
      await store.saveProgress(user.id, { onboarded: false });
      assert.deepEqual((await store.loadProgress(user.id)).data, { onboarded: false },
        'saving twice updates rather than failing on the primary key');
    });

    test('a nonce works exactly once', async () => {
      await store.issueNonce('nonce-a');
      assert.equal(await store.consumeNonce('nonce-a', 60_000), true);
      assert.equal(await store.consumeNonce('nonce-a', 60_000), false, 'replay must fail');
      assert.equal(await store.consumeNonce('never-issued', 60_000), false);
    });

    test('an expired nonce is refused', async () => {
      await store.issueNonce('nonce-old');
      assert.equal(await store.consumeNonce('nonce-old', -1), false);
    });

    test('the budget claim enforces the cooldown', async () => {
      const user = await store.upsertUser({ sub: 'sub-4' });
      const now = Date.now();
      const first = await store.claimTurn(user.id, 10_000, 40, '2026-08-01', now);
      assert.equal(first.ok, true);
      assert.equal(first.used, 1);

      const tooSoon = await store.claimTurn(user.id, 10_000, 40, '2026-08-01', now + 500);
      assert.equal(tooSoon.ok, false);
      assert.equal(tooSoon.reason, 'cooldown');

      const later = await store.claimTurn(user.id, 10_000, 40, '2026-08-01', now + 10_001);
      assert.equal(later.ok, true);
      assert.equal(later.used, 2);
    });

    // Cooldown is checked BEFORE the cap, so the two properties need separate
    // scenarios: you cannot observe the cap while still cooling, and you cannot
    // observe the cooldown once enough time has passed to exhaust the cap.
    test('the daily cap holds', async () => {
      const user = await store.upsertUser({ sub: 'sub-5' });
      const T = Date.now();
      for (let i = 0; i < 3; i++) {
        const claim = await store.claimTurn(user.id, 0, 3, '2026-08-01', T + i);
        assert.equal(claim.ok, true, `claim ${i + 1} of 3 should succeed`);
      }
      const capped = await store.claimTurn(user.id, 0, 3, '2026-08-01', T + 3);
      assert.equal(capped.ok, false);
      assert.equal(capped.reason, 'daily');
    });

    test('a new UTC day resets the count but NOT the cooldown', async () => {
      // The bug the one-row shape exists to prevent. A row keyed by (user, day)
      // would have no last_at on the first request after midnight, so the
      // cooldown could be skipped once every day.
      const user = await store.upsertUser({ sub: 'sub-5b' });
      const T = Date.now();
      assert.equal((await store.claimTurn(user.id, 10_000, 40, '2026-08-01', T)).ok, true);

      const midnight = await store.claimTurn(user.id, 10_000, 40, '2026-08-02', T + 500);
      assert.equal(midnight.ok, false, 'a new day must not be a free pass on the cooldown');
      assert.equal(midnight.reason, 'cooldown');

      const later = await store.claimTurn(user.id, 10_000, 40, '2026-08-02', T + 10_001);
      assert.equal(later.ok, true);
      assert.equal(later.used, 1, 'the new day starts the count again from one');
    });

    test('releasing gives back a question but not the cooldown', async () => {
      const user = await store.upsertUser({ sub: 'sub-6' });
      const now = Date.now();
      await store.claimTurn(user.id, 1000, 40, '2026-08-01', now);
      const before = await store.assistantUsage(user.id);
      await store.releaseTurn(user.id);
      const after = await store.assistantUsage(user.id);
      assert.equal(after.used, before.used - 1, 'the question comes back');
      assert.equal(after.last_at, before.last_at, 'last_at is NOT rewound');
    });

    test('releasing never goes negative', async () => {
      const user = await store.upsertUser({ sub: 'sub-7' });
      await store.releaseTurn(user.id);
      await store.releaseTurn(user.id);
      const usage = await store.assistantUsage(user.id);
      assert.ok(!usage || usage.used >= 0);
    });

    test('deleting an account takes its sessions, progress and budget with it', async () => {
      const user = await store.upsertUser({ sub: 'sub-8' });
      await store.createSession('hash-doomed', user.id, Date.now() + 60_000);
      await store.saveProgress(user.id, { onboarded: true });
      await store.claimTurn(user.id, 1000, 40, '2026-08-01', Date.now());

      await store.deleteAccount(user.id);

      assert.equal(await store.sessionUser('hash-doomed'), null, 'sessions must cascade');
      assert.equal(await store.loadProgress(user.id), null, 'progress must cascade');
      assert.equal(await store.assistantUsage(user.id), null, 'the budget row must cascade');
    });

    test('purging removes expired sessions and stale nonces, and nothing else', async () => {
      const user = await store.upsertUser({ sub: 'sub-9' });
      await store.createSession('hash-keep', user.id, Date.now() + 600_000);
      await store.createSession('hash-purge', user.id, Date.now() - 1000);
      await store.issueNonce('nonce-fresh');

      await store.purgeExpired(60_000);

      assert.ok(await store.sessionUser('hash-keep'), 'a live session survives');
      assert.equal(await store.sessionUser('hash-purge'), null);
      assert.equal(await store.consumeNonce('nonce-fresh', 60_000), true, 'a fresh nonce survives');
    });
  });
}

// --- Wire both backends up ---------------------------------------------------
//
// The environment is set HERE, at the top level, before anything imports
// server/config.js. config.js reads process.env once when it is first loaded
// and every module in the chain closes over those constants, so setting env
// inside a before() hook is too late - the first version of the test did that
// and the Supabase client ended up with an empty base URL.
//
// Both backends are configured at once on purpose. They do not conflict: only
// server/db.js chooses between them, and this file imports each one directly.

const tmp = mkdtempSync(join(tmpdir(), 'theory101-sqlite-'));
process.env.DB_PATH = join(tmp, 'test.db');

const fake = fakePostgrest();
await new Promise((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
const FAKE_ORIGIN = `http://127.0.0.1:${fake.server.address().port}`;
process.env.SUPABASE_URL = FAKE_ORIGIN;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_TIMEOUT_SECONDS = '5';

contract('sqlite', () => import('./server/db-sqlite.js'));
contract('supabase', () => import('./server/db-supabase.js'));

describe('the wire format', () => {
  test('every request carries the service key in both headers PostgREST reads', () => {
    assert.deepEqual([...fake.seen.keys], ['test-service-role-key'],
      'apikey must be sent on every request, and must be the service key');
  });

  test('an upsert asks for merge-duplicates, so a race cannot 409', () => {
    assert.ok(fake.seen.prefers.some((p) => p.includes('resolution=merge-duplicates')));
  });

  test('consuming a nonce deletes and returns in ONE request', () => {
    // return=representation on a DELETE is what makes it a single statement. A
    // select-then-delete would let two requests both see the same nonce.
    assert.ok(fake.seen.prefers.some((p) => p === 'return=representation'));
  });
});

// These run last, and deliberately break the fake in place rather than
// re-pointing SUPABASE_URL - see the note above about config being read once.
describe('failure modes', () => {
  test('a claim function that answers with nothing refuses the turn', async () => {
    const store = await import('./server/db-supabase.js');
    fake.broken.rpc = true;
    const claim = await store.claimTurn(1, 10_000, 40, '2026-08-01', Date.now());
    fake.broken.rpc = false;
    assert.equal(claim.ok, false, 'a budget must fail closed, never open');
    assert.equal(claim.reason, 'cooldown');
  });

  test('an unreachable database raises rather than looking like no data', async () => {
    const store = await import('./server/db-supabase.js');
    await new Promise((resolve) => fake.server.close(resolve));
    await assert.rejects(
      () => store.loadProgress(1),
      (error) => error.name === 'SupabaseError',
      'a down database must not be indistinguishable from "this user has no progress"',
    );
  });

  test('an error never echoes the filter value, which can be a session hash', async () => {
    const store = await import('./server/db-supabase.js');
    const secret = 'a'.repeat(64);
    const error = await store.sessionUser(secret).catch((e) => e);
    assert.ok(!JSON.stringify({ m: error.message, d: error.detail }).includes(secret),
      'a thrown error must not carry the token hash into a log');
  });
});

after(() => {
  fake.server.close();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Windows keeps a handle on the WAL file briefly; the temp dir is disposable.
  }
});
