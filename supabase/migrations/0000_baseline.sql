-- 0000_baseline.sql — the schema as it stood before 0001.
--
-- `profiles`, `weeks`, `games` and `picks` were created by hand in the Supabase
-- dashboard, so no migration created them and the migration series could not be
-- replayed onto an empty database. This file closes that gap.
--
-- PROVENANCE. Not written from the app's types or from memory. Every table,
-- column, default, constraint and index below was read out of the live database
-- on 2026-09-14 by `supabase/baseline/capture.sql`; the raw result is committed
-- alongside it as `supabase/baseline/capture-2026-09-14.csv` (392 rows, project
-- `okyncddbbzrkerjtasvx`). Where this file departs from that capture — it must,
-- since the capture shows today's hardened state and this is the state *before*
-- 0001 — the reason is given inline.
--
-- ---------------------------------------------------------------------------
-- THIS FILE IS DELIBERATELY INSECURE. DO NOT "FIX" IT.
-- ---------------------------------------------------------------------------
-- It recreates the original permissive policies: anyone can rewrite a game
-- score, anyone can insert a week, picks are world-readable, and there is no
-- deadline on pick writes. That is the point. 0001–0009 replay on top of this
-- file, and each one exists to close a hole that was genuinely open. A baseline
-- that started out secure would let every assertion in the test harness pass
-- while proving nothing at all.
--
-- Nothing applies this file to production. Production already has this history;
-- it lives here so a *throwaway* database can be given the same starting point.
--
-- ---------------------------------------------------------------------------
-- APPLYING THIS TO AN EMPTY DATABASE
-- ---------------------------------------------------------------------------
-- `profiles.id` references `auth.users(id)`, and the policies call `auth.uid()`.
-- Neither exists in a bare Postgres — Supabase provides them. A harness must
-- create a stand-in for both before applying this file. That stub belongs in
-- the harness, not here, so that this file stays a faithful record of what
-- production actually looks like.
--
-- Idempotent, in the style of the rest of the series: re-running it is safe.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- `gen_random_uuid()` backs the id defaults on `games` and `picks`. It is
-- built in from Postgres 13, but pgcrypto is installed on the live project and
-- is named here so an older target still works. The capture also found
-- `uuid-ossp`, `pg_stat_statements` and `supabase_vault` installed; none is
-- referenced by anything in this schema, so none is required here.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Exactly as captured. No migration in the series adds, drops or retypes a
-- column, so the live column layout is also the original one.
--
-- Two things to notice, because they are load-bearing later:
--
--   * `games.id` and `picks.id` default to `gen_random_uuid()`. The client
--     never sends an id, and 0006/0007 narrow the INSERT grants to column lists
--     that exclude `id` — those inserts work only because of these defaults.
--
--   * `games.week_id`, `picks.user_id`, `picks.week_id` and `picks.game_id` are
--     all NULLABLE. Every one of them is a foreign key, and a NULL foreign key
--     passes any `auth.uid() = user_id` check by evaluating to NULL rather than
--     false. This is recorded, not corrected — correcting it is a schema change
--     and belongs in a migration of its own.

