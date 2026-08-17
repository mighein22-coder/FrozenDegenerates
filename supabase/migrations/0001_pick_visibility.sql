-- ============================================================================
-- 0001_pick_visibility.sql
--
-- Hide every player's picks from every other player until the week locks.
--
-- Before this migration the policy on `picks` was SELECT USING (true): any
-- logged-in member could read the whole league's picks for the open week
-- straight from the browser console. The UI concealed them, but that was
-- decoration, not enforcement.
--
-- SCOPE / LIMIT: this governs the anon and authenticated keys — the app, the
-- console, the REST API. It does NOT restrict the Supabase dashboard, the
-- service-role key, or pg_dump. Whoever owns the project can still read every
-- row. This removes casual access, not privileged access.
--
-- Safe to run more than once.
-- ============================================================================

-- True once the Saturday 10:00 AM ET pick deadline for this week has passed.
--
-- `at time zone 'America/New_York'` resolves DST from the tz database, so this
-- stays correct across both transitions without any offset arithmetic. It
-- mirrors getPickDeadline() in src/lib/timezone.ts.
--
-- SECURITY DEFINER so the check can read `weeks` regardless of the caller, and
-- an explicit search_path so the function cannot be redirected by a caller's
-- own path settings.
create or replace function public.picks_revealed(p_week_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ((w.saturday_date + time '10:00') at time zone 'America/New_York') <= now(),
    false
  )
  from public.weeks w
  where w.id = p_week_id;
$$;

comment on function public.picks_revealed(text) is
  'True once a week''s Saturday 10:00 ET pick deadline has passed. Gates pick visibility.';

-- Replace the blanket read policy.
--
-- Both historical names are dropped because the deployed policy was created by
-- hand and may carry either. Run the audit query at the bottom of this file
-- first: if your policy has some other name, add it here, or the permissive
-- policy survives alongside the new one and picks stay readable.
drop policy if exists "picks_select_all" on public.picks;
drop policy if exists "Picks are viewable by everyone" on public.picks;
drop policy if exists "picks_select_own_or_revealed" on public.picks;

create policy "picks_select_own_or_revealed"
  on public.picks
  for select
  to authenticated
  using (
    auth.uid() = user_id      -- you can always see your own sheet
    or picks_revealed(week_id) -- everyone else's, only once the week has locked
  );

-- ----------------------------------------------------------------------------
-- Audit: run this BEFORE applying, and again after, to confirm exactly one
-- SELECT policy remains on `picks` and that it is the one above.
-- ----------------------------------------------------------------------------
-- select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename = 'picks'
--  order by cmd, policyname;
