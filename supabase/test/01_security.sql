-- ============================================================================
-- Security tests for the schema: 0000_baseline.sql plus every migration after
-- it.
--
-- Each case plays the part of a member with nothing but the anon key and a SQL
-- console — the threat model 0001–0009 were written against. Every attack
-- below worked at some point in this app's history, and one of them (the
-- deadline on pick writes, 0004) worked again in production as recently as
-- 2026-09-21, because the policy had quietly gone missing and the check that
-- was supposed to notice counted policies instead of reading them.
--
-- Run via supabase/test/run.sh. Every line should read `ok`. A `FAIL` line is
-- a real hole, not a flaky test.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------------------
-- Assertion helpers.
--
-- `must_fail` runs a statement as the CURRENT role (it is deliberately not
-- SECURITY DEFINER) and reports whether it was rejected. The exception handler
-- gives each case its own implicit savepoint, so one blocked statement does
-- not abort the rest of the run.
--
-- A blocked UPDATE or DELETE does NOT raise — a Postgres `using` clause filters
-- rows rather than erroring, so zero rows match and the statement "succeeds".
-- Those cases use must_pass plus an assert on the effect. Getting this wrong is
-- how a test suite reports green over an open hole.
-- ---------------------------------------------------------------------------
create function pg_temp.must_fail(label text, stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'FAIL: ' || label || ' — statement was ALLOWED';
exception when others then
  return 'ok: ' || label;
end $$;

create function pg_temp.must_pass(label text, stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'ok: ' || label;
exception when others then
  return 'FAIL: ' || label || ' — ' || sqlerrm;
end $$;

create function pg_temp.assert(label text, cond boolean) returns text
language sql as $$
  select case when cond then 'ok: ' else 'FAIL: ' end || label;
$$;

-- ---------------------------------------------------------------------------
-- Seed, with RLS bypassed — as sync-week does with the service-role key.
--
-- Seeding runs as the superuser, and every guard trigger short-circuits for
-- roles other than anon/authenticated, so these inserts set columns the
-- triggers would otherwise force. That is deliberate: it is the only way to
-- construct a scored, locked week to attack.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'mallory@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'honest@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'boss@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'stranger@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'invited@example.com');

-- Stranger (4444) and Invited (5555) deliberately have NO profile row. Since
-- 0009 that is the difference between "signed in" and "member", and it is the
-- boundary most of the invite tests below are about.
insert into public.profiles (id, email, name, role) values
  ('11111111-1111-1111-1111-111111111111', 'mallory@example.com', 'Mallory', 'member'),
  ('22222222-2222-2222-2222-222222222222', 'honest@example.com',  'Honest',  'member'),
  ('33333333-3333-3333-3333-333333333333', 'boss@example.com',    'Boss',    'admin');

-- One week whose Saturday deadline is long past, one far enough in
-- the future to stay open. The deadline is computed from real `now()` by
-- picks_revealed(), so these are real dates rather than a faked clock.
insert into public.weeks (id, week_number, saturday_date, status) values
  ('week-2026-03-14', 24, '2026-03-14', 'COMPLETED'),
  ('week-2030-01-05',  1, '2030-01-05', 'OPEN');

insert into public.games (id, week_id, home_team_id, away_team_id, start_time, status, home_score, away_score) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'week-2026-03-14', 'TOR', 'MTL', '2026-03-14 19:00-04', 'FINAL', 4, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'week-2026-03-14', 'BOS', 'NYR', '2026-03-14 19:00-04', 'FINAL', 2, 3),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'week-2030-01-05', 'TOR', 'MTL', '2030-01-05 19:00-05', 'SCHEDULED', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'week-2030-01-05', 'BOS', 'NYR', '2030-01-05 19:00-05', 'SCHEDULED', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'week-2030-01-05', 'EDM', 'CGY', '2030-01-05 19:00-05', 'SCHEDULED', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'week-2030-01-05', 'VAN', 'SEA', '2030-01-05 19:00-05', 'SCHEDULED', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'week-2030-01-05', 'PIT', 'PHI', '2030-01-05 19:00-05', 'SCHEDULED', null, null),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'week-2030-01-05', 'COL', 'VGK', '2030-01-05 19:00-05', 'SCHEDULED', null, null);

