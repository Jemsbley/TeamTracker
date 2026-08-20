import { useEffect, useMemo, useState } from 'react';
import { PLAYERS_PER_GAME } from '../constants';
import { newBlankStat } from '../store';
import type { GameStat, Player, Round, Side, ValorantMap } from '../types';
import {
  parseTrackerMatchJson,
  projectRoundsForTeam,
  type TrackerImportResult,
} from '../utils/trackerImport';
import AgentIcon from './AgentIcon';

type TeamColor = 'Red' | 'Blue';

type ImportPayload = {
  map: ValorantMap | null;
  date: string;
  startingSide: Side | undefined;
  rounds: Round[];
  stats: GameStat[];
  rawJson: unknown;
};

type Props = {
  players: Player[];
  onImport: (payload: ImportPayload) => void;
  onClose: () => void;
};

const INSTRUCTIONS_URL_LABEL = 'tracker.gg';

export default function TrackerImportModal({ players, onImport, onClose }: Props) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackerImportResult | null>(null);
  const [usTeam, setUsTeam] = useState<TeamColor | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleParse = () => {
    setError(null);
    try {
      const parsed = parseTrackerMatchJson(raw);
      if (parsed.players.length === 0) {
        setError('No player data found in that response — make sure you copied the match JSON, not the HTML page.');
        return;
      }
      setResult(parsed);
      // Guess which side is "us" by matching tracker names against the roster.
      const rosterNames = new Set(players.map((p) => p.name.toLowerCase()));
      const redMatches = parsed.players.filter(
        (p) => p.team === 'Red' && rosterNames.has(p.name.toLowerCase())
      ).length;
      const blueMatches = parsed.players.filter(
        (p) => p.team === 'Blue' && rosterNames.has(p.name.toLowerCase())
      ).length;
      const guess: TeamColor | null =
        redMatches === 0 && blueMatches === 0
          ? null
          : redMatches >= blueMatches
            ? 'Red'
            : 'Blue';
      setUsTeam(guess);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse that data.');
    }
  };

  const usPlayers = useMemo(
    () => (result && usTeam ? result.players.filter((p) => p.team === usTeam) : []),
    [result, usTeam]
  );

  // (Re-)seed assignments with best-guess name matches when the team changes.
  useEffect(() => {
    if (!usPlayers.length) {
      setAssignments({});
      return;
    }
    const used = new Set<string>();
    const next: Record<string, string> = {};
    for (const p of usPlayers) {
      const match = players.find(
        (rp) => rp.name.toLowerCase() === p.name.toLowerCase() && !used.has(rp.id)
      );
      if (match) {
        next[p.identifier] = match.id;
        used.add(match.id);
      }
    }
    setAssignments(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usTeam]);

  const usedPlayerIds = new Set(Object.values(assignments).filter(Boolean));

  const handleImport = () => {
    if (!result || !usTeam) return;
    const { startingSide, rounds } = projectRoundsForTeam(result, usTeam, assignments);
    const rawStats: GameStat[] = usPlayers.map((p) => ({
      playerId: assignments[p.identifier] ?? '',
      ...p.stat,
    }));
    while (rawStats.length < PLAYERS_PER_GAME) rawStats.push(newBlankStat());
    onImport({
      map: result.map,
      date: result.date,
      startingSide,
      rounds,
      stats: rawStats.slice(0, PLAYERS_PER_GAME),
      rawJson: result.raw,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Import from tracker.gg</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {!result && (
          <div className="space-y-3">
            <div className="text-sm text-valorant-muted space-y-2">
              <p>
                {INSTRUCTIONS_URL_LABEL} doesn't offer a way to fetch this automatically, so
                you'll need to copy the match data yourself:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Find the match on tracker.gg (e.g. in your match history).</li>
                <li>
                  Click <strong>Open in New Tab</strong> in the top right to load its
                  standalone match page.
                </li>
                <li>
                  Open DevTools (F12 or Cmd+Opt+I) → <strong>Network</strong> tab, then reload
                  the page.
                </li>
                <li>
                  Copy the match ID from the tab's URL — everything after the last{' '}
                  <strong>/</strong> — and paste it into the Network tab's filter box.
                </li>
                <li>
                  The first result should be a JSON response. Right-click it →{' '}
                  <strong>Copy → Copy Response</strong>, then paste it below.
                </li>
              </ol>
              <p className="text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-xs">
                ⚠ This parses tracker.gg's internal API response, which isn't an
                officially supported format — round categorization (gun/save/force)
                is a best-effort guess from loadout values. Always double-check the
                imported map, rounds, and stats before saving.
              </p>
            </div>
            <textarea
              className="input w-full h-40 font-mono text-xs"
              placeholder="Paste the tracker.gg match JSON here…"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!raw.trim()}
                onClick={handleParse}
              >
                Parse
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="text-sm text-valorant-muted">
              {result.map ?? 'Unknown map'} · {result.date}
            </div>
            <p className="text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 text-xs">
              ⚠ Double-check everything below before importing — parsing an
              unofficial API response means map, rounds, and stats may not be
              100% accurate.
            </p>

            <div>
              <div className="label mb-1">Which side is us?</div>
              <div className="grid grid-cols-2 gap-3">
                {(['Red', 'Blue'] as const).map((color) => {
                  const teamPlayers = result.players.filter((p) => p.team === color);
                  const score = result.teams[color];
                  const selected = usTeam === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setUsTeam(color)}
                      className={`text-left rounded-lg border p-3 space-y-1.5 transition-colors ${
                        selected
                          ? 'border-valorant-accent bg-valorant-panel2'
                          : 'border-white/10 hover:bg-valorant-panel2/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs uppercase tracking-wider font-semibold ${
                            color === 'Red' ? 'text-red-300' : 'text-blue-300'
                          }`}
                        >
                          {color}
                        </span>
                        <span className="tabular-nums font-semibold">
                          {score.roundsWon}–{score.roundsLost}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {teamPlayers.map((p) => (
                          <div
                            key={p.identifier}
                            className="flex items-center gap-1.5 text-xs text-valorant-muted"
                          >
                            {p.agent && <AgentIcon agent={p.agent} size={14} />}
                            <span className="truncate">{p.name}</span>
                            <span className="ml-auto tabular-nums">{p.stat.acs}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {usTeam && (
              <div className="space-y-2">
                <div className="label mb-0">Match players to your roster</div>
                {usPlayers.map((p) => (
                  <div key={p.identifier} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 w-40 shrink-0 text-sm">
                      {p.agent && <AgentIcon agent={p.agent} size={18} />}
                      <span className="truncate" title={p.identifier}>
                        {p.name}
                      </span>
                    </div>
                    <select
                      className="input flex-1"
                      value={assignments[p.identifier] ?? ''}
                      onChange={(e) =>
                        setAssignments((prev) => ({ ...prev, [p.identifier]: e.target.value }))
                      }
                    >
                      <option value="">— Select player —</option>
                      {players.map((rp) => (
                        <option
                          key={rp.id}
                          value={rp.id}
                          disabled={usedPlayerIds.has(rp.id) && assignments[p.identifier] !== rp.id}
                        >
                          {rp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!usTeam}
                onClick={handleImport}
              >
                Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
