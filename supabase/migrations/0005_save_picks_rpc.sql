-- ============================================================================
-- 0005_save_picks_rpc.sql
--
-- Make saving a pick sheet atomic.
--
-- `savePicks` in src/lib/supabaseService.ts deleted a member's five picks for
-- the week and then inserted the new set as two separate HTTP requests. Nothing
-- tied them together: if the insert failed after the delete succeeded, that
-- member's sheet was simply gone. ASSESSMENT.md #6 marked this fixed, but only
-- the error message changed.
--
-- 0004 widened it. A submission landing exactly on the Saturday 10:00 ET
-- boundary now has its insert refused by the `picks_insert_own` policy after
-- the delete has already committed. The window is milliseconds wide, but it is
-- reachable, and the cost when it lands is a lost sheet.
--
-- This function does both statements in one transaction, so the pair either
-- both apply or neither does.
--
-- SECURITY INVOKER (the default) — deliberately NOT `security definer`:
--
--   * The policies from 0003/0004 stay in force inside the function, so this
--     grants no authority the caller did not already have. There is no second
--     copy of the auth or deadline rules here to drift out of step with them.
--   * `now()` is the transaction timestamp, fixed for the whole transaction, so
--     `picks_revealed()` returns the same answer to the delete and to the
--     insert. The 10:00 boundary can no longer fall between them. A submission
--     that arrives a moment too late is refused whole, with the old rows intact.
--
-- Depends on picks_revealed() from 0003 and the policies from 0004.
-- Safe to run more than once.
-- ============================================================================

create or replace function public.save_picks(
  p_user_id uuid,
  p_week_id text,
  p_picks jsonb
)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  -- Shape checks. The client checks these too, for a faster and friendlier
  -- error; the console does not, and this is the copy that is not optional.
  if jsonb_typeof(p_picks) is distinct from 'array' then
    raise exception 'Picks must be an array';
  end if;

  if jsonb_array_length(p_picks) <> 5 then
    raise exception 'Must submit exactly 5 picks';
  end if;

  if (
    select count(distinct (e->>'confidence')::int)
      from jsonb_array_elements(p_picks) e
     where (e->>'confidence')::int between 1 and 5
  ) <> 5 then
    raise exception 'Confidence values must be unique and between 1 and 5';
  end if;

  -- Report a locked week in words. Without this the RLS policy still refuses
  -- the write, but as an opaque "violates row-level security policy". Same
  -- transaction as the statements below, so it cannot disagree with them.
  if picks_revealed(p_week_id) then
    raise exception 'Picks are locked. Deadline has passed.';
  end if;

  -- The two statements this function exists for. RLS applies to both.
  delete from public.picks
   where user_id = p_user_id
     and week_id = p_week_id;

  insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence)
  select p_user_id,
         p_week_id,
         e->>'gameId',
         e->>'selectedTeamId',
         (e->>'confidence')::int
    from jsonb_array_elements(p_picks) e;
end;
$$;

comment on function public.save_picks(uuid, text, jsonb) is
  'Replaces a member''s pick sheet for one week in a single transaction. Runs as the caller, so the policies on `picks` still govern it.';

revoke all on function public.save_picks(uuid, text, jsonb) from public;
grant execute on function public.save_picks(uuid, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Verify after applying.
--
-- 1. The function exists and is NOT security definer. `prosecdef` must be false
--    — if it is true, the policies from 0004 are being bypassed:
-- ----------------------------------------------------------------------------
-- select proname, prosecdef, pg_get_function_identity_arguments(oid) as args
--   from pg_proc
--  where pronamespace = 'public'::regnamespace and proname = 'save_picks';
--
-- ----------------------------------------------------------------------------
-- 2. Sign in as a member in the app and save a sheet. Five rows, one week:
-- ----------------------------------------------------------------------------
-- select week_id, count(*) from public.picks
--  where user_id = '<that member''s uuid>'
--  group by week_id order by week_id;
--
-- ----------------------------------------------------------------------------
-- 3. Damage check — has the old bug already eaten a sheet? Every member/week
--    pairing should hold exactly 5 picks. Anything else is a partial sheet,
--    and this query is the only way to find one; the app renders it as an
--    ordinary incomplete entry. Run it once now, and again after any report
--    of picks vanishing. Expect zero rows.
-- ----------------------------------------------------------------------------
-- select p.user_id, pr.name, p.week_id, count(*) as picks
--   from public.picks p
--   left join public.profiles pr on pr.id = p.user_id
--  group by p.user_id, pr.name, p.week_id
-- having count(*) <> 5
--  order by p.week_id, pr.name;
