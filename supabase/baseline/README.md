# The `0000` baseline

`profiles`, `weeks`, `games` and `picks` were created by hand in the Supabase
dashboard. Nothing in `supabase/migrations/` creates them, so the migrations
cannot be replayed onto an empty database — and that single fact is what blocks
the policy-test harness. This directory is the work of fixing it.

## Why it matters

The sibling NFL app runs its policy assertions against a throwaway Postgres
(`supabase/test/run.sh`): apply every migration in order, then check that the
holes are actually closed. That harness is the check that would have caught each
of `0006`–`0009` *before* production, rather than by reading policies carefully
enough at review time.

It cannot be ported here yet, because there is nothing to apply the migrations
*to*. `0001` starts by altering a `profiles` table that no migration created.

The tempting shortcut is to hand-write a plausible `profiles`/`weeks`/`games`/
`picks` from the app's types and start the harness from that. Don't. A harness
whose assertions pass against a *guessed* schema is worse than no harness: it
produces green checkmarks that prove nothing about production. `supabase/README.md`
already records that the SQL which used to document these tables drifted from
the live database and had to be deleted — that is exactly the failure being
avoided here.

So: capture what is really deployed, first.

## The three steps

**1. Capture.** Run [`capture.sql`](capture.sql) in the Supabase SQL editor and
download the result as CSV. It is read-only — catalogs and `information_schema`
only, no pool data, safe during an open week. *This step needs the pool admin;
it cannot be done from the repo.*

**2. Assemble.** Turn that output into `supabase/migrations/0000_baseline.sql`,
filtering it down to only what predates `0001` (see below).

**3. Port the harness.** Bring over the NFL app's `supabase/test/run.sh`, now
that `0000` gives it a database to build. Needs Docker, which is not currently
installed on the dev machine.

Step 1 is the blocking one. Steps 2 and 3 are ordinary work once its output
exists.

## What `0000` must and must not contain

`0000` has to reproduce the database **as it stood before `0001` was applied**,
because `0001`–`0009` will run on top of it. The capture cannot make that
distinction on its own — the catalog does not record which migration made what —
so the filtering is manual:

| Captured | Goes in `0000`? |
| --- | --- |
| The four `create table` statements, columns, defaults | Yes |
| Primary keys, foreign keys, unique and check constraints | Yes |
| Indexes not backing a constraint | Yes |
| `enable row level security` | Yes |
| The original permissive policies (`using (true)`, the self-insert on `profiles`) | **Yes** — see below |
| Policies created by `0003`, `0004`, `0007`, `0008`, `0009` | No |
| Functions: `picks_revealed`, `save_picks`, `is_member`, `redeem_invite`, `admin_create_invite`, `admin_revoke_invite`, `normalise_invite_code`, `generate_invite_code` | No — created by `0003`/`0005`/`0009` |
| Trigger guards on `picks`, `games`, `weeks` | No — created by `0006`/`0007`/`0008` |
| Any *other* function or trigger, including on `auth.users` | Yes — hand-made and never in version control |
| Column grants matching `0001`/`0002`/`0006`/`0007`/`0008` | No |
| `invites`, `invite_claims` | No — created by `0009` |

The counter-intuitive row is the permissive policies. `0000` should recreate the
**original insecure state** — `"Anyone can update games"`, `"Anyone can insert
weeks"`, the `profiles` self-insert — not the hardened one. That is what makes
the harness meaningful: it replays the actual history, so an assertion that
`0007` closes the games hole is testing that `0007` closes a hole that was
genuinely open, not that a hole was never there. A baseline that starts already
secure would pass every assertion while proving nothing.

The live database no longer has those policies, since `0007`/`0008`/`0009`
dropped them. Their original text is recoverable from the migrations that drop
them and from the quoted definitions in `supabase/README.md`.

## Cross-check: what the code requires

Derived from `src/lib/supabase.ts` (the `*Row` types), the column grants in
`0001`–`0008`, and the service layer's queries. **This is not the baseline** —
it is what the capture output gets checked against. A mismatch in either
direction is a finding: a column here but not in production means the app reads
something that does not exist; a column in production but not here is dead
storage or an undocumented feature.

| Table | Columns the code depends on |
| --- | --- |
| `profiles` | `id`, `email`, `name`, `avatar` (nullable), `role` (`admin`\|`member`), `created_at`, `updated_at` |
| `weeks` | `id` (text, `week-YYYY-MM-DD`), `week_number`, `saturday_date` (date), `status` (`OPEN`\|`LOCKED`\|`COMPLETED`), `created_at` |
| `games` | `id`, `week_id`, `nhl_game_id` (nullable), `home_team_id`, `away_team_id`, `start_time`, `status` (`SCHEDULED`\|`LIVE`\|`FINAL`), `home_score` (nullable), `away_score` (nullable), `created_at`, `updated_at` |
| `picks` | `id`, `user_id`, `week_id`, `game_id`, `selected_team_id`, `confidence`, `points_earned`, `result` (`WIN`\|`LOSS`\|`PENDING`), `created_at`, `updated_at` |

Two inferences worth confirming against the capture:

* **`games.id` and `picks.id` must have database-side defaults.** The insert
  grants from `0006` and `0007` do not include `id`, and the client never sends
  one, so every insert relies on a default. If the capture shows no default on
  either, inserts are working for some other reason and that reason needs
  finding.
* **`weeks.id` is the primary key.** `getCurrentWeek` catches Postgres error
  `23505` on a concurrent insert and re-fetches, which only works if a unique
  constraint exists on `id`.

Open questions the capture answers, none of which can be settled from the repo:

* Are the `status` / `role` / `result` columns real enums, or text with check
  constraints? The app treats them as string unions either way.
* Is there a unique constraint on `picks (user_id, week_id, game_id)`, or on
  `(user_id, week_id, confidence)`? The app enforces "five picks, distinct
  confidence 1–5" in TypeScript; whether the database backs that up is unknown.
* Do the `updated_at` columns have a trigger keeping them current, or are they
  written by hand — or stale?
* Is there a trigger on `auth.users` creating profile rows? `supabase/README.md`
  discusses one as a hypothetical for confirm-on-signup; whether one exists is
  a different question.

## Status

- [x] Capture script written
- [ ] Capture run against production — **needs the pool admin**
- [ ] `0000_baseline.sql` assembled from the output
- [ ] Baseline verified by replay (apply `0000`–`0009` to an empty database)
- [ ] `supabase/test/run.sh` ported — also needs Docker installed
