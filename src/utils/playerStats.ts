import type { Game, GameStat, ValorantMap } from '../types';

type Entry = { stat: GameStat; map: ValorantMap };

export type PlayerAggregate = {
  selections: number;
  acs: number;
  hsPercent: number;
  kdr: number;
  assists: number;
  damageDelta: number;
  adr: number;
  kastPercent: number;
  firstKills: number;
  firstDeaths: number;
  multikills: number;
  bestMap: { map: ValorantMap; avgAcs: number; games: number } | null;
};

export type PlayerAgentRow = PlayerAggregate & { agent: string };

export type PlayerStats = {
  byAgent: PlayerAgentRow[]; // sorted by selections desc
  total: PlayerAggregate; // overall row
};

const ZERO: PlayerAggregate = {
  selections: 0,
  acs: 0,
  hsPercent: 0,
  kdr: 0,
  assists: 0,
  damageDelta: 0,
  adr: 0,
  kastPercent: 0,
  firstKills: 0,
  firstDeaths: 0,
  multikills: 0,
  bestMap: null,
};

function aggregate(entries: Entry[]): PlayerAggregate {
  const n = entries.length;
  if (n === 0) return { ...ZERO };
  const sum = (key: keyof GameStat): number =>
    entries.reduce(
      (a, e) =>
        a + (typeof e.stat[key] === 'number' ? (e.stat[key] as number) : 0),
      0
    );
  const totalKills = sum('kills');
  const totalDeaths = sum('deaths');
  return {
    selections: n,
    acs: sum('acs') / n,
    hsPercent: sum('hsPercent') / n,
    kdr: totalDeaths === 0 ? totalKills : totalKills / totalDeaths,
    assists: sum('assists') / n,
    damageDelta: sum('damageDelta') / n,
    adr: sum('adr') / n,
    kastPercent: sum('kastPercent') / n,
    firstKills: sum('firstKills') / n,
    firstDeaths: sum('firstDeaths') / n,
    multikills: sum('multikills') / n,
    bestMap: bestMapFor(entries),
  };
}

function bestMapFor(
  entries: Entry[]
): { map: ValorantMap; avgAcs: number; games: number } | null {
  const byMap = new Map<ValorantMap, { sum: number; count: number }>();
  for (const e of entries) {
    const cur = byMap.get(e.map) ?? { sum: 0, count: 0 };
    cur.sum += e.stat.acs;
    cur.count += 1;
    byMap.set(e.map, cur);
  }
  let best: { map: ValorantMap; avgAcs: number; games: number } | null = null;
  for (const [map, { sum, count }] of byMap) {
    if (count === 0) continue;
    const avg = sum / count;
    if (!best || avg > best.avgAcs) best = { map, avgAcs: avg, games: count };
  }
  return best;
}

export function computePlayerStats(
  games: Game[],
  playerId: string,
  mapFilter: ValorantMap | ''
): PlayerStats {
  const entries: Entry[] = [];
  for (const g of games) {
    if (mapFilter && g.map !== mapFilter) continue;
    for (const s of g.stats) {
      if (s.playerId !== playerId) continue;
      entries.push({ stat: s, map: g.map });
    }
  }

  const byAgentMap = new Map<string, Entry[]>();
  for (const e of entries) {
    const arr = byAgentMap.get(e.stat.agent) ?? [];
    arr.push(e);
    byAgentMap.set(e.stat.agent, arr);
  }

  const byAgent: PlayerAgentRow[] = [];
  for (const [agent, list] of byAgentMap) {
    byAgent.push({ agent, ...aggregate(list) });
  }
  byAgent.sort((a, b) => b.selections - a.selections);

  return { byAgent, total: aggregate(entries) };
}
