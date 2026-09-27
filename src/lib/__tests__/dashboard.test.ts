import { describe, it, expect } from 'vitest';
import { summarizeWeekSheet, topStandings } from '../dashboard';
import { computeStandings } from '../standings';
import type { Profile } from '../supabase';
import type { Game, Pick, StandingsRow } from '../../types';

const WEEK = 'week-2026-10-03';

const game = (id: string, status: Game['status'] = 'SCHEDULED'): Game => ({
  id,
  weekId: WEEK,
  homeTeamId: 'BOS',
  awayTeamId: 'TOR',
  startTime: '2026-10-03T23:00:00Z',
  status
});

const pick = (
  gameId: string,
  confidence: number,
  result: Pick['result'] = 'PENDING'
): Pick => ({
  userId: 'me',
  weekId: WEEK,
  gameId,
  selectedTeamId: 'BOS',
  confidence,
  result,
  pointsEarned: result === 'WIN' ? confidence : 0
});

const row = (userId: string, rank: number, totalPoints = 0): StandingsRow => ({
  userId,
  name: userId,
  avatar: '',
  totalPoints,
  seasonPoints: totalPoints,
  wins: 0,
  losses: 0,
  weeklyScore: 0,
  rank
});

describe('summarizeWeekSheet', () => {
  it('orders the sheet most confident first and joins each pick to its game', () => {
    const games = [game('g1'), game('g2'), game('g3')];
    const sheet = summarizeWeekSheet([pick('g1', 2), pick('g2', 5), pick('g3', 3)], games);

    expect(sheet.lines.map(l => l.pick.confidence)).toEqual([5, 3, 2]);
    expect(sheet.lines.map(l => l.game?.id)).toEqual(['g2', 'g3', 'g1']);
  });

  it('totals only what has been scored', () => {
    const sheet = summarizeWeekSheet(
      [pick('g1', 5, 'WIN'), pick('g2', 4, 'LOSS'), pick('g3', 3, 'WIN'), pick('g4', 2)],
      []
    );

    expect(sheet).toMatchObject({ wins: 2, losses: 1, pending: 1, points: 8 });
  });

  it('keeps a pick pending on a final game until the scoring pass reaches it', () => {
    const sheet = summarizeWeekSheet([pick('g1', 5)], [game('g1', 'FINAL')]);
    expect(sheet).toMatchObject({ wins: 0, losses: 0, pending: 1, points: 0 });
  });

  it('leaves the game undefined while the schedule is still loading', () => {
    const sheet = summarizeWeekSheet([pick('g1', 5)], []);
    expect(sheet.lines[0].game).toBeUndefined();
  });

  it('is empty for a member with no sheet', () => {
    expect(summarizeWeekSheet([], [game('g1')])).toEqual({
      lines: [],
      wins: 0,
      losses: 0,
      pending: 0,
      points: 0
    });
  });
});

describe('topStandings', () => {
  const table = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => row(id, i + 1, 70 - i * 10));

  it('shows the first five and no extra row when the member is among them', () => {
    const { top, mine } = topStandings(table, 'c');
    expect(top.map(r => r.userId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mine).toBeNull();
  });

  it('appends the member below the cut when they are outside it', () => {
    const { top, mine } = topStandings(table, 'g');
    expect(top).toHaveLength(5);
    expect(mine?.userId).toBe('g');
    expect(mine?.rank).toBe(7);
  });

  it('cuts by position, so a tie at the start of the season does not list everyone', () => {
    const tied = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => row(id, 1));
    const { top, mine } = topStandings(tied, 'g');
    expect(top).toHaveLength(5);
    expect(top.every(r => r.rank === 1)).toBe(true);
    expect(mine?.userId).toBe('g');
  });

  it('handles a pool smaller than the limit, and an unknown member', () => {
    const small = table.slice(0, 3);
    expect(topStandings(small, 'zzz')).toEqual({ top: small, mine: null });
  });
});

describe('topStandings — same order as the Standings screen (issue #39)', () => {
  const member = (id: string): Profile => ({
    id,
    name: id.toUpperCase(),
    email: `${id}@example.com`,
    avatar: null,
    role: 'member',
    created_at: '',
    updated_at: ''
  });

  const scored = (userId: string, n: number, points: number, result: Pick['result']): Pick => ({
    userId,
    weekId: 'week-2026-10-17',
    gameId: `${userId}-${n}`,
    selectedTeamId: 'BOS',
    confidence: points || 1,
    result,
    pointsEarned: points
  });

  it('keeps the fewest-losses tiebreak and the ranks, without re-sorting', () => {
    const profiles = ['a', 'b', 'c', 'd', 'e', 'f'].map(member);
    const picks: Pick[] = [
      // B and C: 5 points off one win each; C lost two more getting there.
      scored('b', 1, 5, 'WIN'),
      scored('c', 1, 5, 'WIN'),
      scored('c', 2, 0, 'LOSS'),
      scored('c', 3, 0, 'LOSS'),
      scored('a', 1, 3, 'WIN'),
      scored('d', 1, 2, 'WIN'),
      scored('e', 1, 1, 'WIN'),
      scored('f', 1, 0, 'LOSS')
    ];

    // What the Standings screen renders, row for row.
    const standings = computeStandings(profiles, picks, { within: { segment: 1 } });
    const { top, mine } = topStandings(standings, 'f');

    expect(top.map(r => r.userId)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(top.map(r => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(top).toEqual(standings.slice(0, 5));
    expect(mine?.userId).toBe('f');
  });
});
