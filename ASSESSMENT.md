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

- [x] **4. Picks View Shows Blank Screen on Load Failure** ✅
  - Added loading spinner and error state with retry button for Picks view

- [ ] **15. Members Can Write Their Own Scores** 🔴
  - `picks` UPDATE policy is `USING (auth.uid() = user_id)` with no `WITH CHECK`
    and no column restriction, and `authenticated` holds UPDATE on every column.
  - `getStandings()` sums `points_earned` and counts `result` straight off the
    `picks` rows — so a member can set `points_earned` on their own picks and
    take first place in one REST call. No exploit needed beyond the anon key.
  - Fix: restrict client UPDATE on `picks` to `selected_team_id` / `confidence`;
    `points_earned` and `result` should be service-role only.

- [ ] **16. Anyone Can Rewrite Game Scores** 🔴
  - `games` carries `Anyone can update games` (UPDATE, roles=`public`,
    `USING (true)`) and `Anyone can insert games` (INSERT, roles=`public`,
    `WITH CHECK (true)`). Not limited to members — the anon key is in the
    browser bundle.
  - Any visitor can set `home_score` / `away_score` / `status` on any game,
    which then drives `calculatePickResults` and the standings.
  - Fix: drop the public write policies; scores are written by the
    `sync-scores` function, which should use the service role.

- [ ] **17. Everyone's Picks Are Public Before the Deadline** 🔴
  - `picks` SELECT policy is `USING (true)` for `public`, unconditionally.
  - A member can read every other member's picks before Saturday's deadline,
    which defeats the point of the pool.
  - Fix: gate SELECT on other users' picks behind the week's deadline having
    passed; own picks always visible.

- [ ] **18. Pick Deadline Is Not Enforced Server-Side** 🔴
  - `picks` UPDATE/DELETE policies carry no deadline condition, and `weeks`
    has `Allow authenticated users to update weeks` (UPDATE, `USING (true)`)
    plus `Anyone can insert weeks` (INSERT, roles=`public`).
  - The 10 AM ET lock is enforced only in the client (`arePicksLocked` gating
    the UI). A member can change picks after games start, and can flip a week's
    status back to `OPEN`.
  - Fix: add a deadline predicate to the `picks` write policies; restrict
    `weeks` writes to the service role.

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
    is needed as written). Neither is applied yet.

---

## MEDIUM — Quality Improvements

- [ ] **11. Results Matrix Has No Mobile Layout**
  - Wide table is unusable on phone; only has a "scroll" hint
  - Fix: Add mobile card view (one user per card) like the Standings mobile layout

- [ ] **12. N+1 Queries in TeamStats and MyHistory**
  - `src/App.tsx:228-243`, `258-270` — sequential DB round-trip per week (up to 40 by week 20)
  - Fix: Parallelize with `Promise.all()`

- [ ] **13. `syncScores` Called on Every Results Tab/Week Change**
  - Fires Netlify function even for COMPLETED weeks (no data will change)
  - Fix: Skip sync if week status is COMPLETED

- [ ] **14. Dashboard "Make Picks" CTA Stale After Submission**
  - Always says "make your picks" even when 5 picks are already submitted
  - Fix: Detect `currentPicks.length === 5` and change message accordingly

- [ ] **15. `dateStr` Not Validated Before NHL URL Interpolation**
  - `netlify/functions/sync-scores.ts:30`, `gemini-schedule.ts:29`, `sync-week.ts:77`
  - Fix: Add regex validation `if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 400`

---

## LOW — Housekeeping

- [ ] **16. Tied Players Get Different Ranks (No Tiebreaker)**
  - `src/lib/supabaseService.ts:269` — add `wins` as tiebreaker in sort

- [ ] **17. `sync-scores.ts` Appears to Be Dead Code**
  - `sync-week.ts` is the active function — verify and remove if unused

- [ ] **18. Stale/Unused Dependencies**
  - `recharts` and `@google/genai` still in `package.json` but both removed from the app
  - Fix: `npm uninstall recharts @google/genai`

- [ ] **19. Stale `CURRENT_WEEK_ID = 'week-5'` Constant**
  - Not used anywhere but confusing — remove from `constants.ts`

- [ ] **20. Comment/Code Mismatches**
  - `supabaseService.ts:487`: comment says "3 AM" but function checks 4 AM
  - `sync-week.ts`: duplicates DST logic independently from `timezone.ts`

---

## Immediate Security Checks (Do Manually)

1. **Check git history for committed secrets:**
   ```bash
   git log --all --full-history -- .env src/.env.local
   ```
   If they appear, rotate the Gemini API key immediately.

2. **Verify Supabase RLS** — confirm UPDATE on `games` and `picks` is restricted to service role only.

3. **Confirm Supabase public signups are disabled** — Authentication → Settings → disable "Enable email signups".
