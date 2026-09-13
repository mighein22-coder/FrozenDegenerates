-- Capture the live schema of the four hand-made tables.
--
-- `profiles`, `weeks`, `games` and `picks` were created by hand in the Supabase
-- dashboard. No migration creates them, so the migrations cannot be replayed
-- onto an empty database, which is what blocks the policy-test harness
-- described in `supabase/README.md`. This script reads production's catalog and
-- prints the DDL that would recreate those tables, so `0000_baseline.sql` can
-- be written from what is actually deployed rather than from a guess.
--
-- Read-only. It creates nothing, changes nothing, and touches no row of pool
-- data -- only the system catalogs and `information_schema`. Safe to run at any
-- time, including during an open week.
--
-- HOW TO RUN
--   1. Supabase dashboard -> SQL Editor -> New query.
--   2. Paste this whole file and run it.
--   3. Download the result as CSV ("Download CSV" under the results grid) and
--      hand back the file. Do not retype or summarise the output -- the point
--      of this exercise is to stop guessing, and a paraphrase is a guess.
--
-- The `n` column exists so truncation is detectable: the rows are numbered
-- consecutively, so a gap or an early stop is visible at a glance.
--
-- WHAT IT DOES NOT CAPTURE
--   * Row data. Only shapes.
--   * A clean split between hand-made objects and migration-made ones. The
--     catalog cannot tell who made what, so objects created by 0001-0009 are
--     captured too and get filtered out when the baseline is assembled, since
--     `0000` must contain only what predates `0001`. Sections 9 (functions) and
--     10 (triggers) are where most of that overlap lands.
--   * Anything outside `public`, except triggers on `auth.users`, which are
--     included because a signup trigger there would be invisible otherwise and
--     is exactly the kind of hand-made object this exercise is looking for.

with target as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in ('profiles', 'weeks', 'games', 'picks')
),

-- Column list for each table, already formatted as a `create table` body.
cols as (
  select t.relname,
         string_agg(
           format('  %I %s%s%s',
                  a.attname,
                  format_type(a.atttypid, a.atttypmod),
                  case when a.attnotnull then ' not null' else '' end,
                  case when ad.adbin is not null
                       then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
                       else '' end),
           ',' || chr(10) order by a.attnum) as body
    from target t
    join pg_attribute a on a.attrelid = t.oid
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
   where a.attnum > 0
     and not a.attisdropped
   group by t.relname
),

