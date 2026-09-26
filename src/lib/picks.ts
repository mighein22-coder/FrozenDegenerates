import type { Pick } from '../types';

/**
 * Whether the Picks screen's working copy differs from the sheet last saved.
 *
 * Only what a member chooses counts — game, team and confidence. Order is
 * ignored (picks are appended as they are made, but come back from the
 * database in whatever order it likes), and so are the scoring fields, which
 * the working copy may or may not carry. Undoing an edit makes the sheet
 * clean again.
 */
export function hasUnsavedPickChanges(
  current: Partial<Pick>[],
  saved: Partial<Pick>[]
): boolean {
  const key = (picks: Partial<Pick>[]) =>
    picks
      .map(p => `${p.gameId}|${p.selectedTeamId}|${p.confidence || 0}`)
      .sort()
      .join(',');

  return key(current) !== key(saved);
}
