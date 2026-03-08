import type { Handler, HandlerEvent } from '@netlify/functions';

/**
 * Netlify Function: Fetch NHL Schedule via Direct NHL API
 * Uses the official NHL.com API endpoint (free, no auth required)
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
        body: JSON.stringify({ error: 'dateStr parameter is required' })
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
    // A game at 7 PM ET Saturday shows as midnight UTC Sunday, so we can't just compare UTC dates
    const filteredGames = allGames.filter((g: any) => {
      const gameTimeUTC = new Date(g.startTimeUTC);
      // Use Intl to get the ET date, DST-aware (handles both EST UTC-5 and EDT UTC-4)
      const gameDateET = gameTimeUTC.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      return gameDateET === dateStr;
    });

    // Parse games from NHL API response
    // Use snake_case to match Supabase schema
    // Don't include 'id' - let Supabase generate UUIDs automatically
    const games = filteredGames.map((g: any) => ({
      week_id: `week-${dateStr}`,
      nhl_game_id: g.id,
      home_team_id: g.homeTeam.abbrev,
      away_team_id: g.awayTeam.abbrev,
      start_time: g.startTimeUTC,
      status: 'SCHEDULED'
    }));

    console.log(`[NHL SCHEDULE] Requested date: ${dateStr}, Found ${games.length} games`);
    console.log(`[NHL SCHEDULE] Total games in API response: ${allGames.length}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        games,
        sourceUrl: `https://www.nhl.com/schedule/${dateStr}`
      })
    };
  } catch (error: any) {
    console.error('[NHL SCHEDULE ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Failed to fetch NHL schedule'
      })
    };
  }
};

export { handler };
