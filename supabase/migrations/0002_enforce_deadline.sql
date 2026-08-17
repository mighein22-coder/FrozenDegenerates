-- ============================================================================
-- 0002_enforce_deadline.sql   [OPTIONAL — see supabase/README.md]
--
-- Enforce the Saturday 10:00 AM ET pick deadline in the database.
--
-- Today the deadline is checked only in browser JavaScript
-- (src/lib/supabaseService.ts, savePicks). The policies on `picks` carry no
-- time condition, so a member can insert or rewrite picks from the console
-- after games have started and outcomes are known.
--
-- 0001 hides other players' picks before the deadline. This closes the other
-- half of the same hole: it stops anyone changing their own picks after it.
-- The two are complementary; applying only 0001 leaves late edits possible.
--
-- Depends on picks_revealed() from 0001. Apply 0001 first.
-- Safe to run more than once.
--
-- BEFORE APPLYING, read the failure mode: if `weeks.saturday_date` is ever
-- wrong for the open week, members cannot submit picks at all. Apply on a
-- weekday, never between Friday evening and the Saturday deadline, and verify
-- with the query at the bottom of this file.
-- ============================================================================

-- Writes are allowed only while the week is still open — the exact inverse of
-- the visibility rule, so the two can never disagree about when a week locks.
drop policy if exists "picks_insert_own" on public.picks;
drop policy if exists "Users can insert own picks" on public.picks;

create policy "picks_insert_own"
  on public.picks
  for insert
  to authenticated
  with check (auth.uid() = user_id and not picks_revealed(week_id));

drop policy if exists "picks_update_own" on public.picks;
drop policy if exists "Users can update own picks" on public.picks;

create policy "picks_update_own"
  on public.picks
  for update
  to authenticated
  using (auth.uid() = user_id and not picks_revealed(week_id))
  with check (auth.uid() = user_id and not picks_revealed(week_id));

drop policy if exists "picks_delete_own" on public.picks;
drop policy if exists "Users can delete own picks" on public.picks;

create policy "picks_delete_own"
  on public.picks
  for delete
  to authenticated
  using (auth.uid() = user_id and not picks_revealed(week_id));

-- ----------------------------------------------------------------------------
-- Verify before applying: this must return false for the open week and true
-- for any week whose Saturday has passed. If the open week reports true, do
-- NOT apply — members would be locked out of submitting.
-- ----------------------------------------------------------------------------
-- select id, saturday_date, status, picks_revealed(id) as locked
--   from public.weeks
--  order by saturday_date desc
--  limit 5;
