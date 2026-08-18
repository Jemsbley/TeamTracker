import type { Roster } from '../types';

/** The roster marked primary, or null if none is. */
export function primaryRoster(rosters: Roster[]): Roster | null {
  return rosters.find((r) => r.isPrimary) ?? null;
}

/**
 * The roster id to preselect wherever a roster must be chosen: the primary
 * roster, falling back to the first roster, or '' if there are none.
 */
export function defaultRosterId(rosters: Roster[]): string {
  return (rosters.find((r) => r.isPrimary) ?? rosters[0])?.id ?? '';
}

/** Query-param sentinel for the "All rosters" choice in roster filters. */
export const ALL_ROSTERS = 'all';

/**
 * Resolve a `roster` query param to the roster id a data-page filter should
 * actually use. Filters default to the primary roster (falling back to the
 * first) rather than showing every roster's data at once; an explicit
 * ALL_ROSTERS selection opts back into the unscoped view. Returns ALL_ROSTERS
 * when there are no rosters to scope to.
 */
export function resolveRosterFilter(
  param: string | null,
  rosters: Roster[]
): string {
  if (param === ALL_ROSTERS) return ALL_ROSTERS;
  if (param && rosters.some((r) => r.id === param)) return param;
  return defaultRosterId(rosters) || ALL_ROSTERS;
}
