import { useMemo, useState } from 'react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { aggregateEconomy, pct, type RoundEconomy } from '../../utils/rounds';
import type { Game } from '../../types';

type Props = {
  filteredGames: Game[];
  /** Jump to the Overall tab scoped to [start, end] (ISO yyyy-mm-dd). */
  onSelectRange: (start: string, end: string) => void;
};

/**
 * Every selectable stat mirrors a cell from the Round economy panel. Each maps
 * a RoundEconomy to a wins/total pair so the percentage can be aggregated per
 * time bucket.
 */
type StatDef = {
  key: string;
  label: string;
  get: (e: RoundEconomy) => { wins: number; total: number };
};

const STAT_DEFS: StatDef[] = [
  { key: 'round', label: 'Round win rate', get: (e) => ({ wins: e.totalWins, total: e.total }) },
  { key: 'attackPistol', label: 'Atk Pistol', get: (e) => e.attackPistol },
  { key: 'defensePistol', label: 'Def Pistol', get: (e) => e.defensePistol },
  { key: 'force', label: 'Antieco', get: (e) => e.force },
  { key: 'bonus', label: 'Bonus', get: (e) => e.bonus },
  { key: 'eco', label: 'Eco', get: (e) => e.eco },
  { key: 'antibonus', label: 'Antibonus', get: (e) => e.antibonus },
  { key: 'gun', label: 'Gun', get: (e) => e.gun },
  { key: 'save', label: 'Save', get: (e) => e.save },
  { key: 'fbRate', label: 'FB rate', get: (e) => ({ wins: e.firstBlood.total, total: e.total }) },
  { key: 'winFb', label: 'Win | FB', get: (e) => e.firstBlood },
  { key: 'winNoFb', label: 'Win | no FB', get: (e) => e.noFirstBlood },
  { key: 'atkPlant', label: 'Atk plant %', get: (e) => ({ wins: e.attack.plants, total: e.attack.rounds }) },
  { key: 'postplant', label: 'Postplant W%', get: (e) => ({ wins: e.attack.postplantWins, total: e.attack.plants }) },
  { key: 'plantAllowed', label: 'Plant allowed', get: (e) => ({ wins: e.defense.plantsAllowed, total: e.defense.rounds }) },
  { key: 'retake', label: 'Retake W%', get: (e) => ({ wins: e.defense.retakeWins, total: e.defense.plantsAllowed }) },
];

/** The primary stat uses the brand red; up to four comparison stats cycle
 * through these distinct, theme-consistent hues. */
const PRIMARY_COLOR = '#FF4655'; // valorant-red
const COMPARE_COLORS = ['#38BDF8', '#7AD6C0', '#FFD166', '#9B8FFF'];
const MAX_COMPARE = COMPARE_COLORS.length;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 24 * 60 * 60 * 1000;

type WeekBucket = {
  /** Inclusive ISO date of the Monday that starts the week. */
  start: string;
  /** Inclusive ISO date of the Sunday that ends the week. */
  end: string;
  startDate: Date;
  games: Game[];
};

