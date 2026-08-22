import type { StandingsRow } from '../types';

/**
 * Sorts standings and assigns ranks.
 *
 * Ordering: points descending, then wins descending, then name A-Z. Wins break
 * point ties because a player who earned the same points from more correct picks
 * spread their confidence better.
 *
 * Ranks are *competition ranks*: players who tie on both points and wins share a
 * rank, and the next rank skips accordingly (1, 2, 2, 4). The previous `idx + 1`
 * numbering handed tied players different ranks based on nothing but array order.
 *
 * `scoreKey` selects which points column drives the ordering, so season and
 * per-segment standings can share this function.
 */
export function rankStandings<T extends Pick<StandingsRow, 'wins' | 'name' | 'rank'>>(
  rows: T[],
  scoreKey: keyof T
): T[] {
  const score = (row: T) => Number(row[scoreKey] ?? 0);

  const sorted = [...rows].sort(
    (a, b) =>
      score(b) - score(a) ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
  );

  let lastRank = 0;
  return sorted.map((row, idx) => {
    const prev = sorted[idx - 1];
    const tiedWithPrev =
      prev !== undefined && score(prev) === score(row) && prev.wins === row.wins;

    lastRank = tiedWithPrev ? lastRank : idx + 1;
    return { ...row, rank: lastRank };
  });
}
