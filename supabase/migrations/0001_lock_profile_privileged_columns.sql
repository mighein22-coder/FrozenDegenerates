-- 0001_lock_profile_privileged_columns.sql
--
-- Closes a privilege-escalation hole in the `profiles` table.
--
-- The original policy (see PLANNING.md) is:
--
--   CREATE POLICY "Users can update own profile" ON profiles
--     FOR UPDATE USING (auth.uid() = id);
--
-- With no WITH CHECK clause, Postgres reuses the USING expression as the
-- check. That correctly stops a member from editing somebody else's row, but
-- it places no constraint at all on WHICH COLUMNS of their own row they may
-- change. Any member holding the anon key can therefore run:
--
--   update profiles set role = 'admin' where id = auth.uid();
--
-- ...and gain the Admin Panel, week-status controls and score overrides.
--
-- This migration adds two independent layers so that neither one alone is
-- load-bearing:
--
--   1. Column-level UPDATE privileges — `authenticated` may only write
--      `name` and `avatar`. Checked by Postgres before RLS even runs.
--   2. A BEFORE UPDATE trigger — rejects any change to `id`, `role` or
--      `email` coming from a client role, so the hole stays shut even if a
--      future migration re-grants a blanket UPDATE.
--
-- The `service_role` key (used by the Netlify functions) and direct SQL from
-- the Supabase dashboard are unaffected: role promotion is deliberately an
-- out-of-band admin action.
--
-- Idempotent — safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Make the existing policy's intent explicit.
--    Same semantics as before (an omitted WITH CHECK falls back to USING),
--    written out so the next reader does not have to know that rule.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. Column-level UPDATE privileges.
--    `updateProfile()` in src/lib/supabaseService.ts only ever writes
--    `name` and `avatar`; nothing else in the client updates this table.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;

grant update (name, avatar) on public.profiles to authenticated;

-- service_role must keep full write access for server-side functions.
grant update on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- 3. Belt-and-braces trigger.
--    `current_user` is the Postgres role PostgREST switched into for the
--    request: 'authenticated' or 'anon' for client traffic, 'service_role'
--    for the service key, 'postgres' for the dashboard SQL editor. Only the
--    two client-facing roles are constrained here.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_column_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role can only be changed by a league administrator'
      using errcode = 'insufficient_privilege';
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles.email is managed by authentication and cannot be changed here'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_column_guard on public.profiles;

create trigger profiles_column_guard
  before update on public.profiles
  for each row
  execute function public.enforce_profile_column_guard();

commit;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--
-- (a) Confirm the policy now carries an explicit WITH CHECK:
--
--     select policyname, cmd, qual, with_check
--       from pg_policies
--      where schemaname = 'public' and tablename = 'profiles';
--
-- (b) Confirm `authenticated` can only update name and avatar:
--
--     select grantee, privilege_type, column_name
--       from information_schema.column_privileges
--      where table_schema = 'public'
--        and table_name = 'profiles'
--        and privilege_type = 'UPDATE'
--        and grantee = 'authenticated'
--      order by column_name;
--
--     -- expected: exactly two rows — avatar, name
--
-- (c) Confirm the escalation is actually blocked. Run as a real member from
--     the app (or with a member JWT); it must fail rather than succeed:
--
--     update profiles set role = 'admin' where id = auth.uid();
--
--     -- expected: permission denied for table profiles
--     --           (or: profiles.role can only be changed by a league administrator)
--
-- (d) Confirm the Settings page still works — a member saving their display
--     name and avatar from /Settings should succeed unchanged.
