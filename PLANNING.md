# IcePick NHL Pick'em Pool - Production Deployment Plan

> **Historical record.** This plan described the move from the localStorage
> prototype to the deployed app, and that work is done. It is kept for context on
> why the code is shaped the way it is. For current state see `TASKS.md`, and for
> running the app see `docs/OPERATIONS.md`.

## Overview

Transform the working IcePick prototype into a production-ready app for 10-20 users using the **simplest possible architecture**: Keep Vite + React, add Supabase for auth + database, deploy to Netlify with custom domain.

**IMPORTANT:** All work will be done in a new `src/` directory. The original `prototype_code/` will remain untouched as a reference/backup.

**User Requirements:**
- 10-20 users
- Simplicity prioritized
- Custom domain available
- Keep core functionality unchanged

**Current State:**
- ✅ Working prototype with beautiful UI
- ✅ 6 views (Login, Dashboard, Picks, Standings, Results, Team Stats)
- ✅ Google Gemini AI integration for NHL schedules
- ❌ All data in localStorage (no multi-user support)
- ❌ No real authentication
- ❌ Monolithic 726-line App.tsx
- ❌ Minimal error handling
- ❌ API key exposed in frontend

---

## Architecture Decision: Keep It Simple

**Framework:** Keep Vite + React ✅
**Backend:** Supabase (auth + PostgreSQL database) ✅
**Deployment:** Netlify with custom domain ✅
**AI Service:** Google Gemini (move to Netlify Functions) ✅

**Why This Stack:**
- No framework migration needed
- Supabase free tier: 500MB database, 50K monthly active users (way more than 10-20)
- Authentication built-in (email/password + magic links)
- Real-time subscriptions for live updates
- Deploy in < 1 week

---

## Phase 1: Supabase Setup (Day 1)

### 1.1 Create Supabase Project

1. Go to https://supabase.com
2. Create new project
3. Save credentials: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

### 1.2 Database Schema

See `supabase/migrations/` for schema changes and `supabase/README.md` for how to
apply them. The SQL that used to sit here was never the whole truth — the live
database was altered by hand and drifted from it (`games.nhl_game_id` and the
`updated_at` columns are used by the running code but appeared in no document),
so it has been removed rather than left to mislead.

---

## Phase 2: Code Refactoring (Days 2-3)

### 2.1 Setup New Project Directory

**Step 1: Copy prototype_code to src/**

```bash
# From project root
cp -r prototype_code src
cd src
npm install @supabase/supabase-js date-fns-tz react-hot-toast
```

This preserves the original prototype while giving us a clean workspace.

### 2.2 File Structure

**New files to create in `src/`:**
- `src/lib/supabase.ts` - Supabase client
- `src/lib/supabaseService.ts` - Replace dataService.ts
- `src/lib/timezone.ts` - DST-aware utilities
- `src/hooks/useAuth.ts` - Authentication hook
- `src/components/layout/Sidebar.tsx` - Extract from App.tsx
- `src/components/views/LoginView.tsx` - Extract from App.tsx
- `src/components/views/DashboardView.tsx` - Extract from App.tsx
- `src/components/views/PicksView.tsx` - Extract from App.tsx
- `src/components/views/StandingsView.tsx` - Extract from App.tsx
- `src/components/views/ResultsView.tsx` - Extract from App.tsx
- `src/components/views/TeamStatsView.tsx` - Extract from App.tsx
- `netlify/functions/gemini-analyze.ts` - Serverless function
- `netlify/functions/gemini-schedule.ts` - Serverless function
- `netlify.toml` - Netlify config

**Files to modify:**
- `App.tsx` - Simplify to routing only
- `components/GameCard.tsx` - Use Netlify functions
- `types.ts` - Add Supabase types

**Files to delete:**
- `services/dataService.ts` - Replaced by supabaseService.ts

---

## Phase 3: Supabase Integration (Days 3-4)

**Key implementations:**
- Authentication with `useAuth` hook
- Replace localStorage with Supabase queries
- Fix timezone bug with `date-fns-tz`
- Implement Row Level Security

---

## Phase 4: Netlify Functions (Day 4)

**Secure Gemini API:**
- Move API calls to serverless functions
- Keep API key server-side only
- Update GameCard to call functions via fetch

---

## Phase 5: Component Extraction (Day 5)

**Extract from App.tsx:**
- Sidebar component
- 6 view components
- Simplify App.tsx to < 100 lines

---

## Phase 6: Deployment (Day 6)

**Steps:**
1. Set environment variables in Netlify
2. Deploy via Netlify CLI
3. Configure custom domain
4. Test all flows

---

## Phase 7: User Onboarding (Day 7)

**Setup:**
- Create user accounts in Supabase
- Send credentials to users
- Admin syncs first week's schedule
- Test with real users

---

## Timeline: 7-8 Days Total

| Phase | Days | Tasks |
|-------|------|-------|
| 1. Supabase Setup | 1 | Project, schema, seed |
| 2. Code Refactoring | 2 | Extract components |
| 3. Supabase Integration | 1-2 | Auth, queries |
| 4. Netlify Functions | 1 | Secure Gemini |
| 5. Component Extraction | 1 | Clean App.tsx |
| 6. Deployment | 1 | Netlify + domain |
| 7. User Onboarding | 1 | Accounts, testing |

---

## Critical Files

**Original Location:** `prototype_code/` (PRESERVED - DO NOT MODIFY)
**Working Location:** `src/` (NEW - all changes here)

**Most important files to modify in `src/`:**
1. `App.tsx` (726 lines → refactor to ~100 lines)
2. `services/dataService.ts` (replace with Supabase)
3. `services/geminiService.ts` (move to Netlify functions)
4. `types.ts` (extend for Supabase)
5. `components/GameCard.tsx` (update API calls)

---

## Testing Checklist

- [x] Login/logout works
- [x] Picks save to Supabase (DELETE policy added, submit working)
- [x] Deadline locks at Saturday 11 AM ET (timezone fix applied)
- [x] Standings calculate correctly
- [x] Results matrix shows all picks
- [x] Schedule sync works (NHL API via Netlify function)
- [ ] Mobile responsive
- [x] RLS prevents unauthorized edits (DELETE policy added 2026-01-16)

---

## Success Criteria

✅ **10-20 users can:**
- Log in securely
- Submit weekly picks
- View real-time standings
- Access from any device

✅ **Admin can:**
- Sync NHL schedules
- Enter scores
- Manage users

✅ **System is:**
- Deployed on custom domain
- Secure (Supabase RLS)
- Simple to maintain
- Free to operate
