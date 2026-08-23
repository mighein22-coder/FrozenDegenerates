# App Assessment: Security, Reliability & Production Readiness

## Verdict
**Not quite ready for primetime as-is.** Functionally solid for core pick submission and scoring, but has 4 critical issues that must be fixed first.

**Update 2026-08-21:** the RLS review in item 10 found four further critical
issues (15–18). The database currently relies on the client to enforce scoring,
pick secrecy and the weekly deadline; none of the three is enforced by a policy.
Treat the pool's standings as tamperable until 15–18 are closed.

---

## CRITICAL — Fix Before Any Real Users Touch This

- [x] **1. Pick Deadline Is Wrong (Noon ET, Not 10 AM ET)** ✅
  - Fixed `src/lib/timezone.ts:62` — changed hour `12` → `10`

- [x] **2. No Password Reset Flow** ✅
  - Added "Forgot password?" link on login page with full reset flow

- [x] **3. `sync-week` Function Has No Authentication** ✅
  - Added `x-sync-secret` header validation in function
  - Frontend now passes `VITE_SYNC_WEEK_SECRET` with each sync request
  - **Superseded by #26.** That header check authenticated nobody: the client's
    copy of the secret shipped in the public bundle. Now a verified Supabase
    access token

- [x] **4. Picks View Shows Blank Screen on Load Failure** ✅
  - Added loading spinner and error state with retry button for Picks view

- [x] **15. Members Can Write Their Own Scores** ✅
  - `picks` UPDATE policy is `USING (auth.uid() = user_id)` with no `WITH CHECK`
    and no column restriction, and `authenticated` holds UPDATE on every column.
  - `getStandings()` sums `points_earned` and counts `result` straight off the
    `picks` rows — so a member can set `points_earned` on their own picks and
    take first place in one REST call. No exploit needed beyond the anon key.
  - **The same hole existed on INSERT**, which this entry missed: the insert
    policy checks `user_id` and the deadline but no columns, so a sheet could be
    inserted already scored.
  - **And it was permanent, not transient.** `sync-week` resolves only picks with
    `result = 'PENDING'`, so a pick already claiming `'WIN'` is skipped by every
    later sync. A forged score is never corrected.
  - `0004` did not close this: its `WITH CHECK` tests ownership and the deadline,
    both of which a member forging their own open-week picks satisfies.
  - Fixed by `supabase/migrations/0006_lock_pick_score_columns.sql`. Rather than
    narrowing UPDATE to `selected_team_id`/`confidence` as planned here, client
    UPDATE is revoked outright — nothing in the client updates `picks` at all now
    that `savePicks` goes through the `save_picks` RPC. INSERT is narrowed to the
    five pick columns, and a trigger blocks the two score columns as a second
    layer.
  - Applied 2026-08-23. The two damage-check queries were run first and came back
    clean — no forged scores, so nothing needed repairing.

- [x] **16. Anyone Can Rewrite Game Scores** ✅
  - `games` carries `Anyone can update games` (UPDATE, roles=`public`,
    `USING (true)`) and `Anyone can insert games` (INSERT, roles=`public`,
    `WITH CHECK (true)`). Not limited to members — the anon key is in the
    browser bundle.
  - Any visitor can set `home_score` / `away_score` / `status` on any game,
    which then drives `calculatePickResults` and the standings.
  - Same wound as #15, one table upstream: locking `picks.points_earned` achieves
    little if the game a pick refers to can be flipped instead, leaving
    `sync-week` to compute a wrong result from data it trusts.
  - Fixed by `supabase/migrations/0007_lock_game_score_writes.sql`. Both public
    policies dropped; UPDATE and DELETE revoked from client roles outright;
    INSERT narrowed to the six columns the schedule feed supplies, with a trigger
    forcing client-inserted games to `SCHEDULED`/`null`/`null`.
  - INSERT survives because seeding a week's schedule is a normal member action
    (`saveGames`), not an admin one. Scoring is unaffected — `sync-week` uses the
    service-role key, as this entry anticipated.
  - `weeks` deliberately untouched; where its writes belong is #10, still open.
  - Applied 2026-08-23, with the two damage-check queries run beforehand.

- [x] **17. Everyone's Picks Are Public Before the Deadline** ✅
  - `picks` SELECT policy is `USING (true)` for `public`, unconditionally.
  - A member can read every other member's picks before Saturday's deadline,
    which defeats the point of the pool.
  - **Duplicate of #21** — same finding, recorded twice. Fixed by
    `supabase/migrations/0003_pick_visibility.sql`, applied 2026-08-22:
    `picks_select_own_or_revealed` gates other members' sheets behind
    `picks_revealed(week_id)` and always shows your own, which is exactly the
    fix proposed here. Verified after applying — `picks` carries exactly one
    SELECT policy, so no permissive policy survived the swap.

