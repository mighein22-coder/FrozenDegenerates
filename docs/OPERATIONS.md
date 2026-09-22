# Operations

How IcePick runs in production, and what to do when something needs attention.

## Shape of the system

- **Frontend** — React + Vite in `src/`, built to `src/dist`, served by Netlify.
  Tailwind comes from a CDN `<script>` in `src/index.html`; there is no CSS build.
- **Backend** — Supabase (Postgres + Auth). The browser talks to it directly with
  the anon key, under Row Level Security.
- **Serverless** — Netlify Functions in `netlify/functions/`, with their own
  `package.json`.

Everything deploys from the repo. `netlify.toml` runs
`npm --prefix src ci && npm --prefix netlify/functions ci && npm --prefix src run build`.

## Environment variables

Set in the Netlify dashboard.

**Inlined into the public browser bundle — never put a real secret here.**
Anything prefixed `VITE_` is compiled into the JS every visitor downloads.

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key; safe to publish, RLS is what protects data |

**Functions only — never sent to the browser.**

| Name | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS. Used by `sync-week` and `scheduled-sync`. |
| `SUPABASE_URL` | Optional; both fall back to this if `VITE_SUPABASE_URL` is unset. |

`VITE_SYNC_WEEK_SECRET` and `SYNC_WEEK_SECRET` are gone — removed from the
Netlify dashboard 2026-08-23. `sync-week` authenticates the caller's Supabase
access token instead of a shared secret; the client half of that pair was
inlined into the public bundle, so it authenticated nobody. Do not reintroduce
either name.

`scheduled-sync` adds no variable of its own. It runs the scoring pass in
process rather than calling `sync-week` over HTTP, so there is no request to
authenticate and no secret to store.

## Functions

| Function | Trigger | What it does |
|---|---|---|
| `nhl-schedule` | App, when a week has no games yet | Proxies `api-web.nhle.com/v1/schedule/{date}` and returns rows shaped for insert. No auth. |
| `sync-week` | App on login and on the results view; admin panel | The workhorse. Service-role client: marks games FINAL with scores, resolves PENDING picks (win → points = confidence), and marks the week COMPLETED once all games are final or it is past 4:00 AM ET Sunday. Idempotent. **Requires a `Bearer` Supabase access token** from any signed-in member — not admin-only, since scoring has to happen whoever opens the app. |
| `team-records` | Picks view | `standings/now` → `{ABBR: "W-L-OTL"}`, cached an hour. No auth. |
| `scheduled-sync` | Cron, every 15 minutes | Runs the same scoring pass as `sync-week`, on whichever weeks need it. Takes no input and needs no credential — see below. |

`netlify/functions/_shared/etTime.ts` re-exports the app's timezone helpers so
the functions and the browser agree on when a week locks and closes. Do not
reimplement DST logic in a function — that is exactly the bug that was removed.

`netlify/functions/_shared/syncWeek.ts` holds the scoring pass itself. Both
`sync-week` (with auth, over HTTP) and `scheduled-sync` (on cron, in-process)
call it, so there is one implementation of what scoring means.

The functions have their own `tsconfig.json`. `npm --prefix src run typecheck`
runs it as a second project — `src/tsconfig.json` only ever covered `src/`, and
Netlify's esbuild strips types without checking them, so before that nothing
checked the functions at all. It needs `netlify/functions/node_modules` present;
install both trees.

## The weekly cycle

| When (ET) | What happens |
|---|---|
| Monday 6:00 AM | `getTargetSaturdayDate()` rolls over to the coming Saturday. The next member to log in creates the `weeks` row and the app fetches that Saturday's games. |
| Through the week | Members submit five picks with unique confidence 1–5. |
| **Saturday 10:00 AM** | Pick deadline. Picks lock and, once `0003` is applied, everyone's picks become visible to everyone. |
| Saturday evening | Games play. `scheduled-sync` picks up finals and resolves picks within 15 minutes, with no one signed in. |
| Sunday 4:00 AM | The week is marked COMPLETED, whether or not every game went final. The first scheduled run after 4:00 AM does it. |

