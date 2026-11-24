import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from 'nuqs';
import { MAPS, MAP_SITES } from '../constants';
import { useStore, canEditRoster } from '../store';
import AbilityUsageStrip from '../components/AbilityUsageStrip';
import AgentIcon from '../components/AgentIcon';
import HelpTip from '../components/HelpTip';
import HeatmapCanvas from '../components/heatmap/HeatmapCanvas';
import TimelineRange, {
  TIMELINE_MAX_SECONDS,
  formatTime,
} from '../components/heatmap/TimelineRange';
import Segmented from '../components/Segmented';
import LegacyReportEditor from './LegacyScoutingReport';
import MapIcon from '../components/MapIcon';
import PageHeader from '../components/PageHeader';
import PlayerStatsTable from '../components/PlayerStatsTable';
import WriteButton from '../components/WriteButton';
import type { Game, ScoutMatch, ScoutingReport, Side, ValorantMap } from '../types';
import type { HeatmapEvent, MapDetails } from '../utils/heatmapData';
import { minimapUrl } from '../utils/minimapIcon';
import {
  FILLER_ABILITY_ROWS,
  FILLER_EVENTS,
  FILLER_MAP,
  FILLER_MAP_DETAILS,
} from '../utils/scoutFiller';
import { pctColor, rateColor } from '../utils/color';
import { pct, sideOfRound } from '../utils/rounds';
import {
  DEFAULT_MIN_PLAYERS,
  MAX_TAGS,
  MIN_PLAYERS_OPTIONS,
  MIN_TAGS,
  buildScoutScript,
  compAbilityRows,
  ingestScoutFiles,
  isRiotId,
  parseTagList,
  isLegacyReport,
  scoutGames,
  scoutMapRows,
  scoutPlayers,
  scoutSince,
  scoutSummary,
  trackerCustomsUrl,
  visibleScoutMatches,
} from '../utils/scouting';

// The markdown renderer is sizable and only used here, so it loads on demand
// instead of in the app's main bundle.
const MarkdownNotes = lazy(() => import('../components/MarkdownNotes'));

export default function ScoutingReportPage() {
  const { reportId } = useParams();
  const report = useStore((s) => s.scoutingReports.find((r) => r.id === reportId));

  if (!report) {
    return (
      <div className="space-y-4">
        <Link to="/scouting" className="text-sm text-valorant-muted hover:text-valorant-accent">
          ← Scouting
        </Link>
        <div className="card text-center text-valorant-muted">Scouting report not found.</div>
      </div>
    );
  }

  if (isLegacyReport(report)) return <LegacyReportEditor key={report.id} report={report} />;
  return <ReportView key={report.id} report={report} />;
}

function ReportView({ report }: { report: ScoutingReport }) {
  const update = useStore((s) => s.updateScoutingReport);
  // Roster-attached reports need edit access on that roster; unattached
  // (personal) reports are editable by their owner unless this is an admin view.
  const canEdit = useStore((s) =>
    report.rosterId ? canEditRoster(s, report.rosterId) : !s.adminViewing && !s.guestMode
  );
  const [setupOpen, setSetupOpen] = useQueryState('setup', parseAsBoolean.withDefault(false));
  const hasMatches = (report.matches ?? []).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={report.teamName}
        description={
          <>
            <Link to="/scouting" className="hover:text-valorant-accent">
              ← Scouting
            </Link>
            {report.note && <span> · {report.note}</span>}
          </>
        }
      >
        {hasMatches && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSetupOpen(setupOpen ? null : true)}
          >
            {setupOpen ? 'Hide setup' : 'Roster & data'}
          </button>
        )}
      </PageHeader>

      {(!hasMatches || setupOpen) && <ScoutSetup report={report} canEdit={canEdit} />}
      {hasMatches && <ScoutResults report={report} />}
      <Suspense fallback={<div className="card text-sm text-valorant-muted">Loading notes…</div>}>
      <MarkdownNotes
        title="Notes"
        value={report.notes ?? ''}
        canEdit={canEdit}
        onSave={(notes) => update(report.id, { notes: notes.trim() ? notes : null })}
        emptyText="No notes yet. Add your own, or paste in a scouting write-up (markdown is supported)."
        placeholder={'# Game plan\n\n- They default B on Haven attack\n- Kill LuV first\n\nPaste a full markdown report here too.'}
      />
      </Suspense>
    </div>
  );
}

