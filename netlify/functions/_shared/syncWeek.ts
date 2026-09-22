import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { arePicksLocked, isAfterSunday4AM } from './etTime';

/**
 * The scoring pass, as a plain function.
 *
 * This is the whole of what `sync-week` does, lifted out of its HTTP handler so
 * a second caller can run it without speaking HTTP. `sync-week.ts` is now auth +
 * parse + call; `scheduled-sync.ts` picks the weeks and calls this directly,
 * in-process.
 *
 * That in-process call is the point. `sync-week` requires a Bearer Supabase
 * access token AND a `profiles` row, and a cron run has neither — it is nobody.
 * The alternative was a shared secret so the schedule could authenticate to the
 * HTTP endpoint, and that is exactly the mistake `VITE_SYNC_WEEK_SECRET` was
 * (ASSESSMENT #3, reversed in #26): a second credential to store, rotate and
 * leak, guarding a service-role function. Calling the function directly means
 * there is no second credential at all. The only key involved is
 * `SUPABASE_SERVICE_ROLE_KEY`, which the function already needs.
 *
 * Everything here is idempotent: it only moves non-FINAL games to FINAL and only
 * resolves PENDING picks, so a second run changes nothing the first one settled.
 */

/** `weeks.id` is `week-YYYY-MM-DD`; the date half is interpolated into an NHL API URL. */
const WEEK_ID_PATTERN = /^week-\d{4}-\d{2}-\d{2}$/;

export function isValidWeekId(weekId: unknown): weekId is string {
  return typeof weekId === 'string' && WEEK_ID_PATTERN.test(weekId);
}

export interface SyncWeekResult {
  weekId: string;
  /** Games moved to FINAL with scores this run. */
  updated: number;
  /** Picks moved out of PENDING this run. */
  picksResolved: number;
  /** True if this run marked the week COMPLETED. */
  completed: boolean;
  errors: string[];
  /** Set when the run was a no-op for a structural reason, e.g. no games seeded. */
  message?: string;
}

/**
 * Service-role client. Bypasses RLS, so it is the one thing in the system that
 * can write a score — neither the browser nor a member's token can, by design
 * (0006 / 0007).
 *
 * Throws rather than returning null: every caller treats missing config as
 * fatal, and throwing keeps the reason in one place.
 */
