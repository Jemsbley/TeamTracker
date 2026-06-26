import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import MapIcon from '../../components/MapIcon';
import {
  STAT_DEFS,
  aggregateForGame,
  aggregateForSeries,
  gameOutcome,
  seriesOutcome,
  type Aggregate,
  type StatFilters,
} from '../../utils/stats';
import { gameMatches } from '../../utils/stats';
import {
  aggregateEconomy,
  deriveScore,
  gameEconomy,
  type RoundEconomy,
} from '../../utils/rounds';
import type { Game, Series } from '../../types';

type Mode = 'map' | 'series';

type Props = {
  scopedGames: Game[];
  scopedSeries: Series[];
  filteredGames: Game[];
  filters: StatFilters;
};

/** Precomputed slider-relevant data for one item (game or series). */
type ItemRec = {
  id: string;
  game?: Game;
  series?: Series;
  agg: Aggregate;
  economy: RoundEconomy;
};

/** Slider-bound metric with a getter and display metadata. */
type MetricDef = {
  key: string;
  label: string;
  isPercent: boolean;
  step: number;
  format: (v: number) => string;
  getValue: (item: ItemRec) => number;
};

const EPS = 1e-6;

const STEP_FOR_STAT: Record<string, number> = {
  acs: 1,
  kdr: 0.01,
  assists: 0.1,
  damageDelta: 1,
  adr: 1,
  hsPercent: 0.5,
  kastPercent: 0.5,
  firstKills: 0.05,
  firstDeaths: 0.05,
  multikills: 0.05,
};

export default function ExamineCloserTab({
  scopedGames,
  scopedSeries,
  filteredGames,
  filters,
}: Props) {
  const [mode, setMode] = useQueryState(
    'exMode',
    parseAsStringEnum<Mode>(['map', 'series']).withDefault('series')
  );

  const items: ItemRec[] = useMemo(() => {
    if (mode === 'map') {
      return filteredGames.map((g) => {
        return {
          id: g.id,
          game: g,
          series: undefined,
          agg: aggregateForGame(g, filters),
          economy: gameEconomy(g),
        };
      });
    }
    // Series mode: include series that have ≥1 filter-passing game.
    const matchingSeries = scopedSeries.filter((s) =>
      scopedGames.some(
        (g) => g.seriesId === s.id && gameMatches(g, filters)
      )
    );
    return matchingSeries.map((s) => {
      const seriesGames = scopedGames.filter(
        (g) => g.seriesId === s.id && gameMatches(g, filters)
      );
      return {
        id: s.id,
        game: undefined,
        series: s,
        agg: aggregateForSeries(s, scopedGames, filters),
        economy: aggregateEconomy(seriesGames),
      };
    });
  }, [mode, filteredGames, scopedSeries, scopedGames, filters]);

  // The full list of metric defs (player stats + round economy + pick share).
  const metricDefs: MetricDef[] = useMemo(() => buildMetricDefs(), []);

  // Compute per-metric data ranges, snapped to step grid so handles can hit
  // the exact extremes without round-off pushing items just out of bounds.
  const dataRanges = useMemo(() => {
    const r: Record<string, { min: number; max: number }> = {};
    for (const def of metricDefs) {
      let min = Infinity;
      let max = -Infinity;
      for (const it of items) {
        if (it.agg.games === 0) continue;
        const v = def.getValue(it);
        if (!isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!isFinite(min) || !isFinite(max)) {
        r[def.key] = { min: 0, max: 0 };
      } else {
        const step = def.step;
        r[def.key] = {
          min: Math.floor(min / step) * step,
          max: Math.ceil(max / step) * step,
        };
      }
    }
    return r;
  }, [items, metricDefs]);

  // Bounds state per metric. Reset when ranges change (mode/filters changed).
  const [bounds, setBounds] = useState<Record<string, [number, number]>>(() =>
    snapshotRanges(metricDefs, dataRanges)
  );
  useEffect(() => {
    setBounds(snapshotRanges(metricDefs, dataRanges));
  }, [dataRanges, metricDefs]);

  const matched = useMemo(() => {
    return items.filter((it) => {
      if (it.agg.games === 0) return false;
      for (const def of metricDefs) {
        const v = def.getValue(it);
        // NaN values (e.g. no pick data) are matched as long as the user
        // hasn't narrowed the range — i.e. accept if bounds still equal the
        // data range. This avoids hiding all maps without pick data by
        // default but lets sliders meaningfully filter once moved.
        const range = dataRanges[def.key];
        const [lo, hi] = bounds[def.key] ?? [range.min, range.max];
        if (!isFinite(v)) {
          const atDefault = lo <= range.min + EPS && hi >= range.max - EPS;
          if (!atDefault) return false;
          continue;
        }
        if (v < lo - EPS || v > hi + EPS) return false;
      }
      return true;
    });
  }, [items, metricDefs, bounds, dataRanges]);

  const winRate = useMemo(() => {
    let w = 0;
    let l = 0;
    for (const m of matched) {
      const o =
        mode === 'map'
          ? m.game
            ? gameOutcome(m.game)
            : undefined
          : m.series
            ? seriesOutcome(m.series, scopedGames)
            : undefined;
      if (o === 'W') w += 1;
      else if (o === 'L') l += 1;
    }
    return { w, l };
  }, [matched, mode, scopedGames]);

  if (items.length === 0) {
    return (
      <div className="card text-center text-valorant-muted">
        No {mode === 'map' ? 'maps' : 'series'} match the current filters.
      </div>
    );
  }

  const total = winRate.w + winRate.l;
  const pct = total === 0 ? '–' : `${((winRate.w / total) * 100).toFixed(0)}%`;

  const percentDefs = metricDefs.filter((d) => d.isPercent);
  const otherDefs = metricDefs.filter((d) => !d.isPercent);

  const setStatBound = (key: string, lo: number, hi: number) => {
    setBounds((b) => ({ ...b, [key]: [lo, hi] }));
  };

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="text-sm text-valorant-muted">
          Drag sliders to bracket stat ranges. Matching{' '}
          <span className="text-white font-medium">{matched.length}</span> of{' '}
          {items.length} {mode === 'map' ? 'maps' : 'series'}.
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
        <button
          type="button"
          onClick={() => setBounds(snapshotRanges(metricDefs, dataRanges))}
          className="text-xs text-valorant-muted hover:text-white underline underline-offset-2"
        >
          Reset bounds
        </button>
      </div>

      <div className="card space-y-1">
        <div className="text-sm text-valorant-muted">
          Win rate in matched {mode === 'map' ? 'maps' : 'series'}
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums">{pct}</span>
          <span className="text-sm text-valorant-muted tabular-nums">
            {winRate.w}–{winRate.l}
          </span>
        </div>
      </div>

      <SliderSection
        title="Percentage stats"
        defs={percentDefs}
        ranges={dataRanges}
        bounds={bounds}
        onChange={setStatBound}
      />
      <SliderSection
        title="Average team stats"
        defs={otherDefs}
        ranges={dataRanges}
        bounds={bounds}
        onChange={setStatBound}
      />

      <MatchedList matched={matched} mode={mode} scopedGames={scopedGames} />
    </div>
  );
}

