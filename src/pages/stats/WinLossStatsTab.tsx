import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import MapIcon from '../../components/MapIcon';
import PlayerStatsTable from '../../components/PlayerStatsTable';
import {
  STAT_DEFS,
  aggregateForGame,
  aggregateForSeries,
  gameOutcome,
  rankItemsByStats,
  seriesOutcome,
  type Aggregate,
  type StatFilters,
} from '../../utils/stats';
import { gameMatches } from '../../utils/stats';
import { aggregateEconomy, deriveScore, type RoundEconomy } from '../../utils/rounds';
import { computePickOutcomes } from '../../utils/mapStats';
import type { Game, Player, Series, ValorantMap } from '../../types';

type Props = {
  scopedGames: Game[];
  scopedSeries: Series[];
  scopedPlayers: Player[];
  filteredGames: Game[];
  filters: StatFilters;
  includeSubs: boolean;
  /** Which side of the win/loss split this tab shows. */
  outcome: 'W' | 'L';
};

type Mode = 'map' | 'series';

/** A single rankable statistic value with its baseline for comparison. */
type Metric = {
  key: string;
  label: string;
  value: number;
  baseline: number;
  /** When true, value is in 0..100 and baseline delta is shown in pp. */
  isPercent: boolean;
  /** When true, smaller values are better (inverts delta colors). */
  lowerIsBetter?: boolean;
  format: (v: number) => string;
  /** Optional small-text suffix shown inside the cell (e.g. "12/24"). */
  countLabel?: string;
};

