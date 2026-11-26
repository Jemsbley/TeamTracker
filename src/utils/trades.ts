import type { GameStat, TradeCounts } from '../types';

/**
 * Trades, worked out from a map's kill timeline. A kill is "traded" when the
 * victim's team kills the killer within TRADE_WINDOW_MS of it, in the same
 * round. 5s is tracker.gg's own window: its per-player `traded` stat matches
 * `deathsTraded` from this exactly.
 *
 * Only tracker.gg imports (and scouting uploads with heatmap data) carry a
 * kill timeline, so maps entered by hand have no trade counts.
 */
export const TRADE_WINDOW_MS = 5000;

export type TimelineKill = {
  round: number;
  /** Milliseconds into the round. */
  t: number;
  killer: string;
  victim: string;
};

export const ZERO_TRADES: TradeCounts = {
  kills: 0,
  killsTraded: 0,
  deaths: 0,
  deathsTraded: 0,
  firstKills: 0,
  firstKillsTraded: 0,
  firstDeaths: 0,
  firstDeathsTraded: 0,
};

/**
 * Per-player trade counts from a kill timeline. `teamOf` names each player's
 * team; kills where either side has no team, or both are on the same team
 * (team kills), are ignored, as are kills with no killer (spike, falls). The
 * round's first kill is its earliest enemy kill.
 */
export function computeTrades(
  kills: TimelineKill[],
  teamOf: (id: string) => string | undefined
): Map<string, TradeCounts> {
  const out = new Map<string, TradeCounts>();
  const of = (id: string) => {
    let c = out.get(id);
    if (!c) {
      c = { ...ZERO_TRADES };
      out.set(id, c);
    }
    return c;
  };

  const byRound = new Map<number, TimelineKill[]>();
  for (const k of kills) {
    const kt = teamOf(k.killer);
    const vt = teamOf(k.victim);
    if (!kt || !vt || kt === vt) continue;
    const list = byRound.get(k.round) ?? [];
    list.push(k);
    byRound.set(k.round, list);
  }

  for (const list of byRound.values()) {
    list.sort((a, b) => a.t - b.t);
    list.forEach((k, i) => {
      const victimTeam = teamOf(k.victim);
      let traded = false;
      for (let j = i + 1; j < list.length; j++) {
        const n = list[j];
        if (n.t - k.t > TRADE_WINDOW_MS) break;
        if (n.victim === k.killer && teamOf(n.killer) === victimTeam) {
          traded = true;
          break;
        }
      }
      const killer = of(k.killer);
      const victim = of(k.victim);
      killer.kills += 1;
      victim.deaths += 1;
      if (traded) {
        killer.killsTraded += 1;
        victim.deathsTraded += 1;
      }
      if (i === 0) {
        killer.firstKills += 1;
        victim.firstDeaths += 1;
        if (traded) {
          killer.firstKillsTraded += 1;
          victim.firstDeathsTraded += 1;
        }
      }
    });
  }
  return out;
}

export function addTrades(a: TradeCounts, b: TradeCounts): TradeCounts {
  return {
    kills: a.kills + b.kills,
    killsTraded: a.killsTraded + b.killsTraded,
    deaths: a.deaths + b.deaths,
    deathsTraded: a.deathsTraded + b.deathsTraded,
    firstKills: a.firstKills + b.firstKills,
    firstKillsTraded: a.firstKillsTraded + b.firstKillsTraded,
    firstDeaths: a.firstDeaths + b.firstDeaths,
    firstDeathsTraded: a.firstDeathsTraded + b.firstDeathsTraded,
  };
}

/** Summed trade counts of the stat lines that have them; null when none do. */
export function sumTrades(stats: GameStat[]): TradeCounts | null {
  let total: TradeCounts | null = null;
  for (const s of stats) {
    if (!s.trades) continue;
    total = addTrades(total ?? ZERO_TRADES, s.trades);
  }
  return total;
}

function pctOf(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : NaN;
}

/** The four trade rates as percentages; NaN where there's no sample. */
export type TradeRates = {
  /** Our first deaths that a teammate traded. Higher is better. */
  fdTraded: number;
  /** Our first bloods the enemy traded back. Lower is better. */
  fbTraded: number;
  /** Our deaths that a teammate traded. Higher is better. */
  deathTrade: number;
  /** Our kills the enemy traded back. Lower is better. */
  killTrade: number;
};

export function tradeRates(t: TradeCounts | null): TradeRates {
  if (!t) return { fdTraded: NaN, fbTraded: NaN, deathTrade: NaN, killTrade: NaN };
  return {
    fdTraded: pctOf(t.firstDeathsTraded, t.firstDeaths),
    fbTraded: pctOf(t.firstKillsTraded, t.firstKills),
    deathTrade: pctOf(t.deathsTraded, t.deaths),
    killTrade: pctOf(t.killsTraded, t.kills),
  };
}

/** Labels and tooltips shared by every place the trade rates appear. */
export const TRADE_STAT_INFO = {
  fdTraded: {
    label: 'FD traded%',
    short: 'FD Tr%',
    tooltip: 'First deaths a teammate traded within 5s',
    lowerIsBetter: false,
  },
  fbTraded: {
    label: 'FB traded%',
    short: 'FB Tr%',
    tooltip: 'First bloods the enemy traded back within 5s',
    lowerIsBetter: true,
  },
  deathTrade: {
    label: 'Death trade%',
    short: 'D Tr%',
    tooltip: 'Deaths a teammate traded within 5s',
    lowerIsBetter: false,
  },
  killTrade: {
    label: 'Kill trade%',
    short: 'K Tr%',
    tooltip: 'Kills the enemy traded back within 5s',
    lowerIsBetter: true,
  },
} as const;

export type TradeRateKey = keyof typeof TRADE_STAT_INFO;
export const TRADE_RATE_KEYS: TradeRateKey[] = ['fdTraded', 'fbTraded', 'deathTrade', 'killTrade'];

/** Numerator/denominator behind each rate, for "x/y" sub-labels. */
export function tradeFraction(t: TradeCounts | null, key: TradeRateKey): [number, number] {
  if (!t) return [0, 0];
  switch (key) {
    case 'fdTraded':
      return [t.firstDeathsTraded, t.firstDeaths];
    case 'fbTraded':
      return [t.firstKillsTraded, t.firstKills];
    case 'deathTrade':
      return [t.deathsTraded, t.deaths];
    case 'killTrade':
      return [t.killsTraded, t.kills];
  }
}
