import type { Handler } from '@netlify/functions';
import { createAdminClient, getWeeksToSync, syncWeek, type SyncWeekResult } from './_shared/syncWeek';

/**
 * Netlify Scheduled Function: scheduled-sync
 *
 * Runs the scoring pass on a cron so standings move on their own. Until this
 * existed, `sync-week` only ran when a human opened the app — if nobody logged
 * in all weekend, the pool sat on Friday's numbers until somebody did.
 *
 * The schedule is registered in `netlify.toml`, not here, so the cadence is
 * visible in the same file as the rest of the deploy config.
 *
 * ## No token, by construction
 *
 * This does not call `/.netlify/functions/sync-week`. It imports the scoring
 * pass and runs it in-process. A cron run has no Supabase session and no
 * `profiles` row, so it could not satisfy that endpoint's auth, and the only way
 * to let it through would be a second shared credential — which is precisely
 * the `VITE_SYNC_WEEK_SECRET` mistake (ASSESSMENT #3, reversed in #26). There is
 * nothing here for an attacker to forge, because there is no request.
 *
 * It also takes no input — not a body, not a query string. So even if something
 * reaches it other than the cron, all it can do is sync the weeks the cron would
 * have synced anyway, idempotently. There is no parameter to point it somewhere
 * else.
 *
 * ## Cadence
 *
 * Every 15 minutes, around the clock, and that is cheaper than it sounds.
 * `getWeeksToSync` returns nothing unless a week is past its Saturday 12:00 PM ET
 * deadline and not yet COMPLETED, so from Sunday morning to Saturday morning
 * each run is a single SELECT that finds no rows and stops — no NHL API call, no
 * writes. Real work happens only in the window that matters: Saturday morning
 * through the 4:00 AM ET Sunday close.
 *
 * A flat every-15-minutes cron also means no DST arithmetic. Netlify cron is
 * UTC, and the interesting window is defined in Eastern, which moves by an hour
 * twice a season; a window expressed in UTC would have to be padded and would
 * still be one of those edges nobody notices is wrong until a Saturday night.
 * Running always and letting the query decide has no edges.
 */

/**
 * Stop starting new weeks past this point in the run.
 *
 * Netlify kills a scheduled function that overruns its execution limit, and a
 * catch-up run — two stale weeks, a hundred picks each, every write its own
 * round-trip — is the one shape that could get near it. Being killed would be
 * survivable, because every write commits on its own and the next tick 15
 * minutes later resumes from whatever is still PENDING. But stopping on our own
 * terms means the run reports what it did and what it deferred, instead of
 * vanishing from the logs mid-week.
 *
 * The normal Saturday case is one week and finishes in a second or two, so this
 * never fires.
 */
const TIME_BUDGET_MS = 20_000;

interface RunSummary {
  weeksConsidered: number;
  gamesUpdated: number;
  picksResolved: number;
  weeksCompleted: number;
  /** Weeks left for the next run because the budget ran out. */
  weeksDeferred: number;
  results: SyncWeekResult[];
  errors: string[];
}

const handler: Handler = async () => {
  const startedAt = Date.now();

  let admin;
  try {
    admin = createAdminClient();
  } catch (error: any) {
    // Return non-2xx so the run shows as failed in the Netlify UI rather than
    // quietly doing nothing every 15 minutes.
    console.error('[SCHEDULED SYNC] Cannot start:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const summary: RunSummary = {
    weeksConsidered: 0,
    gamesUpdated: 0,
    picksResolved: 0,
    weeksCompleted: 0,
    weeksDeferred: 0,
    results: [],
    errors: []
  };

  try {
    const weekIds = await getWeeksToSync(admin);
    summary.weeksConsidered = weekIds.length;

    if (weekIds.length === 0) {
      console.log('[SCHEDULED SYNC] No weeks need syncing');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...summary, ms: Date.now() - startedAt })
      };
    }

    console.log(`[SCHEDULED SYNC] Syncing ${weekIds.length} week(s): ${weekIds.join(', ')}`);

    // Sequential on purpose. There are at most a handful of weeks, they share
    // one upstream API, and a failure on one should not take the others with it.
    for (const [index, weekId] of weekIds.entries()) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        summary.weeksDeferred = weekIds.length - index;
        console.warn(
          `[SCHEDULED SYNC] Out of time budget; deferring ${summary.weeksDeferred} week(s) to the next run`
        );
        break;
      }

      try {
        const result = await syncWeek(admin, weekId);
        summary.results.push(result);
        summary.gamesUpdated += result.updated;
        summary.picksResolved += result.picksResolved;
        if (result.completed) summary.weeksCompleted++;
        summary.errors.push(...result.errors.map(e => `${weekId}: ${e}`));
      } catch (error: any) {
        const message = error?.message || 'Unknown error';
        console.error(`[SCHEDULED SYNC] ${weekId} failed:`, message);
        summary.errors.push(`${weekId}: ${message}`);
      }
    }

    console.log(
      `[SCHEDULED SYNC] Done in ${Date.now() - startedAt}ms: ` +
        `${summary.gamesUpdated} games, ${summary.picksResolved} picks, ` +
        `${summary.weeksCompleted} weeks closed, ${summary.weeksDeferred} deferred, ` +
        `${summary.errors.length} errors`
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...summary, ms: Date.now() - startedAt })
    };
  } catch (error: any) {
    // Only reached if the week list itself could not be read — the per-week
    // loop above handles its own failures.
    console.error('[SCHEDULED SYNC ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Internal server error' })
    };
  }
};

export { handler };
