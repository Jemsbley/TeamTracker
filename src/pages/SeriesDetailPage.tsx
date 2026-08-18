import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { sortSeriesGames, useStore, canEditSeries } from '../store';
import WriteButton, { WRITE_TOOLTIP } from '../components/WriteButton';
import AgentBadge from '../components/AgentBadge';
import MapIcon from '../components/MapIcon';
import PickBanCard from '../components/PickBanCard';
import PlayerStatsTable from '../components/PlayerStatsTable';
import RoundEconomyPanel from '../components/RoundEconomyPanel';
import MatchVideosSection from '../components/MatchVideosSection';
import VodReviewsSection from '../components/VodReviewsSection';
import TrackerImportModal from '../components/TrackerImportModal';
import PageHeader from '../components/PageHeader';
import {
  aggregateEconomy,
  deriveScore,
  gameEconomy,
  type RoundEconomy,
} from '../utils/rounds';
import { gameMvpPlayerId, seriesMvpPlayerId } from '../utils/mvp';
import { FORMAT_TO_WIN, SERIES_FORMATS, type SeriesFormat } from '../types';
import { seriesStatus } from '../utils/series';
import { playedMaps, type PlayedMapSummary } from '../utils/pickBan';
import type { Game, Player } from '../types';

const COMPARE_OPTIONS = [
  { key: 'average', label: 'Average' },
  { key: 'prev', label: 'Previous series' },
  { key: 'prev3', label: 'Previous 3 series' },
  { key: 'month', label: 'This month' },
] as const;
type CompareKey = (typeof COMPARE_OPTIONS)[number]['key'];
const COMPARE_KEYS = COMPARE_OPTIONS.map((o) => o.key) as CompareKey[];
const COMPARE_LABEL: Record<CompareKey, string> = Object.fromEntries(
  COMPARE_OPTIONS.map((o) => [o.key, o.label])
) as Record<CompareKey, string>;

