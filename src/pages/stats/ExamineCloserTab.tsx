import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
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
  CATEGORY_LABEL,
  COUNT_CONDITION_FIELD_LABEL,
  HALF_LENGTH,
  ROUND_CONDITION_FIELD_LABEL,
  aggregateEconomy,
  deriveScore,
  gameEconomy,
  scorelineOccurred,
  timelineConditionsMatch,
  type CountCondition,
  type CountConditionField,
  type RoundCategory,
  type RoundCondition,
  type RoundConditionField,
  type RoundEconomy,
  type TimelineCondition,
} from '../../utils/rounds';
import { SERIES_FORMATS, type Game, type Player, type Series, type SeriesFormat } from '../../types';

type Mode = 'map' | 'series';

type Props = {
  scopedGames: Game[];
  scopedSeries: Series[];
  scopedPlayers: Player[];
  filteredGames: Game[];
  filters: StatFilters;
};

const PLAYER_FIELDS: RoundConditionField[] = [
  'firstBloodPlayer',
  'firstDeathPlayer',
  'clutchPlayer',
];

/** True for conditions that belong to the "Filter by player" section (count
 * conditions, plus round conditions on one of the player-attribution fields)
 * rather than the round timeline's own win/loss/category/etc. conditions. */
function isPlayerCondition(c: TimelineCondition): boolean {
  return c.kind === 'count' || PLAYER_FIELDS.includes(c.field);
}

const COUNT_FIELDS: CountConditionField[] = [
  'firstBloodPlayer',
  'firstDeathPlayer',
  'clutchWonPlayer',
  'clutchLostPlayer',
];

/** Precomputed slider-relevant data for one item (game or series). */
type ItemRec = {
  id: string;
  game?: Game;
  series?: Series;
  agg: Aggregate;
  economy: RoundEconomy;
};

/** A required outcome for one 1-based map slot within a series (e.g. "map 2 was a loss"). */
type MapResult = { index: number; value: 'W' | 'L' };