/** Parse yyyy-mm-dd into a UTC date at noon (dodges TZ edges). */
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
/** Monday (UTC) of the week containing the given date. */
function mondayOf(date: Date): Date {
  const dow = (date.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(date.getTime() - dow * DAY_MS);
}
function fmtDay(iso: string): string {
  const d = fromISO(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Build a contiguous list of week buckets spanning all games. */
function buildWeeks(games: Game[]): WeekBucket[] {
  if (games.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const g of games) {
    const t = fromISO(g.date).getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const firstMonday = mondayOf(new Date(min));
  const weeks: WeekBucket[] = [];
  for (let t = firstMonday.getTime(); t <= max; t += 7 * DAY_MS) {
    const startDate = new Date(t);
    const endDate = new Date(t + 6 * DAY_MS);
    weeks.push({
      start: toISO(startDate),
      end: toISO(endDate),
      startDate,
      games: [],
    });
  }
  for (const g of games) {
    const t = fromISO(g.date).getTime();
    const idx = Math.floor((t - firstMonday.getTime()) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks.length) weeks[idx].games.push(g);
  }
  return weeks;
}

export default function ProgressionTab({ filteredGames, onSelectRange }: Props) {
  const [statKey, setStatKey] = useQueryState(
    'stat',
    parseAsString.withDefault(STAT_DEFS[0].key)
  );
  // Up to four additional stats overlaid on the same chart for comparison.
  const [compareKeys, setCompareKeys] = useQueryState(
    'compare',
    parseAsArrayOf(parseAsString).withDefault([])
  );

  const stat = STAT_DEFS.find((s) => s.key === statKey) ?? STAT_DEFS[0];

  // Resolve comparison keys to defs: drop unknown keys, anything equal to the
  // primary, and de-duplicate (keeps URL tampering from breaking the chart).
  const compareStats = useMemo(() => {
    const seen = new Set<string>([stat.key]);
    const out: StatDef[] = [];
    for (const key of compareKeys) {
      if (seen.has(key)) continue;
      const def = STAT_DEFS.find((s) => s.key === key);
      if (!def) continue;
      seen.add(key);
      out.push(def);
      if (out.length >= MAX_COMPARE) break;
    }
    return out;
  }, [compareKeys, stat.key]);

  const weeks = useMemo(() => buildWeeks(filteredGames), [filteredGames]);

  // Aggregate economy once per week, then derive each series from it.
  const weekEcons = useMemo(
    () => weeks.map((w) => aggregateEconomy(w.games)),
    [weeks]
  );

  const series = useMemo<Series[]>(() => {
    const defs = [stat, ...compareStats];
    return defs.map((def, idx) => ({
      key: def.key,
      label: def.label,
      color: idx === 0 ? PRIMARY_COLOR : COMPARE_COLORS[idx - 1],
      points: weekEcons.map((econ) => {
        const { wins, total } = def.get(econ);
        return {
          value: total > 0 ? (wins / total) * 100 : null,
          wins,
          total,
        };
      }),
    }));
  }, [weekEcons, stat, compareStats]);

  const sampleCount = series.reduce(
    (sum, s) => sum + s.points.filter((p) => p.value !== null).length,
    0
  );

  // The clean, de-duplicated list of comparison keys actually being drawn.
  const compareKeyList = compareStats.map((c) => c.key);
  const allSelectedKeys = [stat.key, ...compareKeyList];

  // Stats not yet picked (as primary or comparison) — the only addable ones.
  const availableStats = STAT_DEFS.filter(
    (s) => !allSelectedKeys.includes(s.key)
  );

  /** Options for a dropdown currently showing `currentKey`: every stat except
   * those already chosen in another dropdown. */
  const optionsFor = (currentKey: string) =>
    STAT_DEFS.filter(
      (s) => s.key === currentKey || !allSelectedKeys.includes(s.key)
    );

  const changePrimary = (key: string) => {
    void setStatKey(key);
    // If the new primary was a comparison line, drop it from the overlays.
    if (compareKeyList.includes(key)) {
      void setCompareKeys(compareKeyList.filter((k) => k !== key));
    }
  };

  const changeCompare = (index: number, key: string) => {
    const next = [...compareKeyList];
    next[index] = key;
    void setCompareKeys(next);
  };

  const addCompare = (key: string) => {
    if (!key || compareKeyList.length >= MAX_COMPARE) return;
    if (allSelectedKeys.includes(key)) return;
    void setCompareKeys([...compareKeyList, key]);
  };

  const removeCompare = (key: string) => {
    void setCompareKeys(compareKeyList.filter((k) => k !== key));
  };

  if (filteredGames.length === 0) {
    return (
      <div className="card text-center text-valorant-muted">
        No maps match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Chart box */}
      <div className="card flex-1 min-w-0 space-y-4">
        <div>
          <h3 className="font-semibold">Progression</h3>
          <p className="text-sm text-valorant-muted">
            Stat win rates over time, in weekly steps. Track up to{' '}
            {MAX_COMPARE + 1} stats at once to compare progressions. Click a
            point to view that week in Overall stats.
          </p>
        </div>

        {sampleCount === 0 ? (
          <div className="text-center text-valorant-muted py-8">
            No data for the selected stats in the filtered maps.
          </div>
        ) : (
          <ProgressionChart
            weeks={weeks}
            series={series}
            onSelectRange={onSelectRange}
          />
        )}
      </div>

      {/* Tracked-stat selectors — fixed width and height so the box never
          resizes as trackers are added or removed. */}
      <div className="card w-full shrink-0 lg:w-64 lg:h-[360px] flex flex-col">
        <label className="label">Tracked stats</label>
        {/* Padding so the focus ring on the last/first rows isn't clipped by
            the scroll container's overflow. */}
        <div className="flex flex-col gap-2 overflow-y-auto p-1">
          {series.map((s, idx) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <select
                className="input"
                value={s.key}
                aria-label={idx === 0 ? 'Primary stat' : `Comparison stat ${idx}`}
                onChange={(e) =>
                  idx === 0
                    ? changePrimary(e.target.value)
                    : changeCompare(idx - 1, e.target.value)
                }
              >
                {optionsFor(s.key).map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {/* Reserve the remove-button slot on every row so the dropdowns
                  stay the same width whether or not they're removable. */}
              <span className="w-5 shrink-0 text-center">
                {idx > 0 && (
                  <button
                    type="button"
                    className="text-valorant-muted hover:text-valorant-accent"
                    aria-label={`Remove ${s.label}`}
                    onClick={() => removeCompare(s.key)}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          ))}

          {compareKeyList.length < MAX_COMPARE && availableStats.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0" />
              <select
                className="input"
                value=""
                aria-label="Add comparison stat"
                onChange={(e) => addCompare(e.target.value)}
              >
                <option value="" disabled>
                  + Track another
                </option>
                {availableStats.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="w-5 shrink-0" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ChartPoint = { value: number | null; wins: number; total: number };

type Series = {
  key: string;
  label: string;
  color: string;
  points: ChartPoint[];
};

function ProgressionChart({
  weeks,
  series,
  onSelectRange,
}: {
  weeks: WeekBucket[];
  series: Series[];
  onSelectRange: (start: string, end: string) => void;
}) {
  // Track which series + which week is hovered so the tooltip is unambiguous
  // when multiple lines overlap.
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);

  const n = weeks.length;
  const margin = { top: 20, right: 24, bottom: 52, left: 44 };
  // Doubled footprint vs. the original half-month chart, plus per-week spacing.
  const innerW = Math.max(1120, n * 32);
  const innerH = 260;
  const W = innerW + margin.left + margin.right;
  const H = innerH + margin.top + margin.bottom;

  const x = (i: number) =>
    n <= 1 ? margin.left + innerW / 2 : margin.left + (i / (n - 1)) * innerW;
  const y = (v: number) => margin.top + (1 - v / 100) * innerH;

  // For each series, the sampled (non-empty) points and the path connecting
  // them across empty weeks.
  const drawn = series.map((s) => {
    const sampled = s.points
      .map((p, i) => ({ ...p, i }))
      .filter((p) => p.value !== null);
    const linePath = sampled
      .map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.i).toFixed(1)} ${y(p.value as number).toFixed(1)}`)
      .join(' ');
    return { ...s, sampled, linePath };
  });

  const hovered =
    hover !== null ? series[hover.s]?.points[hover.i] ?? null : null;

  const yTicks = [0, 25, 50, 75, 100];

  // Label a week tick with the month name when its month differs from the
  // previous week's — i.e. the first week of each month. Others are blank.
  let lastMonth = -1;
  let lastYear = -1;

  return (
    <div className="overflow-x-auto relative">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="text-valorant-red"
        role="img"
        aria-label={`${series.map((s) => s.label).join(', ')} over time`}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={margin.left}
              x2={margin.left + innerW}
              y1={y(t)}
              y2={y(t)}
              stroke="currentColor"
              className="text-white/10"
            />
            <text
              x={margin.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-valorant-muted text-[10px]"
            >
              {t}%
            </text>
          </g>
        ))}

        {/* X ticks; month labels at the first week of each month */}
        {weeks.map((w, i) => {
          const month = w.startDate.getUTCMonth();
          const year = w.startDate.getUTCFullYear();
          const labeled = month !== lastMonth || year !== lastYear;
          const showYear = labeled && year !== lastYear;
          if (labeled) {
            lastMonth = month;
            lastYear = year;
          }
          return (
            <g key={w.start}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={margin.top + innerH}
                y2={margin.top + innerH + (labeled ? 6 : 3)}
                stroke="currentColor"
                className="text-white/20"
              />
              {labeled && (
                <text
                  x={x(i)}
                  y={margin.top + innerH + 18}
                  textAnchor="middle"
                  className="fill-valorant-muted text-[10px]"
                >
                  {MONTHS[month]}
                  {showYear ? ` ’${String(year).slice(2)}` : ''}
                </text>
              )}
            </g>
          );
        })}

        {/* Connected lines — primary first, comparison stats on top */}
        {drawn.map((s) =>
          s.linePath ? (
            <path
              key={s.key}
              d={s.linePath}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null
        )}

        {/* Sampled points — hover for detail, click to drill in */}
        {drawn.map((s, si) =>
          s.sampled.map((p) => {
            const active = hover?.s === si && hover?.i === p.i;
            return (
              <circle
                key={`${s.key}-${p.i}`}
                cx={x(p.i)}
                cy={y(p.value as number)}
                r={active ? 6 : 4}
                fill={s.color}
                className="cursor-pointer"
                onMouseEnter={() => setHover({ s: si, i: p.i })}
                onMouseLeave={() =>
                  setHover((h) => (h?.s === si && h?.i === p.i ? null : h))
                }
                onClick={() => onSelectRange(weeks[p.i].start, weeks[p.i].end)}
              />
            );
          })
        )}
      </svg>

      {hover !== null && hovered && hovered.value !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded bg-valorant-panel border border-white/15 px-2 py-1 text-xs shadow-lg whitespace-nowrap"
          style={{ left: x(hover.i), top: y(hovered.value) - 8 }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: series[hover.s].color }}
            />
            <span className="text-valorant-muted">{series[hover.s].label}</span>
          </div>
          <div className="font-semibold tabular-nums">
            {pct(hovered.wins, hovered.total)}
            <span className="text-valorant-muted font-normal">
              {' '}({hovered.wins}/{hovered.total})
            </span>
          </div>
          <div className="text-valorant-muted">
            {fmtDay(weeks[hover.i].start)} – {fmtDay(weeks[hover.i].end)}
          </div>
        </div>
      )}
    </div>
  );
}
