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
| `0000_baseline.sql` | — n/a | The pre-`0001` schema, captured from production 2026-09-14. **Never applied to production** — production already has this history. It exists so a throwaway database can be given the same starting point |
| `0001_lock_profile_privileged_columns.sql` | ☑ applied 2026-08-21 | Stops a member from promoting themselves to `admin` by editing their own `profiles` row |
| `0002_allow_signup_profile_insert.sql` | ☑ applied 2026-08-21 | Lets a new user create their own `profiles` row at signup, without being able to set `role` |
| `0003_pick_visibility.sql` | ☑ applied 2026-08-22 | Hides other players' picks until the week's Saturday deadline passes (10:00 ET here; noon ET since `0011`) |
| `0004_enforce_deadline.sql` | ☑ applied 2026-08-22, found missing 2026-09-14, **re-applied 2026-09-21** | Enforces that deadline for writes too, so picks cannot be changed after games start. Went missing between August and September; see ASSESSMENT.md #27 |
| `0005_save_picks_rpc.sql` | ☑ applied 2026-08-23 | Replaces a pick sheet in one transaction, so a failed save can no longer lose the old picks |
| `0006_lock_pick_score_columns.sql` | ☑ applied 2026-08-23 | Stops a member writing their own `points_earned`/`result` — the columns the standings are summed from |
| `0007_lock_game_score_writes.sql` | ☑ applied 2026-08-23 | Stops anyone — including logged-out visitors — rewriting game scores, which decide every pick |
| `0008_lock_week_deadline_writes.sql` | ☑ applied 2026-08-23 | Stops a member moving `weeks.saturday_date` — the column every deadline rule reads |
| `0009_invites_and_membership.sql` | ☑ applied (date not recorded) | Self-serve signup gated by invite codes. Supersedes 0002: a `profiles` row can no longer be self-inserted, only created by `redeem_invite()` |
| `0010_fix_save_picks_game_id_cast.sql` | ☑ applied 2026-09-22 | Adds the `::uuid` cast `0005` omitted. Without it `save_picks` raised on every call and no member could submit a sheet. Verified by submitting one from the Picks view. See ASSESSMENT.md #28 |
| `0011_noon_deadline.sql` | ☑ applied 2026-09-26 | Moves the pick deadline from Saturday 10:00 to 12:00 ET by redefining `picks_revealed()`. Ships with the client change in `src/lib/timezone.ts`; apply it with that deploy so the UI and database lock together |

Tick the boxes above once the pool admin has run them against production. Apply
them in numeric order — 0002 assumes 0001 is already in place, and 0004 depends
on the `picks_revealed()` function created by 0003.

0003 and 0004 were applied and verified on 2026-08-22: `picks_revealed()` exists,
`picks` carries exactly four policies (one per command), and exactly one of them
is a SELECT policy — confirming no permissive policy survived the swap, which is
the failure mode that would have left picks readable while appearing protected.

⚠️ **That verification was not sufficient, and 0004 was found not to be in
effect.** The 2026-09-14 schema capture found `picks` carrying the three
*original* write policies — the ones 0004 drops by name — and none of the three
0004 creates. Note that the check above passes in both states: there are four
policies either way, one of them SELECT. It counted policies without reading
them.

**Re-applied 2026-09-21 and verified properly.** The damage-check query returned
zero rows, so no pick was ever created after its own week's deadline and nothing
needed repairing. The pre-flight confirmed the open week reported unlocked
before applying, all three policies now name `picks_revealed`, and a member
submitted a sheet for the open week afterwards. Full write-up: ASSESSMENT.md
#27.

**Verify by reading the policies, never by counting them** — that is the whole
lesson of this one:

```sql
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'picks'
 order by cmd;
```

Each of INSERT, UPDATE and DELETE must mention `picks_revealed`.

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

Apply on a weekday. Never between Friday evening and the Saturday noon ET
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

