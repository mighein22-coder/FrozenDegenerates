import type { Handler, HandlerEvent } from '@netlify/functions';
import { GoogleGenAI } from '@google/genai';

/**
 * Netlify Function: Analyze NHL Matchup via Gemini AI
 * This keeps the GEMINI_API_KEY secure on the server-side
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
    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { homeTeam, awayTeam } = body;

    if (!homeTeam || !awayTeam) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'homeTeam and awayTeam parameters are required' })
      };
    }

    // Initialize Gemini AI
    const ai = new GoogleGenAI({ apiKey });

    // Generate matchup analysis
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Provide a brief expert analysis (2-3 sentences) for this NHL matchup: ${homeTeam} vs ${awayTeam}. Include recent form, head-to-head, and key factors.`
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        analysis: result.text
      })
    };
  } catch (error: any) {
    console.error('[GEMINI ANALYZE ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'AI Analysis currently unavailable'
      })
    };
  }
};

export { handler };
