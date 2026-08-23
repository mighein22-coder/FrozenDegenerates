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

- [ ] #10 Verify RLS on `weeks` and `games`. The anon client inserts weeks and
      games and updates week status, so the deployed policies must permit any
      authenticated member to do the same. Decide whether to move those writes
      server-side or gate them on `profiles.role`.

### Known issues not yet scheduled

- [x] **`savePicks` can lose picks.** ✅ Fixed by
      `supabase/migrations/0005_save_picks_rpc.sql` — `savePicks` now makes one
      `save_picks` RPC call that deletes and inserts in a single transaction, so
      the boundary case `0004` opened can no longer lose a sheet. **Needs the
      pool admin to apply `0005`;** until then saving picks fails outright, since
      the client no longer has a delete-then-insert path. Also run the
      partial-sheet audit query in `supabase/README.md`, which finds any sheet the
      old bug already lost.
- [ ] `VITE_SYNC_WEEK_SECRET` is inlined into the public JS bundle, so the shared
      secret guarding `sync-week` is readable by anyone. Replace with a verified
      Supabase JWT plus an admin role check.

### Planned features

- [ ] Automated score sync on a schedule. Scores only move today when a human
      opens the app.
- [ ] Self-serve signup gated by invites.
- [ ] Email notifications — Friday pick reminder and a post-week results mail.
