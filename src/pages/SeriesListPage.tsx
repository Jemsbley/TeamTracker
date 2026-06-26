import { useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAsString, useQueryState } from 'nuqs';
import MapIcon from '../components/MapIcon';
import { sortSeriesGames, useStore } from '../store';
import {
  SERIES_FORMATS,
  type Game,
  type Player,
  type Series,
  type SeriesFormat,
  type ValorantMap,
} from '../types';
import { seriesStatus } from '../utils/series';
import { defaultRosterId } from '../utils/rosters';
import { deriveScore } from '../utils/rounds';
import { gameMvpPlayerId, seriesMvpPlayerId } from '../utils/mvp';
import { PICKBAN_STEPS, isUs, type Team } from '../utils/pickBan';

type VetoEntry =
  | {
      kind: 'ban';
      map: ValorantMap;
      byTeam: Team;
    }
  | {
      kind: 'pick' | 'decider';
      map: ValorantMap;
      byTeam: Team | null;
      game?: Game;
      playedIndex: number;
    };

function buildVetoEntries(series: Series, games: Game[]): VetoEntry[] {
  if (!series.format || !series.pickBan) return [];
  const steps = PICKBAN_STEPS[series.format];
  const pb = series.pickBan;
  const entries: VetoEntry[] = [];
  let playedIdx = 0;

  steps.forEach((step, i) => {
    const move = pb.moves[i];
    if (!move?.map) return;
    if (step.kind === 'pick') {
      playedIdx += 1;
      const game = games.find((g) => (g.order ?? 0) === playedIdx);
      entries.push({
        kind: 'pick',
        map: move.map,
        byTeam: step.team,
        game,
        playedIndex: playedIdx,
      });
    } else {
      entries.push({ kind: 'ban', map: move.map, byTeam: step.team });
    }
  });

  const usedMaps = pb.moves.map((m) => m?.map).filter(Boolean) as ValorantMap[];
  const remaining = pb.pool.filter((m) => !usedMaps.includes(m));
  if (remaining.length === 1) {
    playedIdx += 1;
    const game = games.find((g) => (g.order ?? 0) === playedIdx);
    entries.push({
      kind: 'decider',
      map: remaining[0],
      byTeam: null,
      game,
      playedIndex: playedIdx,
    });
  }
  return entries;
}

