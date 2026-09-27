import { describe, it, expect } from 'vitest';
import { parseMatrixOrder, resolveMatrixOrder } from '../matrixOrder';
import { getSegments } from '../segments';

// Pinned to the 2026-27 bounds so the cases do not move with SEASON_START.
const segments = getSegments('2026-10-06', '2027-04-10');

describe('parseMatrixOrder', () => {
  it('defaults to the week', () => {
    expect(parseMatrixOrder(null)).toBe('week');
  });

  it('reads each known order', () => {
    expect(parseMatrixOrder('week')).toBe('week');
    expect(parseMatrixOrder('segment')).toBe('segment');
    expect(parseMatrixOrder('season')).toBe('season');
  });

  it('treats a stale or hand-edited value as the default', () => {
    expect(parseMatrixOrder('points')).toBe('week');
    expect(parseMatrixOrder('')).toBe('week');
    expect(parseMatrixOrder('SEASON')).toBe('week');
  });
});

describe('resolveMatrixOrder', () => {
  it('scopes WEEK to the selected week', () => {
    const resolved = resolveMatrixOrder('week', 'week-2026-12-19', segments);
    expect(resolved.order).toBe('week');
    expect(resolved.within).toEqual({ week: 'week-2026-12-19' });
    expect(resolved.segment?.number).toBe(2);
  });

  it('scopes SEGMENT to the segment the selected week falls in', () => {
    expect(resolveMatrixOrder('segment', 'week-2026-10-10', segments).within).toEqual({
      segment: 1
    });
    expect(resolveMatrixOrder('segment', 'week-2027-02-13', segments).within).toEqual({
      segment: 3
    });
  });

  it('scopes SEASON to everything', () => {
    const resolved = resolveMatrixOrder('season', 'week-2026-12-19', segments);
    expect(resolved.order).toBe('season');
    expect(resolved.within).toBeNull();
  });

  it('falls back to SEASON when the week sits in no segment', () => {
    // The 9/26 preseason dry run: before the first segment starts.
    const resolved = resolveMatrixOrder('segment', 'week-2026-09-26', segments);
    expect(resolved).toEqual({ order: 'season', segment: null, within: null });
  });

  it('still orders a preseason week by that week when asked', () => {
    expect(resolveMatrixOrder('week', 'week-2026-09-26', segments).within).toEqual({
      week: 'week-2026-09-26'
    });
  });

  it('falls back to SEASON when no week is selected yet', () => {
    expect(resolveMatrixOrder('week', '', segments).within).toBeNull();
    expect(resolveMatrixOrder('segment', '', segments).within).toBeNull();
  });
});
