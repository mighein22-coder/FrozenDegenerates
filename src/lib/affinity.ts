import { TEAMS } from '../constants';
import type { Pick } from '../types';

/**
 * Pure helpers behind the Team Affinity screen (issue #51): one member's picks
 * from completed weeks, rolled up per team.
 */

/** One team on a member's affinity table. */
export interface TeamAffinity {
  id: string;
  /** Times the member picked this team to win. */
  count: number;
  /** Confidence points the member put on those picks, summed. */
  confidenceSum: number;
  wins: number;
  losses: number;
  /** Points those picks earned, summed from `pick.pointsEarned`. */
  points: number;
}

export type AffinitySort = 'picks' | 'confidence' | 'points';

export const AFFINITY_SORTS: readonly AffinitySort[] = ['picks', 'confidence', 'points'];

/** Reads `?sort=`. Missing or unrecognised means PICKS, the original affinity measure. */
export function parseAffinitySort(value: string | null): AffinitySort {
  return (AFFINITY_SORTS as readonly string[]).includes(value ?? '')
    ? (value as AffinitySort)
    : 'picks';
}

/**
 * Rolls a member's picks up per team, one row for every team picked at least
 * once. Win and loss counts come from `pick.result` and points from
 * `pick.pointsEarned` — the columns the standings are summed from — so this
 * screen can never disagree with the table. A PENDING pick counts toward
 * `count` and `confidenceSum` but is neither a win nor a loss.
 */
export function summarizeAffinity(picks: Pick[]): TeamAffinity[] {
  const byTeam = new Map<string, TeamAffinity>();

  for (const p of picks) {
    const row = byTeam.get(p.selectedTeamId) ?? {
      id: p.selectedTeamId,
      count: 0,
      confidenceSum: 0,
      wins: 0,
      losses: 0,
      points: 0
    };
    row.count += 1;
    row.confidenceSum += p.confidence;
    row.points += p.pointsEarned;
    if (p.result === 'WIN') row.wins += 1;
    if (p.result === 'LOSS') row.losses += 1;
    byTeam.set(p.selectedTeamId, row);
  }

  return [...byTeam.values()];
}

/**
 * The measures each sort compares, in order: the chosen one first, then the
 * other two break its ties. Team name is the last resort.
 */
const SORT_KEYS: Record<AffinitySort, ((row: TeamAffinity) => number)[]> = {
  picks: [row => row.count, row => row.confidenceSum, row => row.points],
  confidence: [row => row.confidenceSum, row => row.count, row => row.points],
  points: [row => row.points, row => row.confidenceSum, row => row.count]
};

/** The name a team is shown and tie-broken by; an unknown id sorts by itself. */
const teamName = (id: string): string => TEAMS[id]?.name ?? id;

/**
 * Largest first on the chosen measure, then on the other two in the order
 * `SORT_KEYS` gives, then by team name. Returns a new array.
 */
export function sortAffinity(rows: TeamAffinity[], sort: AffinitySort): TeamAffinity[] {
  const keys = SORT_KEYS[sort];
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const diff = key(b) - key(a);
      if (diff !== 0) return diff;
    }
    return teamName(a.id).localeCompare(teamName(b.id));
  });
}

/**
 * Whose affinity to show. The requested member if they are in the league,
 * otherwise the signed-in member, otherwise the first listed — never a stale
 * id from an old link, which would render an empty screen.
 */
export function resolveAffinityUser(
  requestedId: string | null,
  userIds: string[],
  currentUserId: string | undefined
): string | undefined {
  if (requestedId && userIds.includes(requestedId)) return requestedId;
  if (currentUserId && userIds.includes(currentUserId)) return currentUserId;
  return userIds[0];
}
