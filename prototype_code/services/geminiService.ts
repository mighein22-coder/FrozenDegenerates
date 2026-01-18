import { GoogleGenAI, Type } from "@google/genai";
import { Team, Game } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeMatchup = async (homeTeam: Team, awayTeam: Team): Promise<string> => {
  try {
    const prompt = `
      Analyze the NHL matchup between ${homeTeam.city} ${homeTeam.name} (Home) and ${awayTeam.city} ${awayTeam.name} (Away).
      Provide a brief, 2-sentence expert analysis on key factors (goalies, recent form, injuries) and predict a winner with a percentage confidence.
      Keep it concise and styled for a sports betting dashboard.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return "AI Analysis currently unavailable. Check back closer to game time.";
  }
};

export interface ScheduleResult {
  games: Partial<Game>[];
  sourceUrl: string;
}

export const fetchRealNhlSchedule = async (dateStr: string): Promise<ScheduleResult> => {
  try {
    const prompt = `Find the actual NHL schedule for Saturday, ${dateStr}. 
    Return a JSON array of games where each game has:
    - homeTeamId: 3-letter abbreviation (e.g., BOS, TOR)
    - awayTeamId: 3-letter abbreviation
    - startTime: UTC ISO string
    
    Only return the JSON. No other text.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            games: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  homeTeamId: { type: Type.STRING },
                  awayTeamId: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                },
                required: ["homeTeamId", "awayTeamId", "startTime"]
              }
            }
          }
        }
      },
    });

    const data = JSON.parse(response.text);
    const sourceUrl = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web?.uri || "https://www.nhl.com/schedule";

    return {
      games: data.games.map((g: any, index: number) => ({
        id: `prod-${dateStr}-${index}`,
        weekId: `week-${dateStr}`,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        startTime: g.startTime,
        status: 'SCHEDULED'
      })),
      sourceUrl
    };
  } catch (error) {
    console.error("Failed to fetch real schedule:", error);
    throw error;
  }
};