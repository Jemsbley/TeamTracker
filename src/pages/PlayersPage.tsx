import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, type To } from 'react-router-dom';
import { parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import AbilityUsageStrip from '../components/AbilityUsageStrip';
import AgentIcon from '../components/AgentIcon';
import { useTableCrosshair } from '../components/useTableCrosshair';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapPicker from '../components/MapPicker';
import PageHeader from '../components/PageHeader';
import { MAPS, MAP_COLORS } from '../constants';
import { useStore } from '../store';
import { defaultRosterId } from '../utils/rosters';
import { computePlayerStats, type PlayerAggregate } from '../utils/playerStats';
import { fmt, fmtPct, fmtSigned } from '../utils/stats';
import { TRADE_STAT_INFO } from '../utils/trades';
import type { ValorantMap } from '../types';

const STAT_COLUMNS: {
  key: keyof PlayerAggregate;
  label: string;
  render: (v: number) => string;
  bestIsLow?: boolean;
  tooltip?: string;
}[] = [
  { key: 'vlrRating', label: 'VLR', render: (v) => fmt(v, 2), tooltip: 'Average VLR rating (estimate of vlr.gg’s Rating 2.0) per map. Tracker.gg imports only' },
  { key: 'acs', label: 'ACS', render: (v) => fmt(v, 0), tooltip: 'Average combat score per map' },
  { key: 'kdr', label: 'KDR', render: (v) => fmt(v, 2), tooltip: 'Total kills ÷ total deaths' },
  { key: 'assists', label: 'A', render: (v) => fmt(v, 1), tooltip: 'Average assists per map' },
  { key: 'damageDelta', label: 'DDΔ', render: (v) => fmtSigned(v, 0), tooltip: 'Damage delta: damage dealt minus damage taken, per round' },
  { key: 'adr', label: 'ADR', render: (v) => fmt(v, 0), tooltip: 'Average damage per round' },
  { key: 'hsPercent', label: 'HS%', render: (v) => fmtPct(v, 1), tooltip: 'Headshot %: share of hits that landed on the head' },
  { key: 'kastPercent', label: 'KAST%', render: (v) => fmtPct(v, 1), tooltip: 'Rounds with a kill, assist, survival or trade ÷ rounds played' },
  { key: 'firstKills', label: 'FK', render: (v) => fmt(v, 1), tooltip: 'Average first kills (the round’s opening kill) per map' },
  { key: 'firstDeaths', label: 'FD', render: (v) => fmt(v, 1), bestIsLow: true, tooltip: 'Average first deaths (the round’s first player to die) per map' },
  { key: 'multikills', label: 'MK', render: (v) => fmt(v, 1), tooltip: 'Average multikills (rounds with 3+ kills) per map' },
  { key: 'firstBloodPercent', label: 'FB%', render: (v) => fmtPct(v, 1), tooltip: 'Rounds where this player got the first kill ÷ rounds played' },
  { key: 'firstDeathPercent', label: 'FD%', render: (v) => fmtPct(v, 1), bestIsLow: true, tooltip: 'Rounds where this player died first ÷ rounds played' },
  { key: 'clutchPercent', label: 'CL%', render: (v) => fmtPct(v, 1), tooltip: 'Clutch win %: clutches won ÷ clutches played (rounds marked as clutches)' },
  ...(
    [
      ['fdTradedPct', TRADE_STAT_INFO.fdTraded],
      ['fbTradedPct', TRADE_STAT_INFO.fbTraded],
      ['deathTradePct', TRADE_STAT_INFO.deathTrade],
      ['killTradePct', TRADE_STAT_INFO.killTrade],
    ] as const
  ).map(([key, info]) => ({
    key,
    label: info.short,
    render: (v: number) => fmtPct(v, 0),
    bestIsLow: info.lowerIsBetter,
    tooltip: `${info.label}: ${info.tooltip} (tracker.gg imports only)`,
  })),
];

type SortKey = 'agent' | 'selections' | keyof PlayerAggregate | 'bestMap';
type SortDir = 'asc' | 'desc';

/** Every column the "Columns" menu can hide, in table order. Agent is always shown. */
const TOGGLEABLE_COLUMNS: { key: string; label: string; tooltip?: string }[] = [
  { key: 'selections', label: 'GP', tooltip: 'Games played on this agent' },
  ...STAT_COLUMNS.map((c) => ({ key: c.key as string, label: c.label, tooltip: c.tooltip })),
  {
    key: 'bestMap',
    label: 'Best Map',
    tooltip: 'The map where this player has their highest average ACS on this agent',
  },
  {
    key: 'abilities',
    label: 'Abil',
    tooltip:
      'Ability usage: C / Q / E casts per round · X (ultimate) casts per map. Hover an icon for exact counts',
  },
];

// Hidden columns are a personal display preference, not shareable view state,
// so they live in localStorage rather than the URL. Storing the hidden set
// (not the shown one) means columns added later show up by default.
const HIDDEN_COLUMNS_KEY = 'players-table-hidden-columns';

function readHiddenColumns(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_COLUMNS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function useHiddenColumns(): [Set<string>, (next: Set<string>) => void] {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(readHiddenColumns()));
  const update = (next: Set<string>) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next]));
    } catch {
      // Storage unavailable (private mode etc.): the choice just won't persist.
    }
  };
  return [hidden, update];
}

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

  // Roster and player are what's being viewed, not filters, so they stay put.
  const hasActiveFilters =
    mapFilter !== null ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null;

  const resetFilters = () => {
    setMapFilter(null);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
  };

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
        // Missing values (no VLR rating on hand-entered games) sort low.
        const num = (v: unknown) =>
          typeof v === 'number' && isFinite(v) ? v : -Infinity;
        const av = num(a[sortKeyTyped]);
        const bv = num(b[sortKeyTyped]);
        cmp = av === bv ? 0 : av < bv ? -1 : 1;
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

  const [hiddenCols, setHiddenCols] = useHiddenColumns();
  const crosshair = useTableCrosshair();
  const show = (key: string) => !hiddenCols.has(key);
  const visibleStatColumns = STAT_COLUMNS.filter((c) => show(c.key as string));
  const toggleColumn = (key: string) => {
    const next = new Set(hiddenCols);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      // Don't leave the rows sorted by a column that's no longer visible.
      if (sortKeyTyped === key) {
        setSortKey(null);
        setSortDir(null);
      }
    }
    setHiddenCols(next);
  };

  const selectedPlayer = rosterPlayers.find((p) => p.id === playerId);

  /** Stats page (Overall tab) for the maps this player played, optionally
   * narrowed to one agent and/or map. Carries this page's series and date
   * filters (and map filter, unless a map is given) so it shows the same games. */
  const statsLink = (opts: { agent?: string; map?: ValorantMap }) => ({
    pathname: '/',
    search: new URLSearchParams({
      tab: 'overall',
      roster: rosterId,
      player: playerId,
      ...(opts.agent && { agents: opts.agent }),
      ...((opts.map ?? mapFilter) && { map: (opts.map ?? mapFilter) as string }),
      ...(seriesFilter && { series: seriesFilter }),
      ...(startDate && { start: startDate }),
      ...(endDate && { end: endDate }),
    }).toString(),
  });

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
      <div data-grow className="flex flex-wrap gap-3 items-end">
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
          {crosshair.style}
          <table
            onMouseOver={crosshair.tableProps.onMouseOver}
            onMouseLeave={crosshair.tableProps.onMouseLeave}
            className={`${crosshair.tableProps.className} w-full [&_td]:text-[13px] [&_th]:text-[11px] [&_td]:px-1 [&_th]:px-1 [&_th]:tracking-normal [&_td:first-child]:pl-3 [&_th:first-child]:pl-3 [&_td+td]:border-l [&_th+th]:border-l [&_td]:border-white/5 [&_th]:border-white/5`}
          >
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
                {show('selections') && (
                <SortHeader
                  label="GP"
                  title="Games played on this agent"
                  k="selections"
                  active={sortKeyTyped}
                  dir={sortDir}
                  onClick={handleSort}
                />
                )}
                {visibleStatColumns.map((c) => (
                  <SortHeader
                    key={c.key as string}
                    label={c.label}
                    title={c.tooltip}
                    k={c.key}
                    active={sortKeyTyped}
                    dir={sortDir}
                    onClick={handleSort}
                  />
                ))}
                {show('bestMap') && (
                <SortHeader
                  label="Best Map"
                  title="The map where this player has their highest average ACS on this agent"
                  k="bestMap"
                  align="left"
                  active={sortKeyTyped}
                  dir={sortDir}
                  onClick={handleSort}
                />
                )}
                {show('abilities') && (
                <th
                  className="table-head"
                  title="Ability usage: C / Q / E casts per round · X (ultimate) casts per map. Hover an icon for exact counts"
                >
                  Abil
                </th>
                )}
                {/* Column picker, in its own narrow column so it never covers a label. */}
                <th className="table-head w-8 !pl-0 text-right !border-l-0">
                  <ColumnPicker
                    hidden={hiddenCols}
                    onToggle={toggleColumn}
                    onShowAll={() => setHiddenCols(new Set())}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/10 bg-valorant-accent/10">
                <td className="table-cell font-semibold">All</td>
                {show('selections') && (
                <td className="table-cell text-right text-valorant-muted font-semibold">
                  —
                </td>
                )}
                {visibleStatColumns.map((c) => (
                  <td
                    key={c.key as string}
                    className="table-cell text-right tabular-nums font-semibold"
                  >
                    {c.render(stats.total[c.key] as number)}
                  </td>
                ))}
                {show('bestMap') && (
                <td className="table-cell">
                  <BestMapCell
                    bestMap={stats.total.bestMap}
                    to={stats.total.bestMap && statsLink({ map: stats.total.bestMap.map })}
                    linkTitle={
                      stats.total.bestMap &&
                      `Open team stats filtered to maps where ${selectedPlayer?.name} played ${stats.total.bestMap.map}`
                    }
                  />
                </td>
                )}
                {show('abilities') && <td className="table-cell text-valorant-muted text-xs">—</td>}
                <td className="!border-l-0" />
              </tr>
              {sortedAgents.map((row) => (
                <tr key={row.agent} className="border-t border-white/5">
                  <td className="table-cell">
                    <Link
                      to={statsLink({ agent: row.agent })}
                      className="flex items-center gap-2 hover:text-valorant-red"
                      title={`Open team stats filtered to maps where ${selectedPlayer?.name} played ${row.agent}`}
                    >
                      <AgentIcon agent={row.agent} size={20} />
                      <span className="font-medium">{row.agent}</span>
                    </Link>
                  </td>
                  {show('selections') && (
                  <td className="table-cell text-right tabular-nums">
                    {row.selections}
                  </td>
                  )}
                  {visibleStatColumns.map((c) => {
                    const v = row[c.key] as number;
                    const best = bestByCol[c.key];
                    const isBest =
                      best !== undefined &&
                      typeof v === 'number' &&
                      v === best;
                    return (
                      <td
                        key={c.key as string}
                        className={`table-cell text-right tabular-nums ${
                          isBest ? 'text-yellow-300' : ''
                        }`}
                      >
                        {c.render(v)}
                      </td>
                    );
                  })}
                  {show('bestMap') && (
                  <td className="table-cell">
                    <BestMapCell
                      bestMap={row.bestMap}
                      to={row.bestMap && statsLink({ agent: row.agent, map: row.bestMap.map })}
                      linkTitle={
                        row.bestMap &&
                        `Open team stats filtered to maps where ${selectedPlayer?.name} played ${row.agent} on ${row.bestMap.map}`
                      }
                    />
                  </td>
                  )}
                  {show('abilities') && (
                  <td className="table-cell">
                    {row.abilities ? (
                      <AbilityUsageStrip agent={row.agent} usage={row.abilities} size={14} grid />
                    ) : (
                      <span className="text-valorant-muted text-xs">—</span>
                    )}
                  </td>
                  )}
                  <td className="!border-l-0" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Gear button in the table's header row: a checklist of every hideable
 * column, in table order. Order never changes; columns can only be shown or
 * hidden. The menu is fixed-positioned so the table's horizontal scroll
 * container doesn't clip it. */
function ColumnPicker({
  hidden,
  onToggle,
  onShowAll,
}: {
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // A fixed menu would drift away from the gear on scroll/resize; just close it.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggleOpen = () => {
    if (open) return setPos(null);
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  const hiddenCount = TOGGLEABLE_COLUMNS.filter((c) => hidden.has(c.key)).length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`relative inline-flex items-center justify-center w-6 h-6 rounded hover:text-white hover:bg-white/10 ${
          hiddenCount > 0 || open ? 'text-white' : 'text-valorant-muted'
        }`}
        title={hiddenCount > 0 ? `Choose columns (${hiddenCount} hidden)` : 'Choose columns'}
        aria-label="Choose columns"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
        {hiddenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-valorant-red" />
        )}
      </button>
      {pos && (
        <div
          ref={menuRef}
          className="fixed z-50 w-52 bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 max-h-96 overflow-y-auto normal-case tracking-normal font-normal text-left"
          style={{ top: pos.top, right: pos.right }}
        >
          <button
            type="button"
            onClick={onShowAll}
            disabled={hiddenCount === 0}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-valorant-panel2 border-b border-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Show all
          </button>
          {TOGGLEABLE_COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-valorant-panel2"
              title={c.tooltip}
            >
              <input
                type="checkbox"
                className="accent-valorant-red"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </>
  );
}

function SortHeader({
  label,
  title,
  k,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  title?: string;
  k: SortKey;
  align?: 'left' | 'right';
  active: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const isActive = active === k;
  const arrow = isActive ? (dir === 'asc' ? '▲' : '▼') : '';
  const alignment = align === 'left' ? '' : 'text-right';
  return (
    <th className={`table-head ${alignment}`} title={title}>
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
  to,
  linkTitle,
}: {
  bestMap: PlayerAggregate['bestMap'];
  /** Stats page link for this map (see statsLink). */
  to: To | null;
  linkTitle: string | null;
}) {
  if (!bestMap || !to) return <span className="text-valorant-muted text-xs">—</span>;
  return (
    <Link
      to={to}
      className="flex items-center gap-2 hover:brightness-125"
      title={`${linkTitle} · ${isFinite(bestMap.avgVlr) ? `${bestMap.avgVlr.toFixed(2)} avg VLR · ` : ''}${bestMap.avgAcs.toFixed(0)} avg ACS over ${bestMap.games} ${bestMap.games === 1 ? 'game' : 'games'}`}
    >
      <div className="text-sm">
        <div className="font-medium" style={{ color: MAP_COLORS[bestMap.map] }}>
          {bestMap.map}
        </div>
        <div className="text-xs text-valorant-muted tabular-nums">
          {isFinite(bestMap.avgVlr) && <>{bestMap.avgVlr.toFixed(2)} VLR · </>}
          {bestMap.avgAcs.toFixed(0)} ACS
        </div>
      </div>
    </Link>
  );
}
