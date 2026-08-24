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
      (`supabase/migrations/0003_pick_visibility.sql`).
- [x] Enforce the pick deadline in the database
      (`supabase/migrations/0004_enforce_deadline.sql`).
- [x] Season segments — three auto-computed thirds with their own standings,
      selectable alongside the cumulative season table. No schema change.
- [x] URL routing. Views are driven by the URL, so every screen is linkable
      and the back button works. `/auth/callback` is now a real route.
- [x] Allowlist `/auth/callback` in Supabase → Authentication → URL
      Configuration. Done 2026-08-22, and password reset verified end to end
      against the live site. No app change could substitute for this.
- [x] Fix the broken password reset. `LoginView` sent users to
      `/auth/callback`, which nothing handled, so reset links dead-ended with
      no way to choose a new password. `AuthCallbackView` now reads the
      load-time auth snapshot, which has to be taken before supabase-js erases
      the URL fragment.
- [x] Profile / account settings — name, avatar, password. Landed on `main`
      separately while this work was in review, not part of this branch.

---

## Next up

### Needs a decision or an action from the pool admin

- [x] #10 Verify RLS on `weeks` and `games`. ✅ Decided: those writes stay
      client-side but locked down, rather than moving server-side. Seeding a week
      and its schedule is a normal member action, so `0007` and `0008` keep
      member INSERT while narrowing it to the columns the app actually supplies,
      revoke client UPDATE except the admin-gated week `status`, and add trigger
      guards. Moving seeding into a function remains possible later; it is no
      longer a security question.

### Known issues not yet scheduled

- [x] **`savePicks` can lose picks.** ✅ Fixed by
      `supabase/migrations/0005_save_picks_rpc.sql` — `savePicks` now makes one
      `save_picks` RPC call that deletes and inserts in a single transaction, so
      the boundary case `0004` opened can no longer lose a sheet. `0005` applied
      2026-08-23; the partial-sheet audit query in `supabase/README.md` returned
      zero rows, so nothing was lost while the bug was live.
- [x] `VITE_SYNC_WEEK_SECRET` is inlined into the public JS bundle, so the shared
      secret guarding `sync-week` is readable by anyone. ✅ Replaced with a
      Supabase access token the function verifies via `auth.getUser()`. Gated on
      *any* authenticated member rather than an admin role check as first
      planned — scoring runs whenever any member opens the app, so admin-only
      would freeze it. Both env vars deleted from Netlify 2026-08-23.
- [x] **Members can write their own scores** (ASSESSMENT #15). ✅ `points_earned`
      and `result` — the columns the standings are summed from — were writable
      by any member via UPDATE *or* INSERT, and `sync-week` only ever re-scores
      `PENDING` picks, so a forged score stuck for the season. Fixed by
      `supabase/migrations/0006_lock_pick_score_columns.sql`: client UPDATE on
      `picks` revoked outright, INSERT narrowed to the five pick columns, plus a
      trigger guard. `0006` applied 2026-08-23; the two damage-check queries were
      run first and came back clean, so no forged score ever made the standings.
- [x] **Anyone can rewrite game scores** (ASSESSMENT #16). ✅ `games` carried
      `UPDATE using (true)` and `INSERT with check (true)` for role `public` —
      the anon key, so even a logged-out visitor could set `home_score` /
      `away_score` / `status` and move the standings. Fixed by
      `supabase/migrations/0007_lock_game_score_writes.sql`: public policies
      dropped, client UPDATE/DELETE revoked, INSERT narrowed to the six schedule
      columns, plus a trigger guard. `0007` applied 2026-08-23, with the two
      damage-check queries run beforehand.
- [x] ✅ **`weeks` was writable by any member, which reopened the deadline**
      (ASSESSMENT #18, second half). `picks_revealed()` reads
      `weeks.saturday_date`, and `weeks` carried `UPDATE USING (true)` for
      authenticated plus `INSERT` for `public`. A member could move their own
      deadline with one statement, then re-submit a sheet after the games finished
      and let `sync-week` score it against known results — defeating `0003`–`0006`
      without breaking any of them. Fixed by
      `supabase/migrations/0008_lock_week_deadline_writes.sql`, which derives
      `saturday_date` from the week `id` instead of trusting the client.
      **Pool admin: run the damage-check queries at the bottom of `0008`, then
      apply it.**

### Planned features

- [ ] Automated score sync on a schedule. Scores only move today when a human
      opens the app.
- [ ] Self-serve signup gated by invites.
- [ ] Email notifications — Friday pick reminder and a post-week results mail.
