import type { Handler, HandlerEvent } from '@netlify/functions';

/**
 * Netlify Function: Sync NHL Game Scores
 * Fetches current game scores from the NHL API for a specific date
 * Returns game scores that can be used to update the database
 */
const handler: Handler = async (event: HandlerEvent) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { dateStr } = body;

    if (!dateStr) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'dateStr parameter is required (YYYY-MM-DD format)' })
      };
    }

    // Fetch schedule from NHL API
    const url = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NHL API returned status ${response.status}`);
    }

    const data = await response.json();

    // NHL API returns a full week of games, so we need to filter to just the requested date
    const allGames = data.gameWeek?.[0]?.games ?? [];

    // Filter games by converting UTC time to ET timezone before comparing dates
    const filteredGames = allGames.filter((g: any) => {
      const gameTimeUTC = new Date(g.startTimeUTC);
      const gameTimeET = new Date(gameTimeUTC.getTime() - (5 * 60 * 60 * 1000));
      const gameDateET = gameTimeET.toISOString().split('T')[0];
      return gameDateET === dateStr;
    });

    // Extract score information for each game
    const scores = filteredGames.map((g: any) => ({
      nhl_game_id: g.id,
      home_team_id: g.homeTeam.abbrev,
      away_team_id: g.awayTeam.abbrev,
      home_score: g.homeTeam.score ?? null,
      away_score: g.awayTeam.score ?? null,
      game_state: g.gameState, // 'FUT', 'PRE', 'LIVE', 'FINAL', 'OFF', 'CRIT'
      is_final: g.gameState === 'FINAL' || g.gameState === 'OFF'
    }));

    console.log(`[SYNC SCORES] Date: ${dateStr}, Found ${scores.length} games`);
    console.log(`[SYNC SCORES] Final games: ${scores.filter((s: any) => s.is_final).length}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        dateStr,
        scores,
        totalGames: scores.length,
        finalGames: scores.filter((s: any) => s.is_final).length
      })
    };
  } catch (error: any) {
    console.error('[SYNC SCORES ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Failed to fetch NHL scores'
      })
    };
  }
};

export { handler };
