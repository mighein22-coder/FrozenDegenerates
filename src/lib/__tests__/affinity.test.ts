import { describe, it, expect } from 'vitest';
import { topTeams } from '../affinity';
import type { Pick } from '../../types';

let n = 0;
const pick = (selectedTeamId: string, confidence: number): Pick => ({
  userId: 'me',
  weekId: 'week-2026-10-03',
  gameId: `g${n++}`,
  selectedTeamId,
  confidence,
  pointsEarned: 0,
  result: 'PENDING'
});

describe('topTeams', () => {
  it('returns nothing for a member with no picks', () => {
    expect(topTeams([])).toEqual([]);
  });

  it('ranks by times picked first', () => {
    const picks = [pick('BOS', 1), pick('BOS', 1), pick('TOR', 5), pick('MTL', 4)];
    expect(topTeams(picks).map(t => t.id)).toEqual(['BOS', 'TOR', 'MTL']);
  });

  it('breaks a count tie by the larger confidence sum', () => {
    const picks = [
      pick('BOS', 1), pick('BOS', 2), // 2 picks, sum 3
      pick('TOR', 5), pick('TOR', 4), // 2 picks, sum 9
      pick('MTL', 3), pick('MTL', 3)  // 2 picks, sum 6
    ];
    expect(topTeams(picks)).toEqual([
      { id: 'TOR', count: 2, confidenceSum: 9 },
      { id: 'MTL', count: 2, confidenceSum: 6 },
      { id: 'BOS', count: 2, confidenceSum: 3 }
    ]);
  });

  it('does not let a big confidence sum outrank a higher count', () => {
    const picks = [pick('BOS', 1), pick('BOS', 1), pick('BOS', 1), pick('TOR', 5), pick('TOR', 5)];
    expect(topTeams(picks).map(t => t.id)).toEqual(['BOS', 'TOR']);
  });

  it('cuts the list to three, using confidence to decide who makes it', () => {
    const picks = [
      pick('BOS', 1), pick('TOR', 2), pick('MTL', 3), pick('OTT', 5)
    ];
    expect(topTeams(picks).map(t => t.id)).toEqual(['OTT', 'MTL', 'TOR']);
  });

  it('falls back to team id when count and confidence both tie', () => {
    const picks = [pick('TOR', 3), pick('BOS', 3), pick('MTL', 3)];
    expect(topTeams(picks).map(t => t.id)).toEqual(['BOS', 'MTL', 'TOR']);
  });
});
