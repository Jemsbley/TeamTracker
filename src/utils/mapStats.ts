import { MAPS } from '../constants';
import type { Game, Series, ValorantMap } from '../types';
import { PICKBAN_STEPS, isUs } from './pickBan';
import { deriveScore, sideOfRound } from './rounds';

function gameWinForUs(g: Game): boolean | undefined {
  const sc =
    deriveScore(g) ??
    (g.scoreFor !== undefined && g.scoreAgainst !== undefined
      ? ([g.scoreFor, g.scoreAgainst] as [number, number])
      : undefined);
  if (!sc) return undefined;
  if (sc[0] > sc[1]) return true;
  if (sc[0] < sc[1]) return false;
  return undefined;
}

export type PickType = 'ourPick' | 'enemyPick' | 'decider';

export type PickOutcomes = {
  ourPick: { wins: number; losses: number };
  enemyPick: { wins: number; losses: number };
  decider: { wins: number; losses: number };
};

/**
 * Classify a single played map by who picked it. Returns undefined when the
 * series lacks pick/ban data or the game's order doesn't correspond to a
 * pick or decider slot.
 */
export function gamePickType(g: Game, s: Series): PickType | undefined {
  if (!s.format || !s.pickBan || g.order === undefined) return undefined;
  const steps = PICKBAN_STEPS[s.format];
  let pickIndex = 0;
  for (const step of steps) {
    if (step.kind !== 'pick') continue;
    pickIndex += 1;
    if (pickIndex === g.order) {
      return isUs(step.team, s.pickBan.team1) ? 'ourPick' : 'enemyPick';
    }
  }
  const numPicks = steps.filter((st) => st.kind === 'pick').length;
  if (g.order === numPicks + 1) return 'decider';
  return undefined;
}

/** Win/loss for each game classified by who picked the map. */
export function computePickOutcomes(
  series: Series[],
  games: Game[]
): PickOutcomes {
  const out: PickOutcomes = {
    ourPick: { wins: 0, losses: 0 },
    enemyPick: { wins: 0, losses: 0 },
    decider: { wins: 0, losses: 0 },
  };
  const seriesById = new Map(series.map((s) => [s.id, s]));

  for (const g of games) {
    const ser = seriesById.get(g.seriesId);
    if (!ser) continue;
    const bucket = gamePickType(g, ser);
    if (!bucket) continue;
    const won = gameWinForUs(g);
    if (won === undefined) continue;
    if (won) out[bucket].wins += 1;
    else out[bucket].losses += 1;
  }
  return out;
}

export type AgentComp = {
  agents: string[]; // sorted
  wins: number;
  total: number;
};

export type MapAggregate = {
  map: ValorantMap;
  plays: number;
  wins: number;
  losses: number;
  ourPickCount: number;
  ourBanCount: number;
  enemyBanCount: number;
  attackPistol: { wins: number; total: number };
  defensePistol: { wins: number; total: number };
  /** All rounds we played on attack (any category). */
  attackRounds: { wins: number; total: number };
  /** All rounds we played on defense (any category). */
  defenseRounds: { wins: number; total: number };
  /** Sum and count of ACS across player-game stats; computed average available below. */
  acsSum: number;
  acsCount: number;
  topComp: AgentComp | null;
};

export type MapAggregates = {
  /** Per-map stats keyed by map name. */
  byMap: Record<string, MapAggregate>;
  /** Total picks made by us across the scope. */
  ourPickTotal: number;
  /** Total bans made by us across the scope. */
  ourBanTotal: number;
  /** Total bans made by the opponent across the scope. */
  enemyBanTotal: number;
};

