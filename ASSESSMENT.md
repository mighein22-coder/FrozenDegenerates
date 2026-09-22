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

- [x] **18. Pick Deadline Is Not Enforced Server-Side** ✅
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
  - Fixed by `supabase/migrations/0008_lock_week_deadline_writes.sql`: INSERT
    limited to members and UPDATE to admins (`is_admin()`), members may insert
    four columns and update only `status`, and a trigger **derives
    `saturday_date` from the week `id`** rather than trusting it. The client
    already builds both from the same string, so this costs nothing and removes
    the ability to state a deadline at all.
  - Settles the write half of #10 as well: week and game creation stay
    client-side, but locked down, rather than moving server-side.
  - Applied 2026-08-23. The damage-check queries were run first and came back
    clean — no deadline had been moved.

- [x] **27. The pick deadline was not enforced in the database — 0004 was not in
  effect.** ✅ **Found 2026-09-14 by the `0000` baseline capture; closed
  2026-09-21 by re-applying `0004`.**
  - `0004_enforce_deadline.sql` replaces three `picks` policies with versions
    carrying `and not picks_revealed(week_id)`, named `picks_insert_own`,
    `picks_update_own` and `picks_delete_own`. **None of the three exists in
    production.** What is there instead is the original set — `"Users can insert
    own picks"`, `"Users can update own picks"`, `"Users can delete own picks"`,
    all `to public`, all checking ownership and nothing else. Those are the
    exact policies `0004` drops by name, so either it was never applied or it
    was undone afterwards; the capture cannot tell which.
  - **Why the 2026-08-22 verification missed it.** `supabase/README.md` records
    the check as "`picks` carries exactly four policies (one per command), and
    exactly one of them is a SELECT policy". Both the fixed and the unfixed
    state satisfy that sentence exactly — four policies either way. The check
    counted policies without reading them.
  - **This is exploitable now.** `authenticated` holds table-wide DELETE on
    `picks` and INSERT on the five pick columns. After the Saturday 10:00 ET
    deadline a member can, with the anon key and their own session:
    delete their sheet for the locked week, insert a new one, and let the next
    `sync-week` score it. `enforce_pick_score_guard` forces the new rows to
    `PENDING`/`0`, which is precisely what the attack wants — `sync-week`
    resolves PENDING picks and awards the confidence.
  - The window runs from 10:00 ET Saturday until the week is marked COMPLETED
    (all games final, or 4:00 AM ET Sunday). Afternoon games are final long
    before that, so the results of real games are knowable inside it.
  - **The app itself is not the exposure.** `save_picks` carries its own
    `if picks_revealed(p_week_id) then raise` and refuses a late sheet, so
    nothing reachable through the UI can do this. The hole is the REST endpoint,
    which the policies alone guard. (Worth noting `supabase/README.md` states
    the opposite — "there is no second copy of the deadline rule inside it" —
    and the live function body disproves that too.)
  - **Fixed 2026-09-21 by re-running `0004` as it stands.** It is idempotent, it
    grants nothing, and it touches only these three policies, so it could not
    disturb `0006`'s revoked UPDATE or anything else later in the series. The
    pre-flight confirmed the open week reported unlocked beforehand — skipping
    that is how you lock the pool out of submitting — and a member submitted a
    sheet successfully afterwards. Re-verified by reading the policies rather
    than counting them:

    ```sql
    select policyname, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public' and tablename = 'picks'
     order by cmd;
    ```

    Every one of INSERT, UPDATE and DELETE must mention `picks_revealed`. All
    three did.
  - **Damage check — run 2026-09-21, before fixing: zero rows.** Nothing was
    ever created after its own week's deadline, so the gap was never exploited
    and no sheet needed repairing. A sheet rewritten after its deadline
    keeps its original `created_at` only if the attacker preserved it, and they
    cannot: `created_at` defaults to `now()` on insert and the column is not in
    their INSERT grant. So a pick created after its own week's deadline is the
    signature:

    ```sql
    select p.user_id, pr.name, p.week_id, p.created_at, w.saturday_date
      from public.picks p
      join public.weeks w on w.id = p.week_id
      left join public.profiles pr on pr.id = p.user_id
     where p.created_at > ((w.saturday_date + time '10:00') at time zone 'America/New_York')
     order by p.week_id, pr.name;
    ```

    Expect zero rows. Any row is a sheet submitted or rewritten after its
    deadline — which is not proof of cheating, since a legitimate late insert by
    an admin would look the same, but every one needs explaining. Worth
    re-running after any future migration work on `picks`.
  - **The lesson worth keeping.** This survived a review and a verification step
    because the verification counted policies instead of reading them. The
    policy-test harness that `0000` unblocks is the thing that would have caught
    it in August rather than in September.

