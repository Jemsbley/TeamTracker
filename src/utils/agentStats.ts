import { MAPS } from '../constants';
import type { Game, GameStat, Player, ValorantMap } from '../types';
import { aggregateAbilities, type AbilityUsage } from './abilities';
import { effectiveScore } from './rounds';
import { avgVlr } from './stats';

function gameWinForUs(g: Game): boolean | undefined {
  const sc = effectiveScore(g);
  if (!sc) return undefined;
  if (sc[0] > sc[1]) return true;
  if (sc[0] < sc[1]) return false;
  return undefined;
}

export type AgentMapStat = {
  map: ValorantMap;
  /** # of games on this map where this agent was in the lineup. */
  selectionsOnMap: number;
  /** # of games played on this map (total, regardless of agent). */
  totalGamesOnMap: number;
  wins: number;
};

export type AgentBestPlayer = {
  playerId: string;
  name: string;
  avgAcs: number;
  /** NaN if none of their games on this agent have a VLR rating. */
  avgVlr: number;
  games: number;
};

export type AgentPartner = {
  agent: string;
  wins: number;
  total: number;
};

export type AgentStat = {
  agent: string;
  /** Total games where this agent was in the lineup. */
  selections: number;
  /** Avg ACS across every stat row using this agent. */
  avgAcs: number;
  /** Avg VLR rating across stat rows that have one; NaN if none do. */
  avgVlr: number;
  /** Ability usage across every stat row using this agent; null if none recorded casts. */
  abilities: AbilityUsage | null;
  byMap: AgentMapStat[];
  bestPlayer: AgentBestPlayer | null;
  /** Top 2 partners by win rate when played alongside this agent. */
  topPartners: AgentPartner[];
};

export function computeAgentStats(
  games: Game[],
  players: Player[]
): AgentStat[] {
  // Collect agent set
  const agentSet = new Set<string>();
  for (const g of games)
    for (const s of g.stats) if (s.agent) agentSet.add(s.agent);

  // Per-map game lists
  const gamesByMap = new Map<ValorantMap, Game[]>();
  for (const g of games) {
    const arr = gamesByMap.get(g.map) ?? [];
    arr.push(g);
    gamesByMap.set(g.map, arr);
  }

  const result: AgentStat[] = [];
  const playerById = new Map(players.map((p) => [p.id, p]));

  // Co-occurrence stats: partnerStats[a][b] = { wins, total } across games
  // containing both a and b.
  const partnerStats = new Map<
    string,
    Map<string, { wins: number; total: number }>
  >();
  for (const g of games) {
    const agentsInGame = Array.from(
      new Set(g.stats.map((s) => s.agent).filter(Boolean) as string[])
    );
    const won = gameWinForUs(g) === true;
    for (const a of agentsInGame) {
      for (const b of agentsInGame) {
        if (a === b) continue;
        const inner = partnerStats.get(a) ?? new Map();
        const cur = inner.get(b) ?? { wins: 0, total: 0 };
        cur.total += 1;
        if (won) cur.wins += 1;
        inner.set(b, cur);
        partnerStats.set(a, inner);
      }
    }
  }

  for (const agent of agentSet) {
    const byMap: AgentMapStat[] = [];
    let selections = 0;

    for (const map of MAPS) {
      const gamesOnMap = gamesByMap.get(map) ?? [];
      const totalGamesOnMap = gamesOnMap.length;
      let agentGames = 0;
      let wins = 0;
      for (const g of gamesOnMap) {
        if (!g.stats.some((s) => s.agent === agent)) continue;
        agentGames += 1;
        if (gameWinForUs(g) === true) wins += 1;
      }
      selections += agentGames;
      byMap.push({
        map,
        selectionsOnMap: agentGames,
        totalGamesOnMap,
        wins,
      });
    }

    // Best player on this agent (and the agent's overall avg ACS).
    const acsByPlayer = new Map<string, { sum: number; count: number; stats: GameStat[] }>();
    const agentStats: GameStat[] = [];
    let totalAcs = 0;
    let totalAcsCount = 0;
    for (const g of games) {
      for (const s of g.stats) {
        if (s.agent !== agent) continue;
        const cur = acsByPlayer.get(s.playerId) ?? { sum: 0, count: 0, stats: [] };
        cur.sum += s.acs;
        cur.count += 1;
        cur.stats.push(s);
        acsByPlayer.set(s.playerId, cur);
        agentStats.push(s);
        totalAcs += s.acs;
        totalAcsCount += 1;
      }
    }
    const avgAcs = totalAcsCount > 0 ? totalAcs / totalAcsCount : 0;
    let bestPlayer: AgentBestPlayer | null = null;
    let bestAvg = -Infinity;
    for (const [pid, { sum, count, stats }] of acsByPlayer) {
      if (count === 0) continue;
      const avg = sum / count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestPlayer = {
          playerId: pid,
          name: playerById.get(pid)?.name ?? '?',
          avgAcs: avg,
          avgVlr: avgVlr(stats),
          games: count,
        };
      }
    }

    // Top partners by win rate, ties broken by play count.
    const inner = partnerStats.get(agent);
    let topPartners: AgentPartner[] = [];
    if (inner) {
      const arr: AgentPartner[] = Array.from(inner.entries()).map(
        ([a, s]) => ({ agent: a, wins: s.wins, total: s.total })
      );
      arr.sort((x, y) => {
        if (x.total === 0 && y.total === 0) return 0;
        if (x.total === 0) return 1;
        if (y.total === 0) return -1;
        const xr = x.wins / x.total;
        const yr = y.wins / y.total;
        if (xr !== yr) return yr - xr;
        if (x.total !== y.total) return y.total - x.total;
        return x.agent.localeCompare(y.agent);
      });
      topPartners = arr.slice(0, 2);
    }

    result.push({
      agent,
      selections,
      avgAcs,
      avgVlr: avgVlr(agentStats),
      abilities: aggregateAbilities(agentStats.map((s) => s.abilities)),
      byMap,
      bestPlayer,
      topPartners,
    });
  }

  result.sort((a, b) => b.selections - a.selections);
  return result;
}