export function computeMapAggregates(
  series: Series[],
  games: Game[]
): MapAggregates {
  const byMap: Record<string, MapAggregate> = {};
  for (const m of MAPS) {
    byMap[m] = {
      map: m,
      plays: 0,
      wins: 0,
      losses: 0,
      ourPickCount: 0,
      ourBanCount: 0,
      enemyBanCount: 0,
      attackPistol: { wins: 0, total: 0 },
      defensePistol: { wins: 0, total: 0 },
      attackRounds: { wins: 0, total: 0 },
      defenseRounds: { wins: 0, total: 0 },
      acsSum: 0,
      acsCount: 0,
      topComp: null,
    };
  }

  // Pick / ban counts
  let ourPickTotal = 0;
  let ourBanTotal = 0;
  let enemyBanTotal = 0;
  for (const s of series) {
    if (!s.format || !s.pickBan) continue;
    const steps = PICKBAN_STEPS[s.format];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const move = s.pickBan.moves[i];
      if (!move?.map) continue;
      const agg = byMap[move.map];
      if (!agg) continue;
      const ours = isUs(step.team, s.pickBan.team1);
      if (step.kind === 'pick') {
        if (ours) {
          agg.ourPickCount += 1;
          ourPickTotal += 1;
        }
      } else {
        if (ours) {
          agg.ourBanCount += 1;
          ourBanTotal += 1;
        } else {
          agg.enemyBanCount += 1;
          enemyBanTotal += 1;
        }
      }
    }
  }

  // Per-map agent comp aggregation
  const compsByMap: Record<string, Map<string, AgentComp>> = {};
  for (const m of MAPS) compsByMap[m] = new Map();

  // Game stats
  for (const g of games) {
    const agg = byMap[g.map];
    if (!agg) continue;
    agg.plays += 1;

    const won = gameWinForUs(g);
    if (won === true) agg.wins += 1;
    else if (won === false) agg.losses += 1;

    // Pistols + per-round side splits
    if (g.rounds && g.startingSide) {
      const flip = (side: 'Attack' | 'Defense') =>
        side === 'Attack' ? 'Defense' : 'Attack';
      const pistolEntries: { side: 'Attack' | 'Defense'; idx: number }[] = [
        { side: g.startingSide, idx: 0 },
        { side: flip(g.startingSide), idx: 12 },
      ];
      for (const { side, idx } of pistolEntries) {
        const r = g.rounds[idx];
        if (!r?.result) continue;
        const bucket =
          side === 'Attack' ? agg.attackPistol : agg.defensePistol;
        bucket.total += 1;
        if (r.result === 'W') bucket.wins += 1;
      }
      // All-round side split
      for (let i = 0; i < g.rounds.length; i++) {
        const r = g.rounds[i];
        if (!r?.result) continue;
        const side = sideOfRound(i, g.startingSide);
        const bucket =
          side === 'Attack' ? agg.attackRounds : agg.defenseRounds;
        bucket.total += 1;
        if (r.result === 'W') bucket.wins += 1;
      }
    }

    // ACS
    for (const stat of g.stats) {
      agg.acsSum += stat.acs;
      agg.acsCount += 1;
    }

    // Agent composition (5 agents per map)
    if (g.stats.length >= 5) {
      const agents = g.stats
        .map((s) => s.agent)
        .filter(Boolean)
        .slice(0, 5)
        .sort();
      if (agents.length === 5) {
        const key = agents.join('|');
        const cm = compsByMap[g.map];
        if (cm) {
          const existing: AgentComp = cm.get(key) ?? {
            agents,
            wins: 0,
            total: 0,
          };
          existing.total += 1;
          if (won === true) existing.wins += 1;
          cm.set(key, existing);
        }
      }
    }
  }

  // Finalize top comp per map (highest win rate, ties → most plays)
  for (const m of MAPS) {
    const cm = compsByMap[m];
    let best: AgentComp | null = null;
    let bestRate = -1;
    for (const c of cm.values()) {
      if (c.total === 0) continue;
      const rate = c.wins / c.total;
      if (
        rate > bestRate ||
        (rate === bestRate && (best ? c.total > best.total : true))
      ) {
        bestRate = rate;
        best = c;
      }
    }
    byMap[m].topComp = best;
  }

  return { byMap, ourPickTotal, ourBanTotal, enemyBanTotal };
}
