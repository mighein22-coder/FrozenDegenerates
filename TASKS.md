# Tasks

Working task list for IcePick. `CLAUDE.md` asks every session to read this
before starting and to mark items done as they land.

Status docs: this file plus `ASSESSMENT.md` (findings and their severity).
Operational detail lives in `docs/OPERATIONS.md`.

---

## In progress

Nothing currently in flight.

## Done

### Cleanup (ASSESSMENT #11–#20 and drift)

- [x] Unify the `Week` shape — `getCurrentWeek()` returned a raw snake_case row
      while `getAllWeeks()` returned camelCase, both typed as `Week`. Renamed the
      DB types to `*Row` and mapped at the service boundary. Cleared 12
      pre-existing typecheck errors that `vite build` never surfaced.
- [x] #16 Standings tiebreaker — points, then wins, then name, with competition
      ranks so tied players share a rank.
- [x] #15 Validate `dateStr` / `weekId` before interpolating into NHL API URLs.
- [x] #12 Batch the N+1 loaders in Team Stats and My History (`.in()` queries).
- [x] #13 Skip `sync-week` for COMPLETED weeks, and stop `getRecentIncompleteWeeks`
      returning them.
- [x] #11 Mobile card layout for the results matrix.
- [x] #14 Dashboard CTA reflects incomplete / submitted / locked.
- [x] Remove the dead `/index.css` link (404 on every page load).
- [x] #17–#19 Dead code: `sync-scores`, `geminiService`, `fetchRealNhlSchedule`,
      `_ul`, `deno.lock`, six unreferenced service methods, `CURRENT_WEEK_ID`,
      PicksView's unused `weeks` prop, and the `recharts` / `react-hot-toast` /
      `@google/genai` dependencies.
- [x] Rename `gemini-schedule` → `nhl-schedule` (it never used Gemini), keeping a
      re-export alias for one release.
- [x] #20 Share the ET helpers with the Netlify functions instead of hand-rolling
      DST in `sync-week`. **This fixed a real bug**: the duplicate built the
      Sunday date by string concatenation, so a month-end Saturday produced an
      invalid date and the week could never close on the time condition.
      2026-10-31 is a Saturday this season.
- [x] Add vitest, with timezone and standings specs (18 tests) and a `typecheck`
      script.

### Features

- [x] Hide other players' picks until the week locks
      (`supabase/migrations/0001_pick_visibility.sql`).

---

## Next up

### Needs a decision or an action from the pool admin

- [ ] **Apply `0001_pick_visibility.sql`.** Run the policy-audit query in
      `supabase/README.md` first — the deployed policy names were created by hand
      and may not match what the migration drops.
- [ ] **Decide on `0002_enforce_deadline.sql`** (optional). Without it the
      deadline stays enforced only in browser JavaScript.
- [ ] #10 Verify RLS on `weeks` and `games`. The anon client inserts weeks and
      games and updates week status, so the deployed policies must permit any
      authenticated member to do the same. Decide whether to move those writes
      server-side or gate them on `profiles.role`.

### Known issues not yet scheduled

- [ ] **`savePicks` can lose picks.** It deletes all of a user's picks for the
      week then inserts the new set, with no transaction. If the insert fails
      after the delete, the picks are gone. `ASSESSMENT.md` #6 marked this fixed,
      but only the error message improved. Fix: a `save_picks` RPC doing both in
      one transaction.
- [ ] `VITE_SYNC_WEEK_SECRET` is inlined into the public JS bundle, so the shared
      secret guarding `sync-week` is readable by anyone. Replace with a verified
      Supabase JWT plus an admin role check.

### Planned features

- [ ] Season segments — three auto-computed thirds with their own standings,
      alongside the cumulative season table. No schema change; derived in code
      from `SEASON_START` / `SEASON_END`.
- [ ] URL routing and a real `/auth/callback`. Password reset links currently
      dead-end: `LoginView` sends users to a route that does not exist, and there
      is no set-new-password form.
- [ ] Profile / account settings (#9) — name, avatar, password.
- [ ] Automated score sync on a schedule. Scores only move today when a human
      opens the app.
- [ ] Self-serve signup gated by invites.
- [ ] Email notifications — Friday pick reminder and a post-week results mail.
