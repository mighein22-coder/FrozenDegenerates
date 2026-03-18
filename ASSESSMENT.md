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

- [ ] **5. `week_number` Is Wrong (Week-of-Month, Not Season Week)**
  - `src/lib/supabaseService.ts:31` — `Math.ceil(date/7)` gives 1–5 repeating, not sequential
  - Fix: Derive number from position in sorted `allWeeks` array

- [ ] **6. Delete-Then-Insert Picks Not Atomic (Data Loss Risk)**
  - `src/lib/supabaseService.ts:185` — network failure between DELETE and INSERT loses all picks
  - Fix: Use Supabase `upsert` with `onConflict: 'user_id,week_id,game_id'`

- [ ] **7. All Error Catches Are Silent (Blank Screens)**
  - Every `catch` in `src/App.tsx` only does `console.error` — users see empty views
  - Fix: Add visible error banner with retry button for critical load failures

- [ ] **8. No Admin Panel**
  - `isAdmin` flag exists in `useAuth` but zero admin UI is built
  - Fix: Build minimal admin view (sync trigger, week status, user management)

- [ ] **9. No Account Management**
  - Users cannot change name, avatar, or password within the app
  - Fix: Add Profile/Settings page accessible from sidebar

- [ ] **10. RLS Policies Unverified**
  - "Admin functions" (`updateGameScore`, `calculatePickResults`) use anon key with no role check
  - Action: Verify in Supabase dashboard that UPDATE on `games`/`picks` requires service role

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
