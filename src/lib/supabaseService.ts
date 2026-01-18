import { supabase, type Profile, type Week, type Game, type Pick } from './supabase';
import { getTargetSaturdayDate, getPickDeadline, arePicksLocked, isAfterSunday3AM } from './timezone';
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
      const { data: newWeek, error } = await supabase
        .from('weeks')
        .insert({
          id: weekId,
          week_number: Math.ceil(targetSat.getDate() / 7),
          saturday_date: targetSat.toISOString().split('T')[0],
          status: 'OPEN'
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create week: ${error.message}`);
      week = newWeek;
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
   */
  async saveGames(weekId: string, games: Partial<Game>[]): Promise<void> {
    // Games don't include 'id' - Supabase will auto-generate UUIDs
    // Use insert since we're creating new games (App.tsx checks if games exist first)
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

    // Delete existing picks for this week, then insert new ones
    // NOTE: Requires RLS DELETE policy:
    //   CREATE POLICY "Users can delete own picks" ON picks FOR DELETE USING (auth.uid() = user_id);
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

    if (insertError) throw new Error(`Failed to save picks: ${insertError.message}`);
  },

  /**
   * Calculate and get current standings
   */
  async getStandings(): Promise<StandingsRow[]> {
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

    // Calculate standings for each user
    const standings = profiles.map((profile: Profile) => {
      const userPicks = picks?.filter(p => p.user_id === profile.id) || [];
      const wins = userPicks.filter(p => p.result === 'WIN').length;
      const losses = userPicks.filter(p => p.result === 'LOSS').length;
      const totalPoints = userPicks.reduce((sum, p) => sum + p.points_earned, 0);

      return {
        userId: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        wins,
        losses,
        totalPoints,
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
   * Fetches latest scores and updates games that are now FINAL
   */
  async syncScores(weekId: string): Promise<{ updated: number; errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      // Extract date from weekId (format: week-YYYY-MM-DD)
      const dateStr = weekId.replace('week-', '');

      // Get games for this week that aren't final yet
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', weekId)
        .neq('status', 'FINAL');

      if (gamesError) {
        throw new Error(`Failed to fetch games: ${gamesError.message}`);
      }

      if (!games || games.length === 0) {
        return { updated: 0, errors: [] };
      }

      // Fetch scores from NHL API via Netlify function
      const response = await fetch('/.netlify/functions/sync-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStr })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scores from NHL API');
      }

      const { scores } = await response.json();

      // Match games by nhl_game_id and update scores
      for (const game of games) {
        if (!game.nhl_game_id) {
          errors.push(`Game ${game.id} has no nhl_game_id`);
          continue;
        }

        const nhlScore = scores.find((s: any) => s.nhl_game_id === game.nhl_game_id);

        if (!nhlScore) {
          errors.push(`No NHL data found for game ${game.nhl_game_id}`);
          continue;
        }

        // Only update if game is now final
        if (nhlScore.is_final && nhlScore.home_score !== null && nhlScore.away_score !== null) {
          const { error: updateError } = await supabase
            .from('games')
            .update({
              home_score: nhlScore.home_score,
              away_score: nhlScore.away_score,
              status: 'FINAL'
            })
            .eq('id', game.id);

          if (updateError) {
            errors.push(`Failed to update game ${game.id}: ${updateError.message}`);
            continue;
          }

          // Calculate pick results for this game
          await this.calculatePickResults(game.id, nhlScore.home_score, nhlScore.away_score);
          updated++;
        }
      }

      // Safety net: recalculate any FINAL games that still have PENDING picks
      await this.recalculatePendingPicks(weekId);

      // Check if week should be marked as COMPLETED
      await this.checkWeekCompletion(weekId);

      return { updated, errors };
    } catch (error: any) {
      errors.push(error.message || 'Unknown error');
      return { updated, errors };
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
      const pastSunday3AM = isAfterSunday3AM(saturdayDate);

      // Check if all games are FINAL
      const { data: games } = await supabase
        .from('games')
        .select('status')
        .eq('week_id', weekId);

      const allGamesFinal = games && games.length > 0 && games.every(g => g.status === 'FINAL');

      // Mark as COMPLETED if either condition is met
      if (allGamesFinal || pastSunday3AM) {
        await supabase
          .from('weeks')
          .update({ status: 'COMPLETED' })
          .eq('id', weekId);

        console.log(`Week ${weekId} marked as COMPLETED (allGamesFinal: ${allGamesFinal}, pastSunday3AM: ${pastSunday3AM})`);
      }
    } catch (error) {
      console.error('Error checking week completion:', error);
    }
  }
};
