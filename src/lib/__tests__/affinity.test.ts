import { describe, it, expect } from 'vitest';
import {
  parseAffinitySort,
  resolveAffinityUser,
  sortAffinity,
  summarizeAffinity
} from '../affinity';
import type { Pick } from '../../types';

let n = 0;
const pick = (
  selectedTeamId: string,
  confidence: number,
  result: Pick['result'] = 'PENDING'
): Pick => ({
  userId: 'me',
  weekId: 'week-2026-10-03',
  gameId: `g${n++}`,
  selectedTeamId,
  confidence,
  pointsEarned: result === 'WIN' ? confidence : 0,
  result
});

describe('summarizeAffinity', () => {
  it('returns nothing for a member with no picks', () => {
    expect(summarizeAffinity([])).toEqual([]);
  });

  it('rolls picks up per team with every measure', () => {
    const rows = summarizeAffinity([
      pick('BOS', 5, 'WIN'),
      pick('BOS', 2, 'LOSS'),
      pick('BOS', 3, 'WIN'),
      pick('TOR', 4, 'LOSS')
    ]);
    expect(rows).toContainEqual({ id: 'BOS', count: 3, confidenceSum: 10, wins: 2, losses: 1, points: 8 });
    expect(rows).toContainEqual({ id: 'TOR', count: 1, confidenceSum: 4, wins: 0, losses: 1, points: 0 });
    expect(rows).toHaveLength(2);
  });

  it('counts a pending pick as picked but neither a win nor a loss', () => {
    const [row] = summarizeAffinity([pick('BOS', 3, 'PENDING'), pick('BOS', 2, 'WIN')]);
    expect(row).toMatchObject({ count: 2, confidenceSum: 5, wins: 1, losses: 0, points: 2 });
  });

  it('takes points from pointsEarned, not from confidence', () => {
    const adjusted = { ...pick('BOS', 5, 'WIN'), pointsEarned: 1 };
    expect(summarizeAffinity([adjusted])[0].points).toBe(1);
  });
});

describe('sortAffinity', () => {
  // BOS: most picks. TOR: most confidence. MTL: most points.
  const rows = summarizeAffinity([
    pick('BOS', 1, 'LOSS'), pick('BOS', 1, 'LOSS'), pick('BOS', 1, 'LOSS'),
    pick('TOR', 5, 'LOSS'), pick('TOR', 5, 'LOSS'),
    pick('MTL', 2, 'WIN'), pick('MTL', 3, 'WIN')
  ]);

  it('sorts by times picked', () => {
    // TOR and MTL tie on 2 picks; TOR's higher confidence puts it ahead.
    expect(sortAffinity(rows, 'picks').map(r => r.id)).toEqual(['BOS', 'TOR', 'MTL']);
  });

  it('sorts by total confidence', () => {
    expect(sortAffinity(rows, 'confidence').map(r => r.id)).toEqual(['TOR', 'MTL', 'BOS']);
  });

  it('sorts by points earned', () => {
    expect(sortAffinity(rows, 'points')[0].id).toBe('MTL');
  });

  // Level on 2 picks, separated by confidence then points:
  // BOS 6 conf / 0 pts, TOR 6 conf / 6 pts, MTL 4 conf / 4 pts.
  const tieRows = summarizeAffinity([
    pick('BOS', 3, 'LOSS'), pick('BOS', 3, 'LOSS'),
    pick('TOR', 3, 'WIN'), pick('TOR', 3, 'WIN'),
    pick('MTL', 2, 'WIN'), pick('MTL', 2, 'WIN')
  ]);

  it('Times picked: ties go to confidence, then points', () => {
    expect(sortAffinity(tieRows, 'picks').map(r => r.id)).toEqual(['TOR', 'BOS', 'MTL']);
  });

  it('Times picked: equal count and confidence go to points', () => {
    const rows = summarizeAffinity([
      pick('BOS', 3, 'LOSS'), pick('TOR', 3, 'WIN')
    ]);
    expect(sortAffinity(rows, 'picks').map(r => r.id)).toEqual(['TOR', 'BOS']);
  });

  it('Confidence: ties go to times picked, then points', () => {
    const rows = summarizeAffinity([
      pick('BOS', 5, 'LOSS'),                       // 1 pick, 5 conf, 0 pts
      pick('TOR', 2, 'WIN'), pick('TOR', 3, 'LOSS'), // 2 picks, 5 conf, 2 pts
      pick('MTL', 1, 'WIN'), pick('MTL', 4, 'WIN')   // 2 picks, 5 conf, 5 pts
    ]);
    expect(sortAffinity(rows, 'confidence').map(r => r.id)).toEqual(['MTL', 'TOR', 'BOS']);
  });

  it('Points: ties go to confidence, then times picked', () => {
    const rows = summarizeAffinity([
      pick('BOS', 4, 'WIN'),                         // 4 pts, 4 conf, 1 pick
      pick('TOR', 1, 'WIN'), pick('TOR', 3, 'WIN'),  // 4 pts, 4 conf, 2 picks
      pick('MTL', 4, 'WIN'), pick('MTL', 5, 'LOSS')  // 4 pts, 9 conf, 2 picks
    ]);
    expect(sortAffinity(rows, 'points').map(r => r.id)).toEqual(['MTL', 'TOR', 'BOS']);
  });

  it('breaks a tie on all three measures by team name, not abbreviation', () => {
    // By name: Capitals, Lightning, Maple Leafs. By abbreviation it would be TBL, TOR, WSH.
    const tied = summarizeAffinity([pick('WSH', 3), pick('TOR', 3), pick('TBL', 3)]);
    for (const sort of ['picks', 'confidence', 'points'] as const) {
      expect(sortAffinity(tied, sort).map(r => r.id)).toEqual(['WSH', 'TBL', 'TOR']);
    }
  });

  it('does not mutate its input', () => {
    const before = rows.map(r => r.id);
    sortAffinity(rows, 'points');
    expect(rows.map(r => r.id)).toEqual(before);
  });
});

describe('parseAffinitySort', () => {
  it('accepts the three sorts', () => {
    expect(parseAffinitySort('picks')).toBe('picks');
    expect(parseAffinitySort('confidence')).toBe('confidence');
    expect(parseAffinitySort('points')).toBe('points');
  });

  it('falls back to picks for anything else', () => {
    expect(parseAffinitySort(null)).toBe('picks');
    expect(parseAffinitySort('wins')).toBe('picks');
  });
});

describe('resolveAffinityUser', () => {
  const ids = ['a', 'b', 'c'];

  it('uses the requested member when they are in the league', () => {
    expect(resolveAffinityUser('b', ids, 'a')).toBe('b');
  });

  it('defaults to the signed-in member', () => {
    expect(resolveAffinityUser(null, ids, 'c')).toBe('c');
  });

  it('ignores a requested id that is not in the league', () => {
    expect(resolveAffinityUser('gone', ids, 'c')).toBe('c');
  });

  it('falls back to the first member, and to nothing for an empty league', () => {
    expect(resolveAffinityUser(null, ids, undefined)).toBe('a');
    expect(resolveAffinityUser(null, [], 'a')).toBeUndefined();
  });
});
