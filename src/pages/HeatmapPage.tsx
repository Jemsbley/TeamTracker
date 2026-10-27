import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import AgentIcon from '../components/AgentIcon';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapPicker from '../components/MapPicker';
import MultiSelect from '../components/MultiSelect';
import PageHeader from '../components/PageHeader';
import HeatmapCanvas, {
  type HeatmapGameInfo,
} from '../components/heatmap/HeatmapCanvas';
import { AGENT_CLASS, CLASS_LABEL, MAPS, MAP_SITES } from '../constants';
import { useStore } from '../store';
import { minimapUrl } from '../utils/minimapIcon';
import { ALL_ROSTERS, resolveRosterFilter } from '../utils/rosters';
import {
  buildHeatmapMatchFromRawExport,
  invertHeatmapEvents,
  isHeatmapRawExport,
  mergeHeatmapMatches,
  type HeatmapMatch,
  type RawExport,
} from '../utils/heatmapData';
import type { AgentClass, ValorantMap } from '../types';

// Upper bound for the round-timeline sliders, in seconds — generous enough
// to cover a full 100s round plus the 45s spike timer.
const TIMELINE_MAX_SECONDS = 150;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Mode = 'both' | 'kills' | 'deaths';
type SideFilter = 'both' | 'attack' | 'defense';
type PlantFilter = 'both' | 'pre' | 'post';

const MODES: { key: Mode; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'kills', label: 'Kills only' },
  { key: 'deaths', label: 'Deaths only' },
];
const SIDES: { key: SideFilter; label: string }[] = [
  { key: 'both', label: 'Both sides' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
];
const PLANTS: { key: PlantFilter; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'pre', label: 'Pre-plant' },
  { key: 'post', label: 'Post-plant' },
];

// Thumb-only styling so the transparent track of each stacked <input> lets
// clicks fall through to whichever thumb is nearest — the two handles share
// one visual bar instead of stacking as separate sliders.
const RANGE_THUMB_CLASS =
  'absolute inset-0 w-full m-0 appearance-none bg-transparent pointer-events-none ' +
  'outline-none focus:outline-none focus-visible:outline-none ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-valorant-red [&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 ' +
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-valorant-red [&::-moz-range-thumb]:border-0 ' +
  '[&::-moz-range-thumb]:cursor-pointer';

/** A single-bar dual-handle range slider. The two handles can never cross
 * (each clamps against the other), so there's no ambiguity about which one
 * a click should move — safe to render as one track instead of two. */
