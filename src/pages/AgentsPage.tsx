import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import AgentIcon from '../components/AgentIcon';
import DateRangePicker from '../components/DateRangePicker';
import MapIcon from '../components/MapIcon';
import MapPicker from '../components/MapPicker';
import { AGENT_CLASS, CLASS_COLOR, CLASS_LABEL, MAPS } from '../constants';
import { useStore } from '../store';
import { computeAgentStats, type AgentStat } from '../utils/agentStats';
import type { ValorantMap } from '../types';

type SortKey = 'selections' | 'winrate' | 'acs' | 'mapWinrate';
const SORT_KEYS: SortKey[] = ['selections', 'winrate', 'acs', 'mapWinrate'];

function pct(num: number, denom: number, digits = 0): string {
  if (!denom) return '–';
  return `${((num / denom) * 100).toFixed(digits)}%`;
}

export default function AgentsPage() {
  const games = useStore((s) => s.games);
  const series = useStore((s) => s.series);
  const players = useStore((s) => s.players);
  const rosters = useStore((s) => s.rosters);

  const [rosterFilter, setRosterFilter] = useQueryState(
    'roster',
    parseAsString.withDefault('')
  );
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
    rosterFilter !== '' ||
    mapFilter !== null ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null;

  const resetFilters = () => {
    setRosterFilter('');
    setMapFilter(null);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
  };

  // Series available for the series dropdown (roster-scoped only).
  const rosterScopedSeries = useMemo(
    () =>
      rosterFilter
        ? series.filter((s) => s.rosterId === rosterFilter)
        : series,
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
      rosterFilter
        ? players.filter((p) => p.rosterId === rosterFilter)
        : players,
    [players, rosterFilter]
  );

  const agentStats = useMemo(
    () => computeAgentStats(scopedGames, scopedPlayers),
    [scopedGames, scopedPlayers]
  );

  const [sortKey, setSortKey] = useQueryState(
    'sort',
    parseAsStringEnum<SortKey>(SORT_KEYS).withDefault('selections')
  );
  const [sortMap, setSortMap] = useQueryState(
    'sortMap',
    parseAsStringEnum<ValorantMap>([...MAPS]).withDefault('Ascent')
  );

  const sortedAgents = useMemo(() => {
    const totalWins = (a: AgentStat) =>
      a.byMap.reduce((sum, m) => sum + m.wins, 0);
    const arr = [...agentStats];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'selections':
          return b.selections - a.selections;
        case 'winrate': {
          const ar = a.selections > 0 ? totalWins(a) / a.selections : -1;
          const br = b.selections > 0 ? totalWins(b) / b.selections : -1;
          if (ar !== br) return br - ar;
          return b.selections - a.selections;
        }
        case 'acs':
          return b.avgAcs - a.avgAcs;
        case 'mapWinrate': {
          const am = a.byMap.find((m) => m.map === sortMap);
          const bm = b.byMap.find((m) => m.map === sortMap);
          const ar =
            am && am.selectionsOnMap > 0 ? am.wins / am.selectionsOnMap : -1;
          const br =
            bm && bm.selectionsOnMap > 0 ? bm.wins / bm.selectionsOnMap : -1;
          if (ar !== br) return br - ar;
          return (
            (bm?.selectionsOnMap ?? 0) - (am?.selectionsOnMap ?? 0)
          );
        }
      }
    });
    return arr;
  }, [agentStats, sortKey, sortMap]);

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Agents</h2>
          <p className="text-sm text-valorant-muted">
            {agentStats.length}{' '}
            {agentStats.length === 1 ? 'agent' : 'agents'} played
          </p>
        </div>
        <div>
          <label className="label">Sort by</label>
          <SortMenu
            sortKey={sortKey}
            sortMap={sortMap}
            onChange={(k, m) => {
              setSortKey(k);
              if (m) setSortMap(m);
            }}
          />
        </div>
      </div>

      <div className="card relative flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Roster</label>
          <select
            className="input"
            value={rosterFilter}
            onChange={(e) => {
              setRosterFilter(e.target.value);
              setSeriesFilter('');
            }}
          >
            <option value="">All rosters</option>
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
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
        <div>
          <label className="label">Map</label>
          <MapPicker
            value={mapFilter ?? ''}
            onChange={(v) => setMapFilter(v || null)}
            includeEmpty
            emptyLabel="All maps"
          />
        </div>
        <div>
          <label className="label">Series</label>
          <select
            className="input"
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
        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="absolute top-4 right-4 text-sm text-valorant-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset filters
        </button>
      </div>

      {agentStats.length === 0 ? (
        <div className="card text-center text-valorant-muted space-y-3">
          <p>No agent data yet.</p>
          <Link className="btn-primary" to="/series">
            Add a series
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAgents.map((a) => (
            <AgentCard key={a.agent} a={a} rosterId={rosterFilter} />
          ))}
        </div>
      )}
    </div>
  );
}

