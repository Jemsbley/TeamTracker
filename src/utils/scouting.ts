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
 * The map this opponent has been recorded playing the most (wins + losses).
 * Null if no map has any recorded plays yet.
 */
export function favoriteMap(maps: ScoutMap[]): ValorantMap | null {
  let best: ScoutMap | null = null;
  for (const m of maps) {
    const plays = m.wins + m.losses;
    if (plays === 0) continue;
    const bestPlays = best ? best.wins + best.losses : -1;
    if (
      !best ||
      plays > bestPlays ||
      (plays === bestPlays && m.map.localeCompare(best.map) < 0)
    ) {
      best = m;
    }
  }
  return best?.map ?? null;
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