- [ ] **28. `save_picks` cannot insert — nobody can submit a pick sheet.**
  ⚠️ **Live. Found 2026-09-21 by the first run of `supabase/test/run.sh`.**
  - `0005` builds the insert from the JSON payload and passes `e->>'gameId'`
    — text — into `picks.game_id`, which is `uuid`. Postgres does not coerce
    text to uuid in assignment context, so the statement raises:
    `column "game_id" is of type uuid but expression is of type text`.
  - The other four columns are fine, which is why this reads as correct:
    `user_id` is already uuid, `week_id` and `selected_team_id` are text, and
    `confidence` carries an explicit `::int`. `game_id` is the one that needed
    a cast and did not get one.
  - **Since `savePicks` routes through this function, pick submission has been
    broken since `0005` was applied on 2026-08-23.** Nobody hit it because the
    NHL regular season had not started — there was nothing to submit. The first
    member to try in October would have.
  - Fixed by `supabase/migrations/0010_fix_save_picks_game_id_cast.sql`.
    **Not yet applied to production.**
  - Before applying, confirm production really has the bug — a project-level
    permissive cast would mask it:

    ```sql
    select castsource::regtype, casttarget::regtype, castcontext
      from pg_cast
     where casttarget = 'uuid'::regtype;
    ```

    A text→uuid row with `castcontext` 'a' or 'i' means the live function
    works. No row — stock Postgres — means it does not. Applying `0010` is
    correct either way.
  - **How three readings missed it.** This function was read closely when
    `0005` was written, again during the `0004` investigation, and again when
    the baseline capture was assembled. Every reading was about *policies and
    authorisation*, and the bug is a type error two lines below the part
    everyone was looking at. Executing it caught it in seconds.
  - Note the capture gap this exposes: `baseline/capture.sql` does not read
    `pg_cast`, so the repo cannot rule out the masking cast on its own.

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

- [x] **24. Pick Deadline Enforced Only in Browser JavaScript** ✅ — reopened
  2026-09-14, closed again 2026-09-21. See #27.
  - `savePicks` checked the deadline client-side; the RLS policies carried no
    time condition, so picks could be rewritten from the console after games started
  - Fixed by `supabase/migrations/0004_enforce_deadline.sql`, recorded as applied
    2026-08-22 — but the 2026-09-14 schema capture found none of the three
    policies it creates. Whatever happened on 2026-08-22, the database did not
    have them a month later. Re-applied and properly verified 2026-09-21.
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

1. [x] **Check git history for committed secrets** ✅
   ```bash
   git log --all --full-history -- .env src/.env.local
   ```
   Run 2026-09-13, widened to `*.env*` across every ref and to a pattern scan of
   all history blobs for `AIza…` / `eyJhbGciOi…` / `sk-…` strings. The only env
   file ever committed is `src/.env.example`, which has carried placeholders from
   its first commit. The pattern scan's one hit is a truncated JWT header in an
   old `NEXT_STEPS.md` — documentation filler, not a key. **No Gemini key was
   ever committed, so there is nothing to rotate.** Gemini is gone from the app
   besides: the dependency, the service and the function alias have all been
   removed, and the key now appears only in the untracked local `src/.env`.

2. [x] **Verify Supabase RLS** — confirm UPDATE on `games` and `picks` is restricted to service role only. ✅
   Done by migration rather than by inspection: `0006` revoked client UPDATE on
   `picks` and `0007` did the same for `games`, both with trigger guards, and
   `0008` closed the `weeks.saturday_date` column the deadline rules read. All
   applied and verified 2026-08-23.

3. [x] **Confirm Supabase public signups are disabled** — Authentication → Settings → disable "Enable email signups". ✅
   Confirmed disabled 2026-08-23. This one underpinned the rest: every policy
   from `0003` onward gates on "any authenticated member", which is only a
   meaningful boundary while accounts cannot be self-created.

   **Superseded by `0009`, and deliberately reversed.** Email signups are now
   **ON** — that is what self-serve signup means. The check no longer applies,
   because the boundary it was protecting moved: "signed in" and "member" are
   now different states, membership is a `profiles` row, and `redeem_invite()`
   is the only thing that creates one. No client role holds an INSERT policy or
   grant on `profiles`.

   Do not re-apply this check by switching signups back off — it would break
   the invite flow while protecting nothing that `0009` does not already
   protect. See `docs/OPERATIONS.md` → "Membership and invites".