export default function SeriesDetailPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const series = useStore((s) => s.series.find((x) => x.id === seriesId));
  const games = useStore((s) =>
    s.games.filter((g) => g.seriesId === seriesId)
  );
  const allSeries = useStore((s) => s.series);
  const allGames = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const scoutingReports = useStore((s) => s.scoutingReports);
  const updateSeries = useStore((s) => s.updateSeries);
  const removeGame = useStore((s) => s.removeGame);
  const canEdit = useStore((s) => canEditSeries(s, seriesId));
  const [compare, setCompare] = useQueryState(
    'cmp',
    parseAsStringEnum<CompareKey>(COMPARE_KEYS).withDefault('average')
  );
  const [importSlot, setImportSlot] = useState<number | null>(null);

  if (!series) {
    return (
      <div className="space-y-3">
        <p className="text-valorant-muted">Series not found.</p>
        <Link className="btn-ghost" to="/series">
          Back to series
        </Link>
      </div>
    );
  }

  const sortedGames = sortSeriesGames(games);
  const seriesMvp = seriesMvpPlayerId(games);
  const seriesMvpName = players.find((p) => p.id === seriesMvp)?.name;
  const status = seriesStatus(series, games);
  const seriesEconomy = aggregateEconomy(games);

  const linkedReport = scoutingReports.find(
    (r) => r.id === series.scoutingReportId
  );
  // Offer reports scoped to this series' roster, plus unassigned ones and
  // whatever is already linked (so the current selection never disappears).
  const sortedReports = [...scoutingReports]
    .filter(
      (r) =>
        !r.rosterId ||
        r.rosterId === series.rosterId ||
        r.id === series.scoutingReportId
    )
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  const statsFilters = {
    map: 'all' as const,
    agents: [] as string[],
    seriesId: 'all' as const,
  };

  // --- comparison baseline: which other series' games to compare against.
  // Scoped to the same roster so we compare like-for-like lineups.
  const rosterSeries = [...allSeries]
    .filter((s) => s.rosterId === series.rosterId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const idx = rosterSeries.findIndex((s) => s.id === series.id);
  let compareSeriesIds: string[] = [];
  if (compare === 'average') {
    compareSeriesIds = rosterSeries.map((s) => s.id);
  } else if (compare === 'prev') {
    if (idx > 0) compareSeriesIds = [rosterSeries[idx - 1].id];
  } else if (compare === 'prev3') {
    compareSeriesIds = rosterSeries
      .slice(Math.max(0, idx - 3), idx)
      .map((s) => s.id);
  } else if (compare === 'month') {
    const ym = series.date.slice(0, 7);
    compareSeriesIds = rosterSeries
      .filter((s) => s.date.startsWith(ym))
      .map((s) => s.id);
  }
  const compareIdSet = new Set(compareSeriesIds);
  const compareGames = allGames.filter((g) => compareIdSet.has(g.seriesId));
  const hasBaseline = compareGames.length > 0;
  const compareEconomy = aggregateEconomy(compareGames);
  const baselineEconomy = hasBaseline ? compareEconomy : undefined;
  const baselineGames = hasBaseline ? compareGames : undefined;

  // --- slot computation: how many map slots to render given pick/ban + progress
  const summary: PlayedMapSummary[] =
    series.format && series.pickBan
      ? playedMaps(series.format, series.pickBan)
      : [];
  const totalSlots = summary.length;
  const decided = status.kind === 'won' || status.kind === 'lost';
  const minSlots = series.format ? FORMAT_TO_WIN[series.format] : 0;
  let activeSlots = sortedGames.length;
  if (series.format && totalSlots > 0) {
    const want = decided
      ? Math.min(totalSlots, minSlots)
      : Math.min(totalSlots, Math.max(minSlots, sortedGames.length + 1));
    activeSlots = Math.max(activeSlots, want);
  }

  type Slot =
    | { kind: 'game'; game: Game }
    | { kind: 'preset'; preset: PlayedMapSummary };
  const slots: Slot[] = [];
  for (let i = 0; i < activeSlots; i++) {
    const game = sortedGames[i];
    if (game) {
      slots.push({ kind: 'game', game });
      continue;
    }
    const preset = summary[i];
    if (preset) slots.push({ kind: 'preset', preset });
  }

  const emptyMessage =
    series.format && !series.pickBan
      ? 'Complete the map veto above to populate map slots.'
      : 'No maps yet in this series.';

  const rosterPlayers = players.filter((p) => p.rosterId === series.rosterId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`vs. ${series.opponent}`}
        description={
          <>
            <Link to="/series" className="text-xs text-valorant-muted hover:text-valorant-accent">
              ← All series
            </Link>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {status.kind === 'won' && (
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/20 text-green-200">
                  Series won {status.mapsFor}–{status.mapsAgainst}
                </span>
              )}
              {status.kind === 'lost' && (
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-200">
                  Series lost {status.mapsFor}–{status.mapsAgainst}
                </span>
              )}
              {status.kind === 'in_progress' && (
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-200">
                  {status.mapsFor}–{status.mapsAgainst} · first to {status.toWin}
                </span>
              )}
              {linkedReport && (
                <Link
                  to={`/scouting/${linkedReport.id}`}
                  className="text-xs px-2 py-0.5 rounded bg-valorant-accent/15 text-valorant-accent hover:text-valorant-red"
                >
                  Scouting: {linkedReport.teamName}
                  {linkedReport.note ? ` (${linkedReport.note})` : ''}
                </Link>
              )}
            </div>
            {seriesMvpName && (
              <div className="text-sm text-valorant-muted mt-0.5">
                Series MVP:{' '}
                <span className="text-yellow-200 font-medium">
                  {seriesMvpName}
                </span>{' '}
                <span className="text-xs uppercase tracking-wider px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-200 ml-1">
                  MVP
                </span>
              </div>
            )}
          </>
        }
      >
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Format</label>
            <div
              className="inline-flex rounded overflow-hidden border border-white/10"
              title={!canEdit ? WRITE_TOOLTIP : undefined}
            >
              {SERIES_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    updateSeries(series.id, { format: f as SeriesFormat })
                  }
                  className={`px-2.5 py-1.5 text-sm disabled:cursor-not-allowed ${
                    series.format === f
                      ? 'bg-valorant-red/30 text-white'
                      : 'bg-transparent text-valorant-muted hover:bg-white/5'
                  } ${!canEdit ? 'opacity-50' : ''}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Series date</label>
            <input
              type="date"
              className="input disabled:opacity-50 disabled:cursor-not-allowed"
              value={series.date}
              disabled={!canEdit}
              title={!canEdit ? WRITE_TOOLTIP : undefined}
              onChange={(e) => updateSeries(series.id, { date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Scouting report</label>
            <select
              className="input disabled:opacity-50 disabled:cursor-not-allowed"
              value={series.scoutingReportId ?? ''}
              disabled={!canEdit}
              title={!canEdit ? WRITE_TOOLTIP : undefined}
              onChange={(e) =>
                updateSeries(series.id, {
                  scoutingReportId: e.target.value || null,
                })
              }
            >
              <option value="">— None —</option>
              {sortedReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.teamName}
                  {r.note ? ` (${r.note})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PageHeader>

      <PickBanCard series={series} />

      {(seriesEconomy.total > 0 || games.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h3 className="font-semibold">Stats</h3>
            <div className="flex flex-col gap-1">
              <label className="label mb-0">Compare to</label>
              <div className="inline-flex rounded overflow-hidden border border-white/10">
                {COMPARE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setCompare(o.key)}
                    className={`px-3 py-1.5 text-sm whitespace-nowrap ${
                      compare === o.key
                        ? 'bg-valorant-red/30 text-white'
                        : 'bg-transparent text-valorant-muted hover:bg-white/5'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-valorant-muted">
            {hasBaseline
              ? `Each stat shows its change vs. ${COMPARE_LABEL[compare].toLowerCase()}.`
              : `No prior series to compare against for "${COMPARE_LABEL[compare].toLowerCase()}".`}
          </p>

          {seriesEconomy.total > 0 && (
            <div className="card space-y-2">
              <h4 className="font-semibold">Series round economy</h4>
              <RoundEconomyPanel
                economy={seriesEconomy}
                compare={baselineEconomy}
              />
            </div>
          )}

          {games.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold">Player stats</h4>
              <PlayerStatsTable
                games={games}
                players={players}
                filters={statsFilters}
                includeSubs
                compareGames={baselineGames}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold">Maps</h3>
        {slots.length === 0 ? (
          <div className="card text-center text-valorant-muted">
            {emptyMessage}
          </div>
        ) : (
          slots.map((slot, i) =>
            slot.kind === 'preset' ? (
              <PresetSlot
                key={`slot-${i}`}
                index={i}
                preset={slot.preset}
                canEdit={canEdit}
                onFill={() =>
                  navigate(`/series/${series.id}/games/new?slot=${i + 1}`)
                }
                onImport={() => setImportSlot(i)}
              />
            ) : (
              <GameSlot
                key={slot.game.id}
                index={i}
                game={slot.game}
                seriesId={series.id}
                players={players}
                canEdit={canEdit}
                compareEconomy={baselineEconomy}
                onDelete={() => {
                  if (confirm('Delete this map and its stats?')) {
                    removeGame(slot.game.id);
                  }
                }}
              />
            )
          )
        )}
      </div>

      <MatchVideosSection series={series} />
      <VodReviewsSection series={series} />

      {importSlot !== null && (
        <TrackerImportModal
          players={rosterPlayers}
          onClose={() => setImportSlot(null)}
          onImport={(payload) => {
            const slotIndex = importSlot;
            setImportSlot(null);
            navigate(`/series/${series.id}/games/new?slot=${slotIndex + 1}`, {
              state: { imported: payload },
            });
          }}
        />
      )}
    </div>
  );
}

function PresetSlot({
  index,
  preset,
  canEdit,
  onFill,
  onImport,
}: {
  index: number;
  preset: PlayedMapSummary;
  canEdit: boolean;
  onFill: () => void;
  onImport: () => void;
}) {
  return (
    <div className="card border border-dashed border-white/15 bg-valorant-panel/40 flex items-center gap-4 p-4">
      <MapIcon map={preset.map} width={120} height={70} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-valorant-muted">Map {index + 1}</span>
          <h4 className="font-semibold text-lg">{preset.map}</h4>
          <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-valorant-muted">
            {preset.pickedBy === null ? 'Decider' : 'Pick'}
          </span>
        </div>
        {preset.ourSide && (
          <span
            className={`inline-block text-xs uppercase tracking-wider px-1.5 py-0.5 rounded ${
              preset.ourSide === 'Attack'
                ? 'bg-red-500/15 text-red-300'
                : 'bg-blue-500/15 text-blue-300'
            }`}
          >
            We start {preset.ourSide}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <WriteButton canEdit={canEdit} className="btn-primary" onClick={onFill}>
          Fill in stats →
        </WriteButton>
        <WriteButton canEdit={canEdit} className="btn-ghost" onClick={onImport}>
          Import from tracker.gg
        </WriteButton>
      </div>
    </div>
  );
}

function GameSlot({
  index,
  game,
  seriesId,
  players,
  canEdit,
  compareEconomy,
  onDelete,
}: {
  index: number;
  game: Game;
  seriesId: string;
  players: Player[];
  canEdit: boolean;
  compareEconomy?: RoundEconomy;
  onDelete: () => void;
}) {
  const economy = gameEconomy(game);
  const mvpId = gameMvpPlayerId(game);
  const score = deriveScore(game);
  const finalScore =
    score ??
    (game.scoreFor !== undefined && game.scoreAgainst !== undefined
      ? ([game.scoreFor, game.scoreAgainst] as [number, number])
      : undefined);
  const win =
    finalScore && finalScore[0] > finalScore[1]
      ? 'win'
      : finalScore && finalScore[0] < finalScore[1]
        ? 'loss'
        : undefined;

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-stretch gap-4 p-4">
        <MapIcon map={game.map} width={120} height={70} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-valorant-muted">Map {index + 1}</span>
            <h4 className="font-semibold text-lg">{game.map}</h4>
            {game.startingSide && (
              <span
                className={`text-xs uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  game.startingSide === 'Attack'
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-blue-500/15 text-blue-300'
                }`}
              >
                Start: {game.startingSide}
              </span>
            )}
            {finalScore && (
              <span
                className={`tabular-nums font-semibold ${
                  win === 'win'
                    ? 'text-green-300'
                    : win === 'loss'
                      ? 'text-red-300'
                      : ''
                }`}
              >
                {finalScore[0]}–{finalScore[1]}
              </span>
            )}
            <span className="text-xs text-valorant-muted">{game.date}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {game.stats.map((s) => {
              const p = players.find((pp) => pp.id === s.playerId);
              const isMvp = mvpId && s.playerId === mvpId;
              return (
                <span
                  key={s.playerId + s.agent}
                  className="inline-flex items-center gap-1 text-xs"
                >
                  <span
                    className={`text-valorant-muted ${
                      isMvp ? 'text-yellow-200 font-medium' : ''
                    }`}
                  >
                    {p?.name ?? '?'}
                    {isMvp && ' ★'}:
                  </span>
                  <AgentBadge agent={s.agent} />
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 self-start">
          {canEdit ? (
            <Link
              className="btn-ghost"
              to={`/series/${seriesId}/games/${game.id}`}
            >
              Edit
            </Link>
          ) : (
            <WriteButton canEdit={false} className="btn-ghost">
              Edit
            </WriteButton>
          )}
          <WriteButton canEdit={canEdit} className="btn-danger" onClick={onDelete}>
            Delete
          </WriteButton>
        </div>
      </div>
      {economy.total > 0 && (
        <div className="border-t border-white/5 px-4 py-3 bg-valorant-panel2/20">
          <RoundEconomyPanel economy={economy} compact compare={compareEconomy} />
        </div>
      )}
    </div>
  );
}
