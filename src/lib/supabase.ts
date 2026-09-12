import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Row types — the exact snake_case shapes stored in Postgres.
 *
 * These are deliberately named `*Row` so they cannot be mistaken for the
 * camelCase application types in `src/types.ts`. Confusing the two is what let
 * `getCurrentWeek` return a raw row while `getAllWeeks` returned a mapped one,
 * both typed as `Week`. Map rows to app types at the service boundary; do not
 * let a `*Row` escape into a component.
 */
export type Profile = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: 'admin' | 'member';
  created_at: string;
  updated_at: string;
};

export type WeekRow = {
  id: string;
  week_number: number;
  saturday_date: string;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
  created_at: string;
};

export type GameRow = {
  id: string;
  week_id: string;
  nhl_game_id: number | null;
  home_team_id: string;
  away_team_id: string;
  start_time: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
};

export type PickRow = {
  id: string;
  user_id: string;
  week_id: string;
  game_id: string;
  selected_team_id: string;
  confidence: number;
  points_earned: number;
  result: 'WIN' | 'LOSS' | 'PENDING';
  created_at: string;
  updated_at: string;
};

/**
 * An invite code. Admin-readable only — the RLS policy on `invites` is gated on
 * `is_admin()`, so a member's select returns nothing rather than erroring.
 *
 * A code is REUSABLE and uncapped: one key goes out to the pool and everyone
 * signs up with it. What closes it is `expires_at` (never null — the column
 * carries a 14-day default) or an admin revoking it.
 */
export type InviteRow = {
  code: string;
  /** When set, only this address may redeem the code. Stored lower case. */
  email: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

/** Who joined on which code. One row per member, enforced by `unique (user_id)`. */
export type InviteClaimRow = {
  code: string;
  user_id: string;
  claimed_at: string;
};
