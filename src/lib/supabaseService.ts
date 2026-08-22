import { supabase, type Profile, type WeekRow, type GameRow, type PickRow } from './supabase';
import { getTargetSaturdayDate, arePicksLocked } from './timezone';
import { rankStandings } from './standings';
import type { User, StandingsRow, Week, Game, Pick } from '../types';

/**
 * Maps a `weeks` row (snake_case, as stored) to the camelCase `Week` app type.
 *
 * Every week-returning method goes through this. Previously `getCurrentWeek`
 * returned the raw row while `getAllWeeks` returned the mapped shape, even
 * though both were typed as `Week` — so callers reading `startDate` off the
 * current week silently got `undefined` and a week that never locked.
 */
function mapWeek(row: WeekRow): Week {
  return {
    id: row.id,
    number: row.week_number,
    startDate: row.saturday_date,
    endDate: row.saturday_date, // Single-day week; kept for Week type compatibility
    status: row.status
  };
}

/** Maps a `games` row to the camelCase `Game` app type. */
function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    weekId: row.week_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    startTime: row.start_time,
    status: row.status,
    // Postgres nulls become undefined so optional app fields behave as expected
    nhlGameId: row.nhl_game_id ?? undefined,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined
  };
}

/** Maps a `picks` row to the camelCase `Pick` app type. */
function mapPick(row: PickRow): Pick {
  return {
    userId: row.user_id,
    weekId: row.week_id,
    gameId: row.game_id,
    selectedTeamId: row.selected_team_id,
    confidence: row.confidence,
    pointsEarned: row.points_earned,
    result: row.result
  };
}

/** Groups rows by their `weekId`, seeding every requested week so callers get a complete map. */
function groupByWeek<T extends { weekId: string }>(
  rows: T[],
  weekIds: string[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const weekId of weekIds) grouped[weekId] = [];
  for (const row of rows) (grouped[row.weekId] ??= []).push(row);
  return grouped;
}

/**
 * Supabase Service Layer
 * Replaces the localStorage-based dataService with real database operations
 */
