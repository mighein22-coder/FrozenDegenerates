import type { Handler, HandlerEvent } from '@netlify/functions';
import { createAdminClient, isValidWeekId, syncWeek } from './_shared/syncWeek';

/**
 * Netlify Function: sync-week
 * Server-side sync of NHL scores + pick resolution using the service role key.
 * Bypasses RLS entirely — safe against client session failures.
 *
 * POST body: { weekId: string }
 * Returns: { updated: number, picksResolved: number, errors: string[] }
 *
 * This is the *interactive* entry point — the app calls it on login and on the
 * results view, and the admin panel has a button for it. The scoring itself
 * lives in `_shared/syncWeek.ts`, so the scheduled job can run the same pass
 * without a token. Everything below is auth, parsing, and HTTP shape.
 */
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  // Authenticate the caller: any signed-in member will do.
  //
  // This used to compare a shared secret sent as `x-sync-secret`. The client
  // half of that pair was `VITE_SYNC_WEEK_SECRET`, and Vite inlines `VITE_*`
  // into the bundle every visitor downloads — so the secret was printed in
  // public JS and this endpoint was effectively unauthenticated. Anyone could
  // read it out of the bundle and drive a service-role function at will.
  //
  // A Supabase access token cannot be published that way: it is per-user, it
  // expires, and Supabase is the one that vouches for it. Signing out or
  // deleting a member revokes their access without redeploying anything.
  //
  // Deliberately NOT gated on `profiles.role`. Scoring is meant to happen when
  // any member opens the app (App.tsx syncs on login and on the results view),
  // so an admin-only gate would leave scores frozen until an admin logged in.
  // The blast radius of a member calling this is bounded: it takes one weekId,
  // reads the NHL API, and writes only the scores and pick results that week
  // already implies. It cannot be steered to write anything of the caller's
  // choosing.
  //
  // It IS gated on membership, though, which since 0009 is not the same as
  // holding a token. Signups are open at the auth layer — the anon key is
  // public — so "has a valid token" now includes anyone who made an account and
  // never redeemed an invite. Requiring a profile row keeps this the last thing
  // a non-member cannot reach.
  //
  // None of this applies to the scheduled run, which never comes through here:
  // `scheduled-sync` imports the scoring pass and calls it in-process, so there
  // is no request to authenticate and no second credential to leak.
  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  const token = authHeader?.replace(/^Bearer /i, '').trim();

  if (!token) {
    console.warn('[SYNC WEEK] Request with no bearer token');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data: auth, error: authError } = await adminClient.auth.getUser(token);

  if (authError || !auth?.user) {
    console.warn('[SYNC WEEK] Rejected token:', authError?.message ?? 'no user for token');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Read under the service-role key, so this does not depend on the caller's
  // own visibility into `profiles`.
  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[SYNC WEEK] Membership lookup failed:', profileError.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not verify membership' }) };
  }

  if (!callerProfile) {
    console.warn(`[SYNC WEEK] Non-member ${auth.user.id} attempted a sync`);
    return { statusCode: 403, body: JSON.stringify({ error: 'Members only' }) };
  }

  console.log(`[SYNC WEEK] Authenticated as ${auth.user.id}`);

  try {
    const body = JSON.parse(event.body || '{}');
    const { weekId } = body;

    if (!weekId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'weekId is required' }) };
    }

    // The date is sliced out of this and interpolated into the NHL API URL
    if (!isValidWeekId(weekId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'weekId must be formatted week-YYYY-MM-DD' })
      };
    }

    const result = await syncWeek(adminClient, weekId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        updated: result.updated,
        picksResolved: result.picksResolved,
        errors: result.errors,
        ...(result.message ? { message: result.message } : {})
      })
    };
  } catch (error: any) {
    console.error('[SYNC WEEK ERROR]', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

export { handler };
