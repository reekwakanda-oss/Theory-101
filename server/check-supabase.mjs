// Is Supabase actually set up correctly?
//
//   node --env-file-if-exists=.env server/check-supabase.mjs
//
// The server's boot ping only proves the database answered. This checks the
// things that actually go wrong: schema.sql pasted but never run, the anon key
// used instead of service_role, or row level security left off so the tables
// are readable with a public key.
//
// Nothing here writes any data. The function check deliberately passes a user
// id that cannot exist, so the foreign key rejects the insert before anything
// is stored - which still tells us whether the function is there.

import {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USE_SUPABASE,
} from './config.js';

const TABLES = ['users', 'sessions', 'progress', 'auth_nonces', 'assistant_usage'];
const FUNCTIONS = ['claim_assistant_turn', 'release_assistant_turn'];

let failed = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)}${detail}`);
};

if (!USE_SUPABASE) {
  console.log('Supabase is not configured, so there is nothing to check.\n');
  console.log('  SUPABASE_URL              ', SUPABASE_URL || '(empty)');
  console.log('  SUPABASE_SERVICE_ROLE_KEY ', SUPABASE_SERVICE_ROLE_KEY ? '(set)' : '(empty)');
  console.log('\nSet both in .env, then run this again. Without them the server');
  console.log('stores progress in a local SQLite file, which needs no setup.');
  process.exit(1);
}

const base = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;

async function ask(path, { key = SUPABASE_SERVICE_ROLE_KEY, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: response.status, body: parsed, text };
  } catch (error) {
    return { status: 0, error: error.name === 'AbortError' ? 'timed out' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`Checking ${SUPABASE_URL}\n`);

// --- Can we reach it at all, with a key it accepts? --------------------------

console.log('Connection:');
const reach = await ask('/users?select=id&limit=1');

if (reach.status === 0) {
  report(false, 'the project is reachable', reach.error);
  console.log('\n  Check SUPABASE_URL. It should look like');
  console.log('  https://your-project.supabase.co with no path on the end.');
  process.exit(1);
}
report(true, 'the project is reachable', `HTTP ${reach.status}`);

if (reach.status === 401 || reach.status === 403) {
  report(false, 'the key is accepted', reach.body?.message ?? `HTTP ${reach.status}`);
  console.log('\n  That key was rejected. Use Settings -> API Keys -> service_role.');
  process.exit(1);
}
report(true, 'the key is accepted');

// An empty array here is the healthy answer for a service key on an empty
// table. An anon key would ALSO return an empty array, which is exactly why
// config.js warns about the role and why the anon check below exists.
if (reach.status === 404) {
  report(false, 'the schema has been run', 'users table not found');
  console.log('\n  server/schema.sql has not been run on this project.');
  console.log('  Supabase dashboard -> SQL Editor -> New query -> paste it -> Run.');
  process.exit(1);
}

// --- Every table -------------------------------------------------------------

console.log('\nTables:');
for (const table of TABLES) {
  const result = await ask(`/${table}?select=*&limit=1`);
  const exists = result.status === 200;
  report(exists, table, exists ? `${result.body?.length ?? 0} row(s) visible` : `HTTP ${result.status}`);
}

// --- The two functions the tutor's budget depends on -------------------------

console.log('\nFunctions:');
for (const fn of FUNCTIONS) {
  // -1 cannot be a real user id, so the foreign key rejects the insert and
  // nothing is written. A missing function answers differently from a rejected
  // one, which is the distinction being drawn here.
  const args = fn === 'claim_assistant_turn'
    ? { p_user_id: -1, p_cooldown_ms: 0, p_daily_limit: 1, p_day: '1970-01-01', p_now: 0 }
    : { p_user_id: -1 };
  const result = await ask(`/rpc/${fn}`, { method: 'POST', body: args });
  const missing = result.status === 404
    || /could not find the function|does not exist/i.test(result.body?.message ?? '');
  report(!missing, fn, missing ? 'not found - re-run schema.sql' : 'present');
}

// --- The part that actually matters ------------------------------------------

console.log('\nLockdown:');
const anon = process.env.SUPABASE_ANON_KEY?.trim();
if (!anon) {
  console.log('  --   anon key not supplied, so the most important check was skipped.');
  console.log('       Set SUPABASE_ANON_KEY in .env (Settings -> API Keys -> anon)');
  console.log('       and run this again. The anon key is public by design, so');
  console.log('       what it can read is what the internet can read.');
} else {
  const exposed = await ask('/users?select=id,email&limit=1', { key: anon });
  if (exposed.status === 200 && Array.isArray(exposed.body) && exposed.body.length > 0) {
    report(false, 'the anon key cannot read users', 'IT CAN - ROWS CAME BACK');
    console.log('\n  Row level security is off, or a policy is granting access.');
    console.log('  Re-run server/schema.sql; it enables RLS and revokes the grants.');
  } else if (exposed.status === 401 || exposed.status === 403
             || /permission denied/i.test(exposed.body?.message ?? '')) {
    report(true, 'the anon key is refused outright', exposed.body?.message ?? `HTTP ${exposed.status}`);
  } else if (exposed.status === 200) {
    // Denied-by-RLS and genuinely-empty both look like []. Say so rather than
    // claiming a pass that has not been earned.
    report(true, 'the anon key returned no rows', 'inconclusive while the table is empty');
    console.log('       Once a real account exists, run this again: an empty answer');
    console.log('       then is proof, whereas now it is only consistent with proof.');
  } else {
    report(false, 'the anon key cannot read users', `unexpected HTTP ${exposed.status}`);
  }
}

console.log(failed === 0
  ? '\nSupabase is set up correctly. Start the server and it will use it.'
  : `\n${failed} check(s) failed - see above.`);
process.exitCode = failed === 0 ? 0 : 1;
