import { describe, it, expect } from 'vitest';
import { rankStandings } from '../standings';

const player = (name: string, totalPoints: number, wins: number, losses = 0) => ({
  userId: name.toLowerCase(),
  name,
  avatar: '',
  totalPoints,
  wins,
  losses,
  weeklyScore: 0,
  rank: 0
});

describe('rankStandings', () => {
  it('orders by points descending', () => {
    const ranked = rankStandings(
      [player('Ann', 10, 4), player('Bob', 30, 9), player('Cy', 20, 7)],
      'totalPoints'
    );
    expect(ranked.map(r => r.name)).toEqual(['Bob', 'Cy', 'Ann']);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks point ties on wins', () => {
    const ranked = rankStandings(
      [player('Ann', 20, 5), player('Bob', 20, 8)],
      'totalPoints'
    );
    expect(ranked.map(r => r.name)).toEqual(['Bob', 'Ann']);
    expect(ranked.map(r => r.rank)).toEqual([1, 2]);
  });

  it('gives genuinely tied players the same rank and skips the next', () => {
    const ranked = rankStandings(
      [player('Ann', 20, 5), player('Bob', 20, 5), player('Cy', 10, 3)],
      'totalPoints'
    );
    expect(ranked.map(r => r.rank)).toEqual([1, 1, 3]);
  });

  it('orders fully tied players by name so the table is stable', () => {
    const ranked = rankStandings(
      [player('Zoe', 20, 5), player('Ann', 20, 5)],
      'totalPoints'
    );
    expect(ranked.map(r => r.name)).toEqual(['Ann', 'Zoe']);
  });

  it('can rank by a different points column', () => {
    const rows = [
      { ...player('Ann', 10, 2), segmentPoints: 9 },
      { ...player('Bob', 40, 9), segmentPoints: 1 }
    ];
    expect(rankStandings(rows, 'segmentPoints').map(r => r.name)).toEqual(['Ann', 'Bob']);
    expect(rankStandings(rows, 'totalPoints').map(r => r.name)).toEqual(['Bob', 'Ann']);
  });

  it('does not mutate the input array', () => {
    const rows = [player('Ann', 10, 2), player('Bob', 40, 9)];
    rankStandings(rows, 'totalPoints');
    expect(rows.map(r => r.name)).toEqual(['Ann', 'Bob']);
    expect(rows.every(r => r.rank === 0)).toBe(true);
  });
});
