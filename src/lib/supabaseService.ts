import { supabase, type Profile, type Week, type Game, type Pick } from './supabase';
import { getTargetSaturdayDate, getPickDeadline, arePicksLocked, isAfterSunday4AM } from './timezone';
import type { User, StandingsRow } from '../types';

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

    return week!;
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

    // Map snake_case from Supabase to camelCase for TypeScript
    return (data || []).map(game => ({
      id: game.id,
      weekId: game.week_id,
      nhlGameId: game.nhl_game_id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      startTime: game.start_time,
      status: game.status,
      homeScore: game.home_score,
      awayScore: game.away_score
    }));
  },

  /**
   * Save games to database (admin function)
   * Guards against duplicate inserts by checking if games already exist for the week
   */
  async saveGames(weekId: string, games: Partial<Game>[]): Promise<void> {
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

    // Map snake_case from Supabase to camelCase for TypeScript
    return (data || []).map(pick => ({
      userId: pick.user_id,
      weekId: pick.week_id,
      gameId: pick.game_id,
      selectedTeamId: pick.selected_team_id,
      confidence: pick.confidence,
      pointsEarned: pick.points_earned,
      result: pick.result
    }));
  },

  /**
   * Get all picks for a week (for results/standings)
   */
  async getAllPicks(weekId?: string): Promise<Pick[]> {
    let query = supabase.from('picks').select('*');
    if (weekId) query = query.eq('week_id', weekId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get all picks: ${error.message}`);

    // Map snake_case from Supabase to camelCase for TypeScript
    return (data || []).map(pick => ({
      userId: pick.user_id,
      weekId: pick.week_id,
      gameId: pick.game_id,
      selectedTeamId: pick.selected_team_id,
      confidence: pick.confidence,
      pointsEarned: pick.points_earned,
      result: pick.result
    }));
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

    // Sort by total points (descending) and assign ranks
    return standings
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
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
   * Update game scores (admin function)
   */
  async updateGameScore(
    gameId: string,
    homeScore: number,
    awayScore: number,
    status: 'SCHEDULED' | 'LIVE' | 'FINAL'
  ): Promise<void> {
    const { error } = await supabase
      .from('games')
      .update({ home_score: homeScore, away_score: awayScore, status })
      .eq('id', gameId);

    if (error) throw new Error(`Failed to update game: ${error.message}`);

    // If game is final, calculate results for all picks on this game
    if (status === 'FINAL') {
      await this.calculatePickResults(gameId, homeScore, awayScore);
    }
  },

  /**
   * Calculate pick results for a specific game
   */
  async calculatePickResults(gameId: string, homeScore: number, awayScore: number): Promise<void> {
    // Get the game to find winner
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (!game) return;

    const winnerTeamId = homeScore > awayScore ? game.home_team_id : game.away_team_id;

    // Get all picks for this game
    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .eq('game_id', gameId);

    if (!picks) return;

    // Update each pick with result and points
    for (const pick of picks) {
      const isWin = pick.selected_team_id === winnerTeamId;
      await supabase
        .from('picks')
        .update({
          result: isWin ? 'WIN' : 'LOSS',
          points_earned: isWin ? pick.confidence : 0
        })
        .eq('id', pick.id);
    }
  },

  /**
   * Check if picks are locked for a week
   */
  async isPicksLocked(weekId: string): Promise<boolean> {
    const { data: week } = await supabase
      .from('weeks')
      .select('saturday_date')
      .eq('id', weekId)
      .single();

    if (!week) return true;
    return arePicksLocked(week.saturday_date);
  },

  /**
   * Get recent past weeks that have passed their pick deadline.
   * Uses a date range (last 14 days) instead of status filter so COMPLETED weeks
   * are still included — allowing the server-side sync to resolve any PENDING picks.
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

    return (data || []).map(week => ({
      id: week.id,
      number: week.week_number,
      startDate: week.saturday_date,
      endDate: week.saturday_date, // For Week type compatibility
      status: week.status
    }));
  },

  /**
   * Get a specific week by ID
   */
  async getWeekById(weekId: string): Promise<Week | null> {
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .eq('id', weekId)
      .single();

    if (error) return null;

    return {
      id: data.id,
      number: data.week_number,
      startDate: data.saturday_date,
      endDate: data.saturday_date,
      status: data.status
    };
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
  },

  /**
   * Safety net: Find any FINAL games with PENDING picks and recalculate them
   */
  async recalculatePendingPicks(weekId: string): Promise<void> {
    try {
      // Get all FINAL games for this week
      const { data: finalGames } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', weekId)
        .eq('status', 'FINAL');

      if (!finalGames) return;

      for (const game of finalGames) {
        // Check if any picks for this game are still PENDING
        const { data: pendingPicks } = await supabase
          .from('picks')
          .select('id')
          .eq('game_id', game.id)
          .eq('result', 'PENDING');

        if (pendingPicks && pendingPicks.length > 0) {
          console.log(`Recalculating ${pendingPicks.length} pending picks for game ${game.id}`);
          await this.calculatePickResults(game.id, game.home_score, game.away_score);
        }
      }
    } catch (error) {
      console.error('Error recalculating pending picks:', error);
    }
  },

  /**
   * Check if a week should be marked as COMPLETED
   * Conditions: All games are FINAL, OR it's past 3 AM ET Sunday
   */
  async checkWeekCompletion(weekId: string): Promise<void> {
    try {
      // Get the week
      const { data: week } = await supabase
        .from('weeks')
        .select('*')
        .eq('id', weekId)
        .single();

      if (!week || week.status === 'COMPLETED') return;

      const saturdayDate = week.saturday_date;

      // Check if it's past 3 AM Sunday
      const pastSunday4AM = isAfterSunday4AM(saturdayDate);

      // Check if all games are FINAL
      const { data: games } = await supabase
        .from('games')
        .select('status')
        .eq('week_id', weekId);

      const allGamesFinal = games && games.length > 0 && games.every(g => g.status === 'FINAL');

      // Mark as COMPLETED if either condition is met
      if (allGamesFinal || pastSunday4AM) {
        await supabase
          .from('weeks')
          .update({ status: 'COMPLETED' })
          .eq('id', weekId);

        console.log(`Week ${weekId} marked as COMPLETED (allGamesFinal: ${allGamesFinal}, pastSunday4AM: ${pastSunday4AM})`);
      }
    } catch (error) {
      console.error('Error checking week completion:', error);
    }
  }
};
