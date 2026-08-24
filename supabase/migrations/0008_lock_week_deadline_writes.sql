-- ============================================================================
-- 0008_lock_week_deadline_writes.sql
--
-- Stop a member moving their own deadline.
--
-- `picks_revealed()` — the function 0003 and 0004 both hang off — reads
-- `weeks.saturday_date`. And `weeks` carries:
--
--   "Allow authenticated users to update weeks"  UPDATE  using (true)
--   "Anyone can insert weeks"                    INSERT  with check (true)  [public]
--
-- No column restriction, so any member can restate when their week ends:
--
--   update weeks set saturday_date = '2027-01-01' where id = 'week-2026-10-11';
--
-- From there `picks_revealed()` returns false, 0004's write policies allow
-- writes again, and re-submitting a sheet after the games are final leaves five
-- fresh PENDING rows for the next `sync-week` to score against known results.
-- A perfect week, on demand.
--
-- That defeats 0003, 0004, 0005 and 0006 at once. None of them are wrong. They
-- all just trust this one column, and until now anyone with an account could
-- write it. This migration makes the deadline underivable from anything a
-- client says.
--
-- The insert policy is addressed to `public`, not `authenticated`, so a
-- logged-out visitor could create week rows too.
--
-- Three layers:
--
--   1. Policies — INSERT limited to members; UPDATE limited to admins.
--   2. Privileges — client roles may INSERT only the four columns the app
--      supplies, and may UPDATE only `status`. Checked before RLS runs.
--   3. A BEFORE trigger — derives `saturday_date` from the week `id` on insert
--      rather than trusting it, and refuses any client-role change to `id`,
--      `saturday_date` or `week_number`.
--
-- Why INSERT survives: `getCurrentWeek` (src/lib/supabaseService.ts) creates the
-- week row the first time any member opens the app in a new week. That is the
-- app's normal path, not an admin action.
--
-- Why UPDATE survives: the admin panel's status toggle
-- (src/components/views/AdminView.tsx) cycles OPEN → LOCKED → COMPLETED. Status
-- is not what locks picks — `picks_revealed()` reads the date, not the status —
-- so leaving this to admins costs nothing and keeps the panel working.
--
-- `sync-week` connects with the service-role key and is unaffected; it still
-- marks weeks COMPLETED.
--
-- Depends on picks_revealed() from 0003. Safe to run more than once.
--
-- BEFORE APPLYING, run the damage-check queries at the bottom. If any week's
-- `saturday_date` disagrees with its `id`, someone may already have used this,
-- and the trigger below will not repair the existing row.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Who is an admin?
--
--    SECURITY DEFINER so the check can read `profiles` regardless of the
--    caller's own visibility into that table, and an explicit search_path so it
--    cannot be redirected. Mirrors picks_revealed() from 0003.
--
--    `profiles.role` is itself protected: 0001 revoked column UPDATE on it and
--    added a trigger, so a member cannot promote themselves into this.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_admin() is
  'True when the calling user holds profiles.role = admin. Gates week status changes.';

-- ---------------------------------------------------------------------------
-- 1. Replace the permissive policies.
--
--    Historical names and the names this file creates are both dropped, so
--    re-running cannot leave two policies where one is intended. Run the policy
--    audit at the bottom first: a policy under some other name would survive
--    alongside these and keep the table writable while appearing fixed.
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can insert weeks" on public.weeks;
drop policy if exists "Allow authenticated users to update weeks" on public.weeks;
drop policy if exists "weeks_insert_all" on public.weeks;
drop policy if exists "weeks_update_all" on public.weeks;
drop policy if exists "weeks_insert_authenticated" on public.weeks;
drop policy if exists "weeks_update_admin" on public.weeks;

-- Seeding a new week stays a member action.
create policy "weeks_insert_authenticated"
  on public.weeks
  for insert
  to authenticated
  with check (true);

-- Changing an existing week is an admin action. Combined with the column grant
-- below, this reaches `status` and nothing else.
create policy "weeks_update_admin"
  on public.weeks
  for update
  to authenticated
  using (is_admin())
  with check (is_admin());

-- No DELETE policy: nothing deletes weeks, and a deleted week would orphan its
-- games and picks. The SELECT policy is left exactly as it is.

-- ---------------------------------------------------------------------------
-- 2. Table and column privileges.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.weeks from anon, authenticated;

grant insert (id, week_number, saturday_date, status)
  on public.weeks to authenticated;

grant update (status) on public.weeks to authenticated;

grant insert, update, delete on public.weeks to service_role;