sections as (

  -- 1. Enum types. A `status` column may be a real enum or text with a check
  --    constraint; the baseline has to reproduce whichever it is.
  select 1 as seq, t.typname::text as sort_a, ''::text as sort_b,
         format('create type public.%I as enum (%s);',
                t.typname,
                string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as ddl
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
   group by t.typname

  -- 2. The tables themselves, columns only. Constraints follow separately so
  --    the foreign keys can be added after every table exists.
  union all
  select 2, c.relname::text, ''::text,
         format('create table public.%I (%s%s%s);',
                c.relname, chr(10), c.body, chr(10))
    from cols c

  -- 3. Constraints, primary and unique keys first so foreign keys have
  --    something to point at.
  union all
  select 3,
         (case con.contype
               when 'p' then '1' when 'u' then '2' when 'c' then '3' else '4'
          end)::text,
         (t.relname || ':' || con.conname)::text,
         format('alter table public.%I add constraint %I %s;',
                t.relname, con.conname, pg_get_constraintdef(con.oid))
    from pg_constraint con
    join target t on t.oid = con.conrelid

  -- 4. Indexes that are not already implied by a constraint above.
  union all
  select 4, t.relname::text, i.indexrelid::text,
         pg_get_indexdef(i.indexrelid) || ';'
    from pg_index i
    join target t on t.oid = i.indrelid
   where not exists (
           select 1 from pg_constraint c where c.conindid = i.indexrelid
         )

  -- 5. Whether RLS is on. Worth stating explicitly: a table with policies but
  --    RLS disabled enforces nothing, and reads as protected.
  union all
  select 5, t.relname::text, ''::text,
         format('alter table public.%I %s row level security;',
                t.relname,
                case when t.relrowsecurity then 'enable' else 'disable' end)
    from target t

  -- 6. Policies, reconstructed from `pg_policy` rather than the `pg_policies`
  --    view, so PERMISSIVE vs RESTRICTIVE survives. Two permissive policies OR
  --    together; a restrictive one ANDs. Losing that distinction would quietly
  --    change what the baseline enforces.
  union all
  select 6, t.relname::text, pol.polname::text,
         format('create policy %I on public.%I as %s for %s to %s%s%s;',
                pol.polname,
                t.relname,
                case when pol.polpermissive then 'permissive' else 'restrictive' end,
                case pol.polcmd
                     when 'r' then 'select'
                     when 'a' then 'insert'
                     when 'w' then 'update'
                     when 'd' then 'delete'
                     else 'all'
                end,
                coalesce(
                  (select string_agg(quote_ident(r.rolname), ', ' order by r.rolname)
                     from pg_roles r
                    where r.oid = any (pol.polroles)),
                  'public'),
                case when pol.polqual is not null
                     then chr(10) || '  using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')'
                     else '' end,
                case when pol.polwithcheck is not null
                     then chr(10) || '  with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')'
                     else '' end)
    from pg_policy pol
    join target t on t.oid = pol.polrelid

  -- 7. Table-wide grants.
  union all
  select 7, g.table_name::text, g.grantee::text || ':' || g.privilege_type::text,
         format('grant %s on public.%I to %I;',
                g.privilege_type, g.table_name, g.grantee)
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.table_name in ('profiles', 'weeks', 'games', 'picks')
     and g.grantee in ('anon', 'authenticated', 'service_role')

  -- 8. Column-level grants, which is how 0001/0002/0006/0007/0008 narrowed
  --    writes. A table-wide grant from section 7 also shows up here, expanded
  --    across every column; the duplication is deliberate, because a column
  --    grant that exists *without* a matching table grant is the interesting
  --    case and it is only visible by comparing the two. Emitted as comments so
  --    the assembled baseline can restate them in the tidier
  --    `grant insert (a, b) on t to role` form.
  union all
  select 8, cp.table_name::text,
         cp.grantee::text || ':' || cp.privilege_type::text || ':' || cp.column_name::text,
         format('-- column grant: %s on public.%I(%I) to %I',
                cp.privilege_type, cp.table_name, cp.column_name, cp.grantee)
    from information_schema.column_privileges cp
   where cp.table_schema = 'public'
     and cp.table_name in ('profiles', 'weeks', 'games', 'picks')
     and cp.grantee in ('anon', 'authenticated', 'service_role')

  -- 9. Every function in `public`. Most belong to 0001-0009 and will be dropped
  --    when the baseline is assembled; any that remain are hand-made and have
  --    never been in version control.
  union all
  select 9, p.proname::text, p.oid::text,
         pg_get_functiondef(p.oid) || ';'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'

  -- 10. Triggers on the four tables, plus any on `auth.users`.
  union all
  select 10, c.relname::text, tg.tgname::text,
         pg_get_triggerdef(tg.oid) || ';'
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not tg.tgisinternal
     and (
       (n.nspname = 'public' and c.relname in ('profiles', 'weeks', 'games', 'picks'))
       or (n.nspname = 'auth' and c.relname = 'users')
     )

  -- 11. Extensions, for anything a default expression depends on
  --     (`gen_random_uuid()` lives in pgcrypto on older projects).
  union all
  select 11, e.extname::text, ''::text,
         format('-- extension in use: %s version %s', e.extname, e.extversion)
    from pg_extension e
   where e.extname <> 'plpgsql'
)

select row_number() over (order by seq, sort_a, sort_b) as n,
       seq as section,
       ddl
  from sections
 order by n;
