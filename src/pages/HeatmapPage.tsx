import { useEffect, useMemo, useState } from 'react';
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import DateRangePicker from '../components/DateRangePicker';
import GettingStarted from '../components/GettingStarted';
import MapPicker from '../components/MapPicker';
import PageHeader from '../components/PageHeader';
import HeatmapCanvas from '../components/heatmap/HeatmapCanvas';
import { AGENT_CLASS, CLASS_LABEL, MAPS } from '../constants';
import { useStore } from '../store';
import { minimapUrl } from '../utils/minimapIcon';
import { ALL_ROSTERS, resolveRosterFilter } from '../utils/rosters';
import {
  buildHeatmapMatchFromRawExport,
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
  max,
  onChangeStart,
  onChangeEnd,
}: {
  start: number;
  end: number;
  max: number;
  onChangeStart: (v: number) => void;
  onChangeEnd: (v: number) => void;
}) {
  const startPct = (start / max) * 100;
  const endPct = (end / max) * 100;
  return (
    <div className="relative flex-1 h-3.5">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-panel2" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-red"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={start}
        onChange={(e) => onChangeStart(Math.min(Number(e.target.value), end))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: start > max / 2 ? 5 : 3 }}
      />
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={end}
        onChange={(e) => onChangeEnd(Math.max(Number(e.target.value), start))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: end > max / 2 ? 3 : 5 }}
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
  const [player, setPlayer] = useQueryState(
    'player',
    parseAsString.withDefault('')
  );
  const [agent, setAgent] = useQueryState(
    'agent',
    parseAsString.withDefault('')
  );
  const [agentClass, setAgentClass] = useQueryState(
    'class',
    parseAsString.withDefault('')
  );
  const [roundStart, setRoundStart] = useQueryState(
    'roundStart',
    parseAsFloat.withDefault(0)
  );
  const [roundEnd, setRoundEnd] = useQueryState(
    'roundEnd',
    parseAsFloat.withDefault(TIMELINE_MAX_SECONDS)
  );
  const [afterPlantOnly, setAfterPlantOnly] = useQueryState(
    'afterPlant',
    parseAsBoolean.withDefault(false)
  );

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
        buildHeatmapMatchFromRawExport(g.rawJson as RawExport)
      ),
    [mapScopedGames]
  );
  const match: HeatmapMatch | null = useMemo(
    () => mergeHeatmapMatches(parsedMatches, anchorIdentifiers, nameByIdentifier),
    [parsedMatches, anchorIdentifiers, nameByIdentifier]
  );

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
    if (player && !teamPlayers.some((p) => p.id === player)) setPlayer('');
    if (agent && !teamAgents.includes(agent)) setAgent('');
    if (agentClass && !teamClasses.includes(agentClass as AgentClass))
      setAgentClass('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  const pickAgent = (a: string) => {
    setAgent(a);
    if (a) setAgentClass('');
  };
  const pickClass = (c: string) => {
    setAgentClass(c);
    if (c) setAgent('');
  };

  const filteredEvents = useMemo(() => {
    if (!match) return [];
    const startMs = roundStart * 1000;
    const endMs = roundEnd * 1000;
    return match.events.filter((e) => {
      if (mode === 'kills' && e.kind !== 'kill') return false;
      if (mode === 'deaths' && e.kind !== 'death') return false;
      if (side === 'attack' && e.side !== 'attacker') return false;
      if (side === 'defense' && e.side !== 'defender') return false;
      if (player && e.player !== player) return false;
      if (agent && e.agent !== agent) return false;
      if (agentClass && AGENT_CLASS[e.agent] !== agentClass) return false;
      if (e.roundTime < startMs || e.roundTime > endMs) return false;
      if (afterPlantOnly && !e.afterPlant) return false;
      return true;
    });
  }, [
    match,
    mode,
    side,
    player,
    agent,
    agentClass,
    roundStart,
    roundEnd,
    afterPlantOnly,
  ]);

  const counts = useMemo(() => {
    let kills = 0;
    let deaths = 0;
    for (const e of filteredEvents) {
      if (e.kind === 'kill') kills += 1;
      else deaths += 1;
    }
    return { kills, deaths };
  }, [filteredEvents]);

  const hasActiveFilters =
    rosterParam !== null ||
    mapFilter !== 'Haven' ||
    seriesFilter !== '' ||
    startDate !== null ||
    endDate !== null ||
    mode !== 'both' ||
    side !== 'both' ||
    player !== '' ||
    agent !== '' ||
    agentClass !== '' ||
    roundStart !== 0 ||
    roundEnd !== TIMELINE_MAX_SECONDS ||
    afterPlantOnly;

  const resetFilters = () => {
    setRosterParam(null);
    setMapFilter(null);
    setSeriesFilter('');
    setStartDate(null);
    setEndDate(null);
    setMode('both');
    setSide('both');
    setPlayer('');
    setAgent('');
    setAgentClass('');
    setRoundStart(0);
    setRoundEnd(TIMELINE_MAX_SECONDS);
    setAfterPlantOnly(false);
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

      <div className="card flex flex-wrap items-end gap-4">
        <label className="min-w-[180px]">
          <div className="label">Player</div>
          <select
            className="input"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
          >
            <option value="">All players</option>
            {teamPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.appName ?? p.id} ({p.agent})
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[160px]">
          <div className="label">Agent</div>
          <select
            className="input"
            value={agent}
            onChange={(e) => pickAgent(e.target.value)}
          >
            <option value="">All agents</option>
            {teamAgents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[160px]">
          <div className="label">Agent class</div>
          <select
            className="input"
            value={agentClass}
            onChange={(e) => pickClass(e.target.value)}
          >
            <option value="">All classes</option>
            {teamClasses.map((c) => (
              <option key={c} value={c}>
                {CLASS_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0ca30c]" />
            <span className="text-valorant-muted">
              Kills: <span className="text-white font-semibold">{counts.kills}</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#d03b3b]" />
            <span className="text-valorant-muted">
              Deaths: <span className="text-white font-semibold">{counts.deaths}</span>
            </span>
          </span>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-xs text-valorant-muted tabular-nums w-10">
          {formatTime(roundStart)}
        </span>
        <TimelineRange
          start={roundStart}
          end={roundEnd}
          max={TIMELINE_MAX_SECONDS}
          onChangeStart={setRoundStart}
          onChangeEnd={setRoundEnd}
        />
        <span className="text-xs text-valorant-muted tabular-nums w-10 text-right">
          {formatTime(roundEnd)}
        </span>

        <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
          <input
            type="checkbox"
            checked={afterPlantOnly}
            onChange={(e) => setAfterPlantOnly(e.target.checked)}
          />
          After spike plant only
        </label>
      </div>

      {emptyMessage && <div className="card text-valorant-muted">{emptyMessage}</div>}

      {match && (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="flex-1 min-w-[320px] max-w-[720px]">
            <HeatmapCanvas
              imageUrl={minimapUrl(match.map) ?? ''}
              mapDetails={match.mapDetails}
              events={filteredEvents}
              heatmapEnabled={heatmapEnabled}
              pointsOpacity={pointsOpacity}
            />
          </div>

          <div className="card w-full sm:w-[280px] space-y-4 shrink-0">
            <h3>Display</h3>
            <label className="flex items-center gap-2 text-sm text-valorant-accent">
              <input
                type="checkbox"
                checked={showPoints}
                disabled={justPoints}
                onChange={(e) => setShowPoints(e.target.checked)}
              />
              Show points (50% opacity)
            </label>
            <label className="flex items-center gap-2 text-sm text-valorant-accent">
              <input
                type="checkbox"
                checked={justPoints}
                onChange={(e) => setJustPoints(e.target.checked)}
              />
              Just points
            </label>
            <p className="text-xs text-valorant-muted">
              &quot;Just points&quot; turns off the blurred heatmap and shows
              the raw kill/death dots at full opacity — useful for
              sanity-checking the coordinate mapping against known callouts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
