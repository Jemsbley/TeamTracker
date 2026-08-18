import { useMemo } from 'react';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapPicker from '../components/MapPicker';
import MultiAgentPicker from '../components/MultiAgentPicker';
import PageHeader from '../components/PageHeader';
import { MAPS } from '../constants';
import { useStore } from '../store';
import { ALL_ROSTERS, resolveRosterFilter } from '../utils/rosters';
import { aggregateTeam, gameMatches, type StatFilters } from '../utils/stats';
import type { ValorantMap } from '../types';
import OverallStatsTab from './stats/OverallStatsTab';
import WinLossStatsTab from './stats/WinLossStatsTab';
import ExamineCloserTab from './stats/ExamineCloserTab';
import ProgressionTab from './stats/ProgressionTab';

type TabKey = 'overall' | 'wins' | 'losses' | 'examine' | 'progression';

const TAB_KEYS: TabKey[] = [
  'overall',
  'wins',
  'losses',
  'examine',
  'progression',
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall stats' },
  { key: 'wins', label: 'When we win' },
  { key: 'losses', label: 'When we lose' },
  { key: 'examine', label: 'Examine closer' },
  { key: 'progression', label: 'Progression' },
];

export default function StatsPage() {
  const allPlayers = useStore((s) => s.players);
  const games = useStore((s) => s.games);
  const series = useStore((s) => s.series);
  const rosters = useStore((s) => s.rosters);

  // All view state lives in the URL via nuqs, so filters survive reloads and
  // are shareable. Empty/default values are stripped from the query string.
  // Roster filters default to the primary roster rather than "all rosters".
  const [rosterParam, setRosterParam] = useQueryState('roster', parseAsString);
  const rosterFilter = resolveRosterFilter(rosterParam, rosters);
  const [mapFilter, setMapFilter] = useQueryState(
    'map',
    parseAsStringEnum<ValorantMap>([...MAPS])
  );
  const [agentFilters, setAgentFilters] = useQueryState(
    'agents',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  // Not exposed in the filter bar UI — only ever set via the deep link from
  // the Players page ("open this player's agent games on the stats page").
  const [playerFilter, setPlayerFilter] = useQueryState(
    'player',
    parseAsString.withDefault('')
  );
  const [seriesFilter, setSeriesFilter] = useQueryState(
    'series',
    parseAsString.withDefault('')
  );
  const [includeSubs, setIncludeSubs] = useQueryState(
    'includeSubs',
    parseAsBoolean.withDefault(true)
  );
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum<TabKey>(TAB_KEYS).withDefault('overall')
  );
  const [startDate, setStartDate] = useQueryState('start', parseAsString);
  const [endDate, setEndDate] = useQueryState('end', parseAsString);

  const hasActiveFilters =
    rosterParam !== null ||
    mapFilter !== null ||
    agentFilters.length > 0 ||
    playerFilter !== '' ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null;

  const resetFilters = () => {
    setRosterParam(null);
    setMapFilter(null);
    setAgentFilters([]);
    setPlayerFilter('');
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
  };

  // Jump to the Overall tab scoped to a specific date range (used when a point
  // on the Progression chart is clicked). nuqs batches these into one update.
  const showRangeInOverall = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setTab('overall');
  };

  const filters: StatFilters = {
    map: mapFilter ?? 'all',
    agents: agentFilters,
    playerId: playerFilter || undefined,
    seriesId: seriesFilter || 'all',
  };

  const rosterSeriesIds = useMemo(() => {
    if (rosterFilter === ALL_ROSTERS) return null;
    return new Set(
      series.filter((s) => s.rosterId === rosterFilter).map((s) => s.id)
    );
  }, [rosterFilter, series]);

  const rosterScopedGames = useMemo(
    () =>
      rosterSeriesIds
        ? games.filter((g) => rosterSeriesIds.has(g.seriesId))
        : games,
    [games, rosterSeriesIds]
  );
  const rosterScopedSeries = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? series
        : series.filter((s) => s.rosterId === rosterFilter),
    [series, rosterFilter]
  );
  const rosterScopedPlayers = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? allPlayers
        : allPlayers.filter((p) => p.rosterId === rosterFilter),
    [allPlayers, rosterFilter]
  );

  // Games narrowed to the selected date range first; all other filters and
  // aggregates build on top of this so the range applies everywhere.
  const dateScopedGames = useMemo(
    () =>
      rosterScopedGames.filter((g) => {
        if (startDate && g.date < startDate) return false;
        if (endDate && g.date > endDate) return false;
        return true;
      }),
    [rosterScopedGames, startDate, endDate]
  );

  const team = useMemo(
    () => aggregateTeam(dateScopedGames, filters),
    [dateScopedGames, filters]
  );

  const filteredGames = useMemo(
    () => dateScopedGames.filter((g) => gameMatches(g, filters)),
    [dateScopedGames, filters]
  );

  const totalGames = rosterScopedGames.length;

  if (rosters.length === 0 || series.length === 0) {
    return <GettingStarted hasRoster={rosters.length > 0} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stats"
        titleGrow={false}
        description={
          <>
            {filteredGames.length} of {totalGames} maps match filters
          </>
        }
      >
      <div data-grow className="flex flex-wrap gap-3 items-end">
        <div className="w-32">
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
        <div className="w-32">
          <label className="label">Map</label>
          <MapPicker
            value={mapFilter ?? ''}
            onChange={(v) => setMapFilter(v || null)}
            includeEmpty
            emptyLabel="All maps"
          />
        </div>
        <div className="w-44">
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
        <div className="w-36">
          <label className="label">Agents</label>
          <MultiAgentPicker
            values={agentFilters}
            onChange={setAgentFilters}
          />
        </div>
        <div className="w-44">
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
        <label className="flex items-center gap-2 text-sm text-valorant-muted ml-auto">
          <input
            type="checkbox"
            className="accent-valorant-red"
            checked={includeSubs}
            onChange={(e) => setIncludeSubs(e.target.checked)}
          />
          Include substitutes
        </label>
        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="text-sm text-valorant-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset filters
        </button>
      </div>
      </PageHeader>

      <div className="card stats-shell space-y-4">
        <div className="flex flex-wrap gap-1 border-b border-white/10">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-valorant-red text-white'
                  : 'border-transparent text-valorant-muted hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overall' && (
          <OverallStatsTab
            scopedGames={rosterScopedGames}
            scopedSeries={rosterScopedSeries}
            scopedPlayers={rosterScopedPlayers}
            filteredGames={filteredGames}
            filters={filters}
            includeSubs={includeSubs}
            allSeries={series}
          />
        )}
        {tab === 'wins' && (
          <WinLossStatsTab
            scopedGames={rosterScopedGames}
            scopedSeries={rosterScopedSeries}
            scopedPlayers={rosterScopedPlayers}
            filteredGames={filteredGames}
            filters={filters}
            includeSubs={includeSubs}
            outcome="W"
          />
        )}
        {tab === 'losses' && (
          <WinLossStatsTab
            scopedGames={rosterScopedGames}
            scopedSeries={rosterScopedSeries}
            scopedPlayers={rosterScopedPlayers}
            filteredGames={filteredGames}
            filters={filters}
            includeSubs={includeSubs}
            outcome="L"
          />
        )}
        {tab === 'examine' && (
          <ExamineCloserTab
            scopedGames={rosterScopedGames}
            scopedSeries={rosterScopedSeries}
            scopedPlayers={rosterScopedPlayers}
            filteredGames={filteredGames}
            filters={filters}
          />
        )}
        {tab === 'progression' && (
          <ProgressionTab
            filteredGames={filteredGames}
            onSelectRange={showRangeInOverall}
          />
        )}
      </div>
    </div>
  );
}
