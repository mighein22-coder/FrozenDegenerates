# Database migrations

SQL that has to be applied to the Supabase project by hand. There is no
Supabase CLI wired into this repo yet, so these are **not** applied
automatically by any build or deploy step.

## Applying a migration

1. Open the Supabase dashboard for the IcePick project.
2. Go to **SQL Editor** → **New query**.
3. Paste the contents of the migration file and run it.
4. Run the verification queries in the comment block at the bottom of the
   file and confirm the expected results.

Migrations are written to be idempotent, so re-running one is safe.

## Status

| Migration | Applied? | What it does |
| --- | --- | --- |
| `0001_lock_profile_privileged_columns.sql` | ☑ applied 2026-08-21 | Stops a member from promoting themselves to `admin` by editing their own `profiles` row |
| `0002_allow_signup_profile_insert.sql` | ☑ applied 2026-08-21 | Lets a new user create their own `profiles` row at signup, without being able to set `role` |
| `0003_pick_visibility.sql` | ☑ applied 2026-08-22 | Hides other players' picks until the week's Saturday 10:00 ET deadline passes |
| `0004_enforce_deadline.sql` | ☑ applied 2026-08-22 | Enforces that deadline for writes too, so picks cannot be changed after games start |
| `0005_save_picks_rpc.sql` | ☑ applied 2026-08-23 | Replaces a pick sheet in one transaction, so a failed save can no longer lose the old picks |
| `0006_lock_pick_score_columns.sql` | ☑ applied 2026-08-23 | Stops a member writing their own `points_earned`/`result` — the columns the standings are summed from |
| `0007_lock_game_score_writes.sql` | ☐ not applied | Stops anyone — including logged-out visitors — rewriting game scores, which decide every pick |

Tick the boxes above once the pool admin has run them against production. Apply
them in numeric order — 0002 assumes 0001 is already in place, and 0004 depends
on the `picks_revealed()` function created by 0003.

0003 and 0004 were applied and verified on 2026-08-22: `picks_revealed()` exists,
`picks` carries exactly four policies (one per command), and exactly one of them
is a SELECT policy — confirming no permissive policy survived the swap, which is
the failure mode that would have left picks readable while appearing protected.

Both were verified after applying: `authenticated` now holds UPDATE only on
`name`/`avatar` and INSERT only on `id`/`email`/`name`/`avatar` — `role` appears
in neither — and the `Users can update own profile` policy carries a non-null
`WITH CHECK`.

## 0003 and 0004 — pick secrecy and the deadline

These two close complementary halves of the same hole. `0003` stops a member
reading everyone else's sheet before the deadline; `0004` stops anyone rewriting
their own sheet after it. Applying only `0003` leaves late edits possible.

### What 0003 can and cannot do

Row Level Security governs the anon and authenticated API keys — the app, the
browser console, the REST endpoint. It does **not** apply to the Supabase
dashboard, the service-role key, or `pg_dump`.

So if the pool admin is also a player, `0003` removes the easy path — open
devtools, run one query, read everyone's sheet — but not the privileged one.
Anyone with dashboard access can still read every row. Genuinely sealing picks
from the project owner would need a commit–reveal or client-side encryption
scheme, which trades away recoverability: a lost key means lost picks, and picks
stop working across devices. For a pool this size that is usually the wrong
trade, but it is a real choice, not an oversight.

### Before applying 0003

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
list in `0003` before running it. Otherwise the permissive policy survives
alongside the new one — Postgres ORs permissive policies together — and picks
stay readable while appearing to be protected.

### After applying 0003

Log in as an ordinary member during an **open** week and run this in the browser
console:

```js
const { data } = await supabase.from('picks').select('*').eq('week_id', 'week-YYYY-MM-DD');
console.log(data.length, new Set(data.map(p => p.user_id)).size);
```

It must return only that member's own five rows, from exactly one user id.
Repeat after the Saturday deadline and confirm the whole league appears.

### Timing

Apply on a weekday. Never between Friday evening and the Saturday 10:00 ET
deadline — if something is wrong, that is the one window where it stops people
using the pool.

### How these were tested

Both files were run against a local PostgreSQL 16 instance loaded with a replica
of the live schema (including the permissive policies as currently deployed) and
three fixture users — two members and an admin — with picks in one open week and
one past week. Verified:

- Before `0003`, any member reads all three players' picks for the open week.
  After it, each member — **including the admin** — reads only their own, while
  the past week reveals the full league.
- The deadline instants computed in SQL match `getPickDeadline()` in
  `src/lib/timezone.ts` exactly, on seven dates spanning both DST transitions.
  The database and the countdown lock at the same moment.
- With `0004`, editing an open-week pick succeeds; updating, inserting, or
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

### The one real cost of 0004 — closed by 0005

`savePicks` deleted a member's picks and then inserted the new set, with no
transaction. Before `0004`, if the clock crossed 10:00 ET in the gap between
those two statements the insert still succeeded. With `0004` applied it was
refused, and that member's picks were gone.

The window was milliseconds wide and only existed for someone submitting at
literally 10:00:00 on a Saturday. It was a real widening of an existing bug, not
a new one, and `0005_save_picks_rpc.sql` closes it: the delete and the insert
now run inside one `save_picks` call, so they either both apply or neither does.

`save_picks` runs as the caller, not `security definer`. Two consequences worth
knowing:

* The policies from `0003`/`0004` still govern every row it touches. The
  function grants no authority the caller lacked, and there is no second copy of
  the deadline rule inside it to drift away from the policy.