function SortMenu({
  sortKey,
  sortMap,
  onChange,
}: {
  sortKey: SortKey;
  sortMap: ValorantMap;
  onChange: (k: SortKey, m?: ValorantMap) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMaps, setShowMaps] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowMaps(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setShowMaps(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label =
    sortKey === 'selections'
      ? 'Pick count'
      : sortKey === 'winrate'
        ? 'Win rate'
        : sortKey === 'acs'
          ? 'Avg ACS'
          : `Win rate on ${sortMap}`;

  const choose = (k: SortKey, m?: ValorantMap) => {
    onChange(k, m);
    setOpen(false);
    setShowMaps(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setShowMaps(false);
        }}
        className="input flex items-center gap-2 text-left min-w-[12rem]"
      >
        <span>{label}</span>
        <span className="ml-auto text-valorant-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 flex gap-1">
          <div className="bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 w-56">
            <Option
              active={sortKey === 'selections'}
              onClick={() => choose('selections')}
              onHover={() => setShowMaps(false)}
            >
              Pick count
            </Option>
            <Option
              active={sortKey === 'winrate'}
              onClick={() => choose('winrate')}
              onHover={() => setShowMaps(false)}
            >
              Win rate
            </Option>
            <Option
              active={sortKey === 'acs'}
              onClick={() => choose('acs')}
              onHover={() => setShowMaps(false)}
            >
              Avg ACS
            </Option>
            <Option
              active={sortKey === 'mapWinrate'}
              onClick={() => setShowMaps(true)}
              onHover={() => setShowMaps(true)}
              chevron
            >
              Win rate on map
            </Option>
          </div>
          {showMaps && (
            <div
              className="bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 w-56 max-h-80 overflow-auto"
              onMouseEnter={() => setShowMaps(true)}
            >
              {MAPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => choose('mapWinrate', m)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 ${
                    sortKey === 'mapWinrate' && sortMap === m
                      ? 'bg-valorant-panel2'
                      : ''
                  }`}
                >
                  <MapIcon map={m} width={32} height={18} />
                  <span>{m}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Option({
  children,
  active,
  onClick,
  onHover,
  chevron,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onHover?: () => void;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 ${
        active ? 'bg-valorant-panel2' : ''
      }`}
    >
      <span className="flex-1">{children}</span>
      {chevron && <span className="text-valorant-muted">›</span>}
    </button>
  );
}

function statsLinkFor(
  agent: string,
  map: ValorantMap,
  rosterId: string
): string {
  const params = new URLSearchParams();
  params.set('agents', agent);
  params.set('map', map);
  if (rosterId) params.set('roster', rosterId);
  return `/?${params.toString()}`;
}

function AgentCard({ a, rosterId }: { a: AgentStat; rosterId: string }) {
  const cls = AGENT_CLASS[a.agent];
  const playedMaps = a.byMap.filter((m) => m.selectionsOnMap > 0);
  const totalWins = a.byMap.reduce((s, m) => s + m.wins, 0);
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <AgentIcon agent={a.agent} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{a.agent}</h3>
            {cls && (
              <span
                className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${CLASS_COLOR[cls]}`}
              >
                {CLASS_LABEL[cls]}
              </span>
            )}
            {a.selections > 0 && (
              <span
                className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-valorant-panel2/60"
                title={`${totalWins} W / ${a.selections} GP`}
              >
                <span className="text-valorant-muted">WR </span>
                <span className="text-valorant-accent">
                  {pct(totalWins, a.selections)}
                </span>
              </span>
            )}
          </div>
          <div className="text-xs text-valorant-muted">
            {a.selections} {a.selections === 1 ? 'selection' : 'selections'}
          </div>
        </div>
        <div className="ml-auto text-right space-y-1">
          {a.bestPlayer ? (
            <div>
              <div className="text-xs text-valorant-muted">Best player</div>
              <div className="text-sm">
                <span className="text-yellow-300 font-medium">
                  {a.bestPlayer.name}
                </span>{' '}
                <span className="text-valorant-muted">
                  · {a.bestPlayer.avgAcs.toFixed(0)} avg ACS (
                  {a.bestPlayer.games}{' '}
                  {a.bestPlayer.games === 1 ? 'game' : 'games'})
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-valorant-muted">
              No player data yet
            </div>
          )}
          {a.topPartners.length > 0 && (
            <div>
              <div className="text-xs text-valorant-muted">Best duos</div>
              <div className="flex items-center gap-3 justify-end flex-wrap">
                {a.topPartners.map((p) => (
                  <div
                    key={p.agent}
                    className="inline-flex items-center gap-1.5 text-sm"
                    title={`${a.agent} + ${p.agent}: ${p.wins}/${p.total}`}
                  >
                    <AgentIcon agent={p.agent} size={20} />
                    <span>{p.agent}</span>
                    <span className="text-valorant-accent tabular-nums">
                      {pct(p.wins, p.total)}
                    </span>
                    <span className="text-[10px] text-valorant-muted">
                      ({p.wins}/{p.total})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {playedMaps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {playedMaps.map((m) => (
            <Link
              key={m.map}
              to={statsLinkFor(a.agent, m.map, rosterId)}
              title={`View ${a.agent} stats on ${m.map}`}
              className="bg-valorant-panel2/40 rounded p-2 flex items-center gap-2 hover:bg-valorant-panel2 hover:ring-1 hover:ring-white/15 transition-colors"
            >
              <MapIcon map={m.map} width={48} height={28} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{m.map}</div>
                <div className="text-[11px] text-valorant-muted tabular-nums">
                  Pick {pct(m.selectionsOnMap, m.totalGamesOnMap)}
                  <span className="text-valorant-muted/70">
                    {' '}({m.selectionsOnMap}/{m.totalGamesOnMap})
                  </span>
                </div>
                <div className="text-[11px] tabular-nums">
                  Win{' '}
                  <span className="text-valorant-accent">
                    {pct(m.wins, m.selectionsOnMap)}
                  </span>
                  <span className="text-valorant-muted/70">
                    {' '}({m.wins}/{m.selectionsOnMap})
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
