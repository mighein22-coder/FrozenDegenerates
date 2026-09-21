-- ============================================================================
-- Local test fixture: the parts of a Supabase project that 0000_baseline.sql
-- and the migrations after it depend on, but do not create.
--
-- This is NOT applied to the real project — Supabase provides all of it. It
-- exists so `supabase/test/run.sh` can apply the migrations to a throwaway
-- Postgres and exercise the policies as `anon` / `authenticated`, rather than
-- shipping migrations whose guards have only ever been read.
--
-- Adapted from the sibling NFL app's fixture of the same name. Kept
-- deliberately close to it: the two schemas differ, but the Supabase surface
-- they sit on is identical, and a difference between these two files should
-- mean something.
-- ============================================================================

create extension if not exists pgcrypto;

-- The three roles Supabase connects as.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- BYPASSRLS is what makes this role a faithful stand-in for the service-role
  -- key, which is how `sync-week` connects. Several tests below turn on it:
  -- scoring has to keep working on a week whose deadline has passed, and that
  -- only holds because RLS does not apply to it.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- GoTrue's user table, reduced to the two columns this schema references.
-- `email` is not decoration: `redeem_invite()` reads it to enforce an
-- email-bound invite, and refuses outright when it is null.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- auth.uid() reads the request's JWT claims. The tests set that GUC directly
-- with `set local request.jwt.claim.sub`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
