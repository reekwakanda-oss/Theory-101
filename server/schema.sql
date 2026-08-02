-- Theory 101 on Supabase Postgres.
--
-- Paste this whole file into the Supabase dashboard -> SQL Editor -> New query
-- -> Run. It is idempotent, so running it twice is harmless.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- READ THIS BEFORE CHANGING ANYTHING
--
-- Every table here is reached ONLY by this app's Node server, holding the
-- service_role key. No browser ever talks to Supabase directly - the app's
-- Content-Security-Policy pins connect-src to 'self', which enforces it.
--
-- That means two things must be true of every table, and the bottom of this
-- file asserts them:
--
--   1. ROW LEVEL SECURITY IS ENABLED, WITH NO POLICIES.
--      Supabase grants the anon role access to the public schema by default.
--      A table in public with RLS switched off is readable by anyone holding
--      the anon key - and the anon key is designed to be public. RLS on with
--      zero policies denies everyone; service_role bypasses RLS by design, so
--      the server still works and nobody else gets in.
--
--   2. THE ANON AND AUTHENTICATED ROLES HAVE NO GRANTS.
--      Belt and braces. If a future policy is ever added by accident, the
--      missing grant still stops it.
--
-- Timestamps are epoch milliseconds in bigint, not timestamptz, deliberately:
-- the application compares them against Date.now() everywhere, and one
-- representation end to end means no timezone can ever get between a cooldown
-- and the clock that set it.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id           bigint generated always as identity primary key,
  google_sub   text   not null unique,
  email        text,
  name         text,
  picture      text,
  created_at   bigint not null,
  last_seen_at bigint not null
);

-- Sessions store only a SHA-256 of the cookie value, never the value itself.
-- A stolen database therefore does not hand the thief usable sessions.
create table if not exists public.sessions (
  token_hash text   primary key,
  user_id    bigint not null references public.users(id) on delete cascade,
  created_at bigint not null,
  expires_at bigint not null
);
create index if not exists sessions_user   on public.sessions(user_id);
create index if not exists sessions_expiry on public.sessions(expires_at);

create table if not exists public.progress (
  user_id    bigint primary key references public.users(id) on delete cascade,
  data       jsonb  not null,
  updated_at bigint not null
);

-- Single-use sign-in nonces. Without these, a captured Google ID token could be
-- replayed until it expires.
create table if not exists public.auth_nonces (
  nonce      text   primary key,
  created_at bigint not null
);

-- Tutor budget. ONE row per user, not one per (user, day): a per-day row would
-- have no last_at on the first request after UTC midnight, so the cooldown could
-- be skipped once every day.
create table if not exists public.assistant_usage (
  user_id bigint primary key references public.users(id) on delete cascade,
  day     text   not null,   -- 'YYYY-MM-DD', UTC
  used    integer not null,
  last_at bigint not null
);

-- ─────────────────────────────────────────────────────────────────────────────
-- The atomic claim.
--
-- On SQLite this was a read followed by a write with no await between them,
-- which was safe only because node:sqlite is synchronous and Node runs one
-- thread. Over HTTP that guarantee is gone: two concurrent posts would both
-- read "cooled down" before either wrote. So the decision moves into the
-- database, where a row lock can hold it.
--
-- INSERT ... ON CONFLICT DO NOTHING first, because SELECT ... FOR UPDATE locks
-- nothing when the row does not exist yet, and two first-requests would race.
-- Materialising the row makes the lock have something to take.
--
-- This is strictly stronger than what SQLite gave us: it is correct across
-- several server processes, which the old version never was.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_assistant_turn(
  p_user_id     bigint,
  p_cooldown_ms bigint,
  p_daily_limit integer,
  p_day         text,
  p_now         bigint
) returns table (ok boolean, reason text, used integer, last_at bigint)
language plpgsql
as $$
declare
  v_used    integer;
  v_last_at bigint;
  v_day     text;
begin
  insert into public.assistant_usage (user_id, day, used, last_at)
  values (p_user_id, p_day, 0, 0)
  on conflict (user_id) do nothing;

  select au.day, au.used, au.last_at
    into v_day, v_used, v_last_at
    from public.assistant_usage au
   where au.user_id = p_user_id
     for update;

  if p_now - v_last_at < p_cooldown_ms then
    return query select false, 'cooldown'::text, v_used, v_last_at;
    return;
  end if;

  -- A new UTC day resets the count, but never the cooldown: last_at is carried
  -- by the same row, so midnight is not a free pass.
  if v_day is distinct from p_day then
    v_used := 0;
  end if;

  if v_used >= p_daily_limit then
    return query select false, 'daily'::text, v_used, v_last_at;
    return;
  end if;

  update public.assistant_usage
     set day = p_day, used = v_used + 1, last_at = p_now
   where user_id = p_user_id;

  return query select true, null::text, v_used + 1, p_now;
end;
$$;

-- Give a turn back when the provider failed - the learner got nothing for it.
-- last_at is deliberately NOT rewound, so a failing provider cannot be retried
-- in a tight loop.
create or replace function public.release_assistant_turn(p_user_id bigint)
returns void
language sql
as $$
  update public.assistant_usage
     set used = greatest(0, used - 1)
   where user_id = p_user_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lock everything down. See the note at the top: this is not optional.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users           enable row level security;
alter table public.sessions        enable row level security;
alter table public.progress        enable row level security;
alter table public.auth_nonces     enable row level security;
alter table public.assistant_usage enable row level security;

revoke all on public.users           from anon, authenticated;
revoke all on public.sessions        from anon, authenticated;
revoke all on public.progress        from anon, authenticated;
revoke all on public.auth_nonces     from anon, authenticated;
revoke all on public.assistant_usage from anon, authenticated;

revoke execute on function public.claim_assistant_turn(bigint, bigint, integer, text, bigint)
  from anon, authenticated;
revoke execute on function public.release_assistant_turn(bigint) from anon, authenticated;

-- Assert it, rather than trusting that the statements above ran. If a future
-- migration turns RLS off, the next run of this file fails loudly instead of
-- leaving the users table readable with a public key.
do $$
declare t text;
begin
  foreach t in array array['users', 'sessions', 'progress', 'auth_nonces', 'assistant_usage']
  loop
    if not (select c.relrowsecurity
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = t) then
      raise exception 'RLS is OFF on public.% - the anon key could read it', t;
    end if;
  end loop;
end;
$$;