function SliderSection({
  title,
  defs,
  ranges,
  bounds,
  onChange,
}: {
  title: string;
  defs: MetricDef[];
  ranges: Record<string, { min: number; max: number }>;
  bounds: Record<string, [number, number]>;
  onChange: (key: string, lo: number, hi: number) => void;
}) {
  if (defs.length === 0) return null;
  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {defs.map((def) => {
          const range = ranges[def.key];
          return (
            <DualSlider
              key={def.key}
              def={def}
              range={range}
              value={bounds[def.key] ?? [range.min, range.max]}
              onChange={(lo, hi) => onChange(def.key, lo, hi)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DualSlider({
  def,
  range,
  value,
  onChange,
}: {
  def: MetricDef;
  range: { min: number; max: number };
  value: [number, number];
  onChange: (lo: number, hi: number) => void;
}) {
  const step = def.step;
  const [lo, hi] = value;
  const span = Math.max(range.max - range.min, step);
  const loPct = ((lo - range.min) / span) * 100;
  const hiPct = ((hi - range.min) / span) * 100;
  const noRange = range.min === range.max;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{def.label}</span>
        <span className="text-xs text-valorant-muted tabular-nums">
          {def.format(lo)} – {def.format(hi)}
        </span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded bg-white/10" />
        {!noRange && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-valorant-red/70"
            style={{ left: `${loPct}%`, width: `${Math.max(hiPct - loPct, 0)}%` }}
          />
        )}
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={lo}
          disabled={noRange}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Math.min(next, hi), hi);
          }}
          className="dual-range absolute inset-0 w-full pointer-events-auto"
        />
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={hi}
          disabled={noRange}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(lo, Math.max(next, lo));
          }}
          className="dual-range absolute inset-0 w-full pointer-events-auto"
        />
      </div>
      <div className="flex justify-between text-[10px] text-valorant-muted mt-0.5 tabular-nums">
        <span>{def.format(range.min)}</span>
        <span>{def.format(range.max)}</span>
      </div>
    </div>
  );
}