export default function WinLossStatsTab({
  scopedGames,
  scopedSeries,
  scopedPlayers,
  filteredGames,
  filters,
  includeSubs,
  outcome,
}: Props) {
  const [mode, setMode] = useQueryState(
    'wlMode',
    parseAsStringEnum<Mode>(['map', 'series']).withDefault('map')
  );

  // Games passing shared filters AND matching the win/loss outcome.
  const winningMaps = useMemo(
    () => filteredGames.filter((g) => gameOutcome(g) === outcome),
    [filteredGames, outcome]
  );

  // Series matching filters and series-level outcome.
  const matchingSeries = useMemo(() => {
    if (mode !== 'series') return [];
    return scopedSeries.filter((s) => {
      const matchedGames = scopedGames.filter(
        (g) => g.seriesId === s.id && gameMatches(g, filters)
      );
      if (matchedGames.length === 0) return false;
      return seriesOutcome(s, scopedGames) === outcome;
    });
  }, [mode, scopedSeries, scopedGames, filters, outcome]);

  // All in-scope series with ≥1 filter-passing game (baseline universe).
  const allMatchingSeries = useMemo(() => {
    if (mode !== 'series') return [];
    return scopedSeries.filter((s) =>
      scopedGames.some(
        (g) => g.seriesId === s.id && gameMatches(g, filters)
      )
    );
  }, [mode, scopedSeries, scopedGames, filters]);

  // Slice games — the actual Game[] used for round-economy / pick metrics.
  // For series mode this includes ALL filter-passing games from matching
  // series, not just the won/lost maps inside them.
  const sliceGames = useMemo(() => {
    if (mode === 'map') return winningMaps;
    const setIds = new Set(matchingSeries.map((s) => s.id));
    return scopedGames.filter(
      (g) => setIds.has(g.seriesId) && gameMatches(g, filters)
    );
  }, [mode, winningMaps, matchingSeries, scopedGames, filters]);

  const baselineGames = useMemo(() => {
    if (mode === 'map') return filteredGames;
    const setIds = new Set(allMatchingSeries.map((s) => s.id));
    return scopedGames.filter(
      (g) => setIds.has(g.seriesId) && gameMatches(g, filters)
    );
  }, [mode, filteredGames, allMatchingSeries, scopedGames, filters]);

  // Mean of per-item Aggregate values (one per game in map mode, one per
  // series in series mode). Used for player-stat metrics.
  const aggForMode = useMemo(() => {
    if (mode === 'map') {
      return averageAggregates(
        winningMaps.map((g) => aggregateForGame(g, filters))
      );
    }
    return averageAggregates(
      matchingSeries.map((s) => aggregateForSeries(s, scopedGames, filters))
    );
  }, [mode, winningMaps, matchingSeries, scopedGames, filters]);

  const baselineAgg = useMemo(() => {
    if (mode === 'map') {
      return averageAggregates(
        filteredGames.map((g) => aggregateForGame(g, filters))
      );
    }
    return averageAggregates(
      allMatchingSeries.map((s) => aggregateForSeries(s, scopedGames, filters))
    );
  }, [mode, filteredGames, allMatchingSeries, scopedGames, filters]);

  const itemCount =
    mode === 'map' ? winningMaps.length : matchingSeries.length;

  const rankedItems = useMemo(() => {
    if (mode === 'map') {
      return rankItemsByStats(
        winningMaps,
        (g) => aggregateForGame(g, filters),
        'best'
      );
    }
    return rankItemsByStats(
      matchingSeries,
      (s) => aggregateForSeries(s, scopedGames, filters),
      'best'
    );
  }, [mode, winningMaps, matchingSeries, scopedGames, filters]);

  // Build unified metrics list once for slice vs baseline.
  const metrics = useMemo(
    () =>
      buildMetrics({
        sliceGames,
        sliceAgg: aggForMode,
        baselineGames,
        baselineAgg,
        scopedSeries,
      }),
    [sliceGames, aggForMode, baselineGames, baselineAgg, scopedSeries]
  );

  const sortedPercent = useMemo(
    () =>
      metrics
        .filter((m) => m.isPercent)
        .sort((a, b) => safeDesc(a.value, b.value)),
    [metrics]
  );

  const headerLabel = outcome === 'W' ? 'wins' : 'losses';

  if (itemCount === 0) {
    return (
      <div className="card text-center text-valorant-muted">
        No {mode === 'map' ? 'maps' : 'series'} with a {headerLabel} outcome
        match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="text-sm text-valorant-muted">
          Averaging stats across{' '}
          <span className="text-white font-medium">{itemCount}</span>{' '}
          {mode === 'map' ? 'map' : 'series'} {headerLabel}
        </div>
        <div className="ml-auto inline-flex rounded overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => setMode('map')}
            className={`px-3 py-1 text-sm ${
              mode === 'map'
                ? 'bg-valorant-red text-white'
                : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
            }`}
          >
            By map
          </button>
          <button
            type="button"
            onClick={() => setMode('series')}
            className={`px-3 py-1 text-sm ${
              mode === 'series'
                ? 'bg-valorant-red text-white'
                : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
            }`}
          >
            By series
          </button>
        </div>
      </div>

      <MetricRankSection title="Percentage stats" metrics={sortedPercent} />

      <div className="space-y-2">
        <h3 className="font-semibold">Scoreboard</h3>
        <PlayerStatsTable
          games={sliceGames}
          players={scopedPlayers}
          filters={filters}
          includeSubs={includeSubs}
        />
        <p className="text-xs text-valorant-muted">
          Team and per-player averages across the {sliceGames.length} maps in
          this {outcome === 'W' ? 'wins' : 'losses'} slice.
        </p>
      </div>

      {mode === 'map' ? (
        <RankedMaps
          items={rankedItems as { item: Game; agg: Aggregate; avgRank: number }[]}
          series={scopedSeries}
          outcome={outcome}
        />
      ) : (
        <RankedSeries
          items={rankedItems as { item: Series; agg: Aggregate; avgRank: number }[]}
          scopedGames={scopedGames}
          outcome={outcome}
        />
      )}
    </div>
  );
}

function MetricRankSection({
  title,
  metrics,
}: {
  title: string;
  metrics: Metric[];
}) {
  if (metrics.length === 0) return null;
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {metrics.map((m, i) => {
          const delta = m.value - m.baseline;
          const isUp = m.lowerIsBetter ? delta < 0 : delta > 0;
          const isDown = m.lowerIsBetter ? delta > 0 : delta < 0;
          const finite = isFinite(m.value) && isFinite(m.baseline);
          const deltaTxt = !finite
            ? ''
            : m.isPercent
              ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`
              : `${delta >= 0 ? '+' : ''}${delta.toFixed(
                  Math.abs(delta) < 1 ? 2 : 1
                )}`;
          return (
            <div
              key={m.key}
              className="bg-valorant-panel2/40 rounded p-2"
              title={`Overall: ${m.format(m.baseline)}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wider text-valorant-muted">
                  #{i + 1} · {m.label}
                </span>
                {deltaTxt && (
                  <span
                    className={`text-[10px] tabular-nums ${
                      isUp
                        ? 'text-green-300'
                        : isDown
                          ? 'text-red-300'
                          : 'text-valorant-muted'
                    }`}
                  >
                    {deltaTxt}
                  </span>
                )}
              </div>
              <div className="text-base font-semibold tabular-nums">
                {m.format(m.value)}
              </div>
              {m.countLabel && (
                <div className="text-[10px] text-valorant-muted tabular-nums">
                  {m.countLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankedMaps({
  items,
  series,
  outcome,
}: {
  items: { item: Game; agg: Aggregate; avgRank: number }[];
  series: Series[];
  outcome: 'W' | 'L';
}) {
  const seriesById = useMemo(
    () => new Map(series.map((s) => [s.id, s])),
    [series]
  );
  const heading =
    outcome === 'W' ? 'Best winning maps' : 'Highest-statted losses';
  return (
    <div className="card space-y-2 p-0">
      <h3 className="font-semibold px-4 pt-4">{heading}</h3>
      <div className="divide-y divide-white/5">
        {items.map(({ item: g, avgRank }, idx) => {
          const ser = seriesById.get(g.seriesId);
          const sc =
            deriveScore(g) ??
            (g.scoreFor !== undefined && g.scoreAgainst !== undefined
              ? ([g.scoreFor, g.scoreAgainst] as [number, number])
              : undefined);
          return (
            <Link
              key={g.id}
              to={`/series/${g.seriesId}/games/${g.id}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
            >
              <span className="text-xs text-valorant-muted w-6 tabular-nums">
                #{idx + 1}
              </span>
              <MapIcon map={g.map} width={56} height={32} />
              <span className="font-medium w-24 truncate">{g.map}</span>
              <span className="text-sm text-valorant-muted truncate flex-1">
                vs. {ser?.opponent ?? '?'} · {g.date}
              </span>
              {sc && (
                <span
                  className={`tabular-nums font-semibold ${
                    outcome === 'W' ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {sc[0]}–{sc[1]}
                </span>
              )}
              <span className="text-xs text-valorant-muted w-20 text-right tabular-nums">
                avg rank {avgRank.toFixed(1)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function RankedSeries({
  items,
  scopedGames,
  outcome,
}: {
  items: { item: Series; agg: Aggregate; avgRank: number }[];
  scopedGames: Game[];
  outcome: 'W' | 'L';
}) {
  const heading =
    outcome === 'W' ? 'Best winning series' : 'Highest-statted losing series';

  const seriesScore = (s: Series): [number, number] => {
    let w = 0;
    let l = 0;
    for (const g of scopedGames) {
      if (g.seriesId !== s.id) continue;
      const o = gameOutcome(g);
      if (o === 'W') w += 1;
      else if (o === 'L') l += 1;
    }
    return [w, l];
  };

  const mapsForSeries = (s: Series): ValorantMap[] => {
    const games = scopedGames
      .filter((g) => g.seriesId === s.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return games.map((g) => g.map);
  };

  return (
    <div className="card space-y-2 p-0">
      <h3 className="font-semibold px-4 pt-4">{heading}</h3>
      <div className="divide-y divide-white/5">
        {items.map(({ item: s, avgRank }, idx) => {
          const [w, l] = seriesScore(s);
          const maps = mapsForSeries(s);
          return (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
            >
              <span className="text-xs text-valorant-muted w-6 tabular-nums">
                #{idx + 1}
              </span>
              <span className="font-medium truncate w-40">
                vs. {s.opponent}
              </span>
              <span className="text-xs text-valorant-muted w-24">
                {s.date}
              </span>
              <span className="flex items-center gap-1 flex-1 overflow-hidden">
                {maps.map((m, i) => (
                  <MapIcon key={i} map={m} width={36} height={20} />
                ))}
              </span>
              <span
                className={`tabular-nums font-semibold ${
                  outcome === 'W' ? 'text-green-300' : 'text-red-300'
                }`}
              >
                {w}–{l}
              </span>
              <span className="text-xs text-valorant-muted w-20 text-right tabular-nums">
                avg rank {avgRank.toFixed(1)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Element-wise mean of a list of Aggregates. Empty list -> zeros. */
function averageAggregates(aggs: Aggregate[]): Aggregate {
  const out: Aggregate = {
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
  if (aggs.length === 0) return out;
  const keys = Object.keys(out) as (keyof Aggregate)[];
  for (const k of keys) {
    let sum = 0;
    let n = 0;
    for (const a of aggs) {
      if (a.games === 0) continue;
      sum += a[k] as number;
      n += 1;
    }
    out[k] = (n > 0 ? sum / n : 0) as Aggregate[typeof k];
  }
  out.games = aggs.reduce((acc, a) => acc + a.games, 0);
  return out;
}

const pctFmt = (v: number) => (isFinite(v) ? `${v.toFixed(0)}%` : '–');

/** Build the full ranked-metric list for a win/loss slice. */
function buildMetrics({
  sliceGames,
  sliceAgg,
  baselineGames,
  baselineAgg,
  scopedSeries,
}: {
  sliceGames: Game[];
  sliceAgg: Aggregate;
  baselineGames: Game[];
  baselineAgg: Aggregate;
  scopedSeries: Series[];
}): Metric[] {
  const sliceEcon = aggregateEconomy(sliceGames);
  const baseEcon = aggregateEconomy(baselineGames);

  const slicePicks = computePickOutcomes(scopedSeries, sliceGames);
  const basePicks = computePickOutcomes(scopedSeries, baselineGames);

  const out: Metric[] = [];

  // Player stats — one metric per STAT_DEFS entry.
  for (const def of STAT_DEFS) {
    out.push({
      key: `stat:${def.key}`,
      label: def.label,
      value: sliceAgg[def.key] as number,
      baseline: baselineAgg[def.key] as number,
      isPercent: def.isPercent,
      lowerIsBetter: def.lowerIsBetter,
      format: def.format,
    });
  }

  // Round economy: pistol splits, eco/antieco, gun/save, FB, plant/retake,
  // overall round W%.
  const econCells: { key: keyof RoundEconomy; label: string }[] = [
    { key: 'attackPistol', label: 'Atk Pistol W%' },
    { key: 'defensePistol', label: 'Def Pistol W%' },
    { key: 'force', label: 'Antieco W%' },
    { key: 'bonus', label: 'Bonus W%' },
    { key: 'eco', label: 'Eco W%' },
    { key: 'antibonus', label: 'Antibonus W%' },
    { key: 'gun', label: 'Gun W%' },
    { key: 'save', label: 'Save W%' },
    { key: 'firstBlood', label: 'Win | FB' },
    { key: 'noFirstBlood', label: 'Win | no FB' },
  ];
  for (const { key, label } of econCells) {
    const s = sliceEcon[key] as { wins: number; total: number };
    const b = baseEcon[key] as { wins: number; total: number };
    out.push({
      key: `econ:${String(key)}`,
      label,
      value: ratePct(s.wins, s.total),
      baseline: ratePct(b.wins, b.total),
      isPercent: true,
      format: pctFmt,
      countLabel: `${s.wins}/${s.total}`,
    });
  }

  // First-blood rate (probability of getting FB on any round, not a W%).
  out.push({
    key: 'econ:fbRate',
    label: 'FB rate',
    value: ratePct(sliceEcon.firstBlood.total, sliceEcon.total),
    baseline: ratePct(baseEcon.firstBlood.total, baseEcon.total),
    isPercent: true,
    format: pctFmt,
    countLabel: `${sliceEcon.firstBlood.total}/${sliceEcon.total}`,
  });

  // Attack / defense plant metrics.
  out.push({
    key: 'econ:atkPlant',
    label: 'Atk plant %',
    value: ratePct(sliceEcon.attack.plants, sliceEcon.attack.rounds),
    baseline: ratePct(baseEcon.attack.plants, baseEcon.attack.rounds),
    isPercent: true,
    format: pctFmt,
    countLabel: `${sliceEcon.attack.plants}/${sliceEcon.attack.rounds}`,
  });
  out.push({
    key: 'econ:postplant',
    label: 'Postplant W%',
    value: ratePct(sliceEcon.attack.postplantWins, sliceEcon.attack.plants),
    baseline: ratePct(baseEcon.attack.postplantWins, baseEcon.attack.plants),
    isPercent: true,
    format: pctFmt,
    countLabel: `${sliceEcon.attack.postplantWins}/${sliceEcon.attack.plants}`,
  });
  out.push({
    key: 'econ:plantAllowed',
    label: 'Plant allowed',
    value: ratePct(sliceEcon.defense.plantsAllowed, sliceEcon.defense.rounds),
    baseline: ratePct(baseEcon.defense.plantsAllowed, baseEcon.defense.rounds),
    isPercent: true,
    // Lower allowed-plant rate is better defensively.
    lowerIsBetter: true,
    format: pctFmt,
    countLabel: `${sliceEcon.defense.plantsAllowed}/${sliceEcon.defense.rounds}`,
  });
  out.push({
    key: 'econ:retake',
    label: 'Retake W%',
    value: ratePct(sliceEcon.defense.retakeWins, sliceEcon.defense.plantsAllowed),
    baseline: ratePct(baseEcon.defense.retakeWins, baseEcon.defense.plantsAllowed),
    isPercent: true,
    format: pctFmt,
    countLabel: `${sliceEcon.defense.retakeWins}/${sliceEcon.defense.plantsAllowed}`,
  });

  // Overall round win rate.
  out.push({
    key: 'econ:roundWin',
    label: 'Round W%',
    value: ratePct(sliceEcon.totalWins, sliceEcon.total),
    baseline: ratePct(baseEcon.totalWins, baseEcon.total),
    isPercent: true,
    format: pctFmt,
    countLabel: `${sliceEcon.totalWins}/${sliceEcon.total}`,
  });

  // Pick distribution: in the slice, what % of decided maps came from each
  // pick type. (W%-by-pick-type is degenerate in a single-outcome slice.)
  const sliceTotalDecided =
    slicePicks.ourPick.wins +
    slicePicks.ourPick.losses +
    slicePicks.enemyPick.wins +
    slicePicks.enemyPick.losses +
    slicePicks.decider.wins +
    slicePicks.decider.losses;
  const baseTotalDecided =
    basePicks.ourPick.wins +
    basePicks.ourPick.losses +
    basePicks.enemyPick.wins +
    basePicks.enemyPick.losses +
    basePicks.decider.wins +
    basePicks.decider.losses;
  const pickCounts: { key: 'ourPick' | 'enemyPick' | 'decider'; label: string }[] = [
    { key: 'ourPick', label: 'Our pick share' },
    { key: 'enemyPick', label: 'Enemy pick share' },
    { key: 'decider', label: 'Decider share' },
  ];
  for (const { key, label } of pickCounts) {
    const sCount = slicePicks[key].wins + slicePicks[key].losses;
    const bCount = basePicks[key].wins + basePicks[key].losses;
    out.push({
      key: `pick:${key}`,
      label,
      value: ratePct(sCount, sliceTotalDecided),
      baseline: ratePct(bCount, baseTotalDecided),
      isPercent: true,
      format: pctFmt,
      countLabel: `${sCount}/${sliceTotalDecided}`,
    });
  }

  return out;
}

function ratePct(wins: number, total: number): number {
  if (total === 0) return NaN;
  return (wins / total) * 100;
}

/** Descending sort that pushes NaN values to the bottom. */
function safeDesc(a: number, b: number): number {
  const an = !isFinite(a);
  const bn = !isFinite(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  return b - a;
}
