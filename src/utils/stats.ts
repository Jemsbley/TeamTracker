import type { Game, GameStat, Series, ValorantMap } from '../types';
import { deriveScore } from './rounds';

export type StatFilters = {
  map?: ValorantMap | 'all';
  /**
   * Multi-agent filter. Empty/undefined = no filter. When set, a game
   * qualifies only if EVERY listed agent appears in its lineup, and within a
   * qualifying game only stats whose agent is in the list contribute.
   */
  agents?: string[];
  seriesId?: string | 'all';
};

export type Aggregate = {
  games: number;
  acs: number;
  hsPercent: number;
  kdr: number;
  kills: number;
  deaths: number;
  assists: number; // avg per game
  damageDelta: number; // avg per game
  adr: number; // avg per game
  kastPercent: number;
  firstKills: number;
  firstDeaths: number;
  multikills: number;
};

export const ZERO_AGG: Aggregate = {
  games: 0,
  acs: 0,
  hsPercent: 0,
  kdr: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  damageDelta: 0,
  adr: 0,
  kastPercent: 0,
  firstKills: 0,
  firstDeaths: 0,
  multikills: 0,
};

export function gameMatches(g: Game, f: StatFilters): boolean {
  if (f.map && f.map !== 'all' && g.map !== f.map) return false;
  if (f.seriesId && f.seriesId !== 'all' && g.seriesId !== f.seriesId)
    return false;
  if (f.agents && f.agents.length > 0) {
    const gameAgents = new Set(g.stats.map((s) => s.agent));
    if (!f.agents.every((a) => gameAgents.has(a))) return false;
  }
  return true;
}

function statMatchesAgent(s: GameStat, f: StatFilters): boolean {
  if (!f.agents || f.agents.length === 0) return true;
  return f.agents.includes(s.agent);
}

/** Build flat list of stat entries that pass filters. */
export function collectStats(
  games: Game[],
  f: StatFilters,
  predicate?: (s: GameStat) => boolean
): GameStat[] {
  const out: GameStat[] = [];
  for (const g of games) {
    if (!gameMatches(g, f)) continue;
    for (const s of g.stats) {
      if (!statMatchesAgent(s, f)) continue;
      if (predicate && !predicate(s)) continue;
      out.push(s);
    }
  }
  return out;
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function aggregate(stats: GameStat[]): Aggregate {
  if (!stats.length) return { ...ZERO_AGG };
  const totalKills = stats.reduce((a, s) => a + s.kills, 0);
  const totalDeaths = stats.reduce((a, s) => a + s.deaths, 0);
  return {
    games: stats.length,
    acs: avg(stats.map((s) => s.acs)),
    hsPercent: avg(stats.map((s) => s.hsPercent)),
    kdr: totalDeaths === 0 ? totalKills : totalKills / totalDeaths,
    kills: totalKills,
    deaths: totalDeaths,
    assists: avg(stats.map((s) => s.assists)),
    damageDelta: avg(stats.map((s) => s.damageDelta)),
    adr: avg(stats.map((s) => s.adr ?? 0)),
    kastPercent: avg(stats.map((s) => s.kastPercent)),
    firstKills: avg(stats.map((s) => s.firstKills)),
    firstDeaths: avg(stats.map((s) => s.firstDeaths)),
    multikills: avg(stats.map((s) => s.multikills)),
  };
}

export function aggregateForPlayer(
  games: Game[],
  playerId: string,
  f: StatFilters = {}
): Aggregate {
  return aggregate(collectStats(games, f, (s) => s.playerId === playerId));
}

export function aggregateTeam(games: Game[], f: StatFilters = {}): Aggregate {
  return aggregate(collectStats(games, f));
}

export function fmt(n: number, digits = 1): string {
  if (!isFinite(n)) return '–';
  return n.toFixed(digits);
}

export function fmtSigned(n: number, digits = 0): string {
  if (!isFinite(n)) return '–';
  const v = Number(n.toFixed(digits));
  if (v > 0) return `+${v.toFixed(digits)}`;
  return v.toFixed(digits);
}

export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return '–';
  return `${n.toFixed(digits)}%`;
}

/** Shared per-stat metadata used by tabs that rank stats individually. */
export type StatKey = Exclude<keyof Aggregate, 'games' | 'kills' | 'deaths'>;

export type StatDef = {
  key: StatKey;
  label: string;
  format: (v: number) => string;
  /** Percent stats are grouped separately from raw-value stats. */
  isPercent: boolean;
  /** True when smaller values are better (e.g. first deaths). */
  lowerIsBetter?: boolean;
};

