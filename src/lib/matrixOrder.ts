import { getSegments, getSegmentForWeekId } from './segments';
import type { StandingsScope } from './standings';
import type { Segment } from '../types';

/**
 * Which slice of the season the League Matrix orders its rows by (issue #39).
 *
 * The rule never changes — it is `computeStandings`, the same points → wins →
 * fewest losses → name order the Standings screen uses — only the scope it is
 * computed over. Both narrow scopes hang off the week already chosen in the
 * Matrix's week selector, so there is no second control to keep in step:
 * SEGMENT means the segment that week falls in, not a separately picked one.
 */
export type MatrixOrder = 'week' | 'segment' | 'season';

export const MATRIX_ORDERS: readonly MatrixOrder[] = ['week', 'segment', 'season'];

/**
 * Reads `?order=`. Missing or unrecognised means WEEK: the grid shows one
 * week's sheets, so that week's results are the order that matches what is on
 * screen. Season and Segment are a deliberate step back from it.
 */
export function parseMatrixOrder(value: string | null): MatrixOrder {
  return (MATRIX_ORDERS as readonly string[]).includes(value ?? '')
    ? (value as MatrixOrder)
    : 'week';
}

export interface ResolvedMatrixOrder {
  /**
   * The order actually applied. Differs from the one asked for only when
   * SEGMENT is asked of a week that sits in no segment (a preseason week),
   * which falls back to SEASON rather than to an empty table.
   */
  order: MatrixOrder;
  /** The segment the week falls in, or null when it is outside all of them. */
  segment: Segment | null;
  /** What to hand `computeStandings` as its scope. */
  within: StandingsScope['within'];
}

export function resolveMatrixOrder(
  requested: MatrixOrder,
  weekId: string,
  segments: Segment[] = getSegments()
): ResolvedMatrixOrder {
  const segment = weekId ? getSegmentForWeekId(weekId, segments) : null;

  if (requested === 'week' && weekId) {
    return { order: 'week', segment, within: { week: weekId } };
  }
  if (requested === 'segment' && segment) {
    return { order: 'segment', segment, within: { segment: segment.number } };
  }
  return { order: 'season', segment, within: null };
}
