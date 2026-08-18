# App Assessment: Security, Reliability & Production Readiness

## Verdict
**Not quite ready for primetime as-is.** Functionally solid for core pick submission and scoring, but has 4 critical issues that must be fixed first.

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

- [ ] **9. No Account Management**
  - Users cannot change name, avatar, or password within the app
  - Fix: Add Profile/Settings page accessible from sidebar

- [ ] **10. RLS Policies Unverified**
  - The anon client inserts `weeks` (`getCurrentWeek`) and `games` (`saveGames`) and
    updates week status (AdminView), so the deployed policies must let any
    authenticated member do the same
  - Action: run the audit query in `supabase/README.md`, then either move those
    writes server-side or gate them on `profiles.role`

---

## Found during the 2026-08 cleanup

- [x] **21. Picks Readable by Every Player Before the Deadline** ✅
  - Policy on `picks` was `SELECT USING (true)` — the UI hid other players'
    picks, but one query from the browser console returned the whole league's
    open-week sheet
  - Fixed by `supabase/migrations/0001_pick_visibility.sql` (**needs applying**)
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
  - Fixed by `supabase/migrations/0002_enforce_deadline.sql` (**needs applying**)
  - Verified not to affect scoring: `sync-week` uses the service-role key, which
    bypasses RLS, so picks still resolve and weeks still close after the deadline

- [ ] **25. `savePicks` Can Lose a Member's Picks**
  - Deletes all picks for the week then inserts the new set, with no transaction.
    A failure between the two loses them. #6 above marked this fixed, but only
    the error message improved
  - Fix: a `save_picks` RPC doing both in one transaction
  - Note: #24 marginally widens this. A submission landing exactly on the 10:00
    boundary can now have its insert refused after the delete succeeded. The
    window is milliseconds; the RPC closes it

- [ ] **26. `VITE_SYNC_WEEK_SECRET` Is Not Secret**
  - Vite inlines `VITE_*` into the public bundle, so the shared secret guarding
    `sync-week` ships to every visitor
  - Fix: verify a Supabase JWT and check `profiles.role` instead

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
