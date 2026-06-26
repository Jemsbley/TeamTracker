import { MAPS } from '../constants';
import type { ScoutMap, ValorantMap } from '../types';

export function blankScoutMap(map: ValorantMap): ScoutMap {
  return {
    map,
    wins: 0,
    losses: 0,
    note: '',
    comps: [],
    attackNotes: '',
    defenseNotes: '',
  };
}

/**
 * Ensure every map in the game is represented exactly once, preserving any
 * data already recorded. Used when opening a report so older reports (or ones
 * created before a map was added to the game) still show a full list.
 */
export function withAllMaps(existing: ScoutMap[] = []): ScoutMap[] {
  const byMap = new Map(existing.map((m) => [m.map, m]));
  return MAPS.map((map) => byMap.get(map) ?? blankScoutMap(map));
}

/** True once any record has been entered for this map. */
export function hasRecord(m: ScoutMap): boolean {
  return m.wins > 0 || m.losses > 0;
}

/**
 * Most wins first; ties broken by fewest losses, then map name. Maps with no
 * record entered yet are kept at the bottom (sorted by name).
 */
export function sortScoutMaps(maps: ScoutMap[]): ScoutMap[] {
  return [...maps].sort((a, b) => {
    const ah = hasRecord(a);
    const bh = hasRecord(b);
    if (ah !== bh) return ah ? -1 : 1;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.map.localeCompare(b.map);
  });
}
