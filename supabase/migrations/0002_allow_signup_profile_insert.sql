-- 0002_allow_signup_profile_insert.sql
--
-- Lets a newly signed-up user create their own `profiles` row.
--
-- The schema in PLANNING.md defines SELECT/UPDATE policies on `profiles` but
-- no INSERT policy at all. With RLS enabled and no INSERT policy, every insert
-- is denied — so `useAuth.signUp()` creates the auth user successfully and
-- then fails on the follow-up profile insert, leaving an auth account with no
-- profile behind it (no name, no role, invisible in the standings).
--
-- The policy below is deliberately narrow, and is paired with column-level
-- INSERT privileges for the same reason as migration 0001: a bare
-- `WITH CHECK (auth.uid() = id)` would let a signing-up user pick their own
-- `role` and land as an admin on their very first request. Restricting the
-- grantable columns means `role` can never be supplied by a client and always
-- falls through to its column DEFAULT of 'member'.
--
-- Requires 0001 to have been applied first (shared assumptions about which
-- roles may write this table).
--
-- Idempotent — safe to run more than once.
--
--   !! READ THIS BEFORE APPLYING !!
--
--   This policy only helps if the Supabase project has email confirmation
--   DISABLED (Authentication -> Providers -> Email -> "Confirm email" off).
--
--   With confirmation ON, `supabase.auth.signUp()` returns no session. The
--   user is not authenticated yet, `auth.uid()` is NULL, and the client-side
--   insert is refused by this policy no matter how it is written — RLS cannot
--   authorise a request that carries no identity.
--
--   For a confirm-email signup flow the profile row has to be created
--   server-side by a SECURITY DEFINER trigger on `auth.users` instead, with
--   the display name carried through `raw_user_meta_data`. See
--   supabase/README.md.

begin;

-- ---------------------------------------------------------------------------
-- 1. Allow an authenticated user to insert exactly one row: their own.
--    `auth.uid() = id` ties the row to the caller's auth account, and the
--    email must match the one on that account so a member cannot publish
--    somebody else's address in the league directory.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

-- ---------------------------------------------------------------------------
-- 2. Column-level INSERT privileges.
--    `role` is intentionally absent: it is not grantable to clients, so the
--    DEFAULT 'member' always applies. `created_at` / `updated_at` likewise
--    fall through to their defaults.
-- ---------------------------------------------------------------------------

revoke insert on public.profiles from anon, authenticated;

grant insert (id, email, name, avatar) on public.profiles to authenticated;

-- service_role must keep full write access for server-side functions.
grant insert on public.profiles to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--
-- (a) Confirm the policy exists and carries both conditions:
--
--     select policyname, cmd, roles, with_check
--       from pg_policies
--      where schemaname = 'public'
--        and tablename = 'profiles'
--        and cmd = 'INSERT';
--
-- (b) Confirm `authenticated` can only insert the four intended columns —
--     and in particular NOT `role`:
--
--     select column_name
--       from information_schema.column_privileges
--      where table_schema = 'public'
--        and table_name = 'profiles'
--        and privilege_type = 'INSERT'
--        and grantee = 'authenticated'
--      order by column_name;
--
--     -- expected: exactly four rows — avatar, email, id, name
--
-- (c) End-to-end: sign up a throwaway account through the app. It should land
--     in the standings with role = 'member':
--
--     select id, email, name, role from profiles order by created_at desc limit 1;
--
-- (d) Confirm self-promotion at signup is refused. With a member JWT:
--
--     insert into profiles (id, email, name, role)
--     values (auth.uid(), auth.jwt() ->> 'email', 'Sneaky', 'admin');
--
--     -- expected: permission denied for table profiles
--
-- (e) If signup fails with "new row violates row-level security policy",
--     check the email-confirmation caveat in the header comment first — that
--     is by far the most likely cause.
