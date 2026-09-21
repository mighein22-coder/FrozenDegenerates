-- ============================================================================
-- 0010_fix_save_picks_game_id_cast.sql
--
-- `save_picks` cannot insert. Every call raises.
--
--   ERROR: column "game_id" is of type uuid but expression is of type text
--
-- `0005` builds the insert from the JSON payload:
--
--   insert into public.picks (user_id, week_id, game_id, ...)
--   select p_user_id, p_week_id, e->>'gameId', ...
--
-- `->>` returns text, `picks.game_id` is uuid, and Postgres does not coerce
-- text to uuid in assignment context — only in an explicit cast. The other
-- four columns are fine: `user_id` is already uuid, `week_id` and
-- `selected_team_id` are text, and `confidence` carries an explicit `::int`.
-- `game_id` is the one that needed a cast and did not get one.
--
-- HOW LONG THIS HAS BEEN BROKEN, AND WHY NOBODY NOTICED
-- `0005` was applied 2026-08-23 and `savePicks` has routed through this
-- function ever since, so pick submission has been broken since that date. The
-- NHL regular season had not started, so there was nothing to submit and no
-- one hit it. The first person to try would have.
--
-- Found 2026-09-21 by `supabase/test/run.sh` on its first green-ish run — the
-- assertion "a full sheet for the open week saves". Reading the function did
-- not catch it three times over; executing it caught it immediately.
--
-- BEFORE APPLYING, check whether production actually has this bug. If somebody
-- added a permissive text→uuid cast to the project, `0005` works there and
-- this migration is merely tidier:
--
--   select castsource::regtype, casttarget::regtype, castcontext
--     from pg_cast
--    where casttarget = 'uuid'::regtype;
--
-- `castcontext` of 'a' (assignment) or 'i' (implicit) on a text→uuid row means
-- the live function works. Anything else — including no row at all, which is
-- stock Postgres — means it does not. Applying this is correct either way.
--
-- Safe to run more than once. Changes nothing but the function body.
-- ============================================================================

create or replace function public.save_picks(
  p_user_id uuid,
  p_week_id text,
  p_picks jsonb
)
returns void
language plpgsql
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

  -- `::uuid` is the fix. Without it this insert never ran.
  --
  -- The cast also validates: a `gameId` that is not a UUID raises
  -- `invalid_input_syntax` here rather than being written and failing later at
  -- the foreign key. Both refuse the sheet whole, since the delete and the
  -- insert share one transaction.
  insert into public.picks (user_id, week_id, game_id, selected_team_id, confidence)
  select p_user_id,
         p_week_id,
         (e->>'gameId')::uuid,
         e->>'selectedTeamId',
         (e->>'confidence')::int
    from jsonb_array_elements(p_picks) e;
end;
$$;

-- `0005` set these up; restated because `create or replace` does not disturb
-- them and being explicit costs nothing if this is ever applied out of order.
revoke all on function public.save_picks(uuid, text, jsonb) from public;
grant execute on function public.save_picks(uuid, text, jsonb) to authenticated;

comment on function public.save_picks(uuid, text, jsonb) is
  'Replaces a member''s sheet for one week in a single transaction. Runs as the '
  'caller, so the 0003/0004 policies govern every row it touches.';

-- ----------------------------------------------------------------------------
-- Verify after applying. As a signed-in member, against the current OPEN week,
-- with five real game ids from that week — this must succeed and leave exactly
-- five rows. Before this migration it raised every time.
-- ----------------------------------------------------------------------------
-- select public.save_picks(
--   auth.uid(),
--   'week-YYYY-MM-DD',
--   '[{"gameId":"...","selectedTeamId":"TOR","confidence":1}, ... ]'::jsonb);
--
-- select count(*) from public.picks
--  where user_id = auth.uid() and week_id = 'week-YYYY-MM-DD';   -- expect 5
--
-- The real check is the app: submit a sheet from the Picks view. That is the
-- path that has been broken, and `supabase/test/run.sh` now covers it.
