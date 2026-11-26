import type { Game, GameStat, ValorantMap } from '../types';
import { aggregateAbilities, type AbilityUsage } from './abilities';
import { effectiveClutchWon, roundsPlayedIn } from './rounds';
import { avgVlr } from './stats';
import { sumTrades, tradeRates } from './trades';

type Entry = {
  stat: GameStat;
  map: ValorantMap;
  roundsPlayed: number;
  clutches: number;
  clutchesWon: number;
};

type BestMap = { map: ValorantMap; avgAcs: number; avgVlr: number; games: number };

export type PlayerAggregate = {
  selections: number;
  /** Avg VLR rating over games that have one; NaN if none do. */
  vlrRating: number;
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
  /** % of rounds played where this player got the round's first kill. */
  firstBloodPercent: number;
  /** % of rounds played where this player was the round's first death. */
  firstDeathPercent: number;
  /** % of this player's marked clutch attempts that were won: won / (won + lost). */
  clutchPercent: number;
  /** Trade rates in %, over maps with trade data; NaN if none have it. */
  fdTradedPct: number;
  fbTradedPct: number;
  deathTradePct: number;
  killTradePct: number;
  bestMap: BestMap | null;
  /** Ability usage across these games; null if none recorded casts. */
  abilities: AbilityUsage | null;
};

export type PlayerAgentRow = PlayerAggregate & { agent: string };

export type PlayerStats = {
  byAgent: PlayerAgentRow[]; // sorted by selections desc
  total: PlayerAggregate; // overall row
};

const ZERO: PlayerAggregate = {
  selections: 0,
  vlrRating: NaN,
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
  firstBloodPercent: 0,
  firstDeathPercent: 0,
  clutchPercent: 0,
  fdTradedPct: NaN,
  fbTradedPct: NaN,
  deathTradePct: NaN,
  killTradePct: NaN,
  bestMap: null,
  abilities: null,
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
  const totalRoundsPlayed = entries.reduce((a, e) => a + e.roundsPlayed, 0);
  const totalClutches = entries.reduce((a, e) => a + e.clutches, 0);
  const totalClutchesWon = entries.reduce((a, e) => a + e.clutchesWon, 0);
  const trades = tradeRates(sumTrades(entries.map((e) => e.stat)));
  return {
    selections: n,
    vlrRating: avgVlr(entries.map((e) => e.stat)),
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
    firstBloodPercent: totalRoundsPlayed ? (sum('firstKills') / totalRoundsPlayed) * 100 : 0,
    firstDeathPercent: totalRoundsPlayed ? (sum('firstDeaths') / totalRoundsPlayed) * 100 : 0,
    clutchPercent: totalClutches ? (totalClutchesWon / totalClutches) * 100 : 0,
    fdTradedPct: trades.fdTraded,
    fbTradedPct: trades.fbTraded,
    deathTradePct: trades.deathTrade,
    killTradePct: trades.killTrade,
    bestMap: bestMapFor(entries),
    abilities: aggregateAbilities(entries.map((e) => e.stat.abilities)),
  };
}

function bestMapFor(entries: Entry[]): BestMap | null {
  const byMap = new Map<ValorantMap, GameStat[]>();
  for (const e of entries) {
    const list = byMap.get(e.map) ?? [];
    list.push(e.stat);
    byMap.set(e.map, list);
  }
  let best: BestMap | null = null;
  for (const [map, list] of byMap) {
    if (list.length === 0) continue;
    const avg = list.reduce((a, s) => a + s.acs, 0) / list.length;
    if (!best || avg > best.avgAcs) {
      best = { map, avgAcs: avg, avgVlr: avgVlr(list), games: list.length };
    }
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
      const clutchRounds = (g.rounds ?? []).filter(
        (r) => r.clutch === true && r.clutchPlayerId === playerId
      );
      const clutches = clutchRounds.length;
      const clutchesWon = clutchRounds.filter(effectiveClutchWon).length;
      entries.push({
        stat: s,
        map: g.map,
        roundsPlayed: roundsPlayedIn(g),
        clutches,
        clutchesWon,
      });
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
