import { describe, it, expect } from 'vitest';
import { computeStandings } from '../standings';
import type { Profile } from '../supabase';
import type { Pick } from '../../types';

const profile = (id: string, name: string): Profile => ({
  id,
  name,
  email: `${id}@example.com`,
  avatar: null,
  role: 'member',
  created_at: '',
  updated_at: ''
});

/** A resolved pick worth `points` in the week ending on `saturday`. */
const pick = (
  userId: string,
  saturday: string,
  points: number,
  result: Pick['result'] = points > 0 ? 'WIN' : 'LOSS'
): Pick => ({
  userId,
  weekId: `week-${saturday}`,
  gameId: `${userId}-${saturday}-${points}`,
  selectedTeamId: 'BOS',
  confidence: points || 1,
  pointsEarned: points,
  result
});

const ann = profile('ann', 'Ann');
const bob = profile('bob', 'Bob');
const cy = profile('cy', 'Cy');

// Ann front-loads the season, Bob finishes strong, Cy plays only segment 2.
const picks: Pick[] = [
  pick('ann', '2026-10-17', 5), // seg 1
  pick('ann', '2026-11-07', 4), // seg 1
  pick('ann', '2027-03-06', 1), // seg 3
  pick('bob', '2026-10-17', 1), // seg 1
  pick('bob', '2027-03-06', 5), // seg 3
  pick('bob', '2027-04-10', 5), // seg 3
  pick('cy', '2026-12-12', 3) // seg 2
];

describe('computeStandings — season scope', () => {
  it('totals every week and ranks on the season', () => {
    const rows = computeStandings([ann, bob, cy], picks);
    expect(rows.map(r => [r.name, r.totalPoints, r.rank])).toEqual([
      ['Bob', 11, 1],
      ['Ann', 10, 2],
      ['Cy', 3, 3]
    ]);
  });

  it('reports seasonPoints equal to totalPoints when unscoped', () => {
    for (const row of computeStandings([ann, bob, cy], picks)) {
      expect(row.seasonPoints).toBe(row.totalPoints);
    }
  });
});

describe('computeStandings — segment scope', () => {
  it('resets points, record and rank to the segment', () => {
    const seg1 = computeStandings([ann, bob, cy], picks, { within: { segment: 1 } });
    expect(seg1.map(r => [r.name, r.totalPoints, r.rank])).toEqual([
      ['Ann', 9, 1], // 5 + 4 in segment 1
      ['Bob', 1, 2],
      ['Cy', 0, 3]
    ]);

    // Bob leads the season but trails in segment 1 — the whole point of segments
    const season = computeStandings([ann, bob, cy], picks);
    expect(season[0].name).toBe('Bob');
    expect(seg1[0].name).toBe('Ann');
  });

  it('keeps seasonPoints cumulative while scoped', () => {
    const seg1 = computeStandings([ann, bob, cy], picks, { within: { segment: 1 } });
    const byName = Object.fromEntries(seg1.map(r => [r.name, r]));
    expect(byName.Ann.totalPoints).toBe(9);
    expect(byName.Ann.seasonPoints).toBe(10);
    expect(byName.Bob.totalPoints).toBe(1);
    expect(byName.Bob.seasonPoints).toBe(11);
  });

  it('scopes wins and losses too', () => {
    const withLosses = [...picks, pick('ann', '2026-10-10', 0), pick('ann', '2027-03-13', 0)];

    const seg1 = computeStandings([ann], withLosses, { within: { segment: 1 } });
    expect([seg1[0].wins, seg1[0].losses]).toEqual([2, 1]);

    const season = computeStandings([ann], withLosses);
    expect([season[0].wins, season[0].losses]).toEqual([3, 2]);
  });

  it('still lists a member with no picks in the segment, at zero', () => {
    const seg2 = computeStandings([ann, bob, cy], picks, { within: { segment: 2 } });
    expect(seg2.map(r => r.name).sort()).toEqual(['Ann', 'Bob', 'Cy']);

    const byName = Object.fromEntries(seg2.map(r => [r.name, r]));
    expect(byName.Cy.totalPoints).toBe(3);
    expect(byName.Ann.totalPoints).toBe(0);
    expect(byName.Ann.seasonPoints).toBe(10); // not absent, just behind
  });

  it('ignores picks from weeks outside the configured season', () => {
    const withPreseason = [...picks, pick('cy', '2026-09-26', 5)];

    // Counts toward the season, belongs to no segment
    expect(computeStandings([cy], withPreseason)[0].totalPoints).toBe(8);
    expect(computeStandings([cy], withPreseason, { within: { segment: 1 } })[0].totalPoints).toBe(0);
    expect(computeStandings([cy], withPreseason, { within: { segment: 2 } })[0].totalPoints).toBe(3);
  });
});

