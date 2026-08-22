/**
 * Deprecated alias for `nhl-schedule`.
 *
 * The function never used Gemini — it has always been a plain NHL API proxy.
 * This re-export keeps browsers holding a cached bundle from 404ing on the
 * schedule fetch mid-week. Remove it once a release has gone by.
 */
export { handler } from './nhl-schedule';