-- ---------------------------------------------------------------------------
-- 3. Trigger guard.
--
--    The important line is the one that derives `saturday_date` from the `id`.
--    The app already builds both from the same string — `getCurrentWeek` sets
--    id = 'week-' || <the Saturday> and saturday_date = <the same Saturday> —
--    so deriving it costs an honest caller nothing, and removes the client's
--    ability to state a deadline at all.
--
--    Deriving rather than raising is deliberate: a mismatch is either an attack
--    or a client bug, and refusing the second would leave members unable to open
--    a new week. Normalizing keeps the app working and makes the attack a no-op,
--    the same choice 0006 and 0007 made.
--
--    A malformed id, or one naming a day that is not a Saturday, does raise —
--    there is no correct value to fall back to, and a real week id cannot look
--    like that.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_week_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  derived date;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id !~ '^week-\d{4}-\d{2}-\d{2}$' then
      raise exception 'weeks.id must look like week-YYYY-MM-DD, got %', new.id
        using errcode = 'invalid_parameter_value';
    end if;

    derived := substring(new.id from 6)::date;

    if extract(isodow from derived) <> 6 then
      raise exception 'weeks.id must name a Saturday, got % (%)',
        derived, to_char(derived, 'Day')
        using errcode = 'invalid_parameter_value';
    end if;

    -- The deadline comes from the id, never from what the client sent.
    new.saturday_date := derived;
    new.status := 'OPEN';
    return new;
  end if;

  if new.id is distinct from old.id
     or new.saturday_date is distinct from old.saturday_date
     or new.week_number is distinct from old.week_number then
    raise exception 'a week''s date and number are fixed once it exists; only status may change'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists weeks_guard on public.weeks;

create trigger weeks_guard
  before insert or update on public.weeks
  for each row
  execute function public.enforce_week_guard();

commit;

-- ============================================================================
-- Verification
-- ============================================================================
--
-- (a) One INSERT policy for `authenticated`, one UPDATE policy gated on
--     is_admin(), nothing addressed to `public`:
--
--     select policyname, cmd, roles, qual, with_check
--       from pg_policies
--      where schemaname = 'public' and tablename = 'weeks'
--      order by cmd, policyname;
--
-- (b) `authenticated` holds INSERT on four columns and UPDATE on `status` only:
--
--     select grantee, privilege_type, column_name
--       from information_schema.column_privileges
--      where table_schema = 'public' and table_name = 'weeks'
--        and grantee in ('authenticated', 'anon')
--      order by grantee, privilege_type, column_name;
--
--     -- expected: INSERT on id, saturday_date, status, week_number
--     --           UPDATE on status
--     --           nothing at all for anon
--
-- (c) The deadline move must fail. Run as a real member, signed in, from the
--     browser console:
--
--     update weeks set saturday_date = '2027-01-01' where id = '<open week>';
--
--     -- expected: permission denied for table weeks
--
-- (d) A member must still be able to open a new week. Easiest check without
--     waiting for Monday — confirm the derivation works:
--
--     select id, saturday_date, status from public.weeks
--      order by saturday_date desc limit 3;
--
--     -- every saturday_date must equal the date inside its own id
--
-- (e) The admin status toggle must still work: sign in as an admin, open the
--     Admin panel, and cycle a week's status. Then confirm a non-admin cannot —
--     as a member, from the console:
--
--     update weeks set status = 'OPEN' where id = '<some week>';
--
--     -- expected: no rows updated (the policy filters it out)
--
-- (f) Scoring must still close weeks — `sync-week` connects as `service_role`
--     and bypasses all of the above.
--
-- ============================================================================
-- Damage check: has anyone already moved a deadline?
--
-- Run BEFORE applying. The trigger fixes future writes; it does not repair a
-- row that was already edited, and a moved date silently widens both the
-- visibility window (0003) and the write window (0004) for that week.
-- ============================================================================
--
-- (i) Weeks whose stored date disagrees with the date in their own id, or that
--     do not fall on a Saturday. Expect zero rows:
--
-- select id, week_number, saturday_date, status,
--        substring(id from 6)::date as id_says,
--        to_char(saturday_date, 'Day') as weekday
--   from public.weeks
--  where id ~ '^week-\d{4}-\d{2}-\d{2}$'
--    and (saturday_date is distinct from substring(id from 6)::date
--         or extract(isodow from saturday_date) <> 6)
--  order by saturday_date desc;
--
-- (ii) Week ids that do not follow the format at all — these cannot be checked
--      against anything, and should not exist:
--
-- select id, week_number, saturday_date, status
--   from public.weeks
--  where id !~ '^week-\d{4}-\d{2}-\d{2}$'
--  order by saturday_date desc;
--
-- To repair a row, put the date back to what its id says:
--
-- update public.weeks
--    set saturday_date = substring(id from 6)::date
--  where id = '<week id>';
--
-- Then re-run the pick audit from 0006 for that week — if the window was held
-- open, picks may have been submitted or re-submitted after the games finished.
