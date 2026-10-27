import { describe, it, expect } from 'vitest';
import { fetchAllRows, PAGE_SIZE } from '../paging';

/**
 * Supabase stops a select at 1000 rows and returns no error. Standings and
 * history read the whole picks table, which passes that mid-season, so they
 * go through `fetchAllRows`. These tests use a fake builder that serves a
 * fixed table in `.range()` slices the way PostgREST does.
 */

/** A fake query over `table`, recording each range it was asked for. */
function fakeTable(table: number[], calls: Array<[number, number]>) {
  return () => ({
    range: async (from: number, to: number) => {
      calls.push([from, to]);
      return { data: table.slice(from, to + 1), error: null };
    }
  });
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap', async () => {
    const calls: Array<[number, number]> = [];
    const result = await fetchAllRows(fakeTable(rows(PAGE_SIZE + 1), calls));

    expect(result).toEqual(rows(PAGE_SIZE + 1));
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1]
    ]);
  });

  it('makes one request when the table is under a page', async () => {
    const calls: Array<[number, number]> = [];
    expect(await fetchAllRows(fakeTable(rows(12), calls))).toEqual(rows(12));
    expect(calls).toHaveLength(1);
  });

  it('asks once more after an exactly full page, then stops', async () => {
    const calls: Array<[number, number]> = [];
    const result = await fetchAllRows(fakeTable(rows(2 * PAGE_SIZE), calls));

    expect(result).toHaveLength(2 * PAGE_SIZE);
    expect(calls).toHaveLength(3);
  });

  it('returns an empty list for an empty table', async () => {
    expect(await fetchAllRows(fakeTable([], []))).toEqual([]);
  });

  it('throws on a page error instead of returning a partial list', async () => {
    let page = 0;
    const build = () => ({
      range: async () =>
        page++ === 0
          ? { data: rows(PAGE_SIZE), error: null }
          : { data: null, error: { message: 'boom' } }
    });

    await expect(fetchAllRows(build)).rejects.toThrow('boom');
  });
});