-- A scored sheet in the closed week, for both members. This is what a late
-- rewrite would be trying to improve on.
insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence, points_earned, result) values
  ('11111111-1111-1111-1111-111111111111', 'week-2026-03-14', 'aaaaaaaa-0000-0000-0000-000000000001', 'TOR', 5, 5, 'WIN'),
  ('11111111-1111-1111-1111-111111111111', 'week-2026-03-14', 'aaaaaaaa-0000-0000-0000-000000000002', 'BOS', 4, 0, 'LOSS'),
  ('22222222-2222-2222-2222-222222222222', 'week-2026-03-14', 'aaaaaaaa-0000-0000-0000-000000000001', 'MTL', 3, 0, 'LOSS');

-- Open-week picks for both members. Mallory must see her own and not Honest's;
-- an empty table would make that test pass for the wrong reason.
insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence) values
  ('22222222-2222-2222-2222-222222222222', 'week-2030-01-05', 'bbbbbbbb-0000-0000-0000-000000000001', 'TOR', 5),
  ('11111111-1111-1111-1111-111111111111', 'week-2030-01-05', 'bbbbbbbb-0000-0000-0000-000000000006', 'COL', 3);

\echo ''
\echo '=== A stranger: signed in, but not a member (0009) ==='

set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

select pg_temp.assert('is_member() is false for a profile-less account', not public.is_member());

select pg_temp.must_fail(
  'a stranger cannot make themselves a member',
  $$insert into public.profiles (id, email, name)
    values ('44444444-4444-4444-4444-444444444444', 'stranger@example.com', 'Stranger')$$);

select pg_temp.assert(
  'a stranger cannot read the member roster',
  (select count(*) = 0 from public.profiles));

select pg_temp.must_fail(
  'a stranger cannot seed a week',
  $$insert into public.weeks (id, week_number) values ('week-2030-01-12', 2)$$);

select pg_temp.must_fail(
  'a stranger cannot seed a game — the NHL-game-id squat',
  $$insert into public.games (week_id, home_team_id, away_team_id, start_time)
    values ('week-2030-01-05', 'XXX', 'YYY', now() + interval '20 days')$$);

\echo ''
\echo '=== profiles: no self-promotion (0001) ==='

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.assert('is_member() is true for a member', public.is_member());
select pg_temp.assert('is_admin() is false for a member', not public.is_admin());

select pg_temp.must_fail(
  'a member cannot promote themselves to admin',
  $$update public.profiles set role = 'admin'
     where id = '11111111-1111-1111-1111-111111111111'$$);

select pg_temp.must_pass(
  'a member may rename themselves',
  $$update public.profiles set name = 'Mallory Renamed'
     where id = '11111111-1111-1111-1111-111111111111'$$);

-- Filtered, not refused: the policy's `using` clause matches no rows.
select pg_temp.must_pass(
  'renaming someone else is silently filtered, not an error',
  $$update public.profiles set name = 'Hacked'
     where id = '22222222-2222-2222-2222-222222222222'$$);

select pg_temp.assert(
  'and the other member''s name did not change',
  (select name = 'Honest' from public.profiles
    where id = '22222222-2222-2222-2222-222222222222'));

\echo ''
\echo '=== picks: secret until the deadline (0003) ==='

select pg_temp.assert(
  'a member sees their own open-week picks',
  (select count(*) = 1 from public.picks
    where week_id = 'week-2030-01-05'
      and user_id = '11111111-1111-1111-1111-111111111111'));

select pg_temp.assert(
  'but NOT another member''s, before the deadline',
  (select count(*) = 0 from public.picks
    where week_id = 'week-2030-01-05'
      and user_id = '22222222-2222-2222-2222-222222222222'));

