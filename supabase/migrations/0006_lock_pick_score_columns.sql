-- ============================================================================
-- 0006_lock_pick_score_columns.sql
--
-- Stop a member writing their own score.
--
-- `picks.points_earned` and `picks.result` are what the standings are built
-- from — `computeStandings` sums `points_earned` and counts `result` straight
-- off these rows. Both columns were writable by any logged-in member:
--
--   * The UPDATE policy constrained *which rows* a member may touch, never
--     which columns. `authenticated` held UPDATE on every column, so
--       update picks set points_earned = 5, result = 'WIN' where user_id = auth.uid();
--     took first place in one REST call, with nothing but the anon key.
--   * The same hole existed on INSERT, which the original report missed. The
--     insert policy checks `user_id` and the deadline; it says nothing about
--     `points_earned`, so a forged sheet could simply be inserted pre-scored.
--
-- 0004 did not close this. Its `WITH CHECK` constrains ownership and the
-- deadline, both of which a member forging their own open-week picks satisfies.
--
-- What makes it permanent rather than transient: `sync-week` resolves only
-- picks with `result = 'PENDING'` (netlify/functions/sync-week.ts). A pick that
-- already claims 'WIN' is skipped by every future sync, so a forged score is
-- never corrected. It survives the season.
--
-- Two independent layers, following the pattern 0001 set for `profiles`, so
-- neither one is load-bearing on its own:
--
--   1. Table and column privileges — `authenticated` loses UPDATE on `picks`
--      entirely, and may INSERT only the five columns a pick sheet consists of.
--      Checked by Postgres before RLS runs.
--   2. A BEFORE trigger — rejects any client-role change to `points_earned` or
--      `result`, so the hole stays shut if a later migration re-grants a
--      blanket UPDATE.
--
-- Nothing in the client updates `picks`: `savePicks` goes through the
-- `save_picks` RPC from 0005, which only deletes and inserts, and it writes
-- exactly the five columns still granted below. Verified by grep over `src/`
-- before writing this — there is no `.update()` against `picks` anywhere.
--
-- `service_role` keeps full write access: `sync-week` is what legitimately
-- writes these two columns, and it connects with the service key.
--
-- Depends on the `save_picks` function from 0005. Apply 0005 first.
-- Safe to run more than once.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Defaults, so a pick can only ever be born unscored.
--    Stated explicitly rather than assumed: the table was created by hand and
--    these migrations are the only written record of its shape.
-- ---------------------------------------------------------------------------

alter table public.picks alter column points_earned set default 0;
alter table public.picks alter column result set default 'PENDING';

-- ---------------------------------------------------------------------------
-- 2. Table and column privileges.
--
--    UPDATE goes away completely for client roles. A member changing a pick
--    re-submits the sheet, which deletes and re-inserts through `save_picks`;
--    no code path needs UPDATE. INSERT is narrowed to the five columns that
--    make up a pick, so `points_earned` and `result` fall to their defaults.
-- ---------------------------------------------------------------------------

revoke update on public.picks from anon, authenticated;
revoke insert on public.picks from anon, authenticated;

grant insert (user_id, week_id, game_id, selected_team_id, confidence)
  on public.picks to authenticated;

-- DELETE is unchanged — `save_picks` needs it, and the policy from 0004 keeps
-- it to your own rows before the deadline.
grant delete on public.picks to authenticated;

grant insert, update, delete on public.picks to service_role;

-- The UPDATE policy from 0004 is deliberately left in place. With the privilege
-- revoked it is unreachable, but if some future migration re-grants UPDATE the
-- ownership and deadline rules should already be there waiting.

