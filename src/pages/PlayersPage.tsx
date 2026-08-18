import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import AgentIcon from '../components/AgentIcon';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapIcon from '../components/MapIcon';
import MapPicker from '../components/MapPicker';
import PageHeader from '../components/PageHeader';
import { MAPS } from '../constants';
import { useStore } from '../store';
import { defaultRosterId } from '../utils/rosters';
import { computePlayerStats, type PlayerAggregate } from '../utils/playerStats';
import { fmt, fmtPct, fmtSigned } from '../utils/stats';
import type { ValorantMap } from '../types';

const STAT_COLUMNS: {
  key: keyof PlayerAggregate;
  label: string;
  render: (v: number) => string;
  bestIsLow?: boolean;
}[] = [
  { key: 'acs', label: 'ACS', render: (v) => fmt(v, 0) },
  { key: 'kdr', label: 'KDR', render: (v) => fmt(v, 2) },
  { key: 'assists', label: 'A', render: (v) => fmt(v, 1) },
  { key: 'damageDelta', label: 'DDΔ', render: (v) => fmtSigned(v, 0) },
  { key: 'adr', label: 'ADR', render: (v) => fmt(v, 0) },
  { key: 'hsPercent', label: 'HS%', render: (v) => fmtPct(v, 1) },
  { key: 'kastPercent', label: 'KAST%', render: (v) => fmtPct(v, 1) },
  { key: 'firstKills', label: 'FK', render: (v) => fmt(v, 1) },
  { key: 'firstDeaths', label: 'FD', render: (v) => fmt(v, 1), bestIsLow: true },
  { key: 'multikills', label: 'MK', render: (v) => fmt(v, 1) },
  { key: 'firstBloodPercent', label: 'FB%', render: (v) => fmtPct(v, 1) },
  { key: 'firstDeathPercent', label: 'FD%', render: (v) => fmtPct(v, 1), bestIsLow: true },
  { key: 'clutchPercent', label: 'Clutch%', render: (v) => fmtPct(v, 1) },
];

type SortKey = 'agent' | 'selections' | keyof PlayerAggregate | 'bestMap';
type SortDir = 'asc' | 'desc';