export const supabaseService = {
  /**
   * Get the current week based on ET timezone logic (Monday 6 AM transition)
   */
  async getCurrentWeek(): Promise<Week> {
    const targetSat = getTargetSaturdayDate();
    const weekId = `week-${targetSat.toISOString().split('T')[0]}`;

    // Try to get existing week
    let { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', weekId)
      .single();

    // Create week if doesn't exist
    if (!week) {
      // Calculate sequential week number (count weeks from Oct 1 of current/previous year)
      const satDate = new Date(targetSat);
      const year = satDate.getUTCFullYear();
      const seasonStart = new Date(Date.UTC(year, 9, 1)); // October 1st
      // If Saturday is before Oct 1, use previous year's season start
      if (satDate < seasonStart) {
        seasonStart.setUTCFullYear(year - 1);
      }
      const weekNumber = Math.floor((satDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

      const { data: newWeek, error } = await supabase
        .from('weeks')
        .insert({
          id: weekId,
          week_number: weekNumber,
          saturday_date: targetSat.toISOString().split('T')[0],
          status: 'OPEN'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Concurrent request already created it — re-fetch
          const { data: existingWeek } = await supabase
            .from('weeks')
            .select('*')
            .eq('id', weekId)
            .single();
          week = existingWeek;
        } else {
          throw new Error(`Failed to create week: ${error.message}`);
        }
      } else {
        week = newWeek;
      }
    }

    return mapWeek(week!);
  },

  /**
   * Get all games for a specific week
   */
  async getGamesByWeek(weekId: string): Promise<Game[]> {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .order('start_time', { ascending: true });

    if (error) throw new Error(`Failed to get games: ${error.message}`);

    return (data || []).map(mapGame);
  },

  /**
   * Get games for several weeks in a single query, grouped by week id.
   * Replaces per-week round-trips in the history view.
   */
  async getGamesForWeeks(weekIds: string[]): Promise<Record<string, Game[]>> {
    if (weekIds.length === 0) return {};

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .in('week_id', weekIds)
      .order('start_time', { ascending: true });

    if (error) throw new Error(`Failed to get games: ${error.message}`);

    return groupByWeek((data || []).map(mapGame), weekIds);
  },

  /**
   * Save games to database (admin function)
   * Guards against duplicate inserts by checking if games already exist for the week
   */
  async saveGames(weekId: string, games: Partial<GameRow>[]): Promise<void> {
    // Check if games already exist for this week to prevent duplicate inserts
    const { data: existing } = await supabase
      .from('games')
      .select('id')
      .eq('week_id', weekId)
      .limit(1);

    if (existing && existing.length > 0) {
      // Games already saved for this week, skip insert
      return;
    }

    const { error } = await supabase
      .from('games')
      .insert(games);

    if (error) throw new Error(`Failed to save games: ${error.message}`);
  },

  /**
   * Get user's picks for a specific week
   */
  async getUserPicks(userId: string, weekId: string): Promise<Pick[]> {
    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('user_id', userId)
      .eq('week_id', weekId);

    if (error) throw new Error(`Failed to get user picks: ${error.message}`);

    return (data || []).map(mapPick);
  },

  /**
   * Get all picks for a week (for results/standings)
   */
  async getAllPicks(weekId?: string): Promise<Pick[]> {
    let query = supabase.from('picks').select('*');
    if (weekId) query = query.eq('week_id', weekId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get all picks: ${error.message}`);

    return (data || []).map(mapPick);
  },

  /**
   * Get picks for several weeks in a single query.
   * Replaces per-week round-trips in the team-stats and history views.
   */
  async getPicksForWeeks(weekIds: string[]): Promise<Pick[]> {
    if (weekIds.length === 0) return [];

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .in('week_id', weekIds);

    if (error) throw new Error(`Failed to get picks: ${error.message}`);

    return (data || []).map(mapPick);
  },

  /**
   * Save user picks (replaces all picks for that week)
   */
  async savePicks(
    userId: string,
    weekId: string,
    picks: Array<{ gameId: string; selectedTeamId: string; confidence: number }>
  ): Promise<void> {
    // Check if picks are locked
    const { data: week } = await supabase
      .from('weeks')
      .select('saturday_date')
      .eq('id', weekId)
      .single();

    if (!week) throw new Error('Week not found');

    // Pass the date string directly - timezone.ts will parse it correctly
    if (arePicksLocked(week.saturday_date)) {
      throw new Error('Picks are locked. Deadline has passed.');
    }

    // Validate picks
    if (picks.length !== 5) {
      throw new Error('Must submit exactly 5 picks');
    }

    const confidences = picks.map(p => p.confidence);
    if (new Set(confidences).size !== 5) {
      throw new Error('Confidence values must be unique (1-5)');
    }

    // Save picks atomically: delete old, insert new
    // This is wrapped in error handling to catch network failures
    // NOTE: Requires RLS DELETE and INSERT policies:
    //   CREATE POLICY "Users can delete own picks" ON picks FOR DELETE USING (auth.uid() = user_id);
    //   CREATE POLICY "Users can insert own picks" ON picks FOR INSERT WITH CHECK (auth.uid() = user_id);

    try {
      // Delete existing picks for this week
      const { error: deleteError } = await supabase
        .from('picks')
        .delete()
        .eq('user_id', userId)
        .eq('week_id', weekId);

      if (deleteError) {
        console.error('Delete failed:', deleteError);
        throw new Error(`Failed to clear existing picks: ${deleteError.message}`);
      }

      // Insert new picks
      const { error: insertError } = await supabase
        .from('picks')
        .insert(picks.map(p => ({
          user_id: userId,
          week_id: weekId,
          game_id: p.gameId,
          selected_team_id: p.selectedTeamId,
          confidence: p.confidence
        })));

      if (insertError) {
        // Critical: insertion failed after deletion — picks may be lost
        console.error('Insert failed after deletion:', insertError);
        throw new Error(`Failed to save picks (picks may have been lost): ${insertError.message}`);
      }
    } catch (error: any) {
      // Re-throw with clear message about potential data loss
      throw new Error(error.message || 'Failed to save picks. Please try again.');
    }
  },

  /**
   * Calculate and get current standings
   * @param currentWeekId - Optional week ID to calculate weekly score for
   */
  async getStandings(currentWeekId?: string): Promise<StandingsRow[]> {
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) throw new Error(`Failed to get profiles: ${profilesError.message}`);
    if (!profiles) return [];

    // Get all picks
    const { data: picks, error: picksError } = await supabase
      .from('picks')
      .select('*');

    if (picksError) throw new Error(`Failed to get picks: ${picksError.message}`);

    // Determine the week to use for weekly score:
    // Use the provided currentWeekId, or fall back to the most recent week that has any resolved picks
    let weeklyScoreWeekId = currentWeekId;
    if (!weeklyScoreWeekId && picks && picks.length > 0) {
      const resolvedPicks = picks.filter(p => p.result !== 'PENDING');
      if (resolvedPicks.length > 0) {
        // Find the most recent week_id among resolved picks
        const weekIds = [...new Set(resolvedPicks.map(p => p.week_id))];
        weeklyScoreWeekId = weekIds.sort().reverse()[0];
      }
    }

    // Calculate standings for each user
    const standings = profiles.map((profile: Profile) => {
      const userPicks = picks?.filter(p => p.user_id === profile.id) || [];
      const wins = userPicks.filter(p => p.result === 'WIN').length;
      const losses = userPicks.filter(p => p.result === 'LOSS').length;
      const totalPoints = userPicks.reduce((sum, p) => sum + p.points_earned, 0);
      const weeklyPicks = weeklyScoreWeekId
        ? userPicks.filter(p => p.week_id === weeklyScoreWeekId)
        : [];
      const weeklyScore = weeklyPicks.reduce((sum, p) => sum + p.points_earned, 0);

      return {
        userId: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        wins,
        losses,
        totalPoints,
        weeklyScore,
        rank: 0 // Will be set after sorting
      };
    });

    return rankStandings(standings, 'totalPoints');
  },

  /**
   * Get all profiles (users)
   */
  async getProfiles(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');

    if (error) throw new Error(`Failed to get profiles: ${error.message}`);
    return data || [];
  },

  /**
   * Update the signed-in user's own profile (name / avatar).
   * RLS restricts UPDATE on profiles to `auth.uid() = id`.
   */
  async updateProfile(
    userId: string,
    updates: { name?: string; avatar?: string | null }
  ): Promise<Profile> {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.avatar !== undefined) {
      const avatar = updates.avatar?.trim();
      payload.avatar = avatar ? avatar : null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update profile: ${error.message}`);
    return data;
  },



  /**
   * Get recent past weeks that are past their pick deadline but not yet COMPLETED,
   * so the server-side sync can resolve any still-PENDING picks.
   *
   * COMPLETED weeks are excluded: sync-week only touches non-FINAL games and
   * PENDING picks, so re-syncing a completed week can never change anything.
   */
  async getRecentIncompleteWeeks(currentWeekId: string): Promise<string[]> {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const cutoff = twoWeeksAgo.toISOString().split('T')[0];
    const currentDateStr = currentWeekId.replace('week-', '');

    const { data } = await supabase
      .from('weeks')
      .select('id, saturday_date, status')
      .neq('id', currentWeekId)
      .neq('status', 'COMPLETED')
      .gte('saturday_date', cutoff)
      .lt('saturday_date', currentDateStr)
      .order('saturday_date', { ascending: false })
      .limit(3);

    if (!data) return [];

    // Only return weeks whose Saturday has already passed (picks are locked)
    return data
      .filter(w => arePicksLocked(w.saturday_date))
      .map(w => w.id);
  },

  /**
   * Get all weeks, sorted by date (most recent first)
   */
  async getAllWeeks(): Promise<Week[]> {
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .order('saturday_date', { ascending: false });

    if (error) throw new Error(`Failed to get weeks: ${error.message}`);

    return (data || []).map(mapWeek);
  },


  /**
   * Sync game scores from NHL API
   * Delegates all DB writes to the server-side sync-week function (uses service role key,
   * bypasses RLS, handles already-FINAL games with PENDING picks).
   */
  async syncScores(weekId: string): Promise<{ updated: number; errors: string[] }> {
    try {
      const syncSecret = import.meta.env.VITE_SYNC_WEEK_SECRET;
      if (!syncSecret) {
        console.warn('VITE_SYNC_WEEK_SECRET not configured');
        return { updated: 0, errors: ['Sync secret not configured'] };
      }

      const response = await fetch('/.netlify/functions/sync-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-secret': syncSecret
        },
        body: JSON.stringify({ weekId })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `sync-week returned ${response.status}`);
      }

      const result = await response.json();
      return { updated: result.updated ?? 0, errors: result.errors ?? [] };
    } catch (error: any) {
      return { updated: 0, errors: [error.message || 'Unknown error'] };
    }
  }
};