- [ ] **18. Pick Deadline Is Not Enforced Server-Side** 🔴 — half closed
  - `picks` UPDATE/DELETE policies carry no deadline condition, and `weeks`
    has `Allow authenticated users to update weeks` (UPDATE, `USING (true)`)
    plus `Anyone can insert weeks` (INSERT, roles=`public`).
  - The 10 AM ET lock is enforced only in the client (`arePicksLocked` gating
    the UI). A member can change picks after games start, and can flip a week's
    status back to `OPEN`.
  - **The `picks` half is done** — duplicate of #24, fixed by
    `0004_enforce_deadline.sql`, applied 2026-08-22. The write policies now carry
    `not picks_revealed(week_id)`.
  - **The `weeks` half is still open, and it undoes the other half.**
    `picks_revealed()` reads `weeks.saturday_date`. With `UPDATE USING (true)`
    and no column restriction, any member can move that date and thereby move
    their own deadline:

    ```sql
    update weeks set saturday_date = '2027-01-01' where id = 'week-2026-10-11';
    ```

    From there `picks_revealed()` returns false, `0004`'s policies allow writes
    again, and re-submitting a sheet after the games are final produces five
    fresh `PENDING` rows that the next `sync-week` scores against known results.
    A perfect week, on demand. This defeats `0003`, `0004`, `0005` and `0006`
    together — none of them are wrong, they all just trust this one column.
  - `Anyone can insert weeks` is addressed to `public`, so a logged-out visitor
    can create week rows as well.
  - Fix: the same treatment `0007` gave `games`, plus a trigger tying
    `saturday_date` to the date encoded in the week `id` and requiring it to be
    a Saturday, so the deadline cannot be restated. Overlaps #10 — decide there
    whether week creation moves server-side entirely.

---

## HIGH — Fix Before Season Is in Full Swing

- [x] **5. `week_number` Is Wrong (Week-of-Month, Not Season Week)** ✅
  - Fixed: Week number now calculated from Oct 1 (NHL season start), not day-of-month

- [x] **6. Delete-Then-Insert Picks Not Atomic (Data Loss Risk)** ✅
  - Improved error handling; added clear message if insert fails after deletion

- [x] **7. All Error Catches Are Silent (Blank Screens)** ✅
  - Added visible error banner at top of app when critical data loads fail
  - Users see error message and can dismiss/retry

- [x] **8. No Admin Panel** ✅
  - Built AdminView with: manual sync trigger, week status toggle, user directory
  - Only visible to users with role='admin'
  - Accessible from sidebar for admin users

- [x] **9. No Account Management** ✅
  - Built SettingsView: change display name, avatar URL, and password
  - Password change re-authenticates with the current password first
  - Accessible from the sidebar ("Settings") for all members
  - Email remains read-only (changing it needs a confirm flow + `profiles.email` sync)

- [x] **10. RLS Policies Unverified** — verified 2026-08-21, and they do not hold ✅
  - RLS is **enabled** on `profiles`, `picks`, `games`, `weeks` — but the policies
    on top of it are permissive enough that it buys very little. Live state
    confirmed by querying `pg_policies` / `pg_class` against the production
    project. Findings are broken out as items 15–18 below.
  - `anon` and `authenticated` hold blanket INSERT/UPDATE/SELECT on every
    column of `profiles`; only the policies gate them.
  - Confirmed both pending migrations' premises are accurate:
    `profiles` has **no INSERT policy** (so `0002` is needed as written), and the
    `Users can update own profile` policy has **`with_check = null`** (so `0001`
    is needed as written). Both were applied 2026-08-21.
---

## Found during the 2026-08 cleanup

- [x] **21. Picks Readable by Every Player Before the Deadline** ✅
  - Policy on `picks` was `SELECT USING (true)` — the UI hid other players'
    picks, but one query from the browser console returned the whole league's
    open-week sheet
  - Fixed by `supabase/migrations/0003_pick_visibility.sql`, applied 2026-08-22
  - Note the limit: RLS does not restrict the Supabase dashboard or the
    service-role key, so this stops casual access, not the project owner

- [x] **22. Month-End Saturdays Could Never Close on Time** ✅
  - `sync-week`'s hand-rolled DST helper built the Sunday date by string
    concatenation, so `2026-10-31` became `2026-10-32` — an invalid Date.
    Comparisons against NaN are false, so `pastSunday4AM` was permanently false
    and the week could only close if every game went FINAL. 2026-10-31 is a
    Saturday this season
  - Fixed by sharing `src/lib/timezone.ts`; covered by a regression test