export default function PlayersPage() {
  const rosters = useStore((s) => s.rosters);
  const players = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const series = useStore((s) => s.series);

  const [rosterId, setRosterId] = useQueryState(
    'roster',
    parseAsString.withDefault('')
  );
  const [playerId, setPlayerId] = useQueryState(
    'player',
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

  // Keep roster valid, defaulting to the primary roster.
  useEffect(() => {
    if (!rosters.find((r) => r.id === rosterId)) {
      setRosterId(defaultRosterId(rosters));
    }
  }, [rosters, rosterId]);

  const rosterPlayers = useMemo(
    () => players.filter((p) => p.rosterId === rosterId),
    [players, rosterId]
  );

  // Keep player valid for current roster (prefer first main, then any)
  useEffect(() => {
    if (rosterPlayers.length === 0) {
      if (playerId) setPlayerId('');
      return;
    }
    if (!rosterPlayers.find((p) => p.id === playerId)) {
      const main = rosterPlayers.find((p) => p.isMainRoster);
      setPlayerId(main?.id ?? rosterPlayers[0].id);
    }
  }, [rosterPlayers, playerId]);

  // Series for the current roster, used both for the dropdown and for scoping.
  const rosterSeries = useMemo(
    () => series.filter((s) => s.rosterId === rosterId),
    [series, rosterId]
  );

  const rosterGames = useMemo(() => {
    const ids = new Set(rosterSeries.map((s) => s.id));
    return games.filter((g) => {
      if (!ids.has(g.seriesId)) return false;
      if (seriesFilter && g.seriesId !== seriesFilter) return false;
      if (startDate && g.date < startDate) return false;
      if (endDate && g.date > endDate) return false;
      return true;
    });
  }, [games, rosterSeries, seriesFilter, startDate, endDate]);

  const stats = useMemo(() => {
    if (!playerId) return null;
    return computePlayerStats(rosterGames, playerId, mapFilter ?? '');
  }, [rosterGames, playerId, mapFilter]);

  const [sortKey, setSortKey] = useQueryState(
    'sort',
    parseAsString.withDefault('selections')
  );
  const sortKeyTyped = sortKey as SortKey;
  const [sortDir, setSortDir] = useQueryState(
    'dir',
    parseAsStringEnum<SortDir>(['asc', 'desc']).withDefault('desc')
  );
  const handleSort = (k: SortKey) => {
    if (sortKeyTyped === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir(k === 'agent' ? 'asc' : 'desc');
    }
  };

  const sortedAgents = useMemo(() => {
    if (!stats) return [];
    const arr = [...stats.byAgent];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKeyTyped === 'agent') {
        cmp = a.agent.localeCompare(b.agent);
      } else if (sortKeyTyped === 'bestMap') {
        const av = a.bestMap?.avgAcs;
        const bv = b.bestMap?.avgAcs;
        if (av === undefined && bv === undefined) cmp = 0;
        else if (av === undefined) cmp = 1;
        else if (bv === undefined) cmp = -1;
        else cmp = av - bv;
      } else {
        const av = a[sortKeyTyped] as number;
        const bv = b[sortKeyTyped] as number;
        cmp = (av ?? 0) - (bv ?? 0);
      }
      if (cmp === 0) cmp = a.agent.localeCompare(b.agent);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [stats, sortKeyTyped, sortDir]);

  // Best per stat column across the per-agent rows (for gold highlighting).
  const bestByCol = useMemo(() => {
    const out: Partial<Record<keyof PlayerAggregate, number>> = {};
    if (!stats) return out;
    for (const col of STAT_COLUMNS) {
      let best: number | undefined;
      for (const row of stats.byAgent) {
        const v = row[col.key];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (best === undefined) best = v;
        else if (col.bestIsLow ? v < best : v > best) best = v;
      }
      if (best !== undefined) out[col.key] = best;
    }
    return out;
  }, [stats]);

  const selectedPlayer = rosterPlayers.find((p) => p.id === playerId);

  if (rosters.length === 0 || series.length === 0) {
    return <GettingStarted hasRoster={rosters.length > 0} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Players"
        titleGrow={false}
        description="Per-player breakdown by agent"
      >
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Roster</label>
          <select
            className="input"
            value={rosterId}
            onChange={(e) => {
              setRosterId(e.target.value);
              setSeriesFilter('');
            }}
          >
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Player</label>
          <select
            className="input"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={rosterPlayers.length === 0}
          >
            {rosterPlayers.length === 0 ? (
              <option value="">No players in this roster</option>
            ) : (
              <>
                <optgroup label="Main">
                  {rosterPlayers
                    .filter((p) => p.isMainRoster)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Substitutes">
                  {rosterPlayers
                    .filter((p) => !p.isMainRoster)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              </>
            )}
          </select>
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
          <label className="label">Series</label>
          <select
            className="input"
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
          >
            <option value="">All series</option>
            {[...rosterSeries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} · vs. {s.opponent}
                </option>
              ))}
          </select>
        </div>
      </div>
      </PageHeader>

      {!stats || !selectedPlayer ? (
        <div className="card text-center text-valorant-muted space-y-3">
          <p>Pick a roster and a player to see their stats.</p>
          <Link className="btn-primary" to="/roster">
            Manage rosters
          </Link>
        </div>
      ) : stats.total.selections === 0 ? (
        <div className="card text-center text-valorant-muted">
          No stats yet for {selectedPlayer.name}
          {mapFilter ? ` on ${mapFilter}` : ''}.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-valorant-panel2/40">
              <tr>
                <SortHeader
                  label="Agent"
                  k="agent"
                  align="left"
                  active={sortKeyTyped}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="GP"
                  k="selections"
                  active={sortKeyTyped}
                  dir={sortDir}
                  onClick={handleSort}
                />
                {STAT_COLUMNS.map((c) => (
                  <SortHeader
                    key={c.key as string}
                    label={c.label}
                    k={c.key}
                    active={sortKeyTyped}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                ))}
                <SortHeader
                  label="Best Map"
                  k="bestMap"
                  align="left"
                  active={sortKeyTyped}
                  dir={sortDir}
                  onClick={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/10 bg-valorant-accent/10">
                <td className="table-cell font-semibold">All</td>
                <td className="table-cell text-right pr-5 text-valorant-muted font-semibold">
                  —
                </td>
                {STAT_COLUMNS.map((c) => (
                  <td
                    key={c.key as string}
                    className="table-cell text-right pr-5 tabular-nums font-semibold"
                  >
                    {c.render(stats.total[c.key] as number)}
                  </td>
                ))}
                <td className="table-cell">
                  <BestMapCell bestMap={stats.total.bestMap} />
                </td>
              </tr>
              {sortedAgents.map((row) => (
                <tr key={row.agent} className="border-t border-white/5">
                  <td className="table-cell">
                    <Link
                      to={{
                        pathname: '/',
                        search: new URLSearchParams({
                          tab: 'overall',
                          roster: rosterId,
                          player: playerId,
                          agents: row.agent,
                        }).toString(),
                      }}
                      className="flex items-center gap-2 hover:text-valorant-red"
                      title={`Open team stats filtered to maps where ${selectedPlayer?.name} played ${row.agent}`}
                    >
                      <AgentIcon agent={row.agent} size={20} />
                      <span className="font-medium">{row.agent}</span>
                    </Link>
                  </td>
                  <td className="table-cell text-right pr-5 tabular-nums">
                    {row.selections}
                  </td>
                  {STAT_COLUMNS.map((c) => {
                    const v = row[c.key] as number;
                    const best = bestByCol[c.key];
                    const isBest =
                      best !== undefined &&
                      typeof v === 'number' &&
                      v === best;
                    return (
                      <td
                        key={c.key as string}
                        className={`table-cell text-right pr-5 tabular-nums ${
                          isBest ? 'text-yellow-300' : ''
                        }`}
                      >
                        {c.render(v)}
                      </td>
                    );
                  })}
                  <td className="table-cell">
                    <BestMapCell bestMap={row.bestMap} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  k,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  align?: 'left' | 'right';
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const isActive = active === k;
  const arrow = isActive ? (dir === 'asc' ? '▲' : '▼') : '';
  const alignment = align === 'left' ? '' : 'text-right pr-5';
  return (
    <th className={`table-head ${alignment}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 ${
          align === 'left' ? '' : 'flex-row-reverse'
        } ${isActive ? 'text-valorant-accent' : 'hover:text-valorant-accent'}`}
      >
        <span>{label}</span>
        {arrow && <span className="text-xs">{arrow}</span>}
      </button>
    </th>
  );
}

function BestMapCell({
  bestMap,
}: {
  bestMap: PlayerAggregate['bestMap'];
}) {
  if (!bestMap) return <span className="text-valorant-muted text-xs">—</span>;
  return (
    <div
      className="flex items-center gap-2"
      title={`${bestMap.avgAcs.toFixed(0)} avg ACS over ${bestMap.games} ${bestMap.games === 1 ? 'game' : 'games'}`}
    >
      <MapIcon map={bestMap.map} width={40} height={22} />
      <div className="text-sm">
        <div className="font-medium">{bestMap.map}</div>
        <div className="text-xs text-valorant-muted tabular-nums">
          {bestMap.avgAcs.toFixed(0)} ACS · {bestMap.games}{' '}
          {bestMap.games === 1 ? 'game' : 'games'}
        </div>
      </div>
    </div>
  );
}