create table if not exists public.profiles (
  id uuid not null,
  email text not null,
  name text not null,
  avatar text,
  role text default 'member'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.weeks (
  id text not null,
  week_number integer not null,
  saturday_date date not null,
  status text default 'OPEN'::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.games (
  id uuid not null default gen_random_uuid(),
  week_id text,
  home_team_id text not null,
  away_team_id text not null,
  start_time timestamp with time zone not null,
  status text default 'SCHEDULED'::text,
  home_score integer,
  away_score integer,
  created_at timestamp with time zone default now(),
  nhl_game_id integer
);

create table if not exists public.picks (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  week_id text,
  game_id uuid,
  selected_team_id text not null,
  confidence integer not null,
  points_earned integer default 0,
  result text default 'PENDING'::text,
  created_at timestamp with time zone default now()
);

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
-- Primary and unique keys first, then checks, then foreign keys, so each one
-- has something to point at. `add constraint` has no `if not exists`, so each
-- is guarded individually to keep the file re-runnable.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pkey') then
    alter table public.profiles add constraint profiles_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weeks_pkey') then
    alter table public.weeks add constraint weeks_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_pkey') then
    alter table public.games add constraint games_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_pkey') then
    alter table public.picks add constraint picks_pkey primary key (id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_email_key') then
    alter table public.profiles add constraint profiles_email_key unique (email);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_week_home_away_unique') then
    alter table public.games add constraint games_week_home_away_unique
      unique (week_id, home_team_id, away_team_id);
  end if;

  -- These two are the database's half of the "five picks, one per game,
  -- confidence 1-5 with no duplicates" rule. The app enforces the same thing in
  -- TypeScript and `save_picks` re-checks it in SQL from 0005; these constraints
  -- are what make it true even for a REST call that skips both.
  if not exists (select 1 from pg_constraint where conname = 'picks_user_id_week_id_game_id_key') then
    alter table public.picks add constraint picks_user_id_week_id_game_id_key
      unique (user_id, week_id, game_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_user_id_week_id_confidence_key') then
    alter table public.picks add constraint picks_user_id_week_id_confidence_key
      unique (user_id, week_id, confidence);
  end if;

  -- The status/role/result columns are plain text with check constraints, not
  -- enums. The capture found no enum type in `public` at all.
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles add constraint profiles_role_check
      check ((role = any (array['admin'::text, 'member'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weeks_status_check') then
    alter table public.weeks add constraint weeks_status_check
      check ((status = any (array['OPEN'::text, 'LOCKED'::text, 'COMPLETED'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_status_check') then
    alter table public.games add constraint games_status_check
      check ((status = any (array['SCHEDULED'::text, 'LIVE'::text, 'FINAL'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_result_check') then
    alter table public.picks add constraint picks_result_check
      check ((result = any (array['WIN'::text, 'LOSS'::text, 'PENDING'::text])));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_confidence_check') then
    alter table public.picks add constraint picks_confidence_check
      check (((confidence >= 1) and (confidence <= 5)));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_week_id_fkey') then
    alter table public.games add constraint games_week_id_fkey
      foreign key (week_id) references public.weeks(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_user_id_fkey') then
    alter table public.picks add constraint picks_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_week_id_fkey') then
    alter table public.picks add constraint picks_week_id_fkey
      foreign key (week_id) references public.weeks(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'picks_game_id_fkey') then
    alter table public.picks add constraint picks_game_id_fkey
      foreign key (game_id) references public.games(id) on delete cascade;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_games_week on public.games using btree (week_id);
create index if not exists idx_games_nhl_id on public.games using btree (nhl_game_id);
create index if not exists idx_picks_user_week on public.picks using btree (user_id, week_id);
create index if not exists idx_picks_game on public.picks using btree (game_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- On for all four tables in production, and on here too. RLS being enabled is
-- what makes the permissive policies below the *only* thing standing between a
-- client and the data — which is exactly the situation 0003 onward inherit.
alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.games enable row level security;
alter table public.picks enable row level security;

-- ---------------------------------------------------------------------------
-- Policies — the original, permissive set
-- ---------------------------------------------------------------------------
-- Reconstructed from two sources: the ones still live in the capture, and the
-- ones later migrations drop by name. A policy that a migration drops must have
-- existed to be dropped, and `supabase/README.md` quotes several of them
-- verbatim from the live database before they were removed.
--
-- Read this section as the answer to "what was the pool actually exposed to
-- before any of this was fixed".

-- profiles ------------------------------------------------------------------

-- World-readable, with no `to` clause — so this covers `anon`, and the anon key
-- ships in the browser bundle. Every member's email and role was public. 0009
-- replaces this with an `is_member()` version under the same name.
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles
  for select
  using (true);

-- No `with check`, which is the hole 0001 closes: a `using` clause alone
-- decides which rows you may touch, never what you may write into them, so a
-- member could set their own `role` to 'admin'.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using ((auth.uid() = id));

-- weeks ---------------------------------------------------------------------

drop policy if exists "Anyone can view weeks" on public.weeks;
create policy "Anyone can view weeks"
  on public.weeks
  for select
  using (true);

-- `public`, so the anon key can insert weeks. Dropped by 0008.
drop policy if exists "Anyone can insert weeks" on public.weeks;
create policy "Anyone can insert weeks"
  on public.weeks
  for insert
  with check (true);

-- `using (true)` with no column restriction, so any member could rewrite
-- `saturday_date` — the column every deadline rule reads. Dropped by 0008.
drop policy if exists "Allow authenticated users to update weeks" on public.weeks;
create policy "Allow authenticated users to update weeks"
  on public.weeks
  for update
  to authenticated
  using (true);

-- games ---------------------------------------------------------------------

drop policy if exists "Anyone can view games" on public.games;
create policy "Anyone can view games"
  on public.games
  for select
  using (true);

-- Both `public`: a logged-out visitor could set `home_score` / `away_score` /
-- `status` on any game and move the standings. Dropped by 0007.
drop policy if exists "Anyone can insert games" on public.games;
create policy "Anyone can insert games"
  on public.games
  for insert
  with check (true);

drop policy if exists "Anyone can update games" on public.games;
create policy "Anyone can update games"
  on public.games
  for update
  using (true);

-- Still live in the capture, because 0007's drop list does not name it. It is
-- inert today only because 0007 revoked the UPDATE *grant* from client roles —
-- a policy without a privilege grants nothing. Kept here so the harness sees
-- the same latent hazard production has: re-grant UPDATE on `games` to
-- `authenticated` for any reason and this reopens the scores to every member,
-- with no policy change to notice in review.
drop policy if exists "Allow authenticated users to update games" on public.games;
create policy "Allow authenticated users to update games"
  on public.games
  for update
  to authenticated
  using (true)
  with check (true);

-- picks ---------------------------------------------------------------------

-- Every member's sheet readable by everyone, before and during the week.
-- Replaced by 0003. The original name is one of the two 0003 drops; the other
-- is "Picks are viewable by everyone". 0003 drops both, so the replay is
-- correct either way.
drop policy if exists picks_select_all on public.picks;
create policy picks_select_all
  on public.picks
  for select
  using (true);

-- Ownership, and nothing else. No deadline: these are what 0004 replaces with
-- versions that add `and not picks_revealed(week_id)`.
drop policy if exists "Users can insert own picks" on public.picks;
create policy "Users can insert own picks"
  on public.picks
  for insert
  with check ((auth.uid() = user_id));

drop policy if exists "Users can update own picks" on public.picks;
create policy "Users can update own picks"
  on public.picks
  for update
  using ((auth.uid() = user_id));

drop policy if exists "Users can delete own picks" on public.picks;
create policy "Users can delete own picks"
  on public.picks
  for delete
  using ((auth.uid() = user_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase's default for a new table in `public` is every privilege to `anon`,
-- `authenticated` and `service_role`, and nothing in the dashboard history
-- narrowed that. The capture corroborates it: `anon` and `authenticated` still
-- hold REFERENCES, TRIGGER and TRUNCATE on all four tables, and DELETE on
-- `picks` and `profiles`. Those are exactly the privileges no migration ever
-- revoked — the leftovers of an original `grant all`.
--
-- So the starting point is `grant all`, and 0001/0002/0006/0007/0008 revoke
-- from there. Getting this wrong in the permissive direction is the safe error
-- for a baseline: it makes the later migrations do more work, not less.
grant all on public.profiles to anon, authenticated, service_role;
grant all on public.weeks to anon, authenticated, service_role;
grant all on public.games to anon, authenticated, service_role;
grant all on public.picks to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deliberately not included
-- ---------------------------------------------------------------------------
-- * `invites` and `invite_claims`, and every function and trigger the capture
--   found: `picks_revealed` (0003), `save_picks` (0005), the four
--   `enforce_*_guard` functions and their triggers (0001, 0006, 0007, 0008),
--   `is_admin` (0008), and `is_member` / `redeem_invite` /
--   `admin_create_invite` / `admin_revoke_invite` / `normalise_invite_code` /
--   `generate_invite_code` (0009). All are created by migrations already in
--   this series, so including them here would mean two sources of truth for the
--   same object.
--
-- * A `profiles` INSERT policy. 0002 creates one — dropping it first by the
--   same name — so whether one existed beforehand cannot be told from the
--   capture, since 0009 has since dropped it again. Omitting it is the
--   conservative reading: if the original had one, the replay is missing a hole
--   that 0009 closes anyway, which understates the history rather than
--   inventing it.
--
-- * `rls_auto_enable()`, an event-trigger function found in `public` that
--   belongs to no migration. It enables RLS automatically on any new table in
--   `public`. It is left out because the event trigger that fires it was not
--   captured — `capture.sql` reads `pg_trigger`, and event triggers live in
--   `pg_event_trigger` — so reproducing it here would be half an object.
--   Nothing in the series depends on it: 0009 enables RLS on its own tables
--   explicitly. See `supabase/baseline/README.md` for the follow-up query.
