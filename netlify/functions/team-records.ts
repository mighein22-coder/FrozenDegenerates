import type { Handler } from '@netlify/functions';

/**
 * Netlify Function: Team Records Proxy
 * Fetches current NHL standings server-side to avoid browser CORS issues.
 * Returns a compact map of team abbreviation -> "W-L-OTL" string.
 */
const handler: Handler = async () => {
  try {
    const response = await fetch('https://api-web.nhle.com/v1/standings/now');

    if (!response.ok) {
      throw new Error(`NHL API returned status ${response.status}`);
    }

    const data = await response.json();

    const records: Record<string, string> = {};
    for (const entry of data.standings ?? []) {
      const abbrev: string = entry.teamAbbrev?.default ?? entry.teamAbbrev;
      if (abbrev) {
        records[abbrev] = `${entry.wins}-${entry.losses}-${entry.otLosses}`;
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: JSON.stringify(records)
    };
  } catch (error: any) {
    console.error('[TEAM RECORDS ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Failed to fetch NHL standings' })
    };
  }
};

export { handler };