Correction, 2026-09-14: the first bullet used to claim there is "no second copy
of the deadline rule inside it to drift away from the policy". The live function
body disproves that — `save_picks` opens with
`if picks_revealed(p_week_id) then raise exception 'Picks are locked...'`, a
deliberate second copy that exists to turn an opaque RLS refusal into a readable
error. While the 0004 policies were missing, that copy was the *only* deadline
enforcement on writes — which is why the hole in ASSESSMENT.md #27 was never
reachable through the app's own UI.

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

Applied 2026-08-23, with the two damage-check queries run beforehand.

Those queries stay useful: there is no perfect test — the database has no record
of what the NHL actually reported — but they find the shapes a tampered row
takes, the clearest being a FINAL game ending level, which the NHL regular season
does not produce. Worth re-running if a week's results ever look wrong.

## 0008 — the deadline was a member-writable column

`picks_revealed()`, which `0003` and `0004` both hang off, reads
`weeks.saturday_date`. And `weeks` carried:

```
"Allow authenticated users to update weeks"  UPDATE  using (true)
"Anyone can insert weeks"                    INSERT  with check (true)  [public]
```

No column restriction. So any member could restate when their own week ends:

```sql
update weeks set saturday_date = '2027-01-01' where id = 'week-2026-10-11';
```

`picks_revealed()` then returns false, `0004`'s write policies allow writes
again, and re-submitting a sheet after the games are final leaves five fresh
`PENDING` rows for the next `sync-week` to score against known results.

**This defeated `0003`, `0004`, `0005` and `0006` together.** None of those are
wrong — they all just trusted this one column, and anyone with an account could
write it.

`0008` closes it in three layers: INSERT limited to members and UPDATE to admins;
column privileges allowing members to insert four columns and update only
`status`; and a trigger that **derives `saturday_date` from the week `id`** on
insert rather than trusting what was sent, and refuses any client change to a
week's date or number afterwards.

The app already builds both from the same string — `getCurrentWeek` sets
`id = 'week-' || <Saturday>` and `saturday_date` to the same date — so deriving
costs an honest caller nothing and removes the client's ability to state a
deadline at all.

The admin status toggle keeps working; `status` is not what locks picks, the date
is. `sync-week` is unaffected — service-role key.

Applied 2026-08-23. The damage-check queries were run first and came back clean:
every week's `saturday_date` matched the date in its own `id`, and all fell on a
Saturday. Nobody had moved a deadline before it was closed.

The queries stay useful — a week whose date disagrees with its id would also
point at a bug in week creation. Worth re-running if a week ever locks at the
wrong time.

## 0009 — signup was open, and membership was self-serve

Until `0009`, the pool was safe only because email signups were switched off in
the Supabase project. That is a dashboard toggle, not a policy — and `0002`'s
`profiles` INSERT policy meant anyone who did get an account could make
themselves a member with one statement. The anon key is in the public bundle, so
`auth.signUp` is reachable by anybody the moment that toggle moves.

`0009` makes membership something the database grants rather than something a
client asserts. A `profiles` row is now created by `redeem_invite()` and nothing
else; the self-insert policy and its grant are gone. It also closed `profiles`
SELECT, which was `using (true)` with no `to` clause — so the anon key could
read every member's email and role.

### Signup and email confirmation

The old client-inserts-its-own-profile flow is gone, and so is the constraint it
carried. Signup is now two separable operations: `auth.signUp()`, then
`redeem_invite()`.

`redeem_invite()` still needs a session — it reads `auth.uid()` and refuses
without one — so with confirmation on, redemption cannot happen during signup.
But it no longer has to. `RedeemInviteView` is reachable by anyone holding a
session with no profile row, so the member confirms their address, signs in, and
finishes joining there. `useAuth.signUp` returns `needsConfirmation` for exactly
this path.

**So confirm-on-signup now works without a schema change.** The `SECURITY
DEFINER` trigger on `auth.users` that this section used to call for is no longer
needed; the resumable redemption screen does the same job in the open. The same
screen is what catches a mistyped invite code, which would otherwise strand an
account: auth user created, no profile, and since `0009` no way to make one.