export const STAT_DEFS: StatDef[] = [
  { key: 'acs', label: 'ACS', format: (v) => fmt(v, 0), isPercent: false },
  { key: 'kdr', label: 'KDR', format: (v) => fmt(v, 2), isPercent: false },
  { key: 'assists', label: 'A', format: (v) => fmt(v, 1), isPercent: false },
  { key: 'damageDelta', label: 'DDΔ', format: (v) => fmtSigned(v, 0), isPercent: false },
  { key: 'adr', label: 'ADR', format: (v) => fmt(v, 0), isPercent: false },
  { key: 'hsPercent', label: 'HS%', format: (v) => fmtPct(v, 1), isPercent: true },
  { key: 'kastPercent', label: 'KAST%', format: (v) => fmtPct(v, 1), isPercent: true },
  { key: 'firstKills', label: 'FK', format: (v) => fmt(v, 1), isPercent: false },
  { key: 'firstDeaths', label: 'FD', format: (v) => fmt(v, 1), isPercent: false, lowerIsBetter: true },
  { key: 'multikills', label: 'MK', format: (v) => fmt(v, 1), isPercent: false },
];

export function gameOutcome(g: Game): 'W' | 'L' | undefined {
  const sc =
    deriveScore(g) ??
    (g.scoreFor !== undefined && g.scoreAgainst !== undefined
      ? ([g.scoreFor, g.scoreAgainst] as [number, number])
      : undefined);
  if (!sc) return undefined;
  if (sc[0] > sc[1]) return 'W';
  if (sc[0] < sc[1]) return 'L';
  return undefined;
}

/** Series outcome based on the count of decided games. Undecided games skipped. */
export function seriesOutcome(
  series: Series,
  games: Game[]
): 'W' | 'L' | undefined {
  let w = 0;
  let l = 0;
  for (const g of games) {
    if (g.seriesId !== series.id) continue;
    const o = gameOutcome(g);
    if (o === 'W') w += 1;
    else if (o === 'L') l += 1;
  }
  if (w === 0 && l === 0) return undefined;
  if (w > l) return 'W';
  if (l > w) return 'L';
  return undefined;
}

export function aggregateForGame(g: Game, f: StatFilters = {}): Aggregate {
  return aggregate(collectStats([g], f));
}

export function aggregateForSeries(
  series: Series,
  games: Game[],
  f: StatFilters = {}
): Aggregate {
  const seriesGames = games.filter((g) => g.seriesId === series.id);
  return aggregate(collectStats(seriesGames, f));
}

/**
 * Rank items by average rank across all stats. Lower-is-better stats are
 * flipped so that higher final rank score = better overall.
 *
 * Direction:
 *   'best'  -> highest stat values score lower rank numbers (rank 1 = best)
 *   'worst' -> highest stat values score higher rank numbers (rank 1 = worst)
 *
 * Items with zero games are excluded.
 */
export function rankItemsByStats<T>(
  items: T[],
  getAgg: (t: T) => Aggregate,
  direction: 'best' | 'worst'
): { item: T; agg: Aggregate; avgRank: number }[] {
  const scored = items
    .map((item) => ({ item, agg: getAgg(item) }))
    .filter((x) => x.agg.games > 0);
  if (scored.length === 0) return [];

  const ranksByItem = new Map<T, number[]>();
  for (const s of scored) ranksByItem.set(s.item, []);

  for (const def of STAT_DEFS) {
    // For ranking purposes, "best" = highest value; flip for lower-is-better.
    const valued = scored.map((s) => ({
      item: s.item,
      v: (s.agg[def.key] as number) * (def.lowerIsBetter ? -1 : 1),
    }));
    // Sort descending: highest "good" value first.
    valued.sort((a, b) => b.v - a.v);
    valued.forEach((entry, idx) => {
      ranksByItem.get(entry.item)!.push(idx + 1);
    });
  }

  const withAvg = scored.map((s) => {
    const ranks = ranksByItem.get(s.item)!;
    const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    return { item: s.item, agg: s.agg, avgRank };
  });
  // direction=best -> ascending avgRank (rank 1 = best)
  // direction=worst -> descending avgRank (highest rank-numbers = worst overall)
  withAvg.sort((a, b) =>
    direction === 'best' ? a.avgRank - b.avgRank : b.avgRank - a.avgRank
  );
  return withAvg;
}
