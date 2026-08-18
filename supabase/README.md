# Database migrations

SQL changes to the IcePick Supabase project, in order.

## How to apply

There is no Supabase CLI link for this project and no migration history table.
Apply these **by hand**, in numeric order, through the Supabase dashboard:

1. Open your project → **SQL Editor** → **New query**.
2. Paste the whole file.
3. **Run**, and read the result — these are written to be re-runnable, so an
   error means something is genuinely different from what the file expects, not
   that you ran it twice.
4. Note the date and file name in `docs/OPERATIONS.md`.

Every file is idempotent: `create or replace`, `drop policy if exists` before
`create policy`. Running one a second time is a no-op.

## Scope

These cover **new changes only**. The existing `profiles`, `weeks`, `games`, and
`picks` tables are not reproduced here — the live schema was created by hand and
has drifted from the SQL that used to sit in the project docs (`games.nhl_game_id`
and the `updated_at` columns are used by the running code but appear in no
document). Recording that baseline accurately would mean reading the live
database, which has not been done. Treat the deployed schema as the source of
truth until someone captures it.

## Migrations

| File | Status | What it does |
|---|---|---|
| `0001_pick_visibility.sql` | Apply | Hides other players' picks until the week's Saturday 10:00 ET deadline passes. |
| `0002_enforce_deadline.sql` | Apply after 0001 | Enforces that deadline for writes too, so picks cannot be changed after games start. |

### A word on what 0001 can and cannot do

Row Level Security governs the anon and authenticated API keys — the app, the
browser console, the REST endpoint. It does **not** apply to the Supabase
dashboard, the service-role key, or `pg_dump`.

So if the pool admin is also a player, 0001 removes the easy path — open
devtools, run one query, read everyone's sheet — but not the privileged one.
Anyone with dashboard access can still read every row. Genuinely sealing picks
from the project owner would need a commit–reveal or client-side encryption
scheme, which trades away recoverability: a lost key means lost picks, and picks
stop working across devices. For a pool this size that is usually the wrong
trade, but it is a real choice, not an oversight.

## Before applying 0001

The deployed policies were created by hand and their names may not match what
the migration expects to drop. Run this first:

```sql
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'picks'
 order by cmd, policyname;
```

If the existing SELECT policy is named something other than `picks_select_all`
or `Picks are viewable by everyone`, add that name to the `drop policy if exists`
list in `0001` before running it. Otherwise the permissive policy survives
alongside the new one — Postgres ORs permissive policies together — and picks
stay readable while appearing to be protected.

## After applying 0001

Log in as an ordinary member during an **open** week and run this in the browser
console:

```js
const { data } = await supabase.from('picks').select('*').eq('week_id', 'week-YYYY-MM-DD');
console.log(data.length, new Set(data.map(p => p.user_id)).size);
```

It must return only that member's own five rows, from exactly one user id.
Repeat after the Saturday deadline and confirm the whole league appears.

## Timing

Apply on a weekday. Never between Friday evening and the Saturday 10:00 ET
deadline — if something is wrong, that is the one window where it stops people
using the pool.

## How these were tested

Both files were run against a local PostgreSQL 16 instance loaded with a replica
of the live schema (including the permissive policies as currently deployed) and
three fixture users — two members and an admin — with picks in one open week and
one past week. Verified:

- Before `0001`, any member reads all three players' picks for the open week.
  After it, each member — **including the admin** — reads only their own, while
  the past week reveals the full league.
- The deadline instants computed in SQL match `getPickDeadline()` in
  `src/lib/timezone.ts` exactly, on seven dates spanning both DST transitions.
  The database and the countdown lock at the same moment.
- With `0002`, editing an open-week pick succeeds; updating, inserting, or
  deleting a locked-week pick is refused.
- **Scoring still works after the deadline.** Against a role created with
  `BYPASSRLS` — as Supabase's `service_role` is — `sync-week`'s writes all
  succeed on a locked week: games marked FINAL, all picks resolved with points
  awarded, and the week marked COMPLETED. This is the case that would have been
  bad to get wrong, since standings would have silently stopped updating.
- Both files apply three times in a row with no error and leave exactly four
  policies on `picks`.

One behaviour to know: a blocked **UPDATE** or **DELETE** affects zero rows
rather than raising an error — that is how a Postgres `USING` clause works. A
blocked **INSERT** does raise. Since `savePicks` deletes then inserts, a
late-submission attempt surfaces as an insert error, which the UI already
displays.

### The one real cost of 0002

`savePicks` deletes a member's picks and then inserts the new set, with no
transaction (issue #25 in `ASSESSMENT.md`). Today, if the clock crosses 10:00 ET
in the gap between those two statements, the insert still succeeds. With `0002`
applied it is refused, and that member's picks are gone.

The window is milliseconds wide and only exists for someone submitting at
literally 10:00:00 on a Saturday. It is a real widening of an existing bug, not a
new one, and the `save_picks` RPC that fixes #25 closes it completely. Worth
knowing; not worth withholding the migration over, since the alternative is
leaving late edits possible all season.
