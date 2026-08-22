/**
 * Eastern-time helpers for the Netlify functions.
 *
 * Re-exported from the app's `src/lib/timezone.ts` so the browser and the
 * functions cannot disagree about when a week locks or closes. `sync-week`
 * previously hand-rolled DST detection by probing `Intl` at 08:30 UTC; that
 * duplicate is gone.
 *
 * These are safe in the UTC Lambda runtime: `fromZonedTime` reinterprets the
 * supplied date components as Eastern regardless of the host timezone, so the
 * result does not depend on the process's local zone.
 *
 * A directory under `netlify/functions/` is only treated as a function when it
 * contains a file matching its own name, so `_shared/` ships as a plain module.
 */
export {
  getTargetSaturdayDate,
  getPickDeadline,
  arePicksLocked,
  isAfterSunday4AM,
  getTimeUntilDeadline,
  formatETTime
} from '../../../src/lib/timezone';
