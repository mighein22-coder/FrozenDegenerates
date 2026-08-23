-- ============================================================================
-- 0007_lock_game_score_writes.sql
--
-- Stop anyone rewriting game scores.
--
-- `games` carries two policies written for `public` — not `authenticated`,
-- `public`, which is every request the anon key can make:
--
--   "Anyone can update games"  UPDATE  using (true)
--   "Anyone can insert games"  INSERT  with check (true)
--
-- The anon key ships in the browser bundle, so this is not a members-only
-- hole: any visitor at all could set `home_score`, `away_score` or `status`
-- on any game. Those columns decide every pick's result, so rewriting one
-- rewrites the standings.
--
-- 0006 locked the score columns on `picks`. This is the same wound one table
-- upstream: it does not matter that a member cannot write `points_earned`
-- directly if they can flip the game the pick refers to and have `sync-week`
-- compute a wrong result for them, from data it trusts.
--
-- Two independent layers, as in 0001 and 0006:
--
--   1. Privileges and policies — client roles lose UPDATE and DELETE on
--      `games` outright, and may INSERT only the six columns the schedule
--      feed actually supplies. Anonymous visitors lose write access entirely.
--   2. A BEFORE trigger — forces the score and status columns to their unplayed
--      values on any client-role insert, and refuses any client-role update,
--      so the hole stays shut if a later migration re-grants something.
--
-- Why INSERT survives at all: `saveGames` (src/lib/supabaseService.ts) seeds a
-- week's schedule the first time any member opens it, from the `nhl-schedule`
-- function. That is the app's normal path, not an admin action. It sends
-- exactly `week_id`, `nhl_game_id`, `home_team_id`, `away_team_id`,
-- `start_time` and `status` — no scores — so the grant below matches it.
--
-- Scores are written only by `sync-week`, which connects with the service-role
-- key and is unaffected by everything here.
--
-- SCOPE: `weeks` is deliberately untouched. The client also inserts week rows
-- and the admin panel updates `weeks.status` from the browser, and deciding
-- where those writes belong is ASSESSMENT #10, still open. This migration
-- closes the scoring hole and nothing else.
--
-- Safe to run more than once.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Remove the public write policies.
--
--    Both historical names are dropped, plus the names this file creates, so
--    re-running cannot leave two policies where one is intended. Run the audit
--    query at the bottom first: if a deployed policy carries some other name,
--    add it here, or the permissive policy survives alongside the new one and
--    the table stays writable while appearing fixed.
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can update games" on public.games;
drop policy if exists "Anyone can insert games" on public.games;
drop policy if exists "games_update_all" on public.games;
drop policy if exists "games_insert_all" on public.games;
drop policy if exists "games_insert_authenticated" on public.games;

-- Seeding a week's schedule stays a member action; nothing else may write.
create policy "games_insert_authenticated"
  on public.games
  for insert
  to authenticated
  with check (true);

-- No UPDATE or DELETE policy is created. `sync-week` uses the service-role key,
-- which bypasses RLS, so scoring keeps working with no client-facing policy at
-- all. The SELECT policy is left exactly as it is — games must stay readable.

-- ---------------------------------------------------------------------------
-- 2. Table and column privileges.
--    Checked by Postgres before RLS runs, so this is the layer that holds even
--    if a policy is later loosened.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.games from anon, authenticated;

grant insert (week_id, nhl_game_id, home_team_id, away_team_id, start_time, status)
  on public.games to authenticated;

grant insert, update, delete on public.games to service_role;

-- ---------------------------------------------------------------------------
-- 3. Trigger guard.
--
--    `current_user` is the role PostgREST switched into for the request:
--    'authenticated' or 'anon' for client traffic, 'service_role' for the
--    service key, 'postgres' in the dashboard SQL editor. Only client traffic
--    is constrained.
--
--    INSERT normalizes rather than raising, matching 0006: a game seeded by a
--    member is always unplayed, so forcing the values costs an honest caller
--    nothing and makes a dishonest one a no-op. UPDATE raises, because no
--    client code path updates `games` at all.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_game_score_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.home_score := null;
    new.away_score := null;
    new.status := 'SCHEDULED';
    return new;
  end if;

  raise exception 'games are scored by the league sync and cannot be changed here'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists games_score_guard on public.games;

create trigger games_score_guard
  before insert or update on public.games
  for each row
  execute function public.enforce_game_score_guard();

commit;

-- ============================================================================
-- Verification
-- ============================================================================
--
-- (a) Exactly one INSERT policy, no UPDATE or DELETE policy, and nothing
--     addressed to `public`:
--
--     select policyname, cmd, roles, qual, with_check
--       from pg_policies
--      where schemaname = 'public' and tablename = 'games'
--      order by cmd, policyname;
--
--     -- expected: the SELECT policy you already had, plus
--     --           games_insert_authenticated (INSERT, {authenticated})
--
-- (b) `authenticated` must hold INSERT on six columns and nothing else:
--
--     select privilege_type, column_name
--       from information_schema.column_privileges
--      where table_schema = 'public' and table_name = 'games'
--        and grantee in ('authenticated', 'anon')
--      order by grantee, privilege_type, column_name;
--
--     -- expected: INSERT on away_team_id, home_team_id, nhl_game_id,
--     --           start_time, status, week_id — and no UPDATE or DELETE
--
-- (c) The rewrite must fail. Run as a real member, signed in to the app, from
--     the browser console:
--
--     update games set home_score = 9, away_score = 0, status = 'FINAL';
--
--     -- expected: permission denied for table games
--
-- (d) Seeding must still work. Open a week that has no games yet and confirm
--     the schedule appears, then check it landed unplayed:
--
--     select status, home_score, away_score, count(*) from public.games
--      where week_id = '<that week>'
--      group by status, home_score, away_score;
--
--     -- expected: one row — SCHEDULED, null, null, <number of games>
--
-- (e) Scoring must still work — `sync-week` connects as `service_role`. Open
--     the results view for a week with finished games and confirm scores land
--     and picks resolve.
--
-- ============================================================================
-- Damage check: has anyone already rewritten a score?
--
-- Run before applying. There is no perfect query for this — the database has
-- no record of what the NHL actually reported — but these two find the shapes
-- a tampered row takes.
-- ============================================================================
--
-- (i) Games marked FINAL with a missing or implausible score:
--
-- select id, week_id, home_team_id, away_team_id, status, home_score, away_score
--   from public.games
--  where status = 'FINAL'
--    and (home_score is null or away_score is null
--         or home_score > 12 or away_score > 12
--         or home_score = away_score)
--  order by week_id, start_time;
--
-- -- A tie is the signal worth attention: NHL regular season games do not end
-- -- level, so a FINAL row with equal scores was not written by the NHL feed.
--
-- (ii) Games marked FINAL that have not actually started yet:
--
-- select id, week_id, home_team_id, away_team_id, status, start_time
--   from public.games
--  where status = 'FINAL' and start_time > now()
--  order by start_time;
--
-- To repair a row, reset it and let the next sync rewrite it from the feed:
--
-- update public.games
--    set status = 'SCHEDULED', home_score = null, away_score = null
--  where id = '<game id>';
--
-- Then reset any picks that were resolved against it, so the sync redoes them:
--
-- update public.picks set result = 'PENDING', points_earned = 0
--  where game_id = '<game id>';
