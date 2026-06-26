import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import AgentIcon from '../components/AgentIcon';
import DateRangePicker from '../components/DateRangePicker';
import MapIcon from '../components/MapIcon';
import MultiAgentPicker from '../components/MultiAgentPicker';
import { useStore } from '../store';
import { computeMapAggregates, type MapAggregate } from '../utils/mapStats';

function pct(wins: number, total: number, digits = 0): string {
  if (!total) return '–';
  return `${((wins / total) * 100).toFixed(digits)}%`;
}

function ratePct(num: number, denom: number, digits = 0): string {
  if (!denom) return '–';
  return `${((num / denom) * 100).toFixed(digits)}%`;
}

type SortKey =
  | 'map'
  | 'plays'
  | 'winrate'
  | 'pickRate'
  | 'banRate'
  | 'oppBanRate'
  | 'atkPistol'
  | 'defPistol'
  | 'atkRound'
  | 'defRound'
  | 'topComp'
  | 'avgAcs';
type SortDir = 'asc' | 'desc';

const SORT_KEYS: SortKey[] = [
  'map',
  'plays',
  'winrate',
  'pickRate',
  'banRate',
  'oppBanRate',
  'atkPistol',
  'defPistol',
  'atkRound',
  'defRound',
  'topComp',
  'avgAcs',
];

function rate(num: number, denom: number): number | undefined {
  if (denom === 0) return undefined;
  return num / denom;
}

function getSortValue(
  m: MapAggregate,
  key: SortKey,
  totals: { ourPick: number; ourBan: number; enemyBan: number }
): number | string | undefined {
  switch (key) {
    case 'map':
      return m.map;
    case 'plays':
      return m.plays;
    case 'winrate':
      return rate(m.wins, m.wins + m.losses);
    case 'pickRate':
      return rate(m.ourPickCount, totals.ourPick);
    case 'banRate':
      return rate(m.ourBanCount, totals.ourBan);
    case 'oppBanRate':
      return rate(m.enemyBanCount, totals.enemyBan);
    case 'atkPistol':
      return rate(m.attackPistol.wins, m.attackPistol.total);
    case 'defPistol':
      return rate(m.defensePistol.wins, m.defensePistol.total);
    case 'atkRound':
      return rate(m.attackRounds.wins, m.attackRounds.total);
    case 'defRound':
      return rate(m.defenseRounds.wins, m.defenseRounds.total);
    case 'topComp':
      return m.topComp ? m.topComp.wins / m.topComp.total : undefined;
    case 'avgAcs':
      return m.acsCount > 0 ? m.acsSum / m.acsCount : undefined;
  }
}