**Weeks are created lazily, by whoever logs in first after Monday 6 AM.** If
nobody logs in, no week exists and no games are fetched. There is no scheduled
job doing this.

## Automated score sync

`scheduled-sync` runs the scoring pass on a cron, so standings move whether or
not anyone opens the site. The schedule lives in `netlify.toml`:

```toml
[functions."scheduled-sync"]
  schedule = "*/15 * * * *"
```

**It needs no credential.** It does not call `/.netlify/functions/sync-week` over
HTTP — it imports the scoring pass from `_shared/syncWeek.ts` and runs it
in-process. A cron run has no Supabase session and no `profiles` row, so it could
not satisfy that endpoint's auth, and letting it through would mean inventing a
second shared secret. That is exactly the `VITE_SYNC_WEEK_SECRET` mistake
(ASSESSMENT #3, reversed in #26). Calling the function directly means there is
nothing to forge, because there is no request. **Do not add a secret to make the
HTTP path work for cron.**

**Every 15 minutes is cheaper than it looks.** The function first asks which
weeks are past their Saturday 10:00 AM ET deadline and not yet COMPLETED. From
Sunday morning to Saturday morning that is empty, and the run ends after one
SELECT — no NHL API call, no writes. Roughly 2,900 invocations a month against a
125,000 free-tier allowance.

The cron is flat rather than pinned to Saturday night on purpose. Netlify cron is
UTC; the window that matters is Eastern, and it shifts an hour twice a season. A
UTC window would need padding and would still be an edge that nobody notices is
wrong until a Saturday night. Letting the query decide has no edges.

**A long catch-up run stops itself.** After 20 seconds the run stops starting
new weeks and defers the rest to the next tick, rather than being killed by
Netlify's execution limit mid-week. Nothing is lost either way — every write
commits on its own, and the next run resumes from whatever is still PENDING —
but stopping deliberately means the log says what was deferred. A normal
Saturday is one week and finishes in a second or two.

**It does not create weeks.** Seeding a week and its schedule is still lazy, done
by the first member to log in after Monday 6:00 AM ET. If nobody logs in all
week, there is no week for the scheduler to score. That is the remaining hole in
"runs without a human", and it is a separate job with separate failure modes.

**The app still syncs on login and on the results view.** Kept deliberately: it
costs nothing on a COMPLETED week (the app skips the call entirely), and it is
the fallback if the schedule is disabled, if a deploy drops it, or in local dev
and deploy previews where no cron runs.

### If scores stop moving

1. Netlify dashboard → **Logs → Functions → scheduled-sync**. Every run logs a
   one-line summary: games updated, picks resolved, weeks closed, errors.
   `No weeks need syncing` is the normal mid-week line.
2. Netlify dashboard → **Project configuration → Functions** lists the schedule
   it actually registered. If `scheduled-sync` is not there, the `netlify.toml`
   block did not deploy.
3. A run that ends `Cannot start: Server misconfiguration` means
   `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` is missing from the environment.
4. Anyone can force a sync meanwhile: sign in and open the League Matrix for the
   week, or use the admin panel's sync button.

## Routes

The app uses History-API routing (`react-router-dom`). `netlify.toml` already
serves `index.html` for any path, so deep links and refreshes work.

| Path | View |
|---|---|
| `/` | Dashboard |
| `/picks` | Saturday Picks |
| `/matrix?week=week-YYYY-MM-DD` | League Matrix, optionally on a given week |
| `/affinity` | Team Affinity |
| `/standings?segment=1\|2\|3\|season` | Standings, optionally on a given scope |
| `/history` | My History |
| `/admin` | Admin panel (admins only) |
| `/login` | Login screen |
| `/signup` | Signup screen — takes an invite code. Shareable; send it with the code |
| `/auth/callback` | Landing page for every emailed auth link |

`src/routes.ts` is the single definition driving both the router and the
sidebar, so a path cannot exist in one and not the other. Query parameters are
validated against real data — a stale `?week=` falls back to the most recent
week rather than rendering an empty grid.

### `/auth/callback` — required Supabase setting

Password-reset and confirmation emails land here. **This route only works if the
URL is allowlisted in Supabase**, or Supabase refuses the redirect regardless of
what the app does:

Supabase → Authentication → **URL Configuration**
- **Site URL**: the production origin, e.g. `https://icepick.example.com`
- **Redirect URLs**: add
  - `https://<your-domain>/auth/callback`
  - `http://localhost:8888/auth/callback` (for `netlify dev`)
  - `https://*--<your-site>.netlify.app/auth/callback` (deploy previews, optional)

Also confirm the "Confirm signup" and "Reset password" email templates point at
`{{ .SiteURL }}/auth/callback`.

The route handles both link shapes Supabase can send — implicit flow, where the
token arrives in the URL fragment, and PKCE, where a `code` arrives in the query
string — plus expired and already-used links. It renders full-screen, outside
the signed-in shell, because a recovery link *does* create a session and the
user must be able to set a password without the app navigating away.

One subtlety worth preserving: `src/lib/authRedirect.ts` snapshots the auth
parameters at page load and **must be imported before `lib/supabase`**
(`src/index.tsx` does this). supabase-js erases the URL fragment during its own
initialization, so by the time a component mounts there is nothing left to read.

## Season segments

The season is split into three roughly equal segments, each with its own
standings alongside the cumulative season table. Segments are **derived, not
stored** — there is no table and nothing to backfill.

Everything follows from two constants in `src/constants.ts`:

```ts
export const SEASON_START = '2026-09-29';
export const SEASON_END   = '2027-04-10';
```

`src/lib/segments.ts` enumerates every Saturday in that range and splits them
into three contiguous groups, giving any remainder to the earlier segments so
sizes never differ by more than one. For 2026-27 that is 28 Saturdays, split
10 / 9 / 9:

| Segment | Weeks | Range |
|---|---|---|
| 1 | 10 | 2026-10-03 → 2026-12-05 |
| 2 | 9 | 2026-12-12 → 2027-02-06 |
| 3 | 9 | 2027-02-13 → 2027-04-10 |

**Update the two constants every season.** They are the only dial controlling
where the boundaries fall — move them and every segment recomputes, including
for weeks that do not exist yet. If a boundary needs to land on a particular
date, nudge `SEASON_START`: one week later turns 28 Saturdays into 27 and
resplits them 9/9/9.

A week outside the configured range belongs to no segment. Its picks still count
toward the season total but appear in none of the three segment tables, which is
the visible signal that the constants need updating for a new year.

Scoping is total: with a segment selected, rank, wins, losses and points all
count that segment's weeks only. The Season column stays cumulative in every
scope, and a member with no picks in a segment still appears, at zero.

## Running a migration

See `supabase/README.md`. Short version: paste the file into the Supabase SQL
editor and run it. Every file is written to be re-runnable. Record what you
applied and when in the log below.

**Never apply a migration between Friday evening and the Saturday 10:00 AM
deadline.** That is the one window where a mistake stops people using the pool.

### Applied migrations

| Date | File | By |
|---|---|---|
| 2026-08-22 | `0003_pick_visibility.sql` | pool admin |
| 2026-08-22 | `0004_enforce_deadline.sql` | pool admin |

## Membership and invites

Since `0009_invites_and_membership.sql`, members sign themselves up with an
invite code. There is no hand-creating accounts any more, and — importantly —
**"Enable email signups" is now ON**. That switch used to be the only thing
keeping strangers out; the database is what keeps them out now.

### How it holds

Creating an auth account is open, and cannot be closed: `VITE_SUPABASE_ANON_KEY`
ships in the browser bundle, so anyone can call `auth.signUp`. What that gets
them is nothing. **Membership is a `profiles` row**, and the only thing that
creates one is `redeem_invite(code, name)`. There is no INSERT policy and no
INSERT grant on `profiles` for any client role.

So "signed in" and "member" are different states, and the app has three:

| Signed in | Profile | What they see |
|---|---|---|
| no | — | Login / signup |
| yes | no | "One more step" — enter an invite code |
| yes | yes | The pool |

Someone who signs up without a code sees that middle screen forever. They cannot
read the roster, cannot see a week or a game, and cannot pick.

### Opening the pool

One reusable code for everybody is the normal shape — a code is uncapped, so the
same one works for the whole pool. Mint it in **Admin Panel → Invites**, and
**set an explicit expiry**: the default is 14 days, which for a code minted at
the season opener dies in the middle of October.

Bind an email address instead to make a code personal — useful for a single late
joiner. A bound code is checked against the address on the account, read from
`auth.users` inside the function, so it cannot be spoofed by the client.

Revoke a code from the same panel once everyone is in. Claims already made are
unaffected — revoking is not un-inviting.

### The first admin — bootstrap

Chicken-and-egg, and the one profile created outside `redeem_invite`.
`admin_create_invite` gates on `is_admin()`, which reads `auth.uid()` — null in
a dashboard session — so the SQL editor cannot mint a code either.

1. Supabase → Authentication → Users → Add user (set a password).
2. In the SQL editor:
   ```sql
   insert into public.profiles (id, email, name, role)
   select id, email, 'Your Name', 'admin'
     from auth.users
    where email = 'you@example.com';
   ```
3. Sign in as that user. Admin Panel → Invites now works for everything else.

If you ever need a code before an admin exists, insert one directly rather than
calling the function:

```sql
insert into public.invites (code, expires_at)
values (public.generate_invite_code(), now() + interval '90 days')
returning code, expires_at;
```

### Supabase settings this depends on

Authentication → Providers → Email:

- **Enable signup must be ON.** With it off, self-serve signup cannot work at
  all and you are back to creating users by hand.
- **Confirm email is OFF.** `auth.signUp` returns a session, so the code is
  redeemed in the same action and the user lands straight in the pool.
  Switching it on is supported and safe — `signUp` then returns no session, the
  app says so, and the code is asked for again after the user confirms and signs
  in. That path is deliberate, not a workaround.

### Auditing

```sql
-- Every code and its state.
select code, email, created_at, expires_at, revoked_at
  from public.invites
 order by created_at desc;

-- Who joined on which code.
select c.code, p.name, p.email, c.claimed_at
  from public.invite_claims c
  join public.profiles p on p.id = c.user_id
 order by c.claimed_at desc;

-- Anyone in the pool who did NOT arrive through a code. Should be exactly the
-- founding admin, and nobody else.
select p.id, p.email, p.name, p.role
  from public.profiles p
  left join public.invite_claims c on c.user_id = p.id
 where c.user_id is null;
```

### Removing a member

Delete the auth user (Authentication → Users). `profiles.id` cascades from
`auth.users`, `picks.user_id` cascades from `profiles`, and the invite claim
cascades too — leaving the code itself open for everyone else.

### Promoting an admin

Not something the app can do: `profiles.role` is not client-writable (0001
revoked the column grant and added a trigger). From the SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'them@example.com';
```

## Local development

```bash
npm --prefix src install
npm --prefix netlify/functions install
netlify dev          # from the repo root: Vite on :3000, functions on :8888
```

Use `netlify dev`, not `npm run dev` — the plain Vite server does not serve the
functions, so the schedule fetch and score sync will fail.

The cron does not fire in `netlify dev`. Run it by hand:

```bash
netlify functions:invoke scheduled-sync
```

It takes no input, so that is the whole invocation. It will act on the real
database your `.env` points at — which is production, unless you have a separate
Supabase project.

Checks:

```bash
npm --prefix src run typecheck   # covers src/ AND netlify/functions/
npm --prefix src test
npm --prefix src run build
```

`typecheck` needs both dependency trees installed, since it typechecks the
functions against `netlify/functions/node_modules`.

There is no linter and no CI. `vite build` does **not** typecheck, so run
`typecheck` explicitly before pushing — that is how twelve type errors accumulated
unnoticed.

## When the NHL API changes shape

`nhl-schedule` reads `data.gameWeek[0].games`; `sync-week` reads `data.games`
from `/v1/score/{date}` and falls back to `/v1/schedule/{date}`. Both filter to
the requested ET date, because a 7 PM ET Saturday game is midnight UTC Sunday. If
games stop appearing, check those response shapes first — the endpoints are
undocumented and unversioned in practice.
