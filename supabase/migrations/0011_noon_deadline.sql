-- ============================================================================
-- 0011_noon_deadline.sql
--
-- Move the Saturday pick deadline from 10:00 AM to 12:00 PM Eastern.
--
-- `picks_revealed()` is the single database copy of the deadline. 0003's read
-- policy, 0004's write policies and `save_picks` (0005, 0010) all hang off it,
-- so redefining it moves visibility and write-locking together. Nothing else in
-- the database names the hour.
--
-- It must move in step with getPickDeadline() in src/lib/timezone.ts. If the
-- two disagree, the UI and the database lock at different times: apply this
-- alongside the deploy that changes the client, not a week apart.
--
-- `at time zone 'America/New_York'` is local noon Eastern: 12:00 EDT during
-- daylight time, 12:00 EST after the November change.
--
-- Side effect when applied on a Saturday between 10:00 and 12:00 ET: that
-- week's picks become editable again and are hidden from other members until
-- noon. First applied that way on 2026-09-26, to reopen the preseason dry run.
--
-- Safe to run more than once.
-- ============================================================================

create or replace function public.picks_revealed(p_week_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ((w.saturday_date + time '12:00') at time zone 'America/New_York') <= now(),
    false
  )
  from public.weeks w
  where w.id = p_week_id;
$$;

comment on function public.picks_revealed(text) is
  'True once a week''s Saturday 12:00 ET pick deadline has passed. Gates pick visibility and pick writes.';

-- ----------------------------------------------------------------------------
-- Verify: the open week must report false until noon ET Saturday.
-- ----------------------------------------------------------------------------
-- select id, saturday_date, status, picks_revealed(id) as locked
--   from public.weeks
--  order by saturday_date desc
--  limit 3;
