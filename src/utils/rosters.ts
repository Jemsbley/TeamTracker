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