function MatchedList({
  matched,
  mode,
  scopedGames,
}: {
  matched: ItemRec[];
  mode: Mode;
  scopedGames: Game[];
}) {
  const sorted = useMemo(() => {
    if (mode === 'map') {
      return [...matched].sort((a, b) => {
        const da = a.game?.date ?? '';
        const db = b.game?.date ?? '';
        if (da !== db) return db.localeCompare(da);
        return (b.game?.order ?? 0) - (a.game?.order ?? 0);
      });
    }
    return [...matched].sort((a, b) => {
      const da = a.series?.date ?? '';
      const db = b.series?.date ?? '';
      return db.localeCompare(da);
    });
  }, [matched, mode]);

  if (sorted.length === 0) {
    return (
      <div className="card text-center text-valorant-muted text-sm">
        No {mode === 'map' ? 'maps' : 'series'} fall inside the current bounds.
      </div>
    );
  }

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

  return (
    <div className="card space-y-2 p-0">
      <h3 className="font-semibold px-4 pt-4">
        Matching {mode === 'map' ? 'maps' : 'series'} (most recent first)
      </h3>
      <div className="divide-y divide-white/5">
        {sorted.map((m) => {
          if (mode === 'map' && m.game) {
            const g = m.game;
            const sc =
              deriveScore(g) ??
              (g.scoreFor !== undefined && g.scoreAgainst !== undefined
                ? ([g.scoreFor, g.scoreAgainst] as [number, number])
                : undefined);
            const o = gameOutcome(g);
            return (
              <Link
                key={g.id}
                to={`/series/${g.seriesId}/games/${g.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
              >
                <MapIcon map={g.map} width={56} height={32} />
                <span className="font-medium w-24 truncate">{g.map}</span>
                <span className="text-xs text-valorant-muted truncate flex-1">
                  {g.date}
                </span>
                {sc && (
                  <span
                    className={`tabular-nums font-semibold ${
                      o === 'W'
                        ? 'text-green-300'
                        : o === 'L'
                          ? 'text-red-300'
                          : ''
                    }`}
                  >
                    {sc[0]}–{sc[1]}
                  </span>
                )}
              </Link>
            );
          }
          const s = m.series!;
          const [w, l] = seriesScore(s);
          const o = seriesOutcome(s, scopedGames);
          return (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
            >
              <span className="font-medium truncate flex-1">
                vs. {s.opponent}
              </span>
              <span className="text-xs text-valorant-muted w-24">
                {s.date}
              </span>
              <span
                className={`tabular-nums font-semibold ${
                  o === 'W'
                    ? 'text-green-300'
                    : o === 'L'
                      ? 'text-red-300'
                      : ''
                }`}
              >
                {w}–{l}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function snapshotRanges(
  defs: MetricDef[],
  ranges: Record<string, { min: number; max: number }>
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const def of defs) {
    const r = ranges[def.key] ?? { min: 0, max: 0 };
    out[def.key] = [r.min, r.max];
  }
  return out;
}

const pctFmt0 = (v: number) => (isFinite(v) ? `${v.toFixed(0)}%` : '–');

function rate(b: { wins: number; total: number }): number {
  if (b.total === 0) return NaN;
  return (b.wins / b.total) * 100;
}

function buildMetricDefs(): MetricDef[] {
  const defs: MetricDef[] = [];

  // Player stats — one slider per STAT_DEFS entry.
  for (const def of STAT_DEFS) {
    defs.push({
      key: `stat:${def.key}`,
      label: def.label,
      isPercent: def.isPercent,
      step: STEP_FOR_STAT[def.key] ?? (def.isPercent ? 0.5 : 1),
      format: def.format,
      getValue: (it) => it.agg[def.key] as number,
    });
  }

  // Round economy — % cells.
  const econKeys: { key: keyof RoundEconomy; label: string }[] = [
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
  for (const { key, label } of econKeys) {
    defs.push({
      key: `econ:${String(key)}`,
      label,
      isPercent: true,
      step: 1,
      format: pctFmt0,
      getValue: (it) =>
        rate(it.economy[key] as { wins: number; total: number }),
    });
  }
  // First-blood rate (rate of FB on any round).
  defs.push({
    key: 'econ:fbRate',
    label: 'FB rate',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({ wins: it.economy.firstBlood.total, total: it.economy.total }),
  });
  // Attack / defense plant metrics.
  defs.push({
    key: 'econ:atkPlant',
    label: 'Atk plant %',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({ wins: it.economy.attack.plants, total: it.economy.attack.rounds }),
  });
  defs.push({
    key: 'econ:postplant',
    label: 'Postplant W%',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({
        wins: it.economy.attack.postplantWins,
        total: it.economy.attack.plants,
      }),
  });
  defs.push({
    key: 'econ:plantAllowed',
    label: 'Plant allowed',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({
        wins: it.economy.defense.plantsAllowed,
        total: it.economy.defense.rounds,
      }),
  });
  defs.push({
    key: 'econ:retake',
    label: 'Retake W%',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({
        wins: it.economy.defense.retakeWins,
        total: it.economy.defense.plantsAllowed,
      }),
  });
  defs.push({
    key: 'econ:roundWin',
    label: 'Round W%',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({ wins: it.economy.totalWins, total: it.economy.total }),
  });

  return defs;
}
