import type { Profile } from './supabase';
import { getSegments, getSegmentForWeekId } from './segments';
import type { Pick, Segment, StandingsRow } from '../types';

export interface StandingsScope {
  /**
   * Week whose points populate `weeklyScore`. When omitted, falls back to the
   * most recent week that has any resolved picks, so the column is meaningful
   * before the current week has been scored.
   *
   * This names the COLUMN only and filters nothing — `within` below is what
   * decides who is ahead of whom.
   */
  weekId?: string;
  /**
   * What counts toward points, wins, losses and rank: the whole season (omit
   * or pass null), one segment, or one week.
   *
   * One field rather than two nullable ones because the three are exclusive —
   * a table scoped to both a segment and a week is not a thing, and a shape
   * that cannot express it needs no rule saying so. The Matrix's Order-by
   * pills (issue #39) are this union, one pill each.
   */
  within?: { segment: number } | { week: string } | null;
}

/** The latest week that has at least one scored pick, if any. */
function mostRecentScoredWeekId(picks: Pick[]): string | undefined {
  let latest: string | undefined;
  for (const pick of picks) {
    if (pick.result !== 'PENDING' && (latest === undefined || pick.weekId > latest)) {
      latest = pick.weekId;
    }
  }
  return latest;
}

/**
 * Builds the standings table from raw profiles and picks.
 *
 * Kept as a pure function rather than a query so the season table and each
 * segment table can be derived from one fetch, letting the segment selector
 * switch scope without a round-trip. At pool scale (~20 members, 28 weeks, 5
 * picks each) that is a few thousand rows.
 *
 * Scope is the season, one segment, or one week: whichever is chosen, points,
 * wins, losses and rank count only picks inside it. `seasonPoints` stays
 * cumulative in every scope so a member's overall position is never hidden.
 *
 * Only resolved picks move anything, and other members' picks are not
 * readable until the week locks (0003), so a week scope before any game is
 * final has everyone at 0-0 and falls through to name order. That is the
 * table being empty, not the viewer's own unscored sheet leaking a position.
 *
 * Members with no picks in the selected scope still appear, at zero — they
 * are behind, not absent.
 */
export function computeStandings(
  profiles: Profile[],
  picks: Pick[],
  scope: StandingsScope = {}
): StandingsRow[] {
  const { within = null } = scope;
  const segments: Segment[] = getSegments();
  const weekId = scope.weekId ?? mostRecentScoredWeekId(picks);

  // Precompute each week's segment once rather than per pick per member
  const segmentByWeek = new Map<string, number | null>();
  const segmentOf = (pickWeekId: string): number | null => {
    if (!segmentByWeek.has(pickWeekId)) {
      segmentByWeek.set(pickWeekId, getSegmentForWeekId(pickWeekId, segments)?.number ?? null);
    }
    return segmentByWeek.get(pickWeekId)!;
  };

  const picksByUser = new Map<string, Pick[]>();
  for (const pick of picks) {
    const list = picksByUser.get(pick.userId);
    if (list) list.push(pick);
    else picksByUser.set(pick.userId, [pick]);
  }

  const inScope = (pick: Pick): boolean => {
    if (within == null) return true;
    if ('week' in within) return pick.weekId === within.week;
    return segmentOf(pick.weekId) === within.segment;
  };

  const rows = profiles.map(profile => {
    const userPicks = picksByUser.get(profile.id) ?? [];
    const scoped = within == null ? userPicks : userPicks.filter(inScope);

    return {
      userId: profile.id,
      name: profile.name,
      avatar: profile.avatar ?? '',
      totalPoints: scoped.reduce((sum, p) => sum + p.pointsEarned, 0),
      seasonPoints: userPicks.reduce((sum, p) => sum + p.pointsEarned, 0),
      wins: scoped.filter(p => p.result === 'WIN').length,
      losses: scoped.filter(p => p.result === 'LOSS').length,
      weeklyScore: weekId
        ? userPicks.filter(p => p.weekId === weekId).reduce((sum, p) => sum + p.pointsEarned, 0)
        : 0,
      rank: 0
    };
  });

  return rankStandings(rows, 'totalPoints');
}

/**
 * The one ordering rule for members, everywhere they are listed.
 *
 * Points descending, then wins descending, then losses ASCENDING, then name
 * A-Z. Wins break point ties because the same points off more correct picks
 * means the confidence was spread better. Losses break the rest: wins
 * descending already implies losses ascending when two members made the same
 * number of picks, so this only separates anyone after a missed week or a
 * short sheet — and then the member who gave less away is ahead.
 *
 * Name is last only so the order is stable, not because A-Z means anything.
 *
 * Deliberately NOT exported. Every screen that lists members — the Standings
 * table, the Dashboard's top five, the League Matrix — reaches this rule by
 * calling `computeStandings` and rendering the rows in the order it returns.
 * All three being the same order is the feature (issue #39), and a second
 * caller sorting for itself is how that quietly stops being true.
 */
function compareStandings<T extends { wins: number; losses: number; name: string }>(
  a: T,
  b: T,
  scoreOf: (row: T) => number
): number {
  return (
    scoreOf(b) - scoreOf(a) ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Sorts standings and assigns ranks.
 *
 * Ordering is `compareStandings` above.
 *
 * Ranks are *competition ranks*: members who tie on points, wins AND losses
 * share a rank, and the next rank skips accordingly (1, 2, 2, 4). All three
 * have to match — a rank shared by two rows the sort deliberately separated
 * would be the table contradicting itself. The previous `idx + 1` numbering
 * handed tied players different ranks based on nothing but array order.
 *
 * `scoreKey` selects which points column drives the ordering, so season and
 * per-segment standings can share this function.
 */
export function rankStandings<
  T extends { wins: number; losses: number; name: string; rank: number }
>(rows: T[], scoreKey: keyof T): T[] {
  const score = (row: T) => Number(row[scoreKey] ?? 0);

  const sorted = [...rows].sort((a, b) => compareStandings(a, b, score));

  let lastRank = 0;
  return sorted.map((row, idx) => {
    const prev = sorted[idx - 1];
    const tiedWithPrev =
      prev !== undefined &&
      score(prev) === score(row) &&
      prev.wins === row.wins &&
      prev.losses === row.losses;

    lastRank = tiedWithPrev ? lastRank : idx + 1;
    return { ...row, rank: lastRank };
  });
}
