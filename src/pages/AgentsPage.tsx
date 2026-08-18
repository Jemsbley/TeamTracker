import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import AgentIcon from '../components/AgentIcon';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapIcon from '../components/MapIcon';
import MapPicker from '../components/MapPicker';
import MultiAgentPicker from '../components/MultiAgentPicker';
import MultiMapPicker from '../components/MultiMapPicker';
import PageHeader from '../components/PageHeader';
import { AGENTS_BY_CLASS, AGENT_CLASS, CLASS_COLOR, CLASS_LABEL, MAPS } from '../constants';
import { useStore } from '../store';
import { ALL_ROSTERS, resolveRosterFilter } from '../utils/rosters';
import { computeAgentStats, type AgentStat } from '../utils/agentStats';
import { rateColor } from '../utils/color';
import type { AgentClass, ValorantMap } from '../types';

const CLASSES = Object.keys(AGENTS_BY_CLASS) as AgentClass[];

function pct(num: number, denom: number, digits = 0): string {
  if (!denom) return '–';
  return `${((num / denom) * 100).toFixed(digits)}%`;
}

export default function AgentsPage() {
  const games = useStore((s) => s.games);
  const series = useStore((s) => s.series);
  const players = useStore((s) => s.players);
  const rosters = useStore((s) => s.rosters);

  // Roster filters default to the primary roster rather than "all rosters".
  const [rosterParam, setRosterParam] = useQueryState('roster', parseAsString);
  const rosterFilter = resolveRosterFilter(rosterParam, rosters);
  const [mapFilter, setMapFilter] = useQueryState(
    'map',
    parseAsStringEnum<ValorantMap>([...MAPS])
  );
  const [seriesFilter, setSeriesFilter] = useQueryState(
    'series',
    parseAsString.withDefault('')
  );
  const [startDate, setStartDate] = useQueryState('start', parseAsString);
  const [endDate, setEndDate] = useQueryState('end', parseAsString);

  const hasActiveFilters =
    rosterParam !== null ||
    mapFilter !== null ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null;

  const resetFilters = () => {
    setRosterParam(null);
    setMapFilter(null);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
  };

  // Series available for the series dropdown (roster-scoped only).
  const rosterScopedSeries = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? series
        : series.filter((s) => s.rosterId === rosterFilter),
    [series, rosterFilter]
  );

  // Series narrowed by roster + selected series + date range.
  const scopedSeries = useMemo(
    () =>
      rosterScopedSeries.filter((s) => {
        if (seriesFilter && s.id !== seriesFilter) return false;
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
        return true;
      }),
    [rosterScopedSeries, seriesFilter, startDate, endDate]
  );
  const scopedGames = useMemo(() => {
    const ids = new Set(scopedSeries.map((s) => s.id));
    return games.filter((g) => {
      if (!ids.has(g.seriesId)) return false;
      if (mapFilter && g.map !== mapFilter) return false;
      return true;
    });
  }, [games, scopedSeries, mapFilter]);
  const scopedPlayers = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? players
        : players.filter((p) => p.rosterId === rosterFilter),
    [players, rosterFilter]
  );

  const agentStats = useMemo(
    () => computeAgentStats(scopedGames, scopedPlayers),
    [scopedGames, scopedPlayers]
  );

  const totalGames = scopedGames.length;

  // Only show rows for maps that were actually played in scope.
  const mapsWithData = useMemo(() => {
    const counts = new Map<ValorantMap, number>();
    for (const g of scopedGames) counts.set(g.map, (counts.get(g.map) ?? 0) + 1);
    return MAPS.filter((m) => (counts.get(m) ?? 0) > 0);
  }, [scopedGames]);

  // Table-only display filters: narrow which map rows / agent columns show up
  // in the matrix tables (and the agent list below) without touching the
  // underlying stats calculations for the agents that remain visible.
  const [tableMapFilter, setTableMapFilter] = useQueryState(
    'tableMaps',
    parseAsArrayOf(parseAsStringEnum<ValorantMap>([...MAPS])).withDefault([])
  );
  const [tableAgentFilter, setTableAgentFilter] = useQueryState(
    'tableAgents',
    parseAsArrayOf(parseAsString).withDefault([])
  );

  const visibleMaps = useMemo(
    () =>
      tableMapFilter.length > 0
        ? mapsWithData.filter((m) => tableMapFilter.includes(m))
        : mapsWithData,
    [mapsWithData, tableMapFilter]
  );

  // Agent-column display filter (independent of the tables' own per-stat sort).
  const visibleAgentStats = useMemo(
    () =>
      tableAgentFilter.length > 0
        ? agentStats.filter((a) => tableAgentFilter.includes(a.agent))
        : agentStats,
    [agentStats, tableAgentFilter]
  );

  const totalWinsOf = (a: AgentStat) =>
    a.byMap.reduce((sum, m) => sum + m.wins, 0);

  // Each table sorts its own columns by that table's stat, highest first.
  const winSortedAgents = useMemo(() => {
    const arr = [...visibleAgentStats];
    arr.sort((a, b) => {
      const ar = a.selections > 0 ? totalWinsOf(a) / a.selections : -1;
      const br = b.selections > 0 ? totalWinsOf(b) / b.selections : -1;
      if (ar !== br) return br - ar;
      return b.selections - a.selections;
    });
    return arr;
  }, [visibleAgentStats]);

  const pickSortedAgents = useMemo(() => {
    const arr = [...visibleAgentStats];
    arr.sort((a, b) => {
      const ar = totalGames > 0 ? a.selections / totalGames : -1;
      const br = totalGames > 0 ? b.selections / totalGames : -1;
      if (ar !== br) return br - ar;
      return b.selections - a.selections;
    });
    return arr;
  }, [visibleAgentStats, totalGames]);

  // Agent-details grid, grouped by class; pick count decides order within a class.
  const agentsByClass = useMemo(() => {
    const groups = new Map<AgentClass, AgentStat[]>();
    for (const a of visibleAgentStats) {
      const cls = AGENT_CLASS[a.agent];
      if (!cls) continue;
      const arr = groups.get(cls) ?? [];
      arr.push(a);
      groups.set(cls, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => b.selections - a.selections);
    }
    return groups;
  }, [visibleAgentStats]);

  if (rosters.length === 0 || series.length === 0) {
    return <GettingStarted hasRoster={rosters.length > 0} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        titleGrow={false}
        description={
          <>
            {agentStats.length}{' '}
            {agentStats.length === 1 ? 'agent' : 'agents'} played
          </>
        }
      >
      <div data-grow className="flex flex-wrap gap-3 items-end">
        <div className="w-28">
          <label className="label">Roster</label>
          <select
            className="input truncate"
            value={rosterFilter}
            onChange={(e) => {
              setRosterParam(e.target.value);
              setSeriesFilter('');
            }}
          >
            <option value={ALL_ROSTERS}>All rosters</option>
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="label">Date range</label>
          <DateRangePicker
            start={startDate}
            end={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>
        <div className="w-28">
          <label className="label">Map</label>
          <MapPicker
            value={mapFilter ?? ''}
            onChange={(v) => setMapFilter(v || null)}
            includeEmpty
            emptyLabel="All maps"
          />
        </div>
        <div className="w-40">
          <label className="label">Series</label>
          <select
            className="input truncate"
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
          >
            <option value="">All series</option>
            {[...rosterScopedSeries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} · vs. {s.opponent}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Maps shown</label>
          <MultiMapPicker values={tableMapFilter} onChange={setTableMapFilter} />
        </div>
        <div className="w-36">
          <label className="label">Agents shown</label>
          <MultiAgentPicker values={tableAgentFilter} onChange={setTableAgentFilter} />
        </div>
        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="ml-auto text-sm text-valorant-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset filters
        </button>
      </div>
      </PageHeader>

      {agentStats.length === 0 ? (
        <div className="card text-center text-valorant-muted space-y-3">
          <p>No agent data yet.</p>
          <Link className="btn-primary" to="/series">
            Add a series
          </Link>
        </div>
      ) : (
        <>
          <AgentMatrixTable
            title="Win rates"
            agents={winSortedAgents}
            maps={visibleMaps}
            totalGames={totalGames}
            mode="win"
          />
          <AgentMatrixTable
            title="Pick rates"
            agents={pickSortedAgents}
            maps={visibleMaps}
            totalGames={totalGames}
            mode="pick"
          />
          <div className="space-y-5">
            <h3 className="font-semibold">Agent details</h3>
            {CLASSES.map((cls) => {
              const clsAgents = agentsByClass.get(cls) ?? [];
              if (clsAgents.length === 0) return null;
              return (
                <div key={cls} className="space-y-2">
                  <div className="section-title">{CLASS_LABEL[cls]}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {clsAgents.map((a) => (
                      <AgentDetailRow key={a.agent} a={a} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Agents-as-columns / maps-as-rows matrix, shared by the win-rate and
 * pick-rate tables — same layout, different underlying ratio per `mode`.
 * Only the percentage is shown in each box; the real ratio is a tooltip.
 */
function AgentMatrixTable({
  title,
  agents,
  maps,
  totalGames,
  mode,
}: {
  title: string;
  agents: AgentStat[];
  maps: ValorantMap[];
  totalGames: number;
  mode: 'win' | 'pick';
}) {
  type CellData = { value: string; ratio: string; wins: number; total: number };

  const overallCell = (a: AgentStat): CellData => {
    if (mode === 'win') {
      const wins = a.byMap.reduce((s, m) => s + m.wins, 0);
      return {
        value: pct(wins, a.selections),
        ratio: `${wins}/${a.selections}`,
        wins,
        total: a.selections,
      };
    }
    return {
      value: pct(a.selections, totalGames),
      ratio: `${a.selections}/${totalGames}`,
      wins: a.selections,
      total: totalGames,
    };
  };

  const mapCell = (a: AgentStat, map: ValorantMap): CellData => {
    const m = a.byMap.find((bm) => bm.map === map);
    if (!m) return { value: '–', ratio: '0/0', wins: 0, total: 0 };
    if (mode === 'win') {
      return {
        value: pct(m.wins, m.selectionsOnMap),
        ratio: `${m.wins}/${m.selectionsOnMap}`,
        wins: m.wins,
        total: m.selectionsOnMap,
      };
    }
    return {
      value: pct(m.selectionsOnMap, m.totalGamesOnMap),
      ratio: `${m.selectionsOnMap}/${m.totalGamesOnMap}`,
      wins: m.selectionsOnMap,
      total: m.totalGamesOnMap,
    };
  };

  // Pick rates rarely approach 100% (an agent is one of many pool choices),
  // so on that table alone we rescale color against the highest pick rate
  // actually seen in the table rather than against a theoretical 100% —
  // the single best cell reads fully green instead of everything reading red.
  let maxPickRate = 0;
  if (mode === 'pick') {
    for (const a of agents) {
      const overall = overallCell(a);
      if (overall.total > 0) maxPickRate = Math.max(maxPickRate, overall.wins / overall.total);
      for (const map of maps) {
        const c = mapCell(a, map);
        if (c.total > 0) maxPickRate = Math.max(maxPickRate, c.wins / c.total);
      }
    }
  }

  const GRAY_NO_DATA = 'rgb(75, 85, 99)'; // tailwind gray-600
  const cellColor = (cell: CellData): string => {
    if (cell.total === 0) return GRAY_NO_DATA;
    const rate = cell.wins / cell.total;
    if (mode === 'pick' && maxPickRate > 0) return rateColor(rate / maxPickRate);
    return rateColor(rate);
  };

  // Tracks the hovered cell so its whole row and column can be highlighted
  // together, making it easy to trace a percentage back to its map + agent.
  // Row -1 is the "Overall" row (it sits outside the `maps` list).
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const rowHighlight = (row: number) => hover?.row === row;
  const colHighlight = (col: number) => hover?.col === col;
  // Ring-based (box-shadow) rather than background-color, so the highlight
  // layers over each cell's inline interpolated background color instead of
  // fighting it for the same CSS property.
  const cellHighlightClass = (row: number, col: number) => {
    if (rowHighlight(row) && colHighlight(col)) return 'ring-2 ring-inset ring-valorant-red';
    if (rowHighlight(row) || colHighlight(col)) return 'ring-2 ring-inset ring-white/60';
    return '';
  };

  return (
    <div className="card overflow-x-auto p-0">
      <h3 className="font-semibold px-4 pt-4 pb-2 sticky left-0 z-30 w-fit bg-valorant-panel">
        {title}
      </h3>
      <table className="w-full" onMouseLeave={() => setHover(null)}>
        <thead>
          <tr>
            <th className="table-head text-left px-4 w-40 min-w-[10rem] sticky left-0 z-30 bg-valorant-panel border-r border-white/10 outline outline-2 -outline-offset-2 outline-valorant-panel">
              Map
            </th>
            {agents.map((a, col) => (
              <th
                key={a.agent}
                title={a.agent}
                className={`table-head text-center px-2 py-2 w-14 min-w-[3.5rem] transition-colors ${
                  colHighlight(col) ? 'bg-white/10' : ''
                }`}
              >
                <div className="flex justify-center">
                  <AgentIcon agent={a.agent} size={28} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/10 border-b-4 border-b-black bg-valorant-accent/10">
            <td
              className={`table-cell px-4 w-40 min-w-[10rem] font-semibold transition-colors sticky left-0 z-20 border-r border-white/10 border-b-4 border-b-black outline outline-2 -outline-offset-2 ${
                rowHighlight(-1)
                  ? 'bg-[#3a4650] outline-[#3a4650]'
                  : 'bg-[#2f3944] outline-[#2f3944]'
              }`}
            >
              Overall
            </td>
            {agents.map((a, col) => {
              const cell = overallCell(a);
              return (
                <td
                  key={a.agent}
                  className={`table-cell text-center tabular-nums font-semibold transition-colors ${cellHighlightClass(-1, col)}`}
                  style={{ backgroundColor: cellColor(cell) }}
                  title={cell.ratio}
                  onMouseEnter={() => setHover({ row: -1, col })}
                >
                  <span className="text-black">{cell.value}</span>
                </td>
              );
            })}
          </tr>
          {maps.map((map, row) => (
            <tr key={map} className="border-t border-white/5">
              <td
                className={`table-cell px-4 w-40 min-w-[10rem] transition-colors sticky left-0 z-20 border-r border-white/10 outline outline-2 -outline-offset-2 ${
                  rowHighlight(row)
                    ? 'bg-[#2a3947] outline-[#2a3947]'
                    : 'bg-valorant-panel outline-valorant-panel'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapIcon map={map} width={28} height={16} />
                  <span>{map}</span>
                </div>
              </td>
              {agents.map((a, col) => {
                const cell = mapCell(a, map);
                return (
                  <td
                    key={a.agent}
                    className={`table-cell text-center tabular-nums transition-colors ${cellHighlightClass(row, col)}`}
                    style={{ backgroundColor: cellColor(cell) }}
                    title={cell.ratio}
                    onMouseEnter={() => setHover({ row, col })}
                  >
                    <span className="text-black">{cell.value}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Everything about an agent that isn't in the matrix tables: best player, best duos. */
/** One agent's "everything else" box — sized to sit 3-per-row in the class-grouped grid. */
function AgentDetailRow({ a }: { a: AgentStat }) {
  const cls = AGENT_CLASS[a.agent];
  const totalWins = a.byMap.reduce((s, m) => s + m.wins, 0);
  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <AgentIcon agent={a.agent} size={36} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-semibold">{a.agent}</h4>
            {cls && (
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${CLASS_COLOR[cls]}`}
              >
                {CLASS_LABEL[cls]}
              </span>
            )}
          </div>
          <div className="text-xs text-valorant-muted">
            {a.selections} {a.selections === 1 ? 'sel.' : 'sel.'} ·{' '}
            {a.avgAcs.toFixed(0)} ACS
            {a.selections > 0 && (
              <>
                {' '}
                ·{' '}
                <span title={`${totalWins} W / ${a.selections} GP`}>
                  WR{' '}
                  <span className="text-valorant-accent">
                    {pct(totalWins, a.selections)}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-6">
        {a.bestPlayer ? (
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-valorant-muted">
              Best player
            </div>
            <div className="space-y-0.5">
              <div className="text-yellow-300 font-semibold text-xl">
                {a.bestPlayer.name}
              </div>
              <div className="text-valorant-muted text-sm whitespace-nowrap">
                {a.bestPlayer.avgAcs.toFixed(0)} avg ACS ({a.bestPlayer.games}{' '}
                {a.bestPlayer.games === 1 ? 'game' : 'games'})
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-valorant-muted">
            No player data yet
          </div>
        )}
        {a.topPartners.length > 0 && (
          <div className="ml-auto text-right">
            <div className="text-sm font-semibold uppercase tracking-wide text-valorant-muted">
              Best duos
            </div>
            <div className="flex items-center gap-5 flex-wrap justify-end">
              {a.topPartners.map((p) => (
                <div
                  key={p.agent}
                  className="inline-flex items-center gap-2 text-lg whitespace-nowrap"
                  title={`${a.agent} + ${p.agent}: ${p.wins}/${p.total}`}
                >
                  <AgentIcon agent={p.agent} size={36} />
                  <span>{p.agent}</span>
                  <span className="text-valorant-accent tabular-nums">
                    {pct(p.wins, p.total)}
                  </span>
                  <span className="text-sm text-valorant-muted">
                    ({p.wins}/{p.total})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