export function createAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[SYNC WEEK] Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey
    });
    throw new Error(
      'Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * The weeks a scheduled run should sync: every week past its pick deadline, not
 * yet COMPLETED, and recent enough to still be moving.
 *
 * COMPLETED weeks are excluded because syncing one cannot change anything — the
 * pass only touches non-FINAL games and PENDING picks, and a COMPLETED week has
 * neither outstanding. That exclusion is also what makes a frequent schedule
 * cheap: outside Saturday 10:00 AM ET through Sunday 4:00 AM ET this query
 * returns nothing, and the run ends after one SELECT without touching the NHL
 * API.
 *
 * Deliberately does NOT create a week. Weeks are still seeded lazily by the
 * first member to log in after Monday 6:00 AM ET (see `docs/OPERATIONS.md`);
 * automating that is a separate job with separate failure modes. This one scores
 * the weeks that exist.
 */
export async function getWeeksToSync(admin: SupabaseClient): Promise<string[]> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const cutoff = twoWeeksAgo.toISOString().split('T')[0];

  const { data, error } = await admin
    .from('weeks')
    .select('id, saturday_date, status')
    .neq('status', 'COMPLETED')
    .gte('saturday_date', cutoff)
    .order('saturday_date', { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(`Failed to list weeks: ${error.message}`);
  }

  // A week whose deadline has not passed has no results to score yet. No upper
  // date bound is needed — this is what excludes the coming Saturday.
  // Oldest first, so a week that is overdue to close gets closed first.
  return (data ?? [])
    .filter((w: any) => isValidWeekId(w.id) && arePicksLocked(w.saturday_date))
    .map((w: any) => w.id);
}

/**
 * Sync one week: pull scores from the NHL API, mark finished games FINAL,
 * resolve the picks on them, and close the week once it is done.
 *
 * Never throws for a per-row failure — those land in `errors`, so one bad game
 * cannot strand the rest of the week. Throws only if `weekId` is malformed or
 * the week's games cannot be read at all.
 */
export async function syncWeek(
  admin: SupabaseClient,
  weekId: string
): Promise<SyncWeekResult> {
  if (!isValidWeekId(weekId)) {
    throw new Error('weekId must be formatted week-YYYY-MM-DD');
  }

  const dateStr = weekId.replace('week-', '');
  const errors: string[] = [];
  let gamesUpdated = 0;
  let picksResolved = 0;
  let completed = false;

  console.log(`[SYNC WEEK] Starting sync for ${weekId} (date: ${dateStr})`);

  // Fetch ALL games for this week — no status filter, so already-FINAL games are included
  const { data: dbGames, error: gamesError } = await admin
    .from('games')
    .select('*')
    .eq('week_id', weekId);

  if (gamesError) {
    throw new Error(`Failed to fetch games: ${gamesError.message}`);
  }

  if (!dbGames || dbGames.length === 0) {
    console.log(`[SYNC WEEK] No games found for ${weekId}`);
    return {
      weekId,
      updated: 0,
      picksResolved: 0,
      completed: false,
      errors: [],
      message: 'No games found'
    };
  }

  console.log(`[SYNC WEEK] Found ${dbGames.length} games in DB`);

  // Fetch scores from NHL score endpoint (designed for completed-game data)
  let nhlScores: any[] = [];
  const scoreUrl = `https://api-web.nhle.com/v1/score/${dateStr}`;
  console.log(`[SYNC WEEK] Fetching ${scoreUrl}`);

  const nhlResponse = await fetch(scoreUrl);
  if (nhlResponse.ok) {
    const nhlData = await nhlResponse.json();
    // /v1/score/{date} returns { games: [...] }
    const allGames: any[] = nhlData.games ?? [];

    // Filter to games that were played on the requested ET date
    nhlScores = allGames.filter((g: any) => {
      const gameTimeUTC = new Date(g.startTimeUTC);
      const gameDateET = gameTimeUTC.toLocaleDateString('en-CA', {
        timeZone: 'America/New_York'
      });
      return gameDateET === dateStr;
    });

    console.log(
      `[SYNC WEEK] Score endpoint: ${allGames.length} total, ${nhlScores.length} on ${dateStr}`
    );
  } else {
    // Fallback to schedule endpoint
    console.warn(
      `[SYNC WEEK] Score endpoint returned ${nhlResponse.status}, falling back to schedule`
    );
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
    const scheduleResponse = await fetch(scheduleUrl);
    if (scheduleResponse.ok) {
      const scheduleData = await scheduleResponse.json();
      const allGames: any[] = scheduleData.gameWeek?.[0]?.games ?? [];
      nhlScores = allGames.filter((g: any) => {
        const gameTimeUTC = new Date(g.startTimeUTC);
        const gameDateET = gameTimeUTC.toLocaleDateString('en-CA', {
          timeZone: 'America/New_York'
        });
        return gameDateET === dateStr;
      });
      console.log(`[SYNC WEEK] Schedule fallback: ${nhlScores.length} games on ${dateStr}`);
    } else {
      errors.push(`NHL API unavailable (score: ${nhlResponse.status})`);
    }
  }

  // Map NHL game ID → game data for quick lookup
  const nhlMap = new Map<number, any>();
  for (const g of nhlScores) {
    nhlMap.set(g.id, g);
  }

  // Step 1: Update any non-FINAL games in DB that are now FINAL per NHL
  for (const game of dbGames) {
    if (game.status === 'FINAL') continue;

    if (!game.nhl_game_id) {
      errors.push(`Game ${game.id} has no nhl_game_id`);
      continue;
    }

    const nhlGame = nhlMap.get(game.nhl_game_id);
    if (!nhlGame) {
      errors.push(`No NHL data for nhl_game_id ${game.nhl_game_id}`);
      continue;
    }

    const isFinal = nhlGame.gameState === 'FINAL' || nhlGame.gameState === 'OFF';
    if (isFinal && nhlGame.homeTeam?.score != null && nhlGame.awayTeam?.score != null) {
      const { error: updateError } = await admin
        .from('games')
        .update({
          home_score: nhlGame.homeTeam.score,
          away_score: nhlGame.awayTeam.score,
          status: 'FINAL'
        })
        .eq('id', game.id);

      if (updateError) {
        errors.push(`Failed to update game ${game.id}: ${updateError.message}`);
      } else {
        gamesUpdated++;
        console.log(
          `[SYNC WEEK] Game ${game.id} → FINAL (${nhlGame.homeTeam.score}-${nhlGame.awayTeam.score})`
        );
      }
    }
  }

  // Step 2: For ALL FINAL games in the week, resolve any PENDING picks
  // Re-query so we pick up games just updated above
  const { data: finalGames } = await admin
    .from('games')
    .select('*')
    .eq('week_id', weekId)
    .eq('status', 'FINAL');

  for (const game of finalGames ?? []) {
    const { data: pendingPicks } = await admin
      .from('picks')
      .select('*')
      .eq('game_id', game.id)
      .eq('result', 'PENDING');

    if (!pendingPicks || pendingPicks.length === 0) continue;

    const winnerTeamId =
      game.home_score > game.away_score ? game.home_team_id : game.away_team_id;

    console.log(
      `[SYNC WEEK] Resolving ${pendingPicks.length} pending picks for game ${game.id} (winner: ${winnerTeamId})`
    );

    for (const pick of pendingPicks) {
      const isWin = pick.selected_team_id === winnerTeamId;
      const { error: pickError } = await admin
        .from('picks')
        .update({
          result: isWin ? 'WIN' : 'LOSS',
          points_earned: isWin ? pick.confidence : 0
        })
        .eq('id', pick.id);

      if (pickError) {
        errors.push(`Failed to update pick ${pick.id}: ${pickError.message}`);
      } else {
        picksResolved++;
      }
    }
  }

  // Step 3: Check if week should be marked COMPLETED
  const { data: week } = await admin
    .from('weeks')
    .select('*')
    .eq('id', weekId)
    .single();

  if (week && week.status !== 'COMPLETED') {
    const { data: allWeekGames } = await admin
      .from('games')
      .select('status')
      .eq('week_id', weekId);

    const allFinal =
      allWeekGames != null &&
      allWeekGames.length > 0 &&
      allWeekGames.every((g: any) => g.status === 'FINAL');
    const pastSunday4AM = isAfterSunday4AM(week.saturday_date);

    if (allFinal || pastSunday4AM) {
      await admin
        .from('weeks')
        .update({ status: 'COMPLETED' })
        .eq('id', weekId);
      completed = true;
      console.log(
        `[SYNC WEEK] Week ${weekId} marked COMPLETED (allFinal: ${allFinal}, pastSunday4AM: ${pastSunday4AM})`
      );
    }
  }

  console.log(
    `[SYNC WEEK] Done: ${gamesUpdated} games updated, ${picksResolved} picks resolved, ${errors.length} errors`
  );

  return { weekId, updated: gamesUpdated, picksResolved, completed, errors };
}