select pg_temp.assert(
  'once the week is revealed, the whole league is visible',
  (select count(*) = 3 from public.picks where week_id = 'week-2026-03-14'));

\echo ''
\echo '=== picks: the deadline binds WRITES too (0004) ==='
\echo '--- this is the one that went missing from production in 2026-09 ---'

select pg_temp.assert(
  'picks_revealed() is true for the closed week',
  public.picks_revealed('week-2026-03-14'));

select pg_temp.assert(
  'picks_revealed() is false for the open week',
  not public.picks_revealed('week-2030-01-05'));

-- The attack: after the games are final, delete the sheet and submit a new
-- one. The score guard forces the new rows to PENDING, which is exactly what
-- the attacker wants — sync-week then scores them against known results.
select pg_temp.must_fail(
  'cannot insert a pick into a week whose deadline has passed',
  $$insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence)
    values ('11111111-1111-1111-1111-111111111111', 'week-2026-03-14',
            'aaaaaaaa-0000-0000-0000-000000000002', 'NYR', 1)$$);

select pg_temp.must_pass(
  'deleting a locked sheet is silently filtered, not an error',
  $$delete from public.picks
     where user_id = '11111111-1111-1111-1111-111111111111'
       and week_id = 'week-2026-03-14'$$);

select pg_temp.assert(
  'and the locked sheet is still there',
  (select count(*) = 2 from public.picks
    where user_id = '11111111-1111-1111-1111-111111111111'
      and week_id = 'week-2026-03-14'));

select pg_temp.must_pass(
  'a pick in the OPEN week is still allowed',
  $$insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence)
    values ('11111111-1111-1111-1111-111111111111', 'week-2030-01-05',
            'bbbbbbbb-0000-0000-0000-000000000002', 'BOS', 1)$$);

\echo ''
\echo '=== picks: scores are not member-writable (0006) ==='

select pg_temp.assert(
  'an insert claiming points and a WIN is forced back to 0/PENDING',
  (select points_earned = 0 and result = 'PENDING'
     from public.picks
    where user_id = '11111111-1111-1111-1111-111111111111'
      and game_id = 'bbbbbbbb-0000-0000-0000-000000000002'));

select pg_temp.must_fail(
  'a member holds no UPDATE on picks at all',
  $$update public.picks set confidence = 5
     where user_id = '11111111-1111-1111-1111-111111111111'
       and week_id = 'week-2030-01-05'$$);

select pg_temp.must_fail(
  'and certainly cannot award themselves points',
  $$update public.picks set points_earned = 99, result = 'WIN'
     where user_id = '11111111-1111-1111-1111-111111111111'$$);

\echo ''
\echo '=== games: scores decide every pick, so nobody may write them (0007) ==='

select pg_temp.must_fail(
  'cannot rewrite a final score',
  $$update public.games set home_score = 0, away_score = 9
     where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);

select pg_temp.must_fail(
  'cannot flip a game to FINAL',
  $$update public.games set status = 'FINAL'
     where id = 'bbbbbbbb-0000-0000-0000-000000000003'$$);

select pg_temp.must_fail(
  'cannot delete a game out from under a pick',
  $$delete from public.games where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);

-- Two different defences, and worth testing separately. The score columns are
-- not in the INSERT grant at all, so naming one is refused outright by column
-- privileges before any policy or trigger runs.
select pg_temp.must_fail(
  'a member cannot even name a score column on insert',
  $$insert into public.games (week_id, home_team_id, away_team_id, start_time, home_score)
    values ('week-2030-01-05', 'NSH', 'STL', '2030-01-05 19:00-05', 7)$$);

-- `status` IS grantable, because the app sends it. So this insert is allowed
-- and the trigger is what neutralises it.
select pg_temp.must_pass(
  'a member may still seed a game, because that is how a week fills',
  $$insert into public.games (week_id, home_team_id, away_team_id, start_time, status)
    values ('week-2030-01-05', 'NSH', 'STL', '2030-01-05 19:00-05', 'FINAL')$$);

