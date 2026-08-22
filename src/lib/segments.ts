import { SEASON_START, SEASON_END } from '../constants';
import type { Segment } from '../types';

/**
 * Season segments.
 *
 * The season is divided into three roughly equal segments, each keeping its own
 * standings alongside the cumulative season table. Segments are *derived* from
 * the two season-bound constants rather than stored, so there is no table to
 * keep in sync and no backfill when the bounds change — adjust
 * `SEASON_START` / `SEASON_END` and every segment recomputes, including for
 * weeks that do not exist yet.
 *
 * Everything in here is pure and date-only. Dates are plain `YYYY-MM-DD`
 * strings parsed at UTC noon, which keeps them clear of any timezone boundary;
 * these are calendar dates, not instants. The Saturday 10:00 ET deadline is a
 * separate concern and lives in `timezone.ts`.
 */

export const SEGMENT_COUNT = 3;

/** Parses `YYYY-MM-DD` at UTC noon, far from any date boundary. */
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every Saturday falling within the season bounds, in order.
 * The bounds themselves need not be Saturdays.
 */
export function getSeasonSaturdays(
  seasonStart: string = SEASON_START,
  seasonEnd: string = SEASON_END
): string[] {
  const cursor = parseDate(seasonStart);
  const end = parseDate(seasonEnd);

  // Advance to the first Saturday on or after the start date
  while (cursor.getUTCDay() !== 6) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const saturdays: string[] = [];
  while (cursor <= end) {
    saturdays.push(toDateStr(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return saturdays;
}

/**
 * Splits the season's Saturdays into three contiguous segments of as-equal
 * length as possible. When the count does not divide evenly the earlier
 * segments absorb the remainder, so sizes never differ by more than one.
 *
 * For 2026-27 this yields 28 Saturdays split 10 / 9 / 9:
 *   Segment 1  2026-10-03 → 2026-12-05
 *   Segment 2  2026-12-12 → 2027-02-06
 *   Segment 3  2027-02-13 → 2027-04-10
 */
export function getSegments(
  seasonStart: string = SEASON_START,
  seasonEnd: string = SEASON_END
): Segment[] {
  const saturdays = getSeasonSaturdays(seasonStart, seasonEnd);
  if (saturdays.length === 0) return [];

  const base = Math.floor(saturdays.length / SEGMENT_COUNT);
  const remainder = saturdays.length % SEGMENT_COUNT;

  const segments: Segment[] = [];
  let cursor = 0;

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const size = base + (i < remainder ? 1 : 0);
    if (size === 0) continue; // Fewer Saturdays than segments — skip the empties

    const weeks = saturdays.slice(cursor, cursor + size);
    cursor += size;

    segments.push({
      number: i + 1,
      label: `Segment ${i + 1}`,
      startDate: weeks[0],
      endDate: weeks[weeks.length - 1],
      weekCount: weeks.length
    });
  }

  return segments;
}

/**
 * The segment containing a given Saturday, or null if it falls outside the
 * configured season — a preseason week, or a sign that the season constants
 * need updating for a new year.
 */
export function getSegmentForDate(
  saturdayDate: string,
  segments: Segment[] = getSegments()
): Segment | null {
  return (
    segments.find(s => saturdayDate >= s.startDate && saturdayDate <= s.endDate) ?? null
  );
}

/**
 * The segment for a week id.
 *
 * Week ids are `week-YYYY-MM-DD`, so the date can be sliced straight out with
 * no database round-trip — which is what lets standings be scoped to a segment
 * from the picks alone.
 */
export function getSegmentForWeekId(
  weekId: string,
  segments: Segment[] = getSegments()
): Segment | null {
  const match = /^week-(\d{4}-\d{2}-\d{2})$/.exec(weekId);
  return match ? getSegmentForDate(match[1], segments) : null;
}

/** The segment a date sits in, else the last one already begun, else the first. */
export function getCurrentSegment(
  today: string = toDateStr(new Date()),
  segments: Segment[] = getSegments()
): Segment | null {
  if (segments.length === 0) return null;
  return (
    getSegmentForDate(today, segments) ??
    [...segments].reverse().find(s => today > s.endDate) ??
    segments[0]
  );
}
