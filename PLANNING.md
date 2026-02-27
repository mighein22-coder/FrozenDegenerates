# IcePick NHL Pick'em Pool - Production Deployment Plan

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

```sql
-- Users table (managed by Supabase Auth, extend with profiles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weeks
CREATE TABLE weeks (
  id TEXT PRIMARY KEY,
  week_number INTEGER NOT NULL,
  saturday_date DATE NOT NULL,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED', 'COMPLETED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'LIVE', 'FINAL')),
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Picks
CREATE TABLE picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  selected_team_id TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  points_earned INTEGER DEFAULT 0,
  result TEXT DEFAULT 'PENDING' CHECK (result IN ('WIN', 'LOSS', 'PENDING')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_id, game_id),
  UNIQUE(user_id, week_id, confidence)
);

-- Indexes
CREATE INDEX idx_picks_user_week ON picks(user_id, week_id);
CREATE INDEX idx_games_week ON games(week_id);
CREATE INDEX idx_picks_game ON picks(game_id);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Picks are viewable by everyone" ON picks FOR SELECT USING (true);
CREATE POLICY "Users can insert own picks" ON picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own picks" ON picks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own picks" ON picks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Games are viewable by everyone" ON games FOR SELECT USING (true);
CREATE POLICY "Weeks are viewable by everyone" ON weeks FOR SELECT USING (true);
```

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