describe('computeStandings — weekly score', () => {
  it('uses the requested week', () => {
    const rows = computeStandings([ann], picks, { weekId: 'week-2026-10-17' });
    expect(rows[0].weeklyScore).toBe(5);
  });

  it('falls back to the most recent scored week when none is given', () => {
    // Bob's latest scored week is 2027-04-10
    expect(computeStandings([bob], picks)[0].weeklyScore).toBe(5);
  });

  it('ignores pending picks when choosing the fallback week', () => {
    const withPending = [...picks, pick('bob', '2027-04-17', 0, 'PENDING')];
    expect(computeStandings([bob], withPending)[0].weeklyScore).toBe(5);
  });

  it('stays a season-wide figure even when a segment is selected', () => {
    const rows = computeStandings([ann], picks, {
      weekId: 'week-2027-03-06',
      within: { segment: 1 }
    });
    expect(rows[0].totalPoints).toBe(9); // segment 1 only
    expect(rows[0].weeklyScore).toBe(1); // the week actually asked for
  });
});

describe('computeStandings — week scope', () => {
  it('orders by that week alone', () => {
    // Ann is well ahead on the season; 2027-03-06 is Bob's week.
    const rows = computeStandings([ann, bob, cy], picks, {
      within: { week: 'week-2027-03-06' }
    });
    expect(rows.map(r => [r.name, r.totalPoints])).toEqual([
      ['Bob', 5],
      ['Ann', 1],
      ['Cy', 0]
    ]);
  });

  it('keeps seasonPoints cumulative and lists members who sat the week out', () => {
    const rows = computeStandings([ann, bob, cy], picks, {
      within: { week: 'week-2026-12-12' }
    });
    const byName = Object.fromEntries(rows.map(r => [r.name, r]));
    expect(byName.Cy).toMatchObject({ totalPoints: 3, seasonPoints: 3, rank: 1 });
    expect(byName.Ann).toMatchObject({ totalPoints: 0, wins: 0, losses: 0, seasonPoints: 10 });
  });

  it('applies the fewest-losses tiebreaker inside the week', () => {
    const week = '2026-10-24';
    const rows = computeStandings(
      [ann, bob],
      [
        // Both 3 points off one win; Ann also lost two picks that week.
        pick('ann', week, 3),
        { ...pick('ann', week, 0), gameId: 'ann-l1' },
        { ...pick('ann', week, 0), gameId: 'ann-l2' },
        pick('bob', week, 3)
      ],
      { within: { week: `week-${week}` } }
    );
    expect(rows.map(r => [r.name, r.wins, r.losses, r.rank])).toEqual([
      ['Bob', 1, 0, 1],
      ['Ann', 1, 2, 2]
    ]);
  });

  it('has everyone level before anything in the week is scored', () => {
    // Pending picks earn nothing, so the order falls through to the name.
    const week = '2027-04-17';
    const rows = computeStandings(
      [cy, bob, ann],
      [...picks, pick('cy', week, 0, 'PENDING'), pick('bob', week, 0, 'PENDING')],
      { within: { week: `week-${week}` } }
    );
    expect(rows.map(r => [r.name, r.totalPoints, r.rank])).toEqual([
      ['Ann', 0, 1],
      ['Bob', 0, 1],
      ['Cy', 0, 1]
    ]);
  });

  it('scopes the order without disturbing the weekly column', () => {
    // `weekId` names the column; `within` decides the order.
    const [row] = computeStandings([ann], picks, {
      within: { week: 'week-2026-10-17' },
      weekId: 'week-2027-03-06'
    });
    expect(row.totalPoints).toBe(5); // the scope
    expect(row.weeklyScore).toBe(1); // the column
    expect(row.seasonPoints).toBe(10);
  });
});

describe('computeStandings — tiebreakers', () => {
  it('puts the fewer-losses member ahead of an equal-points, equal-wins rival', () => {
    const rows = computeStandings(
      [ann, bob],
      [
        pick('ann', '2026-10-17', 3),
        pick('ann', '2026-10-24', 0), // a lost pick
        pick('bob', '2026-10-17', 3)
      ]
    );
    expect(rows.map(r => [r.name, r.rank])).toEqual([
      ['Bob', 1],
      ['Ann', 2]
    ]);
  });
});
