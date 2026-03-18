import type { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * Returns true if current UTC time is past 4 AM ET on the Sunday after the given Saturday.
 * Handles DST automatically using Intl.
 */
function isAfterSunday4AM(saturdayDateStr: string): boolean {
  const parts = saturdayDateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const sundayDay = day + 1;
  const sundayStr = `${year}-${String(month).padStart(2, '0')}-${String(sundayDay).padStart(2, '0')}`;

  // Determine ET UTC offset on that Sunday using a test point (8:30 AM UTC)
  // EDT (UTC-4): 8:30 UTC → 4:30 ET  (hour = 4)
  // EST (UTC-5): 8:30 UTC → 3:30 ET  (hour = 3)
  const testPoint = new Date(`${sundayStr}T08:30:00Z`);
  const etHour = parseInt(
    testPoint.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    })
  );
  const utcOffset = etHour === 4 ? 4 : 5;
  const sunday4amUTC = new Date(
    `${sundayStr}T${String(4 + utcOffset).padStart(2, '0')}:00:00Z`
  );

  return new Date() > sunday4amUTC;
}

/**
 * Netlify Function: sync-week
 * Server-side sync of NHL scores + pick resolution using the service role key.
 * Bypasses RLS entirely — safe against client session failures.
 *
 * POST body: { weekId: string }
 * Returns: { updated: number, picksResolved: number, errors: string[] }
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Authenticate request via shared secret header
  const syncSecret = process.env.SYNC_WEEK_SECRET;
  const providedSecret = event.headers['x-sync-secret'] || event.headers['X-Sync-Secret'];
  if (!syncSecret || providedSecret !== syncSecret) {
    console.warn('[SYNC WEEK] Unauthorized request attempt');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[SYNC WEEK] Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      })
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const body = JSON.parse(event.body || '{}');
    const { weekId } = body;

    if (!weekId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'weekId is required' }) };
    }

    const dateStr = weekId.replace('week-', '');
    const errors: string[] = [];
    let gamesUpdated = 0;
    let picksResolved = 0;

    console.log(`[SYNC WEEK] Starting sync for ${weekId} (date: ${dateStr})`);

    // Fetch ALL games for this week — no status filter, so already-FINAL games are included
    const { data: dbGames, error: gamesError } = await adminClient
      .from('games')
      .select('*')
      .eq('week_id', weekId);

    if (gamesError) {
      throw new Error(`Failed to fetch games: ${gamesError.message}`);
    }

    if (!dbGames || dbGames.length === 0) {
      console.log(`[SYNC WEEK] No games found for ${weekId}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated: 0, picksResolved: 0, errors: [], message: 'No games found' })
      };
    }

    console.log(`[SYNC WEEK] Found ${dbGames.length} games in DB`);

    // Fetch scores from NHL score endpoint (designed for completed-game data)
    let nhlScores: any[] = [];
    const scoreUrl = `https://api-web.nhle.com/v1/score/${dateStr}`;
    console.log(`[SYNC WEEK] Fetching ${scoreUrl}`);

    const nhlResponse = await fetch(scoreUrl);
    if (nhlResponse.ok) {
      const nhlData = await nhlResponse.json();
      // /v1/score/{date} returns { games: [...] }
      const allGames: any[] = nhlData.games ?? [];

      // Filter to games that were played on the requested ET date
      nhlScores = allGames.filter((g: any) => {
        const gameTimeUTC = new Date(g.startTimeUTC);
        const gameDateET = gameTimeUTC.toLocaleDateString('en-CA', {
          timeZone: 'America/New_York'
        });
        return gameDateET === dateStr;
      });

      console.log(
        `[SYNC WEEK] Score endpoint: ${allGames.length} total, ${nhlScores.length} on ${dateStr}`
      );
    } else {
      // Fallback to schedule endpoint
      console.warn(
        `[SYNC WEEK] Score endpoint returned ${nhlResponse.status}, falling back to schedule`
      );
      const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
      const scheduleResponse = await fetch(scheduleUrl);
      if (scheduleResponse.ok) {
        const scheduleData = await scheduleResponse.json();
        const allGames: any[] = scheduleData.gameWeek?.[0]?.games ?? [];
        nhlScores = allGames.filter((g: any) => {
          const gameTimeUTC = new Date(g.startTimeUTC);
          const gameDateET = gameTimeUTC.toLocaleDateString('en-CA', {
            timeZone: 'America/New_York'
          });
          return gameDateET === dateStr;
        });
        console.log(`[SYNC WEEK] Schedule fallback: ${nhlScores.length} games on ${dateStr}`);
      } else {
        errors.push(`NHL API unavailable (score: ${nhlResponse.status})`);
      }
    }

    // Map NHL game ID → game data for quick lookup
    const nhlMap = new Map<number, any>();
    for (const g of nhlScores) {
      nhlMap.set(g.id, g);
    }

    // Step 1: Update any non-FINAL games in DB that are now FINAL per NHL
    for (const game of dbGames) {
      if (game.status === 'FINAL') continue;

      if (!game.nhl_game_id) {
        errors.push(`Game ${game.id} has no nhl_game_id`);
        continue;
      }

      const nhlGame = nhlMap.get(game.nhl_game_id);
      if (!nhlGame) {
        errors.push(`No NHL data for nhl_game_id ${game.nhl_game_id}`);
        continue;
      }

      const isFinal = nhlGame.gameState === 'FINAL' || nhlGame.gameState === 'OFF';
      if (isFinal && nhlGame.homeTeam?.score != null && nhlGame.awayTeam?.score != null) {
        const { error: updateError } = await adminClient
          .from('games')
          .update({
            home_score: nhlGame.homeTeam.score,
            away_score: nhlGame.awayTeam.score,
            status: 'FINAL'
          })
          .eq('id', game.id);

        if (updateError) {
          errors.push(`Failed to update game ${game.id}: ${updateError.message}`);
        } else {
          gamesUpdated++;
          console.log(
            `[SYNC WEEK] Game ${game.id} → FINAL (${nhlGame.homeTeam.score}-${nhlGame.awayTeam.score})`
          );
        }
      }
    }

    // Step 2: For ALL FINAL games in the week, resolve any PENDING picks
    // Re-query so we pick up games just updated above
    const { data: finalGames } = await adminClient
      .from('games')
      .select('*')
      .eq('week_id', weekId)
      .eq('status', 'FINAL');

    for (const game of finalGames ?? []) {
      const { data: pendingPicks } = await adminClient
        .from('picks')
        .select('*')
        .eq('game_id', game.id)
        .eq('result', 'PENDING');

      if (!pendingPicks || pendingPicks.length === 0) continue;

      const winnerTeamId =
        game.home_score > game.away_score ? game.home_team_id : game.away_team_id;

      console.log(
        `[SYNC WEEK] Resolving ${pendingPicks.length} pending picks for game ${game.id} (winner: ${winnerTeamId})`
      );

      for (const pick of pendingPicks) {
        const isWin = pick.selected_team_id === winnerTeamId;
        const { error: pickError } = await adminClient
          .from('picks')
          .update({
            result: isWin ? 'WIN' : 'LOSS',
            points_earned: isWin ? pick.confidence : 0
          })
          .eq('id', pick.id);

        if (pickError) {
          errors.push(`Failed to update pick ${pick.id}: ${pickError.message}`);
        } else {
          picksResolved++;
        }
      }
    }

    // Step 3: Check if week should be marked COMPLETED
    const { data: week } = await adminClient
      .from('weeks')
      .select('*')
      .eq('id', weekId)
      .single();

    if (week && week.status !== 'COMPLETED') {
      const { data: allWeekGames } = await adminClient
        .from('games')
        .select('status')
        .eq('week_id', weekId);

      const allFinal =
        allWeekGames != null &&
        allWeekGames.length > 0 &&
        allWeekGames.every((g: any) => g.status === 'FINAL');
      const pastSunday4AM = isAfterSunday4AM(week.saturday_date);

      if (allFinal || pastSunday4AM) {
        await adminClient
          .from('weeks')
          .update({ status: 'COMPLETED' })
          .eq('id', weekId);
        console.log(
          `[SYNC WEEK] Week ${weekId} marked COMPLETED (allFinal: ${allFinal}, pastSunday4AM: ${pastSunday4AM})`
        );
      }
    }

    console.log(
      `[SYNC WEEK] Done: ${gamesUpdated} games updated, ${picksResolved} picks resolved, ${errors.length} errors`
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ updated: gamesUpdated, picksResolved, errors })
    };
  } catch (error: any) {
    console.error('[SYNC WEEK ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

export { handler };
