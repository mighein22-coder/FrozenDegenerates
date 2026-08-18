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
| `VITE_SYNC_WEEK_SECRET` | Sent as `x-sync-secret` when the app triggers a sync. **Despite the name this is not secret** — it ships in the bundle. Tracked in `TASKS.md`. |

**Functions only — never sent to the browser.**

| Name | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Full database access, bypasses RLS. Used by `sync-week`. |
| `SYNC_WEEK_SECRET` | Server side of the `x-sync-secret` check. |
| `SUPABASE_URL` | Optional; `sync-week` falls back to this if `VITE_SUPABASE_URL` is unset. |

## Functions

| Function | Trigger | What it does |
|---|---|---|
| `nhl-schedule` | App, when a week has no games yet | Proxies `api-web.nhle.com/v1/schedule/{date}` and returns rows shaped for insert. No auth. |
| `gemini-schedule` | Legacy path | Re-export of `nhl-schedule`, kept so cached browser bundles don't 404. Safe to delete after a release. |
| `sync-week` | App on login and on the results view; admin panel | The workhorse. Service-role client: marks games FINAL with scores, resolves PENDING picks (win → points = confidence), and marks the week COMPLETED once all games are final or it is past 4:00 AM ET Sunday. Idempotent. |
| `team-records` | Picks view | `standings/now` → `{ABBR: "W-L-OTL"}`, cached an hour. No auth. |

`netlify/functions/_shared/etTime.ts` re-exports the app's timezone helpers so
the functions and the browser agree on when a week locks and closes. Do not
reimplement DST logic in a function — that is exactly the bug that was removed.

## The weekly cycle

| When (ET) | What happens |
|---|---|
| Monday 6:00 AM | `getTargetSaturdayDate()` rolls over to the coming Saturday. The next member to log in creates the `weeks` row and the app fetches that Saturday's games. |
| Through the week | Members submit five picks with unique confidence 1–5. |
| **Saturday 10:00 AM** | Pick deadline. Picks lock and, once `0001` is applied, everyone's picks become visible to everyone. |
| Saturday evening | Games play. Scores update only when somebody opens the app — see the caveat below. |
| Sunday 4:00 AM | The week is marked COMPLETED, whether or not every game went final. |

**Weeks are created lazily, by whoever logs in first after Monday 6 AM.** If
nobody logs in, no week exists and no games are fetched. There is no scheduled
job doing this.

**Scores only sync when a human loads the app.** `sync-week` runs on login and on
the results view. If nobody opens the app all weekend, standings stay stale until
someone does. Automating this is on the roadmap in `TASKS.md`.

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
| _(not yet applied)_ | `0001_pick_visibility.sql` | |
| _(optional, undecided)_ | `0002_enforce_deadline.sql` | |

## Adding a member

There is no signup UI — `useAuth` has a `signUp` function wired to nothing.
Accounts are created by hand:

1. Supabase → Authentication → Users → Add user (set a password).
2. Copy the new user's UUID.
3. In the SQL editor:
   ```sql
   insert into profiles (id, email, name, role)
   values ('<uuid>', '<email>', '<display name>', 'member');
   ```

A member without a `profiles` row can log in but the app shows no profile. Keep
"Enable email signups" **disabled** in Supabase — it is currently the only thing
stopping strangers creating accounts.

## Local development

```bash
npm --prefix src install
npm --prefix netlify/functions install
netlify dev          # from the repo root: Vite on :3000, functions on :8888
```

Use `netlify dev`, not `npm run dev` — the plain Vite server does not serve the
functions, so the schedule fetch and score sync will fail.

Checks:

```bash
npm --prefix src run typecheck
npm --prefix src test
npm --prefix src run build
```

There is no linter and no CI. `vite build` does **not** typecheck, so run
`typecheck` explicitly before pushing — that is how twelve type errors accumulated
unnoticed.

## When the NHL API changes shape

`nhl-schedule` reads `data.gameWeek[0].games`; `sync-week` reads `data.games`
from `/v1/score/{date}` and falls back to `/v1/schedule/{date}`. Both filter to
the requested ET date, because a 7 PM ET Saturday game is midnight UTC Sunday. If
games stop appearing, check those response shapes first — the endpoints are
undocumented and unversioned in practice.
