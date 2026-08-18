import { describe, it, expect } from 'vitest';
import {
  getSeasonSaturdays,
  getSegments,
  getSegmentForDate,
  getSegmentForWeekId,
  getCurrentSegment
} from '../segments';
import { SEASON_START, SEASON_END } from '../../constants';

describe('getSeasonSaturdays', () => {
  it('returns only Saturdays, in order, within the bounds', () => {
    const sats = getSeasonSaturdays('2026-09-29', '2027-04-10');
    expect(sats[0]).toBe('2026-10-03');
    expect(sats[sats.length - 1]).toBe('2027-04-10');
    expect(sats).toHaveLength(28);

    for (const d of sats) {
      expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(6);
    }
    expect([...sats].sort()).toEqual(sats);
  });

  it('includes a bound that is itself a Saturday', () => {
    // 2027-04-10 is a Saturday and the final day of the season
    expect(getSeasonSaturdays('2027-04-10', '2027-04-10')).toEqual(['2027-04-10']);
  });

  it('returns nothing when the range contains no Saturday', () => {
    expect(getSeasonSaturdays('2026-10-04', '2026-10-09')).toEqual([]);
  });
});

describe('getSegments', () => {
  it('splits the real 2026-27 season into three thirds', () => {
    const segments = getSegments(SEASON_START, SEASON_END);

    expect(segments.map(s => [s.startDate, s.endDate, s.weekCount])).toEqual([
      ['2026-10-03', '2026-12-05', 10],
      ['2026-12-12', '2027-02-06', 9],
      ['2027-02-13', '2027-04-10', 9]
    ]);
  });

  it('covers every Saturday exactly once, with no gap or overlap', () => {
    const sats = getSeasonSaturdays();
    const segments = getSegments();

    expect(segments.reduce((n, s) => n + s.weekCount, 0)).toBe(sats.length);
    for (const d of sats) {
      expect(getSegmentForDate(d, segments)).not.toBeNull();
    }
    // Each segment starts the week after the previous one ends
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startDate > segments[i - 1].endDate).toBe(true);
    }
  });

  it('gives the remainder to the earlier segments, never differing by more than one', () => {
    // 29 Saturdays -> 10/10/9
    const s29 = getSegments('2026-09-26', '2027-04-10');
    expect(s29.map(s => s.weekCount)).toEqual([10, 10, 9]);

    // 27 Saturdays -> 9/9/9
    const s27 = getSegments('2026-10-04', '2027-04-10');
    expect(s27.map(s => s.weekCount)).toEqual([9, 9, 9]);
  });

  it('handles a season shorter than three weeks without producing empty segments', () => {
    const two = getSegments('2026-10-01', '2026-10-10');
    expect(two.map(s => s.weekCount)).toEqual([1, 1]);
    expect(getSegments('2026-10-04', '2026-10-09')).toEqual([]);
  });
});

describe('getSegmentForDate', () => {
  it('is inclusive of both boundary Saturdays', () => {
    expect(getSegmentForDate('2026-10-03')?.number).toBe(1); // first of seg 1
    expect(getSegmentForDate('2026-12-05')?.number).toBe(1); // last of seg 1
    expect(getSegmentForDate('2026-12-12')?.number).toBe(2); // first of seg 2
    expect(getSegmentForDate('2027-02-06')?.number).toBe(2); // last of seg 2
    expect(getSegmentForDate('2027-02-13')?.number).toBe(3); // first of seg 3
    expect(getSegmentForDate('2027-04-10')?.number).toBe(3); // last of seg 3
  });

  it('returns null outside the season', () => {
    expect(getSegmentForDate('2026-09-26')).toBeNull(); // preseason
    expect(getSegmentForDate('2027-04-17')).toBeNull(); // playoffs
  });
});

describe('getSegmentForWeekId', () => {
  it('reads the date straight out of the week id', () => {
    expect(getSegmentForWeekId('week-2026-12-12')?.number).toBe(2);
  });

  it('returns null for a malformed id rather than guessing', () => {
    expect(getSegmentForWeekId('week-5')).toBeNull();
    expect(getSegmentForWeekId('2026-12-12')).toBeNull();
    expect(getSegmentForWeekId('')).toBeNull();
  });
});

describe('getCurrentSegment', () => {
  it('returns the segment containing the date', () => {
    expect(getCurrentSegment('2026-12-20')?.number).toBe(2);
  });

  it('returns the first segment before the season starts', () => {
    expect(getCurrentSegment('2026-08-18')?.number).toBe(1);
  });

  it('returns the last segment after the season ends', () => {
    expect(getCurrentSegment('2027-06-01')?.number).toBe(3);
  });

  it('falls into the right segment mid-gap between two segments', () => {
    // A Wednesday between seg 1's last Saturday and seg 2's first
    expect(getCurrentSegment('2026-12-09')?.number).toBe(1);
  });
});
