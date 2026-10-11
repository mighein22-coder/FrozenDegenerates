import type { Pick } from '../types';

/** One team on a member's affinity card. */
export interface TeamAffinity {
  id: string;
  /** Times the member picked this team to win. */
  count: number;
  /** Confidence points the member put on those picks, summed. */
  confidenceSum: number;
}

/**
 * The teams a member picks most, for the Team Affinity screen.
 *
 * Ranked by times picked, then by the confidence summed over those picks (both
 * descending), so two teams picked equally often are separated by how much the
 * member trusted them. A team id breaks any remaining tie, which keeps the
 * three shown from changing between renders.
 */
export function topTeams(picks: Pick[], limit = 3): TeamAffinity[] {
  const byTeam = new Map<string, TeamAffinity>();

  for (const p of picks) {
    const entry = byTeam.get(p.selectedTeamId) ?? {
      id: p.selectedTeamId,
      count: 0,
      confidenceSum: 0
    };
    entry.count += 1;
    entry.confidenceSum += p.confidence;
    byTeam.set(p.selectedTeamId, entry);
  }

  return [...byTeam.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.confidenceSum - a.confidenceSum ||
        a.id.localeCompare(b.id)
    )
    .slice(0, limit);
}