-- ---------------------------------------------------------------------------
-- 3. Trigger guard.
--
--    `current_user` is the role PostgREST switched into for the request:
--    'authenticated' or 'anon' for client traffic, 'service_role' for the
--    service key, 'postgres' in the dashboard SQL editor. Only client traffic
--    is constrained.
--
--    Note `save_picks` is SECURITY INVOKER, so its INSERT arrives here as
--    'authenticated' and is held to the same rule — which is the point.
--
--    INSERT normalizes rather than raising. The only ways a non-default value
--    reaches this branch are a forgery attempt or a column default that drifted,
--    and refusing the second would break pick submission outright. Normalizing
--    makes the forgery a no-op and leaves honest saves working. UPDATE raises,
--    because by then there is no legitimate client caller left to protect.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_pick_score_guard()
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
    new.points_earned := 0;
    new.result := 'PENDING';
    return new;
  end if;

  if new.points_earned is distinct from old.points_earned then
    raise exception 'picks.points_earned is set by scoring and cannot be changed here'
      using errcode = 'insufficient_privilege';
  end if;

  if new.result is distinct from old.result then
    raise exception 'picks.result is set by scoring and cannot be changed here'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists picks_score_guard on public.picks;

create trigger picks_score_guard
  before insert or update on public.picks
  for each row
  execute function public.enforce_pick_score_guard();

commit;

-- ============================================================================
-- Verification
-- ============================================================================
--
-- (a) `authenticated` must hold no UPDATE on `picks`, and INSERT on exactly
--     five columns:
--
--     select privilege_type, column_name
--       from information_schema.column_privileges
--      where table_schema = 'public' and table_name = 'picks'
--        and grantee = 'authenticated'
--      order by privilege_type, column_name;
--
--     -- expected: INSERT on confidence, game_id, selected_team_id, user_id,
--     --           week_id — and no UPDATE rows at all
--
-- (b) The forgery must fail. Run as a real member (signed in to the app, from
--     the browser console), not from the dashboard:
--
--     update picks set points_earned = 5, result = 'WIN' where user_id = auth.uid();
--
--     -- expected: permission denied for table picks
--
-- (c) Saving a sheet must still work — submit five picks in the app, then
--     confirm they landed unscored:
--
--     select result, points_earned, count(*) from public.picks
--      where user_id = '<member uuid>' and week_id = '<open week>'
--      group by result, points_earned;
--
--     -- expected: one row — PENDING, 0, 5
--
-- (d) Scoring must still work — `sync-week` connects as `service_role` and is
--     unaffected. Open the results view for a week with FINAL games and confirm
--     picks still resolve to WIN/LOSS.
--
-- ============================================================================
-- Damage check: has anyone already written their own score?
--
-- This is the state question the migration cannot answer for itself. Run both
-- before applying. Every row returned is a pick whose score disagrees with the
-- game it refers to — either a forgery or a scoring bug, both worth seeing.
-- ============================================================================
--
-- (i) FINAL games where the stored result or points do not match the outcome:
--
-- select p.id, p.user_id, pr.name, p.week_id, p.game_id, p.confidence,
--        p.result as stored_result, p.points_earned as stored_points,
--        case when p.selected_team_id =
--                  case when g.home_score > g.away_score
--                       then g.home_team_id else g.away_team_id end
--             then 'WIN' else 'LOSS' end as true_result
--   from public.picks p
--   join public.games g on g.id = p.game_id
--   left join public.profiles pr on pr.id = p.user_id
--  where g.status = 'FINAL'
--    and (p.result, p.points_earned) is distinct from (
--          case when p.selected_team_id =
--                    case when g.home_score > g.away_score
--                         then g.home_team_id else g.away_team_id end
--               then 'WIN' else 'LOSS' end,
--          case when p.selected_team_id =
--                    case when g.home_score > g.away_score
--                         then g.home_team_id else g.away_team_id end
--               then p.confidence else 0 end
--        )
--  order by p.week_id, pr.name;
--
-- (ii) Picks already scored for a game that has not finished:
--
-- select p.id, p.user_id, pr.name, p.week_id, p.game_id,
--        p.result, p.points_earned, g.status
--   from public.picks p
--   join public.games g on g.id = p.game_id
--   left join public.profiles pr on pr.id = p.user_id
--  where g.status <> 'FINAL'
--    and (p.result <> 'PENDING' or p.points_earned <> 0)
--  order by p.week_id, pr.name;
--
-- To repair a row, reset it and let the next sync redo it properly:
--
-- update public.picks set result = 'PENDING', points_earned = 0 where id = '<pick id>';
