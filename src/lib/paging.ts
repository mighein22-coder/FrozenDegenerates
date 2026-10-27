/**
 * Rows per request. Matches Supabase's default "Max rows" (Settings → API):
 * PostgREST stops at that many rows and returns no error, so an unpaged
 * `select('*')` on a table past it silently comes back short.
 */
export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Anything with PostgREST's `.range()`, i.e. a Supabase select builder. */
type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<PageResult<T>>;
};

/**
 * Read every row a query matches, one page at a time.
 *
 * `build` must return a fresh query each call (a builder can only be awaited
 * once) and should end in a stable `.order(...)`. Without one, Postgres may
 * return rows in a different order per page, so some repeat and others vanish.
 * Stops at the first page shorter than `PAGE_SIZE`.
 */
export async function fetchAllRows<T>(build: () => RangeableQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