/* --------------------------------------------------------------------- setup */

function ScoutSetup({ report, canEdit }: { report: ScoutingReport; canEdit: boolean }) {
  const update = useStore((s) => s.updateScoutingReport);
  const savedTags = report.tags ?? [];
  const minPlayers = report.minPlayers ?? DEFAULT_MIN_PLAYERS;
  const since = scoutSince(report);
  const matches = report.matches ?? [];

  const [text, setText] = useState(() => savedTags.join('\n'));
  const parsed = parseTagList(text);
  const invalid = parsed.filter((t) => !isRiotId(t));
  const tagsValid = invalid.length === 0 && parsed.length >= MIN_TAGS && parsed.length <= MAX_TAGS;
  const savedValid = savedTags.length >= MIN_TAGS;
  const unsaved = parsed.join('\n') !== savedTags.join('\n');

  const script = useMemo(
    () =>
      savedValid
        ? buildScoutScript({ teamName: report.teamName, tags: savedTags, minPlayers, since })
        : '',
    [savedValid, report.teamName, savedTags, minPlayers, since]
  );

  const tagError =
    parsed.length === 0
      ? null
      : invalid.length > 0
        ? `Not a Riot ID (name#tag): ${invalid.join(', ')}`
        : parsed.length < MIN_TAGS
          ? `Add at least ${MIN_TAGS} players (${parsed.length} so far).`
          : parsed.length > MAX_TAGS
            ? `At most ${MAX_TAGS} players (${parsed.length} entered).`
            : null;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <label className="label">Opponent Riot IDs</label>
          <textarea
            className="input w-full min-h-[180px] font-mono text-sm"
            placeholder={'Paste 5–10 Riot IDs, one per line\nPlayer#NA1\nAnother Player#1234'}
            value={text}
            disabled={!canEdit}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-1 text-xs">
            {tagError ? (
              <span className="text-red-300">{tagError}</span>
            ) : (
              <span className="text-valorant-muted">
                {parsed.length > 0
                  ? `${parsed.length} players`
                  : 'One per line, or separated by commas.'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-valorant-accent whitespace-nowrap">Matches since</span>
            <input
              type="date"
              className="input py-1"
              value={since}
              disabled={!canEdit}
              onChange={(e) => update(report.id, { since: e.target.value || null })}
            />
            <HelpTip>
              The script stops looking once it reaches matches older than this, and the report
              ignores anything before it. Defaults to Sep 1 or Jan 1 of this year, whichever is
              more recent.
            </HelpTip>
          </div>
          <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
            <input
              type="checkbox"
              className="accent-valorant-red"
              checked={report.includeMR24 ?? false}
              disabled={!canEdit}
              onChange={(e) => update(report.id, { includeMR24: e.target.checked })}
            />
            Include MR24
            <HelpTip>
              Also count matches played out to all 24 rounds instead of first to 13 (e.g. 14–10
              or 12–12). These are usually scrims.
            </HelpTip>
          </label>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-valorant-accent whitespace-nowrap">Minimum players in a match</span>
            <select
              className="input py-1"
              value={minPlayers}
              disabled={!canEdit}
              onChange={(e) => update(report.id, { minPlayers: Number(e.target.value) })}
            >
              {MIN_PLAYERS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <HelpTip widthClass="w-80">
              A match counts when at least this many of these players were on the same team, and
              none were on the other team. Generating the script builds a snippet to paste into
              your browser while on any of these players' tracker.gg profiles (Customs tab): it
              downloads every match of theirs that meets this minimum as one file. Run it on each
              player's profile so you don't miss matches where one of them was subbed out, then
              upload all the files here to build the report.
            </HelpTip>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <WriteButton
            canEdit={canEdit}
            className="btn-primary"
            disabled={!tagsValid}
            onClick={() => update(report.id, { tags: parsed })}
          >
            {savedValid ? 'Regenerate script' : 'Generate script'}
          </WriteButton>
          {savedValid && unsaved && tagsValid && (
            <span className="text-xs text-valorant-muted">
              The players changed — regenerate the script to use the new list.
            </span>
          )}
        </div>
      </div>

      {savedValid && <ScriptPanel script={script} tags={savedTags} />}
      {savedValid && <UploadPanel report={report} canEdit={canEdit} matchCount={matches.length} />}
    </div>
  );
}

function ScriptPanel({ script, tags }: { script: string; tags: string[] }) {
  const [copied, setCopied] = useState(false);
  const [blocked, setBlocked] = useState(0);
  // Browsers usually let one click open only the first tab and block the
  // rest as pop-ups; count the blocked ones so we can say how to allow them.
  const openAll = () => {
    let missed = 0;
    for (const tag of tags) {
      const w = window.open(trackerCustomsUrl(tag), '_blank');
      if (w) w.opener = null;
      else missed += 1;
    }
    setBlocked(missed);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">1. Run the script on each player’s tracker.gg page</h3>
        <button type="button" className="btn-primary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy script'}
        </button>
      </div>
      <ol className="list-decimal list-inside space-y-1 text-sm text-valorant-muted">
        <li>
          Open a player’s Customs tab on tracker.gg:
          <div className="mt-1.5 ml-5 flex flex-wrap items-center gap-x-4 gap-y-1">
            {tags.map((tag) => (
              <a
                key={tag}
                href={trackerCustomsUrl(tag)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-valorant-accent hover:text-white underline underline-offset-2"
              >
                {tag}
              </a>
            ))}
            <button type="button" className="btn-ghost py-1 text-xs" onClick={openAll}>
              Open all
            </button>
          </div>
          {blocked > 0 && (
            <div className="mt-1 ml-5 text-xs text-yellow-300">
              Your browser blocked {blocked} of the tabs. Allow pop-ups for this site (the icon at
              the right of the address bar), then click Open all again.
            </div>
          )}
        </li>
        <li>
          Open the browser console (F12, or ⌘⌥J on a Mac), paste the script and press Enter. If
          Chrome blocks the paste, type <code className="text-white">allow pasting</code> first.
        </li>
        <li>Leave the tab open until a file downloads — it can take a few minutes.</li>
        <li>Repeat on every player’s profile, then upload all the files below.</li>
      </ol>
      <pre className="max-h-48 overflow-auto rounded-md bg-black/40 p-3 text-xs text-valorant-muted">
        {script}
      </pre>
    </div>
  );
}

function UploadPanel({
  report,
  canEdit,
  matchCount,
}: {
  report: ScoutingReport;
  canEdit: boolean;
  matchCount: number;
}) {
  const update = useStore((s) => s.updateScoutingReport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{ text: string; errors: string[] } | null>(null);

  const ingest = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !canEdit) return;
    setBusy(true);
    try {
      const files = await Promise.all(
        [...fileList].map(async (f) => ({ name: f.name, text: await f.text() }))
      );
      const result = ingestScoutFiles(files, report.tags ?? [], report.matches ?? []);
      if (result.added > 0 || result.updated > 0) update(report.id, { matches: result.matches });
      const parts = [`Added ${result.added} new ${result.added === 1 ? 'match' : 'matches'}`];
      if (result.updated > 0) parts.push(`${result.updated} updated with heatmap data`);
      if (result.duplicates > 0) parts.push(`${result.duplicates} already uploaded`);
      if (result.skipped > 0) parts.push(`${result.skipped} didn’t qualify`);
      setMessage({ text: parts.join(' · '), errors: result.errors });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">2. Upload the downloaded files</h3>
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          dragging ? 'border-valorant-accent bg-white/5' : 'border-white/15'
        } ${canEdit ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
        onClick={() => canEdit && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (canEdit) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(e.dataTransfer.files);
        }}
      >
        {busy ? 'Reading files…' : 'Drop the JSON files here, or click to choose them'}
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          className="hidden"
          onChange={(e) => void ingest(e.target.files)}
        />
      </div>
      {message && (
        <div className="text-sm space-y-1">
          <div className="text-valorant-accent">{message.text}</div>
          {message.errors.map((err) => (
            <div key={err} className="text-red-300">
              {err}
            </div>
          ))}
        </div>
      )}
      {matchCount > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-valorant-muted">
          <span>
            {matchCount} {matchCount === 1 ? 'match' : 'matches'} uploaded
          </span>
          <WriteButton
            canEdit={canEdit}
            className="btn-danger"
            onClick={() => {
              if (window.confirm('Remove every uploaded match from this report?')) {
                update(report.id, { matches: [] });
                setMessage(null);
              }
            }}
          >
            Remove all
          </WriteButton>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- results */

function ScoutResults({ report }: { report: ScoutingReport }) {
  const [mapFilter, setMapFilter] = useQueryState(
    'map',
    parseAsStringEnum<ValorantMap>([...MAPS])
  );
  const visible = useMemo(() => visibleScoutMatches(report), [report]);
  // Everything but the maps table narrows to the selected map; the table keeps
  // every map so you can switch between them.
  const onMap = useMemo(
    () => (mapFilter ? visible.filter((m) => m.map === mapFilter) : visible),
    [visible, mapFilter]
  );
  const games = useMemo(() => scoutGames(onMap), [onMap]);
  const players = useMemo(() => scoutPlayers(report, onMap), [report, onMap]);
  const summary = useMemo(() => scoutSummary(games), [games]);
  const mapRows = useMemo(() => scoutMapRows(scoutGames(visible)), [visible]);
  const topComp = mapFilter ? mapRows.find((r) => r.map === mapFilter)?.topComp ?? null : null;
  const compRows = useMemo(
    () => (topComp ? compAbilityRows(onMap, topComp.agents) : []),
    [onMap, topComp]
  );
  const uploaded = (report.matches ?? []).length;

  if (visible.length === 0) {
    return (
      <div className="card text-center text-valorant-muted">
        None of the {uploaded} uploaded matches meet the current date, minimum player count
        {report.includeMR24 ? '' : ' or MR24 setting'}.
      </div>
    );
  }

  const eco = summary.economy;
  const attackWins = countSideWins(games, 'Attack');
  const defenseWins = countSideWins(games, 'Defense');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-3">
        <StatTile
          label="Map record"
          value={`${summary.wins}–${summary.losses}${summary.draws ? `–${summary.draws}` : ''}`}
          sub={pct(summary.wins, summary.wins + summary.losses)}
          color={pctColor(summary.wins, summary.wins + summary.losses)}
        />
        <RateTile label="Atk pistol W%" wins={eco.attackPistol.wins} total={eco.attackPistol.total} />
        <RateTile label="Def pistol W%" wins={eco.defensePistol.wins} total={eco.defensePistol.total} />
        <RateTile label="Attack round W%" wins={attackWins} total={eco.attack.rounds} />
        <RateTile label="Plant %" wins={eco.attack.plants} total={eco.attack.rounds} />
        <RateTile label="Postplant W%" wins={eco.attack.postplantWins} total={eco.attack.plants} />
        <RateTile label="Defense round W%" wins={defenseWins} total={eco.defense.rounds} />
        <RateTile
          label="Plant allowed %"
          wins={eco.defense.plantsAllowed}
          total={eco.defense.rounds}
          lowerIsBetter
        />
        <RateTile label="Retake W%" wins={eco.defense.retakeWins} total={eco.defense.plantsAllowed} />
      </div>

      <PlayerStatsTable games={games} players={players} filters={{}} includeSubs />

      {/* On wide screens both boxes share the map table's height, which is
          at least ten rows (32px header + 10 × 41px rows): the heatmap card's
          content is absolutely positioned so it can't stretch the row, and
          the map scales to fit beside its filters. */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-stretch lg:min-h-[442px]">
      <div className="card overflow-x-auto p-0 w-full lg:w-[40%] lg:shrink-0">
        <table className="w-full min-w-[460px]">
          <thead className="bg-valorant-panel2/40">
            <tr>
              <th className="table-head">
                <span className="inline-flex items-center gap-2">
                  Map
                  <button
                    type="button"
                    onClick={() => setMapFilter(null)}
                    className={
                      mapFilter ? 'text-valorant-muted hover:text-yellow-300' : 'text-yellow-300'
                    }
                    title="Show every map"
                  >
                    Any
                  </button>
                </span>
              </th>
              <th className="table-head text-right pr-5">Record</th>
              <th className="table-head text-right pr-5">Win%</th>
              <th className="table-head">Most picked comp</th>
            </tr>
          </thead>
          <tbody>
            {mapRows.map((row) => (
              <tr
                key={row.map}
                onClick={() => setMapFilter(mapFilter === row.map ? null : row.map)}
                className={`border-t border-white/5 cursor-pointer transition-colors ${
                  mapFilter === row.map ? 'bg-valorant-panel2/50' : 'hover:bg-valorant-panel2/30'
                }`}
                title={mapFilter === row.map ? 'Show every map' : `Filter this report to ${row.map}`}
              >
                <td className="table-cell">
                  <div className="flex items-center gap-2">
                    <MapIcon map={row.map} width={48} height={28} />
                    <span
                      className={`font-medium ${mapFilter === row.map ? 'text-yellow-300' : ''}`}
                    >
                      {row.map}
                    </span>
                  </div>
                </td>
                <td className="table-cell text-right pr-5 tabular-nums">
                  {row.wins}–{row.losses}
                </td>
                <td
                  className="table-cell text-right pr-5 tabular-nums font-semibold"
                  style={{ color: pctColor(row.wins, row.wins + row.losses) }}
                >
                  {pct(row.wins, row.wins + row.losses)}
                </td>
                <td className="table-cell">
                  {row.topComp ? (
                    <div className="flex items-center gap-1">
                      {row.topComp.agents.map((a) => (
                        <AgentIcon key={a} agent={a} size={20} />
                      ))}
                      <span className="ml-2 text-xs text-valorant-muted tabular-nums">
                        {row.topComp.picks} of {row.plays} · {row.topComp.wins}–{row.topComp.losses}
                      </span>
                    </div>
                  ) : (
                    <span className="text-valorant-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card w-full lg:flex-1 lg:min-w-0 lg:relative">
        <div className="lg:absolute lg:inset-0 lg:p-4 flex flex-col">
          {mapFilter ? (
            <ScoutHeatmap map={mapFilter} matches={onMap} />
          ) : (
            <BlurredPrompt text="Click on a map to see its heatmap" blurClass="blur-md" clip>
              <HeatmapView
                map={FILLER_MAP}
                mapDetails={FILLER_MAP_DETAILS}
                events={FILLER_EVENTS}
                side="both"
                onSide={noop}
                plant="both"
                onPlant={noop}
                activeSites={[]}
                onToggleSite={noop}
                timeStart={0}
                timeEnd={TIMELINE_MAX_SECONDS}
                onTimeStart={noop}
                onTimeEnd={noop}
                showPoints={false}
                onShowPoints={noop}
                justPoints={false}
                onJustPoints={noop}
                playerNames={NO_NAMES}
                gameInfo={NO_GAMES}
              />
            </BlurredPrompt>
          )}
        </div>
      </div>
      </div>

      {mapFilter && compRows.length > 0 && topComp ? (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h4 className="font-semibold">Abilities</h4>
            <div className="flex items-center gap-1">
              {topComp.agents.map((a) => (
                <AgentIcon key={a} agent={a} size={20} />
              ))}
            </div>
            <span className="text-xs text-valorant-muted">
              {topComp.picks} {topComp.picks === 1 ? 'match' : 'matches'} · per round, ult per map
            </span>
          </div>
          <div className="grid gap-x-8 gap-y-1.5 md:grid-cols-2 xl:grid-cols-3">
            {compRows.map((r) => (
              <div key={r.playerId + r.agent} className="flex items-center gap-2 text-sm min-w-0">
                <AgentIcon agent={r.agent} size={20} />
                <span className="w-24 truncate text-valorant-muted" title={r.name}>
                  {r.name}
                </span>
                <AbilityUsageStrip agent={r.agent} usage={r.usage} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card space-y-3">
          <h4 className="font-semibold">Abilities</h4>
          <BlurredPrompt
            blurClass="blur-[4px]"
            text={
              mapFilter
                ? `No ability data for their most picked ${mapFilter} comp`
                : 'Click on a map to see its abilities'
            }
          >
            <div className="grid gap-x-8 gap-y-1.5 md:grid-cols-2 xl:grid-cols-3">
              {FILLER_ABILITY_ROWS.map((r) => (
                <div key={r.agent} className="flex items-center gap-2 text-sm min-w-0">
                  <AgentIcon agent={r.agent} size={20} />
                  <span className="w-24 truncate text-valorant-muted">{r.name}</span>
                  <AbilityUsageStrip agent={r.agent} usage={r.usage} />
                </div>
              ))}
            </div>
          </BlurredPrompt>
        </div>
      )}
    </div>
  );
}

/** Rounds won on one side across games. RoundEconomy only counts side rounds
 * and plants, so the wins are tallied here. */
function countSideWins(games: Game[], side: Side): number {
  let wins = 0;
  for (const g of games) {
    const startingSide = g.startingSide;
    if (!startingSide) continue;
    (g.rounds ?? []).forEach((r, i) => {
      if (r.result === 'W' && sideOfRound(i, startingSide) === side) wins += 1;
    });
  }
  return wins;
}

type SideFilter = 'both' | 'attack' | 'defense';
type PlantFilter = 'both' | 'pre' | 'post';

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

/** A trimmed-down version of the Heatmap page for one map of the scouted
 * team: their kills (green) and deaths (red), filtered by side and spike. */
function ScoutHeatmap({ map, matches }: { map: ValorantMap; matches: ScoutMatch[] }) {
  const [side, setSide] = useQueryState(
    'hside',
    parseAsStringEnum<SideFilter>(['both', 'attack', 'defense']).withDefault('both')
  );
  const [plant, setPlant] = useQueryState(
    'hplant',
    parseAsStringEnum<PlantFilter>(['both', 'pre', 'post']).withDefault('both')
  );
  const [plantSites, setPlantSites] = useQueryState(
    'hsites',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [roundStart, setRoundStart] = useQueryState('hstart', parseAsFloat.withDefault(0));
  const [roundEnd, setRoundEnd] = useQueryState(
    'hend',
    parseAsFloat.withDefault(TIMELINE_MAX_SECONDS)
  );
  const clampTime = (t: number) => Math.min(TIMELINE_MAX_SECONDS, Math.max(0, t));
  const timeStart = clampTime(roundStart);
  const timeEnd = clampTime(roundEnd);
  // Same display modes as the Heatmap page: points over the heatmap at 50%,
  // or points alone at full opacity.
  const [showPoints, setShowPoints] = useState(false);
  const [justPoints, setJustPoints] = useState(false);

  const activeSites = plantSites.filter((s) => MAP_SITES[map].includes(s));
  const withHeat = matches.filter((m) => m.heatmap);

  const events = useMemo<HeatmapEvent[]>(
    () =>
      withHeat.flatMap((m) =>
        m.heatmap!.events.map((e) => ({ ...e, gameId: m.id, team: 'Blue' as const }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches]
  );
  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (side === 'attack' && e.side !== 'attacker') return false;
        if (side === 'defense' && e.side !== 'defender') return false;
        if (plant === 'pre' && e.afterPlant) return false;
        if (plant === 'post' && !e.afterPlant) return false;
        if (activeSites.length > 0 && !(e.plantSite && activeSites.includes(e.plantSite)))
          return false;
        if (e.roundTime < timeStart * 1000 || e.roundTime > timeEnd * 1000) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, side, plant, activeSites.join(), timeStart, timeEnd]
  );
  const playerNames = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of matches)
      for (const riotId of Object.values(m.names)) out.set(riotId, riotId.split('#')[0]);
    return out;
  }, [matches]);
  const gameInfo = useMemo(
    () => new Map(matches.map((m) => [m.id, { date: m.date, series: '' }])),
    [matches]
  );

  if (withHeat.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 lg:py-0 text-center text-valorant-muted">
        These {map} matches were uploaded before heatmaps were added. Upload the same files again
        to see the heatmap.
      </div>
    );
  }

  const toggleSite = (site: string) =>
    setPlantSites(
      activeSites.includes(site)
        ? activeSites.filter((x) => x !== site)
        : [...activeSites, site].sort()
    );

  return (
    <HeatmapView
      map={map}
      mapDetails={withHeat[0].heatmap!.mapDetails}
      events={filtered}
      side={side}
      onSide={setSide}
      plant={plant}
      onPlant={setPlant}
      activeSites={activeSites}
      onToggleSite={toggleSite}
      timeStart={timeStart}
      timeEnd={timeEnd}
      onTimeStart={setRoundStart}
      onTimeEnd={setRoundEnd}
      showPoints={showPoints}
      onShowPoints={setShowPoints}
      justPoints={justPoints}
      onJustPoints={setJustPoints}
      playerNames={playerNames}
      gameInfo={gameInfo}
      note={
        withHeat.length < matches.length
          ? `${matches.length - withHeat.length} of ${matches.length} ${map} matches were uploaded before heatmaps were added and aren’t shown. Upload the same files again to include them.`
          : undefined
      }
    />
  );
}

/** The heatmap with its filter column on the right. Purely presentational,
 * so the blurred placeholder can render the same layout with filler data. */
function HeatmapView({
  map,
  mapDetails,
  events,
  side,
  onSide,
  plant,
  onPlant,
  activeSites,
  onToggleSite,
  timeStart,
  timeEnd,
  onTimeStart,
  onTimeEnd,
  showPoints,
  onShowPoints,
  justPoints,
  onJustPoints,
  playerNames,
  gameInfo,
  note,
}: {
  map: ValorantMap;
  mapDetails: MapDetails;
  events: HeatmapEvent[];
  side: SideFilter;
  onSide: (v: SideFilter) => void;
  plant: PlantFilter;
  onPlant: (v: PlantFilter) => void;
  activeSites: string[];
  onToggleSite: (site: string) => void;
  /** Round-time window, in seconds. */
  timeStart: number;
  timeEnd: number;
  onTimeStart: (v: number) => void;
  onTimeEnd: (v: number) => void;
  showPoints: boolean;
  onShowPoints: (v: boolean) => void;
  justPoints: boolean;
  onJustPoints: (v: boolean) => void;
  playerNames: ReadonlyMap<string, string>;
  gameInfo: ReadonlyMap<string, { date: string; series: string }>;
  note?: string;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
      {/* Largest square that fits beside the filter column. */}
      <div className="lg:flex-1 lg:min-w-0 lg:min-h-0 lg:[container-type:size]">
        <div className="w-full lg:w-[min(100cqw,100cqh)] mx-auto">
          <HeatmapCanvas
            imageUrl={minimapUrl(map) ?? ''}
            mapDetails={mapDetails}
            events={events}
            heatmapEnabled={!justPoints}
            pointsOpacity={justPoints ? 1 : showPoints ? 0.5 : 0}
            playerNames={playerNames}
            gameInfo={gameInfo}
            inverted={false}
          />
        </div>
      </div>

      <div className="order-first lg:order-none shrink-0 lg:w-56 flex flex-col gap-4">
        <div>
          <div className="label">Side</div>
          <Segmented value={side} options={SIDES} onChange={onSide} />
        </div>
        <div>
          <div className="label">Spike</div>
          <div className="space-y-2">
            <Segmented value={plant} options={PLANTS} onChange={onPlant} />
            <div className="flex items-center gap-1">
              {MAP_SITES[map].map((site) => {
                const on = activeSites.includes(site);
                return (
                  <button
                    key={site}
                    type="button"
                    onClick={() => onToggleSite(site)}
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
              <span className="ml-1">
                <HelpTip>Select for rounds where the spike was at some point planted on that site</HelpTip>
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="label">Round time</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-valorant-muted tabular-nums w-8">
              {formatTime(timeStart)}
            </span>
            <TimelineRange
              start={timeStart}
              end={timeEnd}
              min={0}
              max={TIMELINE_MAX_SECONDS}
              onChangeStart={onTimeStart}
              onChangeEnd={onTimeEnd}
            />
            <span className="text-xs text-valorant-muted tabular-nums w-8 text-right">
              {formatTime(timeEnd)}
            </span>
          </div>
        </div>
        <div>
          <div className="label">Display</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
              <input
                type="checkbox"
                checked={showPoints}
                disabled={justPoints}
                onChange={(e) => onShowPoints(e.target.checked)}
              />
              Show points (50% opacity)
            </label>
            <label className="flex items-center gap-2 text-sm text-valorant-accent whitespace-nowrap">
              <input
                type="checkbox"
                checked={justPoints}
                onChange={(e) => onJustPoints(e.target.checked)}
              />
              Just points
            </label>
          </div>
        </div>
        {note && <div className="text-xs text-valorant-muted">{note}</div>}
      </div>
    </div>
  );
}

const noop = () => {};

const NO_NAMES: ReadonlyMap<string, string> = new Map();
const NO_GAMES: ReadonlyMap<string, { date: string; series: string }> = new Map();

/** Made-up content under a heavy blur with a prompt on top — a preview of
 * what the box will show once there's something to show. */
function BlurredPrompt({
  text,
  blurClass,
  clip = false,
  children,
}: {
  text: string;
  /** Tailwind blur class — heavier for the heatmap, lighter for text rows. */
  blurClass: string;
  /** Clip the blur at the box edge. Off by default so it fades out softly
   * into the surrounding card padding instead of ending in a hard line. */
  clip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex-1 min-h-0 flex flex-col ${clip ? 'overflow-hidden rounded-lg' : ''}`}
    >
      <div
        aria-hidden
        className={`flex-1 min-h-0 flex flex-col ${blurClass} opacity-70 pointer-events-none select-none`}
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <span className="rounded-md bg-black/60 px-4 py-2 text-center font-medium text-white">
          {text}
        </span>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-valorant-muted leading-tight">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-valorant-muted tabular-nums">{sub}</div>}
    </div>
  );
}

function RateTile({
  label,
  wins,
  total,
  lowerIsBetter,
}: {
  label: string;
  wins: number;
  total: number;
  lowerIsBetter?: boolean;
}) {
  const color = total ? rateColor(lowerIsBetter ? 1 - wins / total : wins / total) : undefined;
  return <StatTile label={label} value={pct(wins, total)} sub={`${wins}/${total}`} color={color} />;
}