- [x] **23. `Week` Row Shape and App Type Used Interchangeably** ✅
  - `getCurrentWeek()` returned the raw snake_case row, `getAllWeeks()` returned
    camelCase, both typed as `Week`; `App.tsx` read both spellings
  - DB types renamed to `*Row`; cleared 12 typecheck errors `vite build` never showed

- [x] **24. Pick Deadline Enforced Only in Browser JavaScript** ✅
  - `savePicks` checked the deadline client-side; the RLS policies carried no
    time condition, so picks could be rewritten from the console after games started
  - Fixed by `supabase/migrations/0004_enforce_deadline.sql`, applied 2026-08-22
  - Verified not to affect scoring: `sync-week` uses the service-role key, which
    bypasses RLS, so picks still resolve and weeks still close after the deadline

- [x] **25. `savePicks` Can Lose a Member's Picks** ✅
  - Deleted all picks for the week then inserted the new set, with no transaction.
    A failure between the two lost them. #6 above marked this fixed, but only
    the error message improved
  - Fixed by `supabase/migrations/0005_save_picks_rpc.sql`: `savePicks` now makes
    a single `save_picks` RPC call that does both statements in one transaction
  - The RPC runs as the caller, not `security definer`, so the `0004` policies
    still govern it and the deadline rule is not duplicated. `now()` is fixed for
    the transaction, so `picks_revealed()` answers the delete and the insert
    identically — the 10:00 boundary case #24 opened is refused whole, with the
    member's previous sheet intact
  - Applied 2026-08-23. `prosecdef` verified false, and the partial-sheet audit
    query in `supabase/README.md` returned zero rows — no sheet was lost while
    the bug was live

- [x] **26. `VITE_SYNC_WEEK_SECRET` Is Not Secret** ✅
  - Vite inlines `VITE_*` into the public bundle, so the shared secret guarding
    `sync-week` shipped to every visitor — the endpoint was effectively
    unauthenticated, and it holds a service-role client
  - Fixed: the client sends its Supabase access token as `Authorization: Bearer`,
    and `sync-week` verifies it with `auth.getUser()` before doing anything
  - **Not** gated on `profiles.role`, contrary to the original note here. `App.tsx`
    syncs on login and on the results view for every member, so an admin-only gate
    would freeze scoring until an admin signed in — breaking the "compute results
    when a user logs in" requirement. Any authenticated member is the correct gate
  - Both env vars deleted from the Netlify dashboard 2026-08-23

---

## MEDIUM — Quality Improvements

- [x] **11. Results Matrix Has No Mobile Layout** ✅
  - Added a card-per-player mobile view; cell logic shared with the desktop matrix

- [x] **12. N+1 Queries in TeamStats and MyHistory** ✅
  - Replaced both per-week loops with batched `.in()` queries

- [x] **13. `syncScores` Called on Every Results Tab/Week Change** ✅
  - Skipped for COMPLETED weeks; `getRecentIncompleteWeeks` no longer returns them

- [x] **14. Dashboard "Make Picks" CTA Stale After Submission** ✅
  - CTA now reflects incomplete / submitted / locked

- [x] **15. `dateStr` Not Validated Before NHL URL Interpolation** ✅
  - Added format guards returning 400 in `nhl-schedule` and `sync-week`

---

## LOW — Housekeeping

- [x] **16. Tied Players Get Different Ranks (No Tiebreaker)** ✅
  - Sort by points, then wins, then name; competition ranks in `lib/standings.ts`

- [x] **17. `sync-scores.ts` Appears to Be Dead Code** ✅
  - Confirmed dead and deleted

- [x] **18. Stale/Unused Dependencies** ✅
  - Removed `recharts`, `react-hot-toast`, `@google/genai`

- [x] **19. Stale `CURRENT_WEEK_ID = 'week-5'` Constant** ✅
  - Removed

- [x] **20. Comment/Code Mismatches** ✅
  - `sync-week` now imports the shared ET helpers; the duplicated DST logic is gone

---

## Immediate Security Checks (Do Manually)

1. **Check git history for committed secrets:**
   ```bash
   git log --all --full-history -- .env src/.env.local
   ```
   If they appear, rotate the Gemini API key immediately.

2. **Verify Supabase RLS** — confirm UPDATE on `games` and `picks` is restricted to service role only.

3. **Confirm Supabase public signups are disabled** — Authentication → Settings → disable "Enable email signups".
