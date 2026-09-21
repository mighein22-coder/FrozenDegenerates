#!/usr/bin/env bash
#
# Apply every migration to a throwaway Postgres, in order, and run the security
# tests against the result. Every line of output should read `ok`; a `FAIL` is a
# real hole.
#
# In order matters: the live project went through this sequence one migration
# at a time, so what has to be proven safe is the sequence itself, not a
# squashed schema that no database ever had.
#
# This exists because those policies are the whole security model, and a policy
# that has only ever been *read* is a policy you are trusting on vibes. On
# 2026-09-14 a schema capture found that 0004 was not in the production
# database at all — a month after being recorded as applied and verified,
# because the verification counted policies instead of reading them. This
# harness is the thing that would have caught it the same day.
#
#   ./supabase/test/run.sh
#
# Requires a Postgres 16 server and `psql`. NOT Docker — any reachable server
# will do, including one you already run locally. Override any of these from
# the environment:
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./supabase/test/run.sh
#
# The server must allow creating databases, because each run drops and
# recreates one. Against a hosted Supabase project, which does not allow that,
# replace the recreate below with `drop schema public cascade; create schema
# public;` — and know that you are then testing against a real auth schema
# rather than the fixture's stand-in.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-55432}"
export PGUSER="${PGUSER:-postgres}"
DB="${PGDATABASE_TEST:-icepick_test}"

echo "==> Recreating $DB"
psql -q -d postgres -c "drop database if exists $DB;" -c "create database $DB;"

echo "==> Supabase fixture (roles, auth.users, auth.uid)"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/00_supabase_fixture.sql"

# Every migration, in order, starting at 0000. 0000 is the baseline: the schema
# as it stood before 0001, captured from production rather than guessed. It is
# deliberately insecure — it carries the original permissive policies — so that
# each later migration is tested against the hole it actually closed.
for migration in "$HERE"/../migrations/*.sql; do
  echo "==> Applying $(basename "$migration")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration" >/dev/null
done

echo "==> Security tests"
output=$(psql -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/01_security.sql" 2>&1)
echo "$output"

if grep -q '^FAIL' <<<"$output"; then
  echo
  echo "FAILED: $(grep -c '^FAIL' <<<"$output") assertion(s) above did not hold."
  exit 1
fi

echo
echo "==> Re-running 0001 and 0002 alone, then checking nothing reopened"

# 0001 and 0002 are full of `create or replace` and `drop policy ... create
# policy`. Re-applying either by itself — a completely natural thing to do while
# editing one function — puts back the `profiles` self-insert policy and grant
# that 0009 exists to remove, and the pool is open again with nothing looking
# obviously wrong. This step is what keeps that from going unnoticed.
#
# The same two queries are in supabase/README.md for running by hand against
# production. Keep them in step.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/../migrations/0001_lock_profile_privileged_columns.sql" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/../migrations/0002_allow_signup_profile_insert.sql" >/dev/null

reopened=$(psql -t -A -d "$DB" -c "
  select coalesce(string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', '), '')
    from pg_policies
   where schemaname = 'public'
     and (
       -- ANY insert policy on profiles. Not just a permissive one: the policy
       -- this exists to catch is \`with check (auth.uid() = id)\`, which looks
       -- restrictive and is exactly the hole — it lets every signed-in user
       -- make themselves a member. After 0009 there should be none at all.
       (cmd = 'INSERT' and tablename = 'profiles')
       -- Anyone-can-write on the schedule.
       or (cmd = 'INSERT' and with_check = 'true'
           and tablename in ('weeks', 'games'))
       -- Anyone-can-read, on the member roster specifically. weeks and games
       -- are readable on purpose: they are the NHL schedule, and there is
       -- nothing in a fixture list worth hiding.
       or (cmd = 'SELECT' and qual = 'true' and tablename = 'profiles')
     );")

grants=$(psql -t -A -d "$DB" -c "
  select coalesce(string_agg(distinct table_name, ', '), '')
    from information_schema.column_privileges
   where grantee in ('anon', 'authenticated')
     and privilege_type = 'INSERT'
     and table_name = 'profiles';")

if [ -n "$reopened" ] || [ -n "$grants" ]; then
  echo
  echo "FAILED: re-applying 0001/0002 reopened something."
  [ -n "$reopened" ] && echo "  permissive policies: $reopened"
  [ -n "$grants" ]   && echo "  insert grants back on: $grants"
  exit 1
fi
echo "ok: 0001 and 0002 are safe to re-apply"

echo
echo "PASSED: $(grep -c '^ok' <<<"$output") assertions."
