import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getWeeksToSync,
  isValidWeekId,
  syncWeek
} from '../../../netlify/functions/_shared/syncWeek';

/**
 * `getWeeksToSync` is what the scheduled job asks before doing anything, and
 * the case for running it every 15 minutes rests entirely on this returning an
 * empty list most of the time. If it ever started handing back the coming
 * Saturday, the cron would hammer the NHL API around the clock for a week with
 * no results to read. So the empty cases matter here as much as the full ones.
 *
 * The deadline it filters on is 12:00 PM *Eastern*, which moves against UTC
 * twice a season — and the cron fires in UTC. These tests straddle that:
 * EDT (UTC-4) through 2026-11-01, EST (UTC-5) after.
 */

/** Pretend "now" is a specific instant. */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

interface WeekRow {
  id: string;
  saturday_date: string;
  status: string;
}

/**
 * Enough of a Supabase client to run `getWeeksToSync` against, plus a record of
 * how the query was built. Some of the filtering happens in Postgres, not in
 * our code, so asserting on the query is the only way to pin it down.
 */
function fakeClient(rows: WeekRow[] | null, error: { message: string } | null = null) {
  const calls: {
    from?: string;
    neq: any[][];
    gte: any[][];
    order?: any[];
    limit?: any[];
  } = { neq: [], gte: [] };

  const builder: any = {
    select: () => builder,
    neq: (...args: any[]) => {
      calls.neq.push(args);
      return builder;
    },
    gte: (...args: any[]) => {
      calls.gte.push(args);
      return builder;
    },
    order: (...args: any[]) => {
      calls.order = args;
      return builder;
    },
    limit: (...args: any[]) => {
      calls.limit = args;
      return builder;
    },
    // Thenable, so `await`ing the chain yields the Supabase result shape.
    then: (resolve: (value: any) => any) => resolve({ data: rows, error })
  };

  const client: any = {
    from: (table: string) => {
      calls.from = table;
      return builder;
    }
  };

  return { client, calls };
}

const week = (id: string, status = 'ACTIVE'): WeekRow => ({
  id,
  saturday_date: id.replace('week-', ''),
  status
});

describe('isValidWeekId', () => {
  // The date half of this is interpolated straight into an NHL API URL, so it
  // is a guard, not a formatting nicety.
  it('accepts the canonical shape', () => {
    expect(isValidWeekId('week-2026-10-03')).toBe(true);
  });

  const rejected: Array<[label: string, input: unknown]> = [
    ['an unpadded day', 'week-2026-10-3'],
    ['no prefix', '2026-10-03'],
    ['path traversal', 'week-2026-10-03/../../secrets'],
    ['a trailing space', 'week-2026-10-03 '],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}]
  ];

  for (const [label, input] of rejected) {
    it(`rejects ${label}`, () => {
      expect(isValidWeekId(input)).toBe(false);
    });
  }
});

describe('getWeeksToSync', () => {
  it('returns nothing before the deadline, so a mid-week run is one SELECT', async () => {
    // Wednesday. The coming Saturday's week row exists — someone logged in and
    // seeded it — but nothing has been played.
    freeze('2026-09-30T15:00:00Z');
    const { client } = fakeClient([week('week-2026-10-03')]);

    await expect(getWeeksToSync(client)).resolves.toEqual([]);
  });

  it('still returns nothing an hour before the deadline', async () => {
    freeze('2026-10-03T15:00:00Z'); // 11:00 AM EDT
    const { client } = fakeClient([week('week-2026-10-03')]);

    await expect(getWeeksToSync(client)).resolves.toEqual([]);
  });

  it('picks the week up once the deadline passes', async () => {
    freeze('2026-10-03T17:00:00Z'); // 1:00 PM EDT
    const { client } = fakeClient([week('week-2026-10-03')]);

    await expect(getWeeksToSync(client)).resolves.toEqual(['week-2026-10-03']);
  });

  it('reads the deadline in Eastern, not UTC, on the far side of the DST change', async () => {
    // 2026-11-07 is EST (UTC-5), so 12:00 PM ET is 17:00 UTC — an hour later in
    // UTC than the same clock time in October. A cron that hard-coded a UTC
    // window would be an hour wrong here; this path has no window to be wrong.
    const row = [week('week-2026-11-07')];

    freeze('2026-11-07T16:30:00Z'); // 11:30 AM EST
    await expect(getWeeksToSync(fakeClient(row).client)).resolves.toEqual([]);

    freeze('2026-11-07T17:30:00Z'); // 12:30 PM EST
    await expect(getWeeksToSync(fakeClient(row).client)).resolves.toEqual([
      'week-2026-11-07'
    ]);
  });

  it('asks Postgres to exclude COMPLETED weeks and anything over two weeks old', async () => {
    freeze('2026-10-03T17:00:00Z');
    const { client, calls } = fakeClient([]);

    await getWeeksToSync(client);

    expect(calls.from).toBe('weeks');
    expect(calls.neq).toContainEqual(['status', 'COMPLETED']);
    expect(calls.gte).toContainEqual(['saturday_date', '2026-09-19']);
  });

  it('returns overdue weeks oldest first, so the stalest one closes first', async () => {
    freeze('2026-10-17T17:00:00Z');
    const { client, calls } = fakeClient([
      week('week-2026-10-03'),
      week('week-2026-10-10'),
      week('week-2026-10-17')
    ]);

    await expect(getWeeksToSync(client)).resolves.toEqual([
      'week-2026-10-03',
      'week-2026-10-10',
      'week-2026-10-17'
    ]);
    expect(calls.order).toEqual(['saturday_date', { ascending: true }]);
  });

  it('drops a malformed week id rather than feeding it to the NHL URL', async () => {
    freeze('2026-10-03T17:00:00Z');
    const { client } = fakeClient([
      { id: 'week-oops', saturday_date: '2026-10-03', status: 'ACTIVE' },
      week('week-2026-10-03')
    ]);

    await expect(getWeeksToSync(client)).resolves.toEqual(['week-2026-10-03']);
  });

  it('tolerates an empty table', async () => {
    freeze('2026-10-03T17:00:00Z');
    await expect(getWeeksToSync(fakeClient(null).client)).resolves.toEqual([]);
  });

  it('throws if the week list cannot be read, so the run is marked failed', async () => {
    freeze('2026-10-03T17:00:00Z');
    const { client } = fakeClient(null, { message: 'connection refused' });

    await expect(getWeeksToSync(client)).rejects.toThrow('connection refused');
  });
});

describe('syncWeek', () => {
  it('refuses a malformed weekId before touching the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client: any = {
      from: () => {
        throw new Error('should not have queried');
      }
    };

    await expect(syncWeek(client, 'week-2026-10-3')).rejects.toThrow(
      'weekId must be formatted week-YYYY-MM-DD'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