* `now()` is the transaction timestamp, fixed for the whole transaction, so
  `picks_revealed()` gives the delete and the insert the same answer. A
  submission that lands on the wrong side of 10:00 is refused whole, with the
  member's previous sheet still in place.

Applied and verified 2026-08-23: `prosecdef` is false, confirming the function
runs as the caller and the `0004` policies still govern it.

#### Has the old bug already eaten a sheet?

Every member/week pairing should hold exactly five picks; a partial sheet is
what the old failure left behind, and the app renders it as an ordinary
incomplete entry rather than flagging it. Run this in the SQL editor — expect
zero rows:

```sql
select p.user_id, pr.name, p.week_id, count(*) as picks
  from public.picks p
  left join public.profiles pr on pr.id = p.user_id
 group by p.user_id, pr.name, p.week_id
having count(*) <> 5
 order by p.week_id, pr.name;
```

Run 2026-08-23 alongside applying `0005`: zero rows — no sheet was lost while
the bug was live. Worth re-running after any report of picks vanishing.

Any row is a sheet that needs repairing by hand — ask that member what they
picked, or, for a week already scored, correct it and re-run the sync so the
standings follow.

## 0006 — members could write their own scores

`computeStandings` sums `picks.points_earned` and counts `picks.result` straight
off the rows. Both columns were writable by any logged-in member: the UPDATE
policy said which *rows* you may touch, never which *columns*, and
`authenticated` held UPDATE on all of them. One REST call with the anon key took
first place. The same gap existed on INSERT — a sheet could be inserted
pre-scored.

`0004` did not close it. Its `WITH CHECK` tests ownership and the deadline, and
a member forging their own picks in an open week passes both.

The part that makes it stick: `sync-week` resolves only picks with
`result = 'PENDING'`. A pick already claiming `'WIN'` is skipped by every later
sync, so a forged score is never corrected — it lasts the season.

`0006` closes it in two layers, the same shape as `0001` on `profiles`:
`authenticated` loses UPDATE on `picks` outright and may INSERT only the five
columns a sheet consists of, and a `BEFORE` trigger rejects any client-role
change to the two score columns even if a later migration re-grants UPDATE.

Nothing in the client updates `picks` — `savePicks` goes through the `save_picks`
RPC, which only deletes and inserts — so removing UPDATE costs no functionality.
`sync-week` is unaffected: it connects as `service_role`.

Applied 2026-08-23. The two damage-check queries at the bottom of the migration
were run first and came back clean: no pick's stored score disagreed with its
game's outcome, and nothing was scored ahead of a finished game. Nobody had
exploited this before it was closed.

Those queries stay useful — they also catch scoring bugs, not just forgeries.
Worth re-running if the standings ever look wrong.

## 0007 — anyone could rewrite game scores

`games` carried two policies written for `public` rather than `authenticated`:

```
"Anyone can update games"  UPDATE  using (true)
"Anyone can insert games"  INSERT  with check (true)
```

`public` covers every request the anon key can make, and the anon key ships in
the browser bundle. So this was not a members-only hole — **a logged-out visitor
could set `home_score`, `away_score` or `status` on any game.** Those columns
decide every pick's result, so rewriting one rewrites the standings.

This is the same wound `0006` closed, one table upstream. Locking
`picks.points_earned` achieves little if someone can instead flip the game a
pick refers to and have `sync-week` compute a wrong result from data it trusts.

`0007` drops both public policies, revokes UPDATE and DELETE on `games` from
client roles outright, and narrows INSERT to the six columns the schedule feed
supplies — plus a trigger that forces any client-inserted game to
`SCHEDULED`/`null`/`null` and refuses client updates entirely.

INSERT survives because seeding a week's schedule is a normal member action:
`saveGames` fills a week the first time anyone opens it. Scores are written only
by `sync-week`, which uses the service-role key and is unaffected.

**`weeks` is deliberately left alone.** The client also inserts week rows, and
the admin panel updates `weeks.status` from the browser. Deciding where those
writes belong is ASSESSMENT #10, still open — `0007` closes the scoring hole and
stops there.

**Run the two damage-check queries at the bottom of the migration before
applying.** There is no perfect test — the database has no record of what the
NHL actually reported — but they find the shapes a tampered row takes, the
clearest being a FINAL game ending level, which the NHL regular season does not
produce.

## Signup and email confirmation

`0002` covers the signup flow the app actually implements today: the client
inserts its own `profiles` row right after `supabase.auth.signUp()`.

**That only works with email confirmation turned off** (Authentication →
Providers → Email → "Confirm email"). With confirmation on, `signUp()` returns
no session, so the insert arrives unauthenticated, `auth.uid()` is NULL, and
RLS refuses it — no INSERT policy can rescue a request that carries no
identity.

If the pool wants confirm-on-signup, the profile row has to be created
server-side instead, by a `SECURITY DEFINER` trigger on `auth.users` that
reads the display name out of `raw_user_meta_data`. That replaces the client
insert in `useAuth.signUp` rather than sitting alongside it, so it is a
different change, not an addition to `0002`.

## Known gaps not covered here

- Changing a member's email still has to be done by an admin. Doing it in-app
  needs Supabase's confirm-change flow plus a trigger keeping
  `profiles.email` in sync with `auth.users.email`.
- `games` and `picks` still need the RLS review described in ASSESSMENT.md
  item #10.
