import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getTargetSaturdayDate,
  getPickDeadline,
  arePicksLocked,
  isAfterSunday4AM
} from '../timezone';

/**
 * These helpers decide when a week opens, when picks lock, and when a week
 * closes. Getting one wrong silently corrupts a whole week of the pool, and
 * the Netlify functions now share this module, so it is worth pinning down.
 *
 * Dates are chosen to straddle both US DST transitions:
 *   EDT (UTC-4) until 2026-11-01, EST (UTC-5) until 2027-03-14.
 */

/** Pretend "now" is a specific instant. */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getPickDeadline', () => {
  it('is 10:00 ET on the Saturday, as 14:00 UTC during EDT', () => {
    expect(getPickDeadline('2026-10-17').toISOString()).toBe('2026-10-17T14:00:00.000Z');
  });

  it('is 10:00 ET on the Saturday, as 15:00 UTC during EST', () => {
    expect(getPickDeadline('2026-12-05').toISOString()).toBe('2026-12-05T15:00:00.000Z');
  });

  it('shifts by an hour across the November DST boundary', () => {
    const beforeFallback = getPickDeadline('2026-10-31').toISOString();
    const afterFallback = getPickDeadline('2026-11-07').toISOString();
    expect(beforeFallback).toBe('2026-10-31T14:00:00.000Z');
    expect(afterFallback).toBe('2026-11-07T15:00:00.000Z');
  });
});

describe('arePicksLocked', () => {
  it('is open one minute before the deadline', () => {
    freeze('2026-12-05T14:59:00Z'); // 09:59 EST
    expect(arePicksLocked('2026-12-05')).toBe(false);
  });

  it('is locked one minute after the deadline', () => {
    freeze('2026-12-05T15:01:00Z'); // 10:01 EST
    expect(arePicksLocked('2026-12-05')).toBe(true);
  });
});

describe('isAfterSunday4AM', () => {
  it('is false before 4 AM ET Sunday and true after', () => {
    freeze('2026-12-06T08:59:00Z'); // 03:59 EST Sunday
    expect(isAfterSunday4AM('2026-12-05')).toBe(false);

    freeze('2026-12-06T09:01:00Z'); // 04:01 EST Sunday
    expect(isAfterSunday4AM('2026-12-05')).toBe(true);
  });

  /**
   * Regression: the implementation previously living in sync-week.ts built the
   * Sunday date by string concatenation (`day + 1`), so a Saturday on the last
   * day of a month produced "2026-10-32" — an invalid Date. Every comparison
   * against NaN is false, so such a week could never close on the time
   * condition. 2026-10-31 is a Saturday in the upcoming season.
   */
  it('rolls over into the next month', () => {
    freeze('2026-11-01T08:59:00Z'); // 03:59 EST, DST already ended
    expect(isAfterSunday4AM('2026-10-31')).toBe(false);

    freeze('2026-11-01T09:01:00Z'); // 04:01 EST
    expect(isAfterSunday4AM('2026-10-31')).toBe(true);
  });

  it('rolls over into the next year', () => {
    freeze('2027-01-01T08:59:00Z');
    expect(isAfterSunday4AM('2026-12-31')).toBe(false);

    freeze('2027-01-01T09:01:00Z');
    expect(isAfterSunday4AM('2026-12-31')).toBe(true);
  });
});

describe('getTargetSaturdayDate', () => {
  const saturdayOf = () => getTargetSaturdayDate().toISOString().split('T')[0];

  it('targets the coming Saturday from Monday 6 AM ET onward', () => {
    freeze('2026-12-07T11:01:00Z'); // Monday 06:01 EST
    expect(saturdayOf()).toBe('2026-12-12');
  });

  it('still shows the previous Saturday just before Monday 6 AM ET', () => {
    freeze('2026-12-07T10:59:00Z'); // Monday 05:59 EST
    expect(saturdayOf()).toBe('2026-12-05');
  });

  it('shows the just-played Saturday on Sunday', () => {
    freeze('2026-12-06T18:00:00Z'); // Sunday afternoon ET
    expect(saturdayOf()).toBe('2026-12-05');
  });

  it('targets the current Saturday during the week', () => {
    freeze('2026-12-10T17:00:00Z'); // Thursday noon EST
    expect(saturdayOf()).toBe('2026-12-12');
  });
});