/** True if every configured map-slot requirement is met by this series (empty list = always true). */
function seriesMapResultsMatch(
  series: Series,
  games: Game[],
  mapResults: MapResult[]
): boolean {
  if (mapResults.length === 0) return true;
  const seriesGames = games
    .filter((g) => g.seriesId === series.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return mapResults.every((mr) => {
    const g = seriesGames[mr.index - 1];
    return !!g && gameOutcome(g) === mr.value;
  });
}

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
  scopedPlayers,
  filteredGames,
  filters,
}: Props) {
  const [mode, setMode] = useQueryState(
    'exMode',
    parseAsStringEnum<Mode>(['map', 'series']).withDefault('series')
  );

  const [conditionsRaw, setConditionsRaw] = useQueryState(
    'timeline',
    parseAsString.withDefault('[]')
  );
  const conditions: TimelineCondition[] = useMemo(() => {
    try {
      const parsed = JSON.parse(conditionsRaw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((c): c is TimelineCondition => {
        if (!c || typeof c.id !== 'string') return false;
        if (c.kind === 'count') {
          return (
            typeof c.field === 'string' &&
            typeof c.playerId === 'string' &&
            typeof c.count === 'number'
          );
        }
        return (
          typeof c.roundIndex === 'number' &&
          typeof c.field === 'string' &&
          typeof c.value === 'string'
        );
      });
    } catch {
      return [];
    }
  }, [conditionsRaw]);
  const setConditions = (next: TimelineCondition[]) => {
    setConditionsRaw(next.length ? JSON.stringify(next) : null);
  };

  // Scoreline filter: matches maps/series where the running score hit this
  // exact (us, them) tally at any point in the map, not just at the end.
  const [scoreUs, setScoreUs] = useQueryState('scoreUs', parseAsInteger);
  const [scoreThem, setScoreThem] = useQueryState('scoreThem', parseAsInteger);
  const scorelineActive = scoreUs !== null && scoreThem !== null;

  // Per-map win/loss picker (series mode only): require specific map slots
  // within the series to have gone a specific way, e.g. "map 1 was a loss".
  const [mapResultsRaw, setMapResultsRaw] = useQueryState(
    'mapResults',
    parseAsString.withDefault('[]')
  );
  const mapResults: MapResult[] = useMemo(() => {
    try {
      const parsed = JSON.parse(mapResultsRaw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (m): m is MapResult =>
          m && typeof m.index === 'number' && (m.value === 'W' || m.value === 'L')
      );
    } catch {
      return [];
    }
  }, [mapResultsRaw]);
  const setMapResults = (next: MapResult[]) => {
    setMapResultsRaw(next.length ? JSON.stringify(next) : null);
  };

  // Series-format filter (Bo1/Bo3/Bo5), shown alongside the map-result picker.
  const [formatsRaw, setFormatsRaw] = useQueryState('exFormats', parseAsString.withDefault('[]'));
  const formats: SeriesFormat[] = useMemo(() => {
    try {
      const parsed = JSON.parse(formatsRaw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((f): f is SeriesFormat => SERIES_FORMATS.includes(f));
    } catch {
      return [];
    }
  }, [formatsRaw]);
  const setFormats = (next: SeriesFormat[]) => {
    setFormatsRaw(next.length ? JSON.stringify(next) : null);
  };

  const items: ItemRec[] = useMemo(() => {
    const passesExtra = (g: Game) =>
      timelineConditionsMatch(g, conditions) &&
      (!scorelineActive || scorelineOccurred(g, scoreUs as number, scoreThem as number));

    const seriesById = new Map(scopedSeries.map((s) => [s.id, s]));
    const passesFormat = (seriesId: string) => {
      if (formats.length === 0) return true;
      const fmt = seriesById.get(seriesId)?.format;
      return !!fmt && formats.includes(fmt);
    };

    let raw: ItemRec[];
    if (mode === 'map') {
      raw = filteredGames
        .filter((g) => passesFormat(g.seriesId))
        .map((g) => ({
          id: g.id,
          game: g,
          series: undefined,
          agg: aggregateForGame(g, filters),
          economy: gameEconomy(g),
        }));
    } else {
      // Series mode: include series that have ≥1 filter-passing game.
      const matchingSeries = scopedSeries.filter(
        (s) =>
          passesFormat(s.id) && scopedGames.some((g) => g.seriesId === s.id && gameMatches(g, filters))
      );
      raw = matchingSeries.map((s) => {
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
    }

    if (mode === 'map') {
      if (conditions.length === 0 && !scorelineActive) return raw;
      return raw.filter((it) => it.game && passesExtra(it.game));
    }

    return raw.filter((it) => {
      if (!it.series) return false;
      if (conditions.length > 0 || scorelineActive) {
        const anyMapMatches = scopedGames.some(
          (g) => g.seriesId === it.series!.id && gameMatches(g, filters) && passesExtra(g)
        );
        if (!anyMapMatches) return false;
      }
      return seriesMapResultsMatch(it.series, scopedGames, mapResults);
    });
  }, [
    mode,
    filteredGames,
    scopedSeries,
    scopedGames,
    filters,
    conditions,
    scoreUs,
    scoreThem,
    scorelineActive,
    mapResults,
    formats,
  ]);

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

  const total = winRate.w + winRate.l;
  const pct = total === 0 ? '–' : `${((winRate.w / total) * 100).toFixed(0)}%`;

  const percentDefs = metricDefs.filter((d) => d.isPercent);
  const otherDefs = metricDefs.filter((d) => !d.isPercent);

  const setStatBound = (key: string, lo: number, hi: number) => {
    setBounds((b) => ({ ...b, [key]: [lo, hi] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="card w-full md:w-64 shrink-0 flex flex-col items-center justify-center text-center gap-1">
          <div className="text-xs uppercase tracking-wide text-valorant-muted">
            Win rate in matched {mode === 'map' ? 'maps' : 'series'}
          </div>
          <div className="text-6xl font-extrabold tabular-nums text-white leading-none">
            {pct}
          </div>
          <div className="text-base text-valorant-muted tabular-nums">
            {winRate.w}–{winRate.l}
          </div>
        </div>
        <div className="hidden md:block w-px bg-white/20" />
        {mode === 'series' && (
          <div className="shrink-0">
            <MapResultSection
              mapResults={mapResults}
              onChange={setMapResults}
              formats={formats}
              onFormatsChange={setFormats}
            />
          </div>
        )}
        <div className="flex-1 min-w-[320px] flex flex-col gap-4">
          <div className="card flex flex-nowrap items-center gap-2 overflow-hidden">
            <h3 className="min-w-0 flex-1 truncate whitespace-nowrap font-semibold">
              Filter by scoreline
            </h3>
            <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
              <ScorelineFilter
                us={scoreUs}
                them={scoreThem}
                onChange={(u, t) => {
                  setScoreUs(u);
                  setScoreThem(t);
                }}
              />
              <div className="inline-flex shrink-0 rounded overflow-hidden border border-white/10">
                <button
                  type="button"
                  onClick={() => setMode('map')}
                  className={`px-2 py-1 whitespace-nowrap text-sm ${
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
                  className={`px-2 py-1 whitespace-nowrap text-sm ${
                    mode === 'series'
                      ? 'bg-valorant-red text-white'
                      : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
                  }`}
                >
                  By series
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBounds(snapshotRanges(metricDefs, dataRanges))}
              className="shrink-0 whitespace-nowrap text-xs text-valorant-muted hover:text-white underline underline-offset-2"
            >
              Reset bounds
            </button>
          </div>
          <div className="flex-1 flex flex-col [&>div]:flex-1">
            <PlayerConditionSection
              conditions={conditions}
              onChange={setConditions}
              players={scopedPlayers}
            />
          </div>
        </div>
      </div>

      <RoundTimeline
        conditions={conditions}
        onChange={setConditions}
        players={scopedPlayers}
      />

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

function conditionSummary(cond: TimelineCondition, players: Player[]): string {
  if (cond.kind === 'count') {
    const name = players.find((p) => p.id === cond.playerId)?.name ?? '?';
    return `${COUNT_CONDITION_FIELD_LABEL[cond.field]} ${name}: ${cond.count}+ in a map`;
  }
  const roundLabel = `Round ${cond.roundIndex + 1}`;
  switch (cond.field) {
    case 'result':
      return `${roundLabel}: we ${cond.value === 'W' ? 'won' : 'lost'}`;
    case 'category':
      return `${roundLabel}: ${CATEGORY_LABEL[cond.value as RoundCategory] ?? cond.value}`;
    case 'firstBlood':
      return `${roundLabel}: first blood ${cond.value === 'us' ? 'us' : 'them'}`;
    case 'firstBloodPlayer':
      return `${roundLabel}: first blood by ${players.find((p) => p.id === cond.value)?.name ?? '?'}`;
    case 'firstDeathPlayer':
      return `${roundLabel}: first death was ${players.find((p) => p.id === cond.value)?.name ?? '?'}`;
    case 'clutchPlayer':
      return `${roundLabel}: clutch by ${players.find((p) => p.id === cond.value)?.name ?? '?'}`;
    case 'planted':
      return `${roundLabel}: spike ${cond.value === 'yes' ? 'planted' : 'not planted'}`;
    case 'clutch':
      return `${roundLabel}: ${cond.value === 'yes' ? 'a clutch happened' : 'no clutch'}`;
    case 'clutchResult':
      return `${roundLabel}: clutch ${cond.value === 'won' ? 'won' : 'lost'}`;
    default:
      return roundLabel;
  }
}

/** Deterministic id for a (round, field) pair — at most one condition per pair. */
function condKey(roundIndex: number, field: RoundConditionField): string {
  return `${roundIndex}:${field}`;
}

/** Shared get/set helpers over the flat conditions array, keyed by (round, field). */
function useRoundConditions(
  conditions: TimelineCondition[],
  onChange: (next: TimelineCondition[]) => void
) {
  const byKey = useMemo(() => {
    const m = new Map<string, RoundCondition>();
    for (const c of conditions) {
      if (c.kind === 'count') continue;
      m.set(condKey(c.roundIndex, c.field), c);
    }
    return m;
  }, [conditions]);
  const get = (roundIndex: number, field: RoundConditionField) =>
    byKey.get(condKey(roundIndex, field))?.value;
  const set = (roundIndex: number, field: RoundConditionField, value: string | null) => {
    const key = condKey(roundIndex, field);
    const rest = conditions.filter(
      (c) => c.kind === 'count' || condKey(c.roundIndex, c.field) !== key
    );
    onChange(value == null ? rest : [...rest, { id: key, roundIndex, field, value }]);
  };
  return { get, set };
}

/**
 * Horizontal per-round timeline: one notch per round, each with its own
 * result/first-blood/category/clutch/plant controls. Every round starts
 * unfiltered ("any") — click a button to require that value, click it again
 * to clear it back to "any". Replaces having to manually add one condition
 * at a time via a round-number + field + value picker.
 */
function RoundTimeline({
  conditions,
  onChange,
  players,
}: {
  conditions: TimelineCondition[];
  onChange: (next: TimelineCondition[]) => void;
  players: Player[];
}) {
  const { get, set } = useRoundConditions(conditions, onChange);
  const toggle = (idx: number, field: RoundConditionField, value: string) => {
    set(idx, field, get(idx, field) === value ? null : value);
  };

  // Regulation is fixed at 24 rounds; OT is opt-in, added two rounds (one
  // side-swapped pair) at a time.
  const [otPairs, setOtPairs] = useQueryState('exOt', parseAsInteger.withDefault(0));
  const regulation = HALF_LENGTH * 2;
  const otRounds = Math.max(0, otPairs) * 2;
  const totalCols = regulation + otRounds;

  // Player-attribution conditions (and counts) are shown and reset from the
  // "Filter by player" section instead — only the timeline's own conditions
  // (result/category/first blood/planted/clutch) show up here.
  const sortedConditions = useMemo(
    () =>
      conditions
        .filter((c) => !isPlayerCondition(c))
        .sort((a, b) => {
          const ra = a.kind === 'count' ? Infinity : a.roundIndex;
          const rb = b.kind === 'count' ? Infinity : b.roundIndex;
          return ra - rb || a.field.localeCompare(b.field);
        }),
    [conditions]
  );

  const removeCondition = (id: string) => {
    onChange(conditions.filter((c) => c.id !== id));
  };

  const reset = () => {
    onChange(conditions.filter(isPlayerCondition));
    setOtPairs(null);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Round timeline</h3>
          <p className="text-xs text-valorant-muted">
            Every round starts unfiltered. Click the check or X under a round to require
            that we won or lost it — e.g. mark round 3 a loss to find maps/series where we
            lost round 3. Click an active icon again to clear it. In series mode, at least
            one game in the series must satisfy every marked round.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="shrink-0 text-xs text-valorant-muted hover:text-white underline underline-offset-2"
        >
          Reset
        </button>
      </div>
      <div className="relative">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: totalCols }, (_, idx) => (
            <RoundNotch key={idx} idx={idx} get={get} toggle={toggle} />
          ))}
        </div>
        {/* Positioned by column fraction so it always lands exactly between
            round 12 and round 13, even once OT columns are added. */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white/20 -translate-x-1/2"
          style={{ left: `${(HALF_LENGTH / totalCols) * 100}%` }}
        />
        {otRounds > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/20 -translate-x-1/2"
            style={{ left: `${(regulation / totalCols) * 100}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() => setOtPairs(otPairs + 1)}
        >
          + Add OT round (pair)
        </button>
        {otPairs > 0 && (
          <button
            type="button"
            className="btn-danger text-xs"
            onClick={() => setOtPairs(otPairs > 1 ? otPairs - 1 : null)}
          >
            – Remove last OT pair
          </button>
        )}
      </div>
      {sortedConditions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {sortedConditions.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 text-xs bg-valorant-panel2/60 border border-white/10 rounded-full pl-3 pr-1.5 py-1"
            >
              {conditionSummary(c, players)}
              <button
                type="button"
                onClick={() => removeCondition(c.id)}
                className="text-valorant-muted hover:text-white rounded-full w-4 h-4 flex items-center justify-center"
                title="Remove condition"
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="text-xs text-valorant-muted hover:text-white underline underline-offset-2"
            onClick={() => onChange(conditions.filter(isPlayerCondition))}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/** One round's column of compact toggle controls. Fluid-width so the whole
 * timeline (24 regulation rounds, plus any OT) always fits the card without
 * horizontal scrolling — the check/X squares scale down with the column. */
function RoundNotch({
  idx,
  get,
  toggle,
}: {
  idx: number;
  get: (idx: number, field: RoundConditionField) => string | undefined;
  toggle: (idx: number, field: RoundConditionField, value: string) => void;
}) {
  const active = get(idx, 'result') !== undefined;
  return (
    <div
      className={`flex flex-col items-center gap-1 min-w-0 rounded px-1 py-2 ${
        active ? 'bg-valorant-accent/10 ring-1 ring-valorant-accent/40' : 'bg-valorant-panel2/30'
      }`}
    >
      <div className="text-center text-xs text-valorant-muted font-semibold">
        {idx + 1}
      </div>
      <ResultToggle
        selected={get(idx, 'result')}
        onSelect={(v) => toggle(idx, 'result', v)}
      />
    </div>
  );
}

/** Round result picker: a green check and a red X, each in their own bright
 * square — pick the one that shows how the round went. Click the active one
 * again to clear it back to "any". Squares fill the notch's fluid width (capped
 * so they don't balloon on very wide screens) and their icons scale with them. */
function ResultToggle({
  selected,
  onSelect,
}: {
  selected: string | undefined;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <button
        type="button"
        title="Round won"
        onClick={() => onSelect('W')}
        className={`flex items-center justify-center aspect-square w-full max-w-12 mx-auto rounded-md border-2 transition-colors ${
          selected === 'W'
            ? 'bg-green-500 border-green-300'
            : 'bg-valorant-panel2/50 border-white/15 hover:border-green-400/60'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`w-2/3 h-2/3 ${selected === 'W' ? 'text-white' : 'text-green-400'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="4 13 9.5 18.5 20 6" />
        </svg>
      </button>
      <button
        type="button"
        title="Round lost"
        onClick={() => onSelect('L')}
        className={`flex items-center justify-center aspect-square w-full max-w-12 mx-auto rounded-md border-2 transition-colors ${
          selected === 'L'
            ? 'bg-red-500 border-red-300'
            : 'bg-valorant-panel2/50 border-white/15 hover:border-red-400/60'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`w-2/3 h-2/3 ${selected === 'L' ? 'text-white' : 'text-red-400'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </svg>
      </button>
    </div>
  );
}

/** Compact "our score – their score" filter: matches maps/series where the
 * running score hit this exact tally at any point in the map, not just at
 * the end. Sits to the left of the by-map/by-series toggle. */
function ScorelineFilter({
  us,
  them,
  onChange,
}: {
  us: number | null;
  them: number | null;
  onChange: (us: number | null, them: number | null) => void;
}) {
  const parse = (raw: string): number | null => {
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
  };
  return (
    <div
      className="flex items-center gap-1.5"
      title="Match maps/series where the score hit this exact tally at any point in the map"
    >
      <span className="text-xs uppercase tracking-wider text-valorant-muted whitespace-nowrap">
        Scoreline
      </span>
      <input
        type="number"
        min={0}
        className="input w-14 shrink-0 px-1 text-center"
        placeholder="–"
        value={us ?? ''}
        onChange={(e) => onChange(parse(e.target.value), them)}
      />
      <span className="text-valorant-muted">–</span>
      <input
        type="number"
        min={0}
        className="input w-14 shrink-0 px-1 text-center"
        placeholder="–"
        value={them ?? ''}
        onChange={(e) => onChange(us, parse(e.target.value))}
      />
      {/* Space is always reserved (rather than the button only mounting once
          a value is set) so typing a value never shifts the toggle beside it. */}
      <button
        type="button"
        onClick={() => onChange(null, null)}
        disabled={us === null && them === null}
        tabIndex={us === null && them === null ? -1 : 0}
        className={`shrink-0 text-xs text-valorant-muted hover:text-white ${
          us === null && them === null ? 'invisible' : ''
        }`}
        title="Clear scoreline filter"
      >
        ✕
      </button>
    </div>
  );
}

/** Series-mode-only picker: require specific 1-based map slots in the series
 * to have gone a specific way (e.g. "map 1 was a loss"), independent of the
 * round timeline and stat sliders. Reuses the same W/L toggle as rounds. */
function MapResultSection({
  mapResults,
  onChange,
  formats,
  onFormatsChange,
}: {
  mapResults: MapResult[];
  onChange: (next: MapResult[]) => void;
  formats: SeriesFormat[];
  onFormatsChange: (next: SeriesFormat[]) => void;
}) {
  const MAX_MAPS = 5;
  const get = (index: number) => mapResults.find((m) => m.index === index)?.value;
  const set = (index: number, value: 'W' | 'L') => {
    const rest = mapResults.filter((m) => m.index !== index);
    onChange(get(index) === value ? rest : [...rest, { index, value }]);
  };
  // Empty selection means "no filter", which we show as every box checked
  // (all formats included) rather than all unchecked.
  const formatChecked = (f: SeriesFormat) => formats.length === 0 || formats.includes(f);
  const toggleFormat = (f: SeriesFormat) => {
    const current = formats.length === 0 ? SERIES_FORMATS : formats;
    const next = formatChecked(f) ? current.filter((x) => x !== f) : [...current, f];
    onFormatsChange(next.length === SERIES_FORMATS.length ? [] : next);
  };

  return (
    <div className="card space-y-2 w-fit">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-[260px] space-y-1">
          <h3 className="font-semibold">Filter by map result</h3>
          <div className="flex flex-wrap gap-3">
            {SERIES_FORMATS.map((f) => (
              <label
                key={f}
                className="inline-flex items-center gap-1.5 text-sm text-valorant-muted hover:text-white cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-valorant-red"
                  checked={formatChecked(f)}
                  onChange={() => toggleFormat(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </div>
        <button
          type="button"
          disabled={mapResults.length === 0 && formats.length === 0}
          className="shrink-0 text-xs text-valorant-muted hover:text-white underline underline-offset-2 disabled:opacity-40 disabled:hover:text-valorant-muted disabled:no-underline disabled:cursor-default"
          onClick={() => {
            onChange([]);
            onFormatsChange([]);
          }}
        >
          Reset
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: MAX_MAPS }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex flex-col items-center gap-1 w-12">
            <div className="text-[11px] text-valorant-muted font-semibold">Map {n}</div>
            <ResultToggle selected={get(n)} onSelect={(v) => set(n, v as 'W' | 'L')} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Secondary picker for the three player-attribution conditions, which need a
 * player select rather than a simple toggle and so don't fit in a notch. */
function PlayerConditionSection({
  conditions,
  onChange,
  players,
}: {
  conditions: TimelineCondition[];
  onChange: (next: TimelineCondition[]) => void;
  players: Player[];
}) {
  const [filterKind, setFilterKind] = useState<'round' | 'count'>('round');

  const [roundNum, setRoundNum] = useState(1);
  const [field, setField] = useState<RoundConditionField>('firstBloodPlayer');
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const { set } = useRoundConditions(conditions, onChange);

  const [countField, setCountField] = useState<CountConditionField>('firstBloodPlayer');
  const [countPlayerId, setCountPlayerId] = useState(players[0]?.id ?? '');
  const [countMin, setCountMin] = useState(2);

  useEffect(() => {
    if (!playerId && players[0]) setPlayerId(players[0].id);
    if (!countPlayerId && players[0]) setCountPlayerId(players[0].id);
  }, [players, playerId, countPlayerId]);

  const addRoundCondition = () => {
    if (!playerId) return;
    set(Math.max(0, roundNum - 1), field, playerId);
  };

  const addCountCondition = () => {
    if (!countPlayerId) return;
    const id = `count:${countField}:${countPlayerId}`;
    const rest = conditions.filter((c) => c.id !== id);
    onChange([
      ...rest,
      {
        id,
        kind: 'count',
        field: countField,
        playerId: countPlayerId,
        count: Math.max(1, countMin),
      },
    ]);
  };

  const playerConditions = useMemo(
    () =>
      conditions
        .filter(isPlayerCondition)
        .sort((a, b) => {
          const ra = a.kind === 'count' ? Infinity : a.roundIndex;
          const rb = b.kind === 'count' ? Infinity : b.roundIndex;
          return ra - rb || a.field.localeCompare(b.field);
        }),
    [conditions]
  );

  const removeCondition = (id: string) => {
    onChange(conditions.filter((c) => c.id !== id));
  };

  const modeToggle = (
    <div className="inline-flex rounded overflow-hidden border border-white/10">
      <button
        type="button"
        onClick={() => setFilterKind('round')}
        className={`px-3 py-1 text-sm ${
          filterKind === 'round'
            ? 'bg-valorant-red text-white'
            : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
        }`}
      >
        Round
      </button>
      <button
        type="button"
        onClick={() => setFilterKind('count')}
        className={`px-3 py-1 text-sm ${
          filterKind === 'count'
            ? 'bg-valorant-red text-white'
            : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
        }`}
      >
        Count
      </button>
    </div>
  );

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">Filter by player</h3>
        <button
          type="button"
          disabled={playerConditions.length === 0}
          className="shrink-0 text-xs text-valorant-muted hover:text-white underline underline-offset-2 disabled:opacity-40 disabled:hover:text-valorant-muted disabled:no-underline disabled:cursor-default"
          onClick={() => onChange(conditions.filter((c) => !isPlayerCondition(c)))}
        >
          Reset
        </button>
      </div>

      {filterKind === 'round' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Mode
            </div>
            {modeToggle}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Round #
            </div>
            <input
              type="number"
              min={1}
              className="input w-20"
              value={roundNum}
              onChange={(e) => setRoundNum(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Event
            </div>
            <select
              className="input"
              value={field}
              onChange={(e) => setField(e.target.value as RoundConditionField)}
            >
              {PLAYER_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {ROUND_CONDITION_FIELD_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Player
            </div>
            <select
              className="input"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
            >
              {players.length === 0 && <option value="">No players</option>}
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-ghost"
            disabled={!playerId}
            onClick={addRoundCondition}
          >
            + Add condition
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Mode
            </div>
            {modeToggle}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Min. count
            </div>
            <input
              type="number"
              min={1}
              className="input w-20"
              value={countMin}
              onChange={(e) => setCountMin(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Event
            </div>
            <select
              className="input"
              value={countField}
              onChange={(e) => setCountField(e.target.value as CountConditionField)}
            >
              {COUNT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {COUNT_CONDITION_FIELD_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
              Player
            </div>
            <select
              className="input"
              value={countPlayerId}
              onChange={(e) => setCountPlayerId(e.target.value)}
            >
              {players.length === 0 && <option value="">No players</option>}
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-ghost"
            disabled={!countPlayerId}
            onClick={addCountCondition}
          >
            + Add condition
          </button>
        </div>
      )}

      <div className="flex flex-nowrap items-center gap-2 pt-2 border-t border-white/5 overflow-x-auto">
        {playerConditions.length === 0 ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-valorant-muted">
            No active filters
          </span>
        ) : (
          playerConditions.map((c) => (
            <span
              key={c.id}
              className="shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap text-xs bg-valorant-panel2/60 border border-white/10 rounded-full pl-3 pr-1.5 py-1"
            >
              {conditionSummary(c, players)}
              <button
                type="button"
                onClick={() => removeCondition(c.id)}
                className="text-valorant-muted hover:text-white rounded-full w-4 h-4 flex items-center justify-center"
                title="Remove condition"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>
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
          className="dual-range absolute inset-y-0 -left-[7px] w-[calc(100%+14px)] pointer-events-auto"
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
          className="dual-range absolute inset-y-0 -left-[7px] w-[calc(100%+14px)] pointer-events-auto"
        />
      </div>
      <div className="flex justify-between text-xs text-valorant-muted mt-0.5 tabular-nums">
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
    { key: 'antieco', label: 'Antieco W%' },
    { key: 'bonus', label: 'Bonus W%' },
    { key: 'eco', label: 'Eco W%' },
    { key: 'antibonus', label: 'Antibonus W%' },
    { key: 'gun', label: 'Gun W%' },
    { key: 'save', label: 'Save W%' },
    { key: 'force', label: 'Force W%' },
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
  // Clutch rate (rate of a marked clutch on any round).
  defs.push({
    key: 'econ:clutchRate',
    label: 'Clutch rate',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) =>
      rate({ wins: it.economy.clutch.total, total: it.economy.total }),
  });
  // Clutch win rate (of the clutches that happened, how many were won).
  defs.push({
    key: 'econ:clutchWinRate',
    label: 'Clutch W%',
    isPercent: true,
    step: 1,
    format: pctFmt0,
    getValue: (it) => rate(it.economy.clutch),
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