One consequence worth knowing: an uninvited stranger who signs up sees that
screen and nothing else, forever. That is the whole app to them. It is only safe
because `0009` also tightened what a session without a profile can do — the
foreign key on `picks.user_id` stopped them picking, but on its own left them
able to read the roster and to insert `weeks` and `games` rows, including
squatting a real NHL game id so a fixture was graded against an inverted result.

## Known gaps not covered here

- Changing a member's email still has to be done by an admin. Doing it in-app
  needs Supabase's confirm-change flow plus a trigger keeping
  `profiles.email` in sync with `auth.users.email`.
- No `0000` baseline, so the migrations cannot be replayed onto an empty
  database and the policy-test harness cannot be ported. In progress — see
  [`baseline/`](baseline/).

## The regression check

Run this after **any** migration work, not just after 0009. It is the one query
that catches the failure mode this schema is prone to: a migration being
re-applied on its own and quietly putting back something a later one removed.

`0001` and `0002` are full of `create or replace` and
`drop policy … create policy`. Re-applying either by itself — a completely
natural thing to do while editing one function — restores the self-insert policy
and grant that `0009` exists to remove, and the pool is open again with nothing
looking obviously wrong.

```sql
-- Expect ZERO rows from both. Any row is a reopened hole.

-- 1. Policies that should not exist.
select tablename, policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and (
     -- ANY insert policy on profiles, permissive or not. The one this is here
     -- to catch is `with check (auth.uid() = id)`, which reads as restrictive
     -- and is exactly the hole: it lets every signed-in user make themselves a
     -- member.
     (cmd = 'INSERT' and tablename = 'profiles')
     -- Anyone-can-write on the schedule.
  or (cmd = 'INSERT' and with_check = 'true' and tablename in ('weeks', 'games'))
     -- Anyone-can-read, on the roster specifically. `weeks_select_all` and
     -- `games_select_all` are `using (true)` on purpose — they are the NHL
     -- schedule, and there is nothing in a fixture list worth hiding.
  or (cmd = 'SELECT' and qual = 'true' and tablename = 'profiles')
   );

-- 2. Insert grants that should not exist.
select grantee, table_name, column_name
  from information_schema.column_privileges
 where grantee in ('anon', 'authenticated')
   and privilege_type = 'INSERT'
   and table_name = 'profiles';
```

### The automated test harness

`supabase/test/run.sh` applies every migration in order to a throwaway Postgres
and then runs the assertions in `01_security.sql` against the result. Every
line should read `ok`; a `FAIL` is a real hole.

```bash
PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./supabase/test/run.sh
```

It needs a Postgres 16 server and `psql`. It does **not** need Docker — any
reachable server will do, and every connection setting is overridable from the
environment. The server must allow creating databases, since each run drops and
recreates one; against a hosted Supabase project, swap the recreate for
`drop schema public cascade; create schema public;`.

Ported from the sibling NFL app, whose copy carries the line "The NHL app found
four of these holes in production" — this harness exists because of this repo's
history. It has since found a fifth.

**This was blocked for a long time, and the reason is worth keeping.** No
migration created `profiles`, `weeks`, `games` or `picks`; they were made by
hand in the dashboard, and `PLANNING.md` records that the SQL which used to
document them drifted from production and was deleted. A harness would have had
to start from a *guessed* schema, and assertions passing against a guess are
worse than no assertions — they look like proof. `0000_baseline.sql` closed
that by capturing production's real DDL; see [`supabase/baseline/`](baseline/).

**It runs green: 60 assertions, on PostgreSQL 17.4.** Which means `0000`
replays — every migration applies in order to an empty database, so the
baseline is now proven rather than merely reviewed.

The first run found two real defects that three careful readings had not:

1. **`save_picks` could not insert** — ASSESSMENT.md #28, fixed by `0010`.
2. **Re-applying `0002` alone reopened self-serve membership**, putting back
   the `profiles` INSERT policy and grant that `0009` removed. The operative
   half of `0002` now sits behind a guard keyed on `public.invites` existing,
   so a clean replay still opens the hole exactly as history did — which is
   what makes the `0009` assertions mean anything — while re-applying the file
   afterwards is a no-op.

The two dashboard queries above remain the check against *production*, which a
local replay can never stand in for. Run them after any migration work.