function TimelineRange({
  start,
  end,
  min,
  max,
  onChangeStart,
  onChangeEnd,
}: {
  start: number;
  end: number;
  min: number;
  max: number;
  onChangeStart: (v: number) => void;
  onChangeEnd: (v: number) => void;
}) {
  const span = max - min || 1;
  const startPct = ((start - min) / span) * 100;
  const endPct = ((end - min) / span) * 100;
  const mid = min + span / 2;
  return (
    <div className="relative flex-1 h-3.5">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-panel2" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-red"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={start}
        onChange={(e) => onChangeStart(Math.min(Number(e.target.value), end))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: start > mid ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={end}
        onChange={(e) => onChangeEnd(Math.max(Number(e.target.value), start))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: end > mid ? 3 : 5 }}
      />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-valorant-panel2 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
            value === o.key
              ? 'bg-valorant-red text-white'
              : 'text-valorant-accent hover:bg-white/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A small "?" badge that reveals its children as a tooltip on hover. */
function HelpTip({ children }: { children: ReactNode }) {
  return (
    <span className="group relative flex -translate-y-px">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/30 text-[10px] font-bold text-valorant-muted cursor-help">
        ?
      </span>
      <span className="pointer-events-none absolute right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-2 z-20 w-64 rounded-md border border-white/10 bg-valorant-panel px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        {children}
      </span>
    </span>
  );
}

export default function HeatmapPage() {
  const rosters = useStore((s) => s.rosters);
  const allSeries = useStore((s) => s.series);
  const games = useStore((s) => s.games);
  const allPlayers = useStore((s) => s.players);

  const [rosterParam, setRosterParam] = useQueryState('roster', parseAsString);
  const rosterFilter = resolveRosterFilter(rosterParam, rosters);
  const [mapFilter, setMapFilter] = useQueryState(
    'map',
    parseAsStringEnum<ValorantMap>([...MAPS]).withDefault('Haven')
  );
  const [seriesFilter, setSeriesFilter] = useQueryState(
    'series',
    parseAsString.withDefault('')
  );
  const [startDate, setStartDate] = useQueryState('start', parseAsString);
  const [endDate, setEndDate] = useQueryState('end', parseAsString);

  const [mode, setMode] = useQueryState(
    'mode',
    parseAsStringEnum<Mode>(['both', 'kills', 'deaths']).withDefault('both')
  );
  const [side, setSide] = useQueryState(
    'side',
    parseAsStringEnum<SideFilter>(['both', 'attack', 'defense']).withDefault(
      'both'
    )
  );
  const [players, setPlayers] = useQueryState(
    'player',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [agents, setAgents] = useQueryState(
    'agent',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [agentClasses, setAgentClasses] = useQueryState(
    'class',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [roundStart, setRoundStart] = useQueryState(
    'roundStart',
    parseAsFloat.withDefault(0)
  );
  const [roundEnd, setRoundEnd] = useQueryState(
    'roundEnd',
    parseAsFloat.withDefault(TIMELINE_MAX_SECONDS)
  );
  const [plant, setPlant] = useQueryState(
    'plant',
    parseAsStringEnum<PlantFilter>(['both', 'pre', 'post']).withDefault('both')
  );
  const [plantSites, setPlantSites] = useQueryState(
    'sites',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [inverted, setInverted] = useQueryState(
    'invert',
    parseAsBoolean.withDefault(false)
  );
  // Ignore sites left in the URL that the current map doesn't have.
  const mapSites = MAP_SITES[mapFilter];
  const activeSites = plantSites.filter((s) => mapSites.includes(s));

  // "Show points" overlays the raw kill/death dots at 50% opacity alongside
  // the heatmap. "Just points" is a calibration mode: it turns the blurred
  // heatmap off entirely and shows the dots at full opacity instead.
  const [showPoints, setShowPoints] = useState(false);
  const [justPoints, setJustPoints] = useState(false);
  const pointsOpacity = justPoints ? 1 : showPoints ? 0.5 : 0;
  const heatmapEnabled = !justPoints;

  // Scope series/games/players to the selected roster, same convention as
  // StatsPage: an explicit ALL_ROSTERS selection opts back into everything.
  const rosterSeriesIds = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? null
        : new Set(
            allSeries.filter((s) => s.rosterId === rosterFilter).map((s) => s.id)
          ),
    [rosterFilter, allSeries]
  );
  const rosterScopedSeries = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? allSeries
        : allSeries.filter((s) => s.rosterId === rosterFilter),
    [allSeries, rosterFilter]
  );
  const rosterScopedGames = useMemo(
    () =>
      rosterSeriesIds
        ? games.filter((g) => rosterSeriesIds.has(g.seriesId))
        : games,
    [games, rosterSeriesIds]
  );
  const rosterScopedPlayers = useMemo(
    () =>
      rosterFilter === ALL_ROSTERS
        ? allPlayers
        : allPlayers.filter((p) => p.rosterId === rosterFilter),
    [allPlayers, rosterFilter]
  );

  const dateScopedGames = useMemo(
    () =>
      rosterScopedGames.filter((g) => {
        if (startDate && g.date < startDate) return false;
        if (endDate && g.date > endDate) return false;
        return true;
      }),
    [rosterScopedGames, startDate, endDate]
  );
  const seriesScopedGames = useMemo(
    () =>
      seriesFilter
        ? dateScopedGames.filter((g) => g.seriesId === seriesFilter)
        : dateScopedGames,
    [dateScopedGames, seriesFilter]
  );

  // Only games actually imported with a tracker.gg-shaped rawJson blob carry
  // per-kill locations — most games in this app are stats-only.
  const gamesWithRawData = useMemo(
    () => seriesScopedGames.filter((g) => isHeatmapRawExport(g.rawJson)),
    [seriesScopedGames]
  );
  const mapsWithData = useMemo(
    () => new Set(gamesWithRawData.map((g) => g.map)),
    [gamesWithRawData]
  );
  const disabledMaps = useMemo(
    () => new Set(MAPS.filter((m) => !mapsWithData.has(m))),
    [mapsWithData]
  );
  const mapScopedGames = useMemo(
    () => gamesWithRawData.filter((g) => g.map === mapFilter),
    [gamesWithRawData, mapFilter]
  );

  // "Our team" for each game is whichever roster player's tracker.gg tag
  // (Player.lastSeenIgn, set the last time a match was imported and a
  // player was assigned to that in-game tag) shows up in it — not a raw
  // username, so this stays correct as roster membership changes.
  const anchorIdentifiers = useMemo(
    () =>
      new Set(
        rosterScopedPlayers
          .filter((p): p is typeof p & { lastSeenIgn: string } => !!p.lastSeenIgn)
          .map((p) => p.lastSeenIgn)
      ),
    [rosterScopedPlayers]
  );
  const nameByIdentifier = useMemo(
    () =>
      new Map(
        rosterScopedPlayers
          .filter((p): p is typeof p & { lastSeenIgn: string } => !!p.lastSeenIgn)
          .map((p) => [p.lastSeenIgn, p.name])
      ),
    [rosterScopedPlayers]
  );

  const parsedMatches = useMemo(
    () =>
      mapScopedGames.map((g) =>
        buildHeatmapMatchFromRawExport(g.rawJson as RawExport, g.id)
      ),
    [mapScopedGames]
  );
  const match: HeatmapMatch | null = useMemo(
    () => mergeHeatmapMatches(parsedMatches, anchorIdentifiers, nameByIdentifier),
    [parsedMatches, anchorIdentifiers, nameByIdentifier]
  );

  const gameInfo = useMemo(() => {
    const seriesById = new Map(allSeries.map((s) => [s.id, s]));
    return new Map<string, HeatmapGameInfo>(
      mapScopedGames.map((g) => {
        const series = seriesById.get(g.seriesId);
        return [
          g.id,
          { date: g.date, series: series ? `vs. ${series.opponent}` : 'Unknown' },
        ];
      })
    );
  }, [mapScopedGames, allSeries]);

  const emptyMessage = useMemo(() => {
    if (gamesWithRawData.length === 0) {
      return 'No heatmap data for the current roster/series/date filters yet — import a tracker.gg match with location data to populate this view.';
    }
    if (mapScopedGames.length === 0) {
      return `No heatmap data for ${mapFilter} yet — try a different map.`;
    }
    if (!match) {
      return "None of the matching games include a player from this roster. Link a teammate's tracker.gg tag via a match import to see their team highlighted here.";
    }
    return null;
  }, [gamesWithRawData, mapScopedGames, mapFilter, match]);

  const teamPlayers = useMemo(() => match?.players ?? [], [match]);
  const playerNames = useMemo(
    () => new Map(teamPlayers.map((p) => [p.id, p.appName ?? p.id])),
    [teamPlayers]
  );
  const teamAgents = useMemo(
    () => Array.from(new Set(teamPlayers.map((p) => p.agent))).sort(),
    [teamPlayers]
  );
  const teamClasses = useMemo(
    () =>
      Array.from(
        new Set(
          teamAgents
            .map((a) => AGENT_CLASS[a])
            .filter((c): c is AgentClass => !!c)
        )
      ),
    [teamAgents]
  );

  // Reset player/agent/class filters that no longer apply once the merged
  // match changes, rather than silently showing an empty heatmap.
  useEffect(() => {
    if (!match) return;
    const keepPlayers = players.filter((id) => teamPlayers.some((p) => p.id === id));
    if (keepPlayers.length !== players.length) setPlayers(keepPlayers);
    const keepAgents = agents.filter((a) => teamAgents.includes(a));
    if (keepAgents.length !== agents.length) setAgents(keepAgents);
    const keepClasses = agentClasses.filter((c) =>
      teamClasses.includes(c as AgentClass)
    );
    if (keepClasses.length !== agentClasses.length) setAgentClasses(keepClasses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // Agent and class filters are mutually exclusive — picking one clears the
  // other, so they never intersect into an empty selection.
  const pickAgents = (a: string[]) => {
    setAgents(a);
    if (a.length > 0) setAgentClasses([]);
  };
  const pickClasses = (c: string[]) => {
    setAgentClasses(c);
    if (c.length > 0) setAgents([]);
  };

  // Pre-plant caps the timeline at the latest plant; post-plant floors it at
  // the earliest one, so the slider can't be dragged into a window that
  // can't hold any dots. Only plants on the selected sites count. The URL
  // values are clamped for display/filtering rather than rewritten, so
  // switching back to "Both" restores them.
  const plantSeconds = useMemo(
    () =>
      (match?.plants ?? [])
        .filter((p) => activeSites.length === 0 || activeSites.includes(p.site))
        .map((p) => p.time / 1000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [match, activeSites.join()]
  );
  const timelineMin =
    plant === 'post' && plantSeconds.length > 0
      ? Math.floor(Math.min(...plantSeconds))
      : 0;
  const timelineMax =
    plant === 'pre' && plantSeconds.length > 0
      ? Math.ceil(Math.max(...plantSeconds))
      : TIMELINE_MAX_SECONDS;
  const clampTime = (t: number) => Math.min(timelineMax, Math.max(timelineMin, t));
  const timeStart = clampTime(roundStart);
  const timeEnd = clampTime(roundEnd);

  const filteredEvents = useMemo(() => {
    if (!match) return [];
    const startMs = timeStart * 1000;
    const endMs = timeEnd * 1000;
    return match.events.filter((e) => {
      if (mode === 'kills' && e.kind !== 'kill') return false;
      if (mode === 'deaths' && e.kind !== 'death') return false;
      if (side === 'attack' && e.side !== 'attacker') return false;
      if (side === 'defense' && e.side !== 'defender') return false;
      if (players.length > 0 && !players.includes(e.player)) return false;
      if (agents.length > 0 && !agents.includes(e.agent)) return false;
      if (
        agentClasses.length > 0 &&
        !agentClasses.includes(AGENT_CLASS[e.agent] ?? '')
      )
        return false;
      if (e.roundTime < startMs || e.roundTime > endMs) return false;
      if (plant === 'pre' && e.afterPlant) return false;
      if (plant === 'post' && !e.afterPlant) return false;
      if (
        activeSites.length > 0 &&
        !(e.plantSite && activeSites.includes(e.plantSite))
      )
        return false;
      return true;
    });
  }, [
    match,
    mode,
    side,
    players,
    agents,
    agentClasses,
    timeStart,
    timeEnd,
    plant,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    activeSites.join(),
  ]);

  // Inverting re-centers each dot on the enemy in that engagement.
  const displayedEvents = useMemo(
    () => (inverted ? invertHeatmapEvents(filteredEvents) : filteredEvents),
    [filteredEvents, inverted]
  );

  const counts = useMemo(() => {
    let kills = 0;
    let deaths = 0;
    for (const e of displayedEvents) {
      if (e.kind === 'kill') kills += 1;
      else deaths += 1;
    }
    return { kills, deaths };
  }, [displayedEvents]);

  const hasActiveFilters =
    rosterParam !== null ||
    mapFilter !== 'Haven' ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null ||
    mode !== 'both' ||
    side !== 'both' ||
    players.length > 0 ||
    agents.length > 0 ||
    agentClasses.length > 0 ||
    roundStart !== 0 ||
    roundEnd !== TIMELINE_MAX_SECONDS ||
    plant !== 'both' ||
    activeSites.length > 0 ||
    inverted;

  const resetFilters = () => {
    setRosterParam(null);
    setMapFilter(null);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
    setMode('both');
    setSide('both');
    setPlayers([]);
    setAgents([]);
    setAgentClasses([]);
    setRoundStart(0);
    setRoundEnd(TIMELINE_MAX_SECONDS);
    setPlant('both');
    setPlantSites([]);
    setInverted(false);
  };

  if (rosters.length === 0 || allSeries.length === 0) {
    return <GettingStarted hasRoster={rosters.length > 0} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Kill / Death Heatmap" titleGrow={false}>
        <div data-grow className="flex flex-wrap gap-3 items-end">
          <div className="w-32">
            <div className="label">Roster</div>
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
            <div className="label">Map</div>
            <MapPicker
              value={mapFilter}
              onChange={(v) => setMapFilter(v || null)}
              disabledMaps={disabledMaps}
            />
          </div>

          <div className="w-44">
            <div className="label">Date range</div>
            <DateRangePicker
              start={startDate}
              end={endDate}
              onChange={(s, e) => {
                setStartDate(s);
                setEndDate(e);
              }}
            />
          </div>

          <div className="w-44">
            <div className="label">Series</div>
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
            <div className="label">Show</div>
            <Segmented value={mode} options={MODES} onChange={setMode} />
          </div>
          <div>
            <div className="label">Side</div>
            <Segmented value={side} options={SIDES} onChange={setSide} />
          </div>

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

      {emptyMessage && <div className="card text-valorant-muted">{emptyMessage}</div>}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {match && (
          <div className="w-full lg:w-[720px] lg:max-w-[60%] shrink-0">
            <HeatmapCanvas
              imageUrl={minimapUrl(match.map) ?? ''}
              mapDetails={match.mapDetails}
              events={displayedEvents}
              heatmapEnabled={heatmapEnabled}
              pointsOpacity={pointsOpacity}
              playerNames={playerNames}
              gameInfo={gameInfo}
              inverted={inverted}
            />
          </div>
        )}

        <div className="card w-full lg:flex-1 lg:min-w-0 space-y-5">
          <div className="flex items-center gap-6 text-lg pb-4 border-b border-white/5">
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full bg-[#0ca30c]" />
              <span className="text-valorant-muted">
                Kills: <span className="text-white text-2xl font-bold tabular-nums">{counts.kills}</span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-4 rounded-full bg-[#d03b3b]" />
              <span className="text-valorant-muted">
                Deaths: <span className="text-white text-2xl font-bold tabular-nums">{counts.deaths}</span>
              </span>
            </span>
          </div>
          <div>
            <div className="label">Player</div>
            <MultiSelect
              values={players}
              onChange={setPlayers}
              emptyLabel="All players"
              noun="players"
              options={teamPlayers.map((p) => ({
                value: p.id,
                label: p.appName ?? p.id,
                icon: <AgentIcon agent={p.agent} size={20} className="shrink-0" />,
              }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <div className="label">Agent</div>
              <MultiSelect
                values={agents}
                onChange={pickAgents}
                emptyLabel="All agents"
                noun="agents"
                options={teamAgents.map((a) => ({
                  value: a,
                  label: a,
                  icon: <AgentIcon agent={a} size={20} className="shrink-0" />,
                }))}
              />
            </div>
            <div className="min-w-0">
              <div className="label">Agent class</div>
              <MultiSelect
                values={agentClasses}
                onChange={pickClasses}
                emptyLabel="All classes"
                noun="classes"
                options={teamClasses.map((c) => ({ value: c, label: CLASS_LABEL[c] }))}
              />
            </div>
          </div>

          <div>
            <div className="label">Round time</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-valorant-muted tabular-nums w-9">
                {formatTime(timeStart)}
              </span>
              <TimelineRange
                start={timeStart}
                end={timeEnd}
                min={timelineMin}
                max={timelineMax}
                onChangeStart={setRoundStart}
                onChangeEnd={setRoundEnd}
              />
              <span className="text-xs text-valorant-muted tabular-nums w-9 text-right">
                {formatTime(timeEnd)}
              </span>
            </div>
          </div>

          <div>
            <div className="label">Spike</div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={plant} options={PLANTS} onChange={setPlant} />
              <div className="flex items-center gap-1">
                {mapSites.map((site) => {
                  const on = activeSites.includes(site);
                  return (
                    <button
                      key={site}
                      type="button"
                      onClick={() =>
                        setPlantSites(
                          on
                            ? activeSites.filter((x) => x !== site)
                            : [...activeSites, site].sort()
                        )
                      }
                      className={`w-8 py-1 rounded text-sm font-semibold border transition-colors hover:text-white ${
                        on
                          ? 'bg-valorant-red text-white border-valorant-red'
                          : 'bg-valorant-panel2/40 text-valorant-muted border-white/10'
                      }`}
                    >
                      {site}
                    </button>
                  );
                })}
              </div>
              <HelpTip>
                Select for rounds where the spike was at some point planted on
                that site
              </HelpTip>
            </div>
          </div>

          <div>
            <div className="label">Display</div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showPoints}
                  disabled={justPoints}
                  onChange={(e) => setShowPoints(e.target.checked)}
                />
                Show points (50% opacity)
              </label>
              <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={justPoints}
                  onChange={(e) => setJustPoints(e.target.checked)}
                />
                Just points
              </label>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={inverted}
                    onChange={(e) => setInverted(e.target.checked)}
                  />
                  Invert
                </label>
                <HelpTip>
                  Inverting the heatmap shows where enemies stand most
                  frequently when kills occur in your matches. Green
                  represents locations where opponents stand when you kill
                  them, red the opposite.
                </HelpTip>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
