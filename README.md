# IcePick — NHL Regular Season Pick'em Pool

A web app for running a Saturday-night NHL pick'em pool for 10–20 people.

Each week members pick five of Saturday's games and rank them by confidence 1–5.
Correct picks score their confidence value; the pool tracks weekly and cumulative
standings, win-loss records, and every member's pick history.

The season is also split into three roughly equal segments, each with its own
standings — so a slow start doesn't put the rest of the year out of reach.

**Status:** deployed and running a live season.

## How it works

| When (ET) | What happens |
|---|---|
| Monday 6:00 AM | The week rolls over to the coming Saturday; the app fetches that day's NHL schedule |
| Through the week | Members pick five games and assign confidence 1–5, no duplicates |
| **Saturday 10:00 AM** | Picks lock, and the league's selections become visible |
| Saturday evening | Games play; scores sync from the NHL API |
| Sunday 4:00 AM | The week closes and results are final |

## Views

**Dashboard** — rank, total points, record, and where you are in the current week.
**Saturday Picks** — the week's games, with team records and a live deadline countdown.
**Standings** — league leaderboard, switchable between the three season segments and the full season.
**League Matrix** — everyone's picks for a week, once the deadline has passed.
**My History** — your season, week by week.
**Team Affinity** — each member's most-picked teams.
**Admin** — manual score sync, week status, member directory (admins only).

## Tech stack

- **Frontend** — React 19, TypeScript, Vite. Tailwind via CDN; there is no CSS build step.
- **Backend** — Supabase (Postgres + Auth), accessed directly from the browser under Row Level Security.
- **Serverless** — Netlify Functions for the NHL API proxy and server-side score sync.
- **Hosting** — Netlify.

The NHL schedule and scores come from the public `api-web.nhle.com` endpoints. No
AI service is involved — an earlier version used Gemini for schedule fetching and
that has been fully removed.

## Getting started

```bash
npm --prefix src install
npm --prefix netlify/functions install
cp src/.env.example src/.env.local   # fill in your Supabase credentials
netlify dev                          # from the repo root
```

Use `netlify dev` rather than `npm run dev` — the plain Vite server does not serve
the functions, so schedule fetching and score sync will fail.

Checks before pushing:

```bash
npm --prefix src run typecheck   # vite build does NOT typecheck
npm --prefix src test
npm --prefix src run build
```

## Documentation

| File | Purpose |
|---|---|
| `docs/OPERATIONS.md` | Runbook — env vars, the weekly cycle, functions, adding a member, migrations |
| `TASKS.md` | Current work and backlog |
| `ASSESSMENT.md` | Findings by severity, and what has been fixed |
| `supabase/README.md` | Database migrations and how to apply them |
| `PLANNING.md` | Historical record of the prototype-to-production plan |

`prototype_code/` holds the original localStorage prototype, preserved as a
reference. It is never built or deployed.

## Known gaps

Tracked in full in `TASKS.md`. The ones worth knowing up front:

- **Scores only sync when someone opens the app.** There is no scheduled job.
- **Weeks are created lazily** by whoever logs in first after Monday 6 AM.
- **No signup UI.** Accounts are created by hand in the Supabase dashboard.
- **Password reset is broken** — the reset email points at `/auth/callback`, a
  route that does not exist.
- **`savePicks` is not transactional** and can lose a member's picks if the
  insert fails after the delete.

## Cost

Free tier throughout — Supabase (500 MB, 50k MAU) and Netlify (100 GB bandwidth,
300 build minutes) are both far above what a 20-person pool needs. The NHL API is
public and unauthenticated.