export default function MapsPage() {
  const navigate = useNavigate();
  const games = useStore((s) => s.games);
  const series = useStore((s) => s.series);
  const rosters = useStore((s) => s.rosters);

  const [rosterFilter, setRosterFilter] = useQueryState(
    'roster',
    parseAsString.withDefault('')
  );
  const [agentFilters, setAgentFilters] = useQueryState(
    'agents',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [seriesFilter, setSeriesFilter] = useQueryState(
    'series',
    parseAsString.withDefault('')
  );
  const [startDate, setStartDate] = useQueryState('start', parseAsString);
  const [endDate, setEndDate] = useQueryState('end', parseAsString);

  const hasActiveFilters =
    rosterFilter !== '' ||
    agentFilters.length > 0 ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null;

  const resetFilters = () => {
    setRosterFilter('');
    setAgentFilters([]);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
  };

  const goToMapInStats = (mapName: string) => {
    const params = new URLSearchParams();
    params.set('map', mapName);
    if (rosterFilter) params.set('roster', rosterFilter);
    if (seriesFilter) params.set('series', seriesFilter);
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    if (agentFilters.length > 0) params.set('agents', agentFilters.join(','));
    navigate(`/?${params.toString()}`);
  };

  // Series available for the series dropdown (roster-scoped only).
  const rosterScopedSeries = useMemo(
    () =>
      rosterFilter
        ? series.filter((s) => s.rosterId === rosterFilter)
        : series,
    [series, rosterFilter]
  );

  // Series feeding pick/ban aggregation: roster + selected series + date range.
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

  // Games feeding play/round stats: within the scoped series, then narrowed by
  // the selected agents (a game must include every selected agent).
  const scopedGames = useMemo(() => {
    const ids = new Set(scopedSeries.map((s) => s.id));
    return games.filter((g) => {
      if (!ids.has(g.seriesId)) return false;
      if (agentFilters.length > 0) {
        const gameAgents = new Set(g.stats.map((s) => s.agent));
        if (!agentFilters.every((a) => gameAgents.has(a))) return false;
      }
      return true;
    });
  }, [games, scopedSeries, agentFilters]);

  const aggregates = useMemo(
    () => computeMapAggregates(scopedSeries, scopedGames),
    [scopedSeries, scopedGames]
  );

  const [sortKey, setSortKey] = useQueryState(
    'sort',
    parseAsStringEnum<SortKey>(SORT_KEYS).withDefault('winrate')
  );
  const [sortDir, setSortDir] = useQueryState(
    'dir',
    parseAsStringEnum<SortDir>(['asc', 'desc']).withDefault('desc')
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'map' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const arr = Object.values(aggregates.byMap);
    const totals = {
      ourPick: aggregates.ourPickTotal,
      ourBan: aggregates.ourBanTotal,
      enemyBan: aggregates.enemyBanTotal,
    };
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey, totals);
      const vb = getSortValue(b, sortKey, totals);
      if (va === undefined && vb === undefined) return a.map.localeCompare(b.map);
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      let cmp: number;
      if (typeof va === 'string' && typeof vb === 'string') {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      if (cmp === 0) cmp = a.map.localeCompare(b.map);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [aggregates, sortKey, sortDir]);

  const totalGames = scopedGames.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Maps</h2>
        <p className="text-sm text-valorant-muted">
          {totalGames} {totalGames === 1 ? 'map' : 'maps'} played ·{' '}
          {aggregates.ourPickTotal} our picks
        </p>
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
          <label className="label">Agents</label>
          <MultiAgentPicker values={agentFilters} onChange={setAgentFilters} />
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

      {totalGames === 0 ? (
        <div className="card text-center text-valorant-muted space-y-3">
          <p>No maps tracked yet.</p>
          <Link className="btn-primary" to="/series">
            Add your first series
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-valorant-panel2/40">
              <tr>
                <SortHeader
                  label="Map"
                  k="map"
                  align="left"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Plays"
                  k="plays"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="W–L"
                  k="winrate"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Pick%"
                  k="pickRate"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Ban%"
                  k="banRate"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Opp Ban%"
                  k="oppBanRate"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Atk Round"
                  k="atkRound"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Def Round"
                  k="defRound"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Atk Pistol"
                  k="atkPistol"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Def Pistol"
                  k="defPistol"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Top Comp"
                  k="topComp"
                  align="left"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortHeader
                  label="Avg ACS"
                  k="avgAcs"
                  active={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <MapRow
                  key={m.map}
                  m={m}
                  ourPickTotal={aggregates.ourPickTotal}
                  ourBanTotal={aggregates.ourBanTotal}
                  enemyBanTotal={aggregates.enemyBanTotal}
                  onClick={() => goToMapInStats(m.map)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-valorant-muted">
        <p>
          Pick% = our picks of this map ÷ all our picks. Ban% = our bans of this
          map ÷ all our bans. Opp Ban% = opponent bans of this map ÷ all
          opponent bans. Top Comp = the 5-agent composition with the highest win
          rate (ties broken by play count).
        </p>
      </div>
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
        {arrow && <span className="text-[10px]">{arrow}</span>}
      </button>
    </th>
  );
}

function MapRow({
  m,
  ourPickTotal,
  ourBanTotal,
  enemyBanTotal,
  onClick,
}: {
  m: MapAggregate;
  ourPickTotal: number;
  ourBanTotal: number;
  enemyBanTotal: number;
  onClick: () => void;
}) {
  const avgAcs = m.acsCount > 0 ? m.acsSum / m.acsCount : 0;
  const dim = m.plays === 0 ? 'text-valorant-muted' : '';
  return (
    <tr
      onClick={onClick}
      className="border-t border-white/5 cursor-pointer hover:bg-valorant-panel2/30 transition-colors"
      title="Click to view this map in Stats"
    >
      <td className="table-cell">
        <div className="flex items-center gap-2">
          <MapIcon map={m.map} width={48} height={28} />
          <span className="font-medium">{m.map}</span>
        </div>
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {m.plays}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {m.plays === 0 ? '—' : `${m.wins}-${m.losses}`}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {ratePct(m.ourPickCount, ourPickTotal)}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {ratePct(m.ourBanCount, ourBanTotal)}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {ratePct(m.enemyBanCount, enemyBanTotal)}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {pct(m.attackRounds.wins, m.attackRounds.total)}{' '}
        <span className="text-[10px] text-valorant-muted">
          ({m.attackRounds.wins}/{m.attackRounds.total})
        </span>
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {pct(m.defenseRounds.wins, m.defenseRounds.total)}{' '}
        <span className="text-[10px] text-valorant-muted">
          ({m.defenseRounds.wins}/{m.defenseRounds.total})
        </span>
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {pct(m.attackPistol.wins, m.attackPistol.total)}{' '}
        <span className="text-[10px] text-valorant-muted">
          ({m.attackPistol.wins}/{m.attackPistol.total})
        </span>
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {pct(m.defensePistol.wins, m.defensePistol.total)}{' '}
        <span className="text-[10px] text-valorant-muted">
          ({m.defensePistol.wins}/{m.defensePistol.total})
        </span>
      </td>
      <td className="table-cell">
        {m.topComp ? (
          <div
            className="flex items-center gap-1"
            title={`${m.topComp.agents.join(', ')} — ${m.topComp.wins}/${m.topComp.total} (${pct(m.topComp.wins, m.topComp.total, 0)})`}
          >
            {m.topComp.agents.map((a) => (
              <AgentIcon key={a} agent={a} size={20} />
            ))}
            <span className="ml-1 text-xs text-valorant-muted tabular-nums">
              {pct(m.topComp.wins, m.topComp.total)} ({m.topComp.wins}/
              {m.topComp.total})
            </span>
          </div>
        ) : (
          <span className="text-valorant-muted text-xs">—</span>
        )}
      </td>
      <td className={`table-cell text-right pr-5 tabular-nums ${dim}`}>
        {avgAcs > 0 ? avgAcs.toFixed(0) : '—'}
      </td>
    </tr>
  );
}
