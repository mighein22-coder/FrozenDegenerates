import { formatETTime, getPickDeadline } from './timezone';
import type { Profile } from './supabase';
import type { Game, Pick } from '../types';

/**
 * Who picked a particular game (issue #54, ported from DegenNFL #44).
 *
 * THE SCREEN ONLY EVER SHOWS A LOCKED WEEK. Pick visibility here is per week,
 * not per game: `picks_revealed` (0003, 0011) opens a week's picks at its
 * Saturday noon ET deadline, all at once. Until then the only pick in the data
 * is your own, and a tally over that would say 'one person took BOS' about a
 * game half the league has picked. So an open week's games are not summarised
 * at all, even one that has gone final before the deadline.
 *
 * That is also what makes the 'no pick' list safe: a locked week takes no new
 * picks, so a member missing from both sides really did not pick the game.
 */

export interface SidePick {
  member: Profile;
  pick: Pick;
}

export interface GameSide {
  teamId: string;
  /** Highest confidence first, then by name: a stable order people compare. */
  picks: SidePick[];
  /** Confidence points riding on this side, summed across its picks. */
  totalConfidence: number;
}

export interface GamePicksSummary {
  home: GameSide;
  away: GameSide;
  /** Members with no pick on this game. Only meaningful once the week is locked. */
  noPick: Profile[];
}

function byConfidenceThenName(a: SidePick, b: SidePick): number {
  return b.pick.confidence - a.pick.confidence || a.member.name.localeCompare(b.member.name);
}

/**
 * Split the picks on one game into its two sides, plus the members on neither.
 *
 * Only call it for a locked week; see the note at the top of the file. Picks
 * for a different game are ignored, and so is a pick for a team on neither side
 * of this one, which cannot be written but would otherwise count a member as
 * having picked while listing them nowhere.
 */
export function summarizeGamePicks(
  game: Game,
  picks: Pick[],
  members: Profile[]
): GamePicksSummary {
  const byId = new Map(members.map(member => [member.id, member]));
  const home: SidePick[] = [];
  const away: SidePick[] = [];
  const picked = new Set<string>();

  for (const pick of picks) {
    if (pick.gameId !== game.id) continue;
    const member = byId.get(pick.userId);
    if (!member) continue;

    if (pick.selectedTeamId === game.homeTeamId) home.push({ member, pick });
    else if (pick.selectedTeamId === game.awayTeamId) away.push({ member, pick });
    else continue;

    picked.add(member.id);
  }

  const side = (teamId: string, list: SidePick[]): GameSide => ({
    teamId,
    picks: [...list].sort(byConfidenceThenName),
    totalConfidence: list.reduce((sum, entry) => sum + entry.pick.confidence, 0)
  });

  return {
    home: side(game.homeTeamId, home),
    away: side(game.awayTeamId, away),
    noPick: members
      .filter(member => !picked.has(member.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

/** The team that won a final game, or null while there is no result. */
export function gameWinnerId(game: Game): string | null {
  if (game.status !== 'FINAL' || game.homeScore == null || game.awayScore == null) return null;
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

/** When an open week's picks become public, for the greyed-out game list. */
export function picksOpenLabel(saturdayDate: string): string {
  return `Opens ${formatETTime(getPickDeadline(saturdayDate), 'EEE h:mm a')} ET`;
}

/**
 * Link to the Game Picks screen, with or without a game chosen.
 *
 * The week rides in the query string, as it does on the Matrix. Every other
 * parameter in `search` is kept, so `?order=` survives the trip there and back.
 */
export function gamePicksPath(search: string, weekId: string, gameId?: string): string {
  const params = new URLSearchParams(search);
  params.set('week', weekId);
  return `/matrix/game${gameId ? `/${gameId}` : ''}?${params.toString()}`;
}