select pg_temp.assert(
  'but the seeded game was forced to SCHEDULED with no score',
  (select status = 'SCHEDULED' and home_score is null and away_score is null
     from public.games
    where week_id = 'week-2030-01-05' and home_team_id = 'NSH'));

\echo ''
\echo '=== weeks: the deadline column is not member-writable (0008) ==='

select pg_temp.must_fail(
  'cannot move a week''s Saturday, which every deadline rule reads',
  $$update public.weeks set saturday_date = '2031-01-04'
     where id = 'week-2030-01-05'$$);

select pg_temp.must_fail(
  'cannot renumber a week',
  $$update public.weeks set week_number = 99 where id = 'week-2030-01-05'$$);

select pg_temp.must_pass(
  'a member''s status UPDATE is silently filtered, not an error',
  $$update public.weeks set status = 'COMPLETED' where id = 'week-2030-01-05'$$);

select pg_temp.assert(
  'and the week is still OPEN',
  (select status = 'OPEN' from public.weeks where id = 'week-2030-01-05'));

select pg_temp.must_fail(
  'a week id that is not a Saturday is rejected',
  $$insert into public.weeks (id, week_number) values ('week-2030-01-07', 2)$$);

select pg_temp.must_fail(
  'a malformed week id is rejected',
  $$insert into public.weeks (id, week_number) values ('week-5', 5)$$);

select pg_temp.must_pass(
  'a member may still seed a new week',
  $$insert into public.weeks (id, week_number, saturday_date)
    values ('week-2030-01-12', 2, '1999-01-01')$$);

select pg_temp.assert(
  'and its deadline was derived from the id, not from what was sent',
  (select saturday_date = date '2030-01-12' from public.weeks
    where id = 'week-2030-01-12'));

\echo ''
\echo '=== the admin can do the few things an admin should ==='

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.assert('is_admin() is true for the admin', public.is_admin());

select pg_temp.must_pass(
  'an admin may close a week',
  $$update public.weeks set status = 'COMPLETED' where id = 'week-2030-01-12'$$);

select pg_temp.must_fail(
  'but not even an admin may move a deadline',
  $$update public.weeks set saturday_date = '2031-01-04'
     where id = 'week-2030-01-05'$$);

select pg_temp.must_fail(
  'and not even an admin may rewrite a score',
  $$update public.games set home_score = 0
     where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$);

\echo ''
\echo '=== save_picks: one transaction, and its own deadline check (0005) ==='

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.must_fail(
  'save_picks refuses a sheet that is not five picks',
  $$select public.save_picks('11111111-1111-1111-1111-111111111111', 'week-2030-01-05',
      '[{"gameId":"bbbbbbbb-0000-0000-0000-000000000001","selectedTeamId":"TOR","confidence":1}]'::jsonb)$$);

select pg_temp.must_fail(
  'save_picks refuses duplicate confidence values',
  $$select public.save_picks('11111111-1111-1111-1111-111111111111', 'week-2030-01-05',
      '[{"gameId":"bbbbbbbb-0000-0000-0000-000000000001","selectedTeamId":"TOR","confidence":1},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000002","selectedTeamId":"BOS","confidence":1},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000003","selectedTeamId":"EDM","confidence":2},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000004","selectedTeamId":"VAN","confidence":3},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000005","selectedTeamId":"PIT","confidence":4}]'::jsonb)$$);

select pg_temp.must_fail(
  'save_picks refuses a locked week, in words rather than an RLS error',
  $$select public.save_picks('11111111-1111-1111-1111-111111111111', 'week-2026-03-14',
      '[{"gameId":"aaaaaaaa-0000-0000-0000-000000000001","selectedTeamId":"TOR","confidence":1},
        {"gameId":"aaaaaaaa-0000-0000-0000-000000000002","selectedTeamId":"NYR","confidence":2},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000003","selectedTeamId":"EDM","confidence":3},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000004","selectedTeamId":"VAN","confidence":4},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000005","selectedTeamId":"PIT","confidence":5}]'::jsonb)$$);

select pg_temp.assert(
  'and the closed week''s scored sheet is untouched',
  (select count(*) = 2 from public.picks
    where user_id = '11111111-1111-1111-1111-111111111111'
      and week_id = 'week-2026-03-14'));

select pg_temp.must_pass(
  'a full sheet for the open week saves',
  $$select public.save_picks('11111111-1111-1111-1111-111111111111', 'week-2030-01-05',
      '[{"gameId":"bbbbbbbb-0000-0000-0000-000000000001","selectedTeamId":"TOR","confidence":1},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000002","selectedTeamId":"BOS","confidence":2},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000003","selectedTeamId":"EDM","confidence":3},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000004","selectedTeamId":"VAN","confidence":4},
        {"gameId":"bbbbbbbb-0000-0000-0000-000000000005","selectedTeamId":"PIT","confidence":5}]'::jsonb)$$);

select pg_temp.assert(
  'replacing a sheet leaves exactly five picks, not seven',
  (select count(*) = 5 from public.picks
    where user_id = '11111111-1111-1111-1111-111111111111'
      and week_id = 'week-2030-01-05'));

\echo ''
\echo '=== invites: membership is granted, never asserted (0009) ==='

select pg_temp.must_fail(
  'a member cannot mint an invite',
  $$select public.admin_create_invite(null, now() + interval '7 days')$$);

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select pg_temp.must_pass(
  'an admin can mint an invite',
  $$select public.admin_create_invite(null, now() + interval '7 days')$$);

-- Bind a second code to one address, to prove the binding is enforced against
-- auth.users rather than against anything the redeemer claims.
create temporary table pg_temp_codes as
select (public.admin_create_invite('invited@example.com', now() + interval '7 days')).code as bound_code,
       (select code from public.invites where email is null limit 1)      as open_code;

select pg_temp.assert(
  'the admin can see both codes',
  (select count(*) = 2 from public.invites));

-- Back to an ordinary member, now that there is something to fail to read.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.assert(
  'a member cannot read the invite list, codes and all',
  (select count(*) = 0 from public.invites));

\echo ''
\echo '--- redemption, as the invited stranger ---'

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

select pg_temp.must_fail(
  'a code bound to someone else''s address is refused',
  format($$select public.redeem_invite(%L, 'Stranger')$$,
         (select bound_code from pg_temp_codes)));

select pg_temp.must_fail(
  'a code that does not exist is refused',
  $$select public.redeem_invite('NOPE-NOPE', 'Stranger')$$);

select pg_temp.must_pass(
  'the open code works, and makes them a member',
  format($$select public.redeem_invite(%L, 'Stranger')$$,
         (select open_code from pg_temp_codes)));

select pg_temp.assert(
  'they are a member now',
  public.is_member());

select pg_temp.assert(
  'and a plain member, never an admin',
  (select role = 'member' from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'));

select pg_temp.must_fail(
  'the same person cannot redeem twice',
  format($$select public.redeem_invite(%L, 'Stranger Again')$$,
         (select open_code from pg_temp_codes)));

\echo ''
\echo '=== sync-week still works after the deadline (service_role bypasses RLS) ==='
\echo '--- the case that would be bad to get wrong: standings must keep moving ---'

set local role service_role;

select pg_temp.must_pass(
  'the league sync can mark a game FINAL with a score',
  $$update public.games set status = 'FINAL', home_score = 3, away_score = 2
     where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$);

select pg_temp.must_pass(
  'the league sync can resolve a pick on a LOCKED week',
  $$update public.picks set result = 'WIN', points_earned = 5
     where user_id = '22222222-2222-2222-2222-222222222222'
       and week_id = 'week-2026-03-14'$$);

select pg_temp.must_pass(
  'the league sync can close a week',
  $$update public.weeks set status = 'COMPLETED' where id = 'week-2026-03-14'$$);

\echo ''
rollback;