export default function SeriesListPage() {
  const series = useStore((s) => s.series);
  const games = useStore((s) => s.games);
  const players = useStore((s) => s.players);
  const rosters = useStore((s) => s.rosters);
  const addSeries = useStore((s) => s.addSeries);
  const removeSeries = useStore((s) => s.removeSeries);

  const today = new Date().toISOString().slice(0, 10);
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(today);
  const [format, setFormat] = useState<SeriesFormat>('BO3');
  const [newRosterId, setNewRosterId] = useState<string>(() =>
    defaultRosterId(rosters)
  );
  const [rosterFilter, setRosterFilter] = useQueryState(
    'roster',
    parseAsString.withDefault('')
  );

  // Keep the new-series roster picker pointed at a real roster
  if (newRosterId && !rosters.find((r) => r.id === newRosterId)) {
    setNewRosterId(defaultRosterId(rosters));
  }

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const o = opponent.trim();
    if (!o || !newRosterId) return;
    addSeries({ opponent: o, date, format, rosterId: newRosterId });
    setOpponent('');
    setDate(today);
    setFormat('BO3');
  };

  const filteredSeries = rosterFilter
    ? series.filter((s) => s.rosterId === rosterFilter)
    : series;
  const sorted = [...filteredSeries].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const rosterById = (id: string) =>
    rosters.find((r) => r.id === id)?.name ?? '?';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Series</h2>
          <p className="text-sm text-valorant-muted">
            {series.length} series · {games.length} games tracked
          </p>
        </div>
      </div>

      <form onSubmit={onAdd} className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Opponent</label>
          <input
            className="input"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="e.g. Lesley University"
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Roster</label>
          <select
            className="input"
            value={newRosterId}
            onChange={(e) => setNewRosterId(e.target.value)}
          >
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Format</label>
          <div className="inline-flex rounded overflow-hidden border border-white/10">
            {SERIES_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`px-3 py-1.5 text-sm ${
                  format === f
                    ? 'bg-valorant-red/30 text-white'
                    : 'bg-transparent text-valorant-muted hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary" type="submit">
          New series
        </button>
      </form>

      {rosters.length > 1 && (
        <div className="card flex items-end gap-3">
          <div>
            <label className="label">Filter by roster</label>
            <select
              className="input"
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value)}
            >
              <option value="">All rosters</option>
              {rosters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="card text-valorant-muted">
            No series yet. Add one above to start tracking matches.
          </div>
        )}
        {sorted.map((s) => {
          const sGames = sortSeriesGames(
            games.filter((g) => g.seriesId === s.id)
          );
          const status = seriesStatus(s, sGames);
          const seriesMvpId = seriesMvpPlayerId(sGames);
          const seriesMvpName =
            players.find((p) => p.id === seriesMvpId)?.name;
          const entries = buildVetoEntries(s, sGames);
          const team1 = s.pickBan?.team1;

          return (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="card block hover:border-white/15 hover:bg-valorant-panel2/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-lg font-semibold">vs. {s.opponent}</div>
                    {rosters.length > 1 && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-valorant-panel2 text-valorant-accent">
                        {rosterById(s.rosterId)}
                      </span>
                    )}
                    {s.format && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-valorant-muted">
                        {s.format}
                      </span>
                    )}
                    {status.kind === 'won' && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/20 text-green-200">
                        Won {status.mapsFor}–{status.mapsAgainst}
                      </span>
                    )}
                    {status.kind === 'lost' && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-200">
                        Lost {status.mapsFor}–{status.mapsAgainst}
                      </span>
                    )}
                    {status.kind === 'in_progress' &&
                      status.mapsFor + status.mapsAgainst > 0 && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-200">
                          {status.mapsFor}–{status.mapsAgainst}
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-valorant-muted">
                    {s.date} · {sGames.length}{' '}
                    {sGames.length === 1 ? 'map' : 'maps'}
                    {status.kind === 'unset' &&
                      status.mapsFor + status.mapsAgainst > 0 && (
                        <span>
                          {' '}· {status.mapsFor}W–{status.mapsAgainst}L
                        </span>
                      )}
                  </div>
                  {seriesMvpName && (
                    <div className="text-xs text-valorant-muted">
                      Series MVP:{' '}
                      <span className="text-yellow-300 font-medium">
                        {seriesMvpName}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  className="btn-danger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (
                      confirm(
                        `Delete series vs. ${s.opponent}? All games and stats in it will be removed.`
                      )
                    )
                      removeSeries(s.id);
                  }}
                >
                  Delete
                </button>
              </div>

              {entries.length > 0 ? (
                <div className="flex flex-wrap gap-3 mt-3">
                  {entries.map((entry, i) => (
                    <VetoTile
                      key={`${entry.map}-${i}`}
                      entry={entry}
                      team1={team1}
                      players={players}
                    />
                  ))}
                </div>
              ) : (
                sGames.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {sGames.map((g, i) => (
                      <PlayedTile
                        key={g.id}
                        index={i}
                        game={g}
                        players={players}
                      />
                    ))}
                  </div>
                )
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function VetoTile({
  entry,
  team1,
  players,
}: {
  entry: VetoEntry;
  team1: 'us' | 'opp' | undefined;
  players: Player[];
}) {
  const isOurAction =
    entry.byTeam !== null && !!team1 && isUs(entry.byTeam, team1);
  const isBan = entry.kind === 'ban';

  const game = entry.kind === 'ban' ? undefined : entry.game;
  const score =
    game &&
    (deriveScore(game) ??
      (game.scoreFor !== undefined && game.scoreAgainst !== undefined
        ? ([game.scoreFor, game.scoreAgainst] as [number, number])
        : undefined));
  const win =
    score && score[0] > score[1]
      ? 'win'
      : score && score[0] < score[1]
        ? 'loss'
        : undefined;
  const mvpId = game ? gameMvpPlayerId(game) : undefined;
  const mvpName = mvpId ? players.find((p) => p.id === mvpId)?.name : undefined;

  return (
    <div className={`w-40 flex-shrink-0 ${isBan ? 'opacity-80' : ''}`}>
      <div
        className={`relative rounded overflow-hidden border-2 ${
          isOurAction ? 'border-white' : 'border-transparent'
        }`}
      >
        <MapIcon map={entry.map} fill rounded="" />
        {isBan && (
          <div className="absolute inset-0 bg-red-500/40 pointer-events-none" />
        )}
        <div className="absolute inset-x-0 bottom-0 px-1 py-1 bg-black/70 text-xs text-center font-medium">
          {entry.map}
        </div>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {entry.kind === 'ban' ? (
          <div className="text-xs text-valorant-muted">Banned</div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs">
              <span className="text-valorant-muted">
                Map {entry.playedIndex}
                {entry.kind === 'decider' ? ' · Decider' : ''}
              </span>
              {score && (
                <span
                  className={`tabular-nums font-semibold ${
                    win === 'win'
                      ? 'text-green-300'
                      : win === 'loss'
                        ? 'text-red-300'
                        : ''
                  }`}
                >
                  {score[0]}–{score[1]}
                </span>
              )}
            </div>
            {mvpName && (
              <div className="text-xs text-valorant-muted">
                MVP:{' '}
                <span className="text-yellow-300 font-medium">{mvpName}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlayedTile({
  index,
  game,
  players,
}: {
  index: number;
  game: Game;
  players: Player[];
}) {
  const score =
    deriveScore(game) ??
    (game.scoreFor !== undefined && game.scoreAgainst !== undefined
      ? ([game.scoreFor, game.scoreAgainst] as [number, number])
      : undefined);
  const win =
    score && score[0] > score[1]
      ? 'win'
      : score && score[0] < score[1]
        ? 'loss'
        : undefined;
  const mvpId = gameMvpPlayerId(game);
  const mvpName = players.find((p) => p.id === mvpId)?.name;
  return (
    <div className="w-40 flex-shrink-0">
      <div className="relative rounded overflow-hidden border-2 border-transparent">
        <MapIcon map={game.map} fill rounded="" />
        <div className="absolute inset-x-0 bottom-0 px-1 py-1 bg-black/70 text-xs text-center font-medium">
          {game.map}
        </div>
      </div>
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-valorant-muted">
            Map {game.order ?? index + 1}
          </span>
          {score && (
            <span
              className={`tabular-nums font-semibold ${
                win === 'win'
                  ? 'text-green-300'
                  : win === 'loss'
                    ? 'text-red-300'
                    : ''
              }`}
            >
              {score[0]}–{score[1]}
            </span>
          )}
        </div>
        {mvpName && (
          <div className="text-xs text-valorant-muted">
            MVP:{' '}
            <span className="text-yellow-300 font-medium">{mvpName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
