import type { Game, Pick, StandingsRow } from '../types';

/**
 * Pure helpers behind the Dashboard, kept out of the component so the two
 * things it would be easy to get wrong — which rows the top-five shows, and
 * how a half-played sheet adds up — are testable without rendering anything.
 */

/** One line of a member's sheet: the pick, and the game it was made on. */
export interface SheetLine {
  pick: Pick;
  /** Undefined only while the week's schedule is still loading. */
  game: Game | undefined;
}

export interface WeekSheet {
  /** Most confident first — the order a member thinks about their sheet in. */
  lines: SheetLine[];
  wins: number;
  losses: number;
  /** Picks not yet scored, including any on a final game the sync has not reached. */
  pending: number;
  points: number;
}

/**
 * Joins a member's saved picks for one week to that week's games and totals
 * what has been scored so far.
 *
 * Results come from `pick.result` alone, never recomputed from the game score:
 * the standings are summed from the same column, so the sheet and the table
 * can never disagree. A final game whose pick is still PENDING stays pending
 * here until the scoring pass reaches it.
 */
export function summarizeWeekSheet(picks: Pick[], games: Game[]): WeekSheet {
  const gameById = new Map(games.map(g => [g.id, g]));

  const lines = [...picks]
    .sort((a, b) => b.confidence - a.confidence)
    .map(pick => ({ pick, game: gameById.get(pick.gameId) }));

  return {
    lines,
    wins: picks.filter(p => p.result === 'WIN').length,
    losses: picks.filter(p => p.result === 'LOSS').length,
    pending: picks.filter(p => p.result === 'PENDING').length,
    points: picks.reduce((sum, p) => sum + p.pointsEarned, 0)
  };
}

export interface TopStandings {
  /** The first `limit` rows, in the order `computeStandings` returned them. */
  top: StandingsRow[];
  /**
   * The signed-in member's row when it falls below the cut, else null. A
   * shortlist that silently leaves out the person reading it hides the one
   * row they came to check.
   */
  mine: StandingsRow | null;
}

/**
 * The Dashboard's shortlist. Rows are cut by position, not by rank, so a tie
 * straddling fifth place does not balloon the list — before the first scored
 * week everyone is tied at 1st. Ranks are shown as `computeStandings`
 * assigned them and must not be renumbered from the index.
 */
export function topStandings(
  rows: StandingsRow[],
  userId: string | undefined,
  limit = 5
): TopStandings {
  const top = rows.slice(0, limit);
  const inTop = top.some(r => r.userId === userId);
  const mine = inTop ? null : rows.find(r => r.userId === userId) ?? null;
  return { top, mine };
}
