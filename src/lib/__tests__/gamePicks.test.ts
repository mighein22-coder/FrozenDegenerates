import { describe, expect, it } from 'vitest';
import {
  gamePicksPath,
  gameWinnerId,
  picksOpenLabel,
  summarizeGamePicks
} from '../gamePicks';
import type { Profile } from '../supabase';
import type { Game, Pick } from '../../types';

/** The per-game picks screen (issue #54). */

const WEEK_ID = 'week-2026-11-07';

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    weekId: WEEK_ID,
    homeTeamId: 'BOS',
    awayTeamId: 'TOR',
    startTime: '2026-11-08T00:00:00.000Z',
    status: 'SCHEDULED',
    ...overrides
  };
}

function profile(id: string, name: string): Profile {
  return {
    id,
    email: `${id}@example.com`,
    name,
    avatar: null,
    role: 'member',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z'
  };
}

function pick(userId: string, teamId: string, confidence = 1, gameId = 'g1'): Pick {
  return {
    userId,
    weekId: WEEK_ID,
    gameId,
    selectedTeamId: teamId,
    confidence,
    pointsEarned: 0,
    result: 'PENDING'
  };
}

describe('summarizeGamePicks', () => {
  const members = [
    profile('a', 'Alice'),
    profile('b', 'Bob'),
    profile('c', 'Carol'),
    profile('d', 'Dave')
  ];

  it('splits the picks into the home and away sides', () => {
    const summary = summarizeGamePicks(
      game(),
      [pick('a', 'BOS'), pick('b', 'TOR'), pick('c', 'BOS')],
      members
    );
    expect(summary.home.teamId).toBe('BOS');
    expect(summary.home.picks.map(p => p.member.name)).toEqual(['Alice', 'Carol']);
    expect(summary.away.teamId).toBe('TOR');
    expect(summary.away.picks.map(p => p.member.name)).toEqual(['Bob']);
  });

  it('lists the highest confidence first, then by name', () => {
    const summary = summarizeGamePicks(
      game(),
      [pick('b', 'BOS', 2), pick('a', 'BOS', 2), pick('c', 'BOS', 5)],
      members
    );
    expect(summary.home.picks.map(p => p.member.name)).toEqual(['Carol', 'Alice', 'Bob']);
  });

  it('totals the confidence on each side', () => {
    const summary = summarizeGamePicks(
      game(),
      [pick('a', 'BOS', 5), pick('b', 'BOS', 2), pick('c', 'TOR', 4)],
      members
    );
    expect(summary.home.totalConfidence).toBe(7);
    expect(summary.away.totalConfidence).toBe(4);
  });

  it('lists everybody with no pick on the game, by name', () => {
    const summary = summarizeGamePicks(game(), [pick('c', 'BOS'), pick('a', 'TOR')], members);
    expect(summary.noPick.map(m => m.name)).toEqual(['Bob', 'Dave']);
  });

  it('ignores picks on other games', () => {
    const summary = summarizeGamePicks(
      game(),
      [pick('a', 'BOS', 1, 'g2'), pick('b', 'TOR')],
      members
    );
    expect(summary.home.picks).toHaveLength(0);
    expect(summary.noPick.map(m => m.name)).toEqual(['Alice', 'Carol', 'Dave']);
  });

  it('does not count a pick for a team that is not in the game', () => {
    const summary = summarizeGamePicks(game(), [pick('a', 'NYR')], members);
    expect(summary.home.picks).toHaveLength(0);
    expect(summary.away.picks).toHaveLength(0);
    expect(summary.noPick.map(m => m.name)).toContain('Alice');
  });

  it('skips a pick by someone who is not a member', () => {
    const summary = summarizeGamePicks(game(), [pick('ghost', 'BOS')], members);
    expect(summary.home.picks).toHaveLength(0);
    expect(summary.noPick).toHaveLength(4);
  });
});

describe('gameWinnerId', () => {
  it('names the team with more goals in a final game', () => {
    expect(gameWinnerId(game({ status: 'FINAL', homeScore: 3, awayScore: 2 }))).toBe('BOS');
    expect(gameWinnerId(game({ status: 'FINAL', homeScore: 1, awayScore: 4 }))).toBe('TOR');
  });

  it('has no winner until the game is final', () => {
    expect(gameWinnerId(game())).toBeNull();
    expect(gameWinnerId(game({ status: 'LIVE', homeScore: 3, awayScore: 2 }))).toBeNull();
  });

  it('has no winner when a final game has no score', () => {
    expect(gameWinnerId(game({ status: 'FINAL' }))).toBeNull();
  });
});

describe('picksOpenLabel', () => {
  it('names the Saturday noon ET deadline', () => {
    expect(picksOpenLabel('2026-11-07')).toBe('Opens Sat 12:00 PM ET');
  });
});

describe('gamePicksPath', () => {
  it('links to a game in a week', () => {
    expect(gamePicksPath('', WEEK_ID, 'g1')).toBe(`/matrix/game/g1?week=${WEEK_ID}`);
  });

  it('links to the game list when no game is given', () => {
    expect(gamePicksPath('', WEEK_ID)).toBe(`/matrix/game?week=${WEEK_ID}`);
  });

  it('keeps the other parameters and replaces the week', () => {
    expect(gamePicksPath('?week=week-2026-10-31&order=season', WEEK_ID, 'g1')).toBe(
      `/matrix/game/g1?week=${WEEK_ID}&order=season`
    );
  });
});
