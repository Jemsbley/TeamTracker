import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AgentIcon from '../components/AgentIcon';
import AgentPicker from '../components/AgentPicker';
import MapPicker from '../components/MapPicker';
import RoundsEditor from '../components/RoundsEditor';
import { PLAYERS_PER_GAME } from '../constants';
import { newBlankStat, useStore } from '../store';
import type { GameStat, Round, Side, ValorantMap } from '../types';
import { deriveScore, gameEconomy, pct } from '../utils/rounds';
import { gameMvpPlayerId } from '../utils/mvp';
import { playedMaps } from '../utils/pickBan';

type StatField = keyof Omit<GameStat, 'playerId' | 'agent'>;

const STAT_COLUMNS: {
  key: StatField;
  label: string;
  step?: number;
  bestIsLow?: boolean;
}[] = [
  { key: 'acs', label: 'ACS' },
  { key: 'kills', label: 'K' },
  { key: 'deaths', label: 'D', bestIsLow: true },
  { key: 'assists', label: 'A' },
  { key: 'damageDelta', label: 'DDΔ' },
  { key: 'adr', label: 'ADR' },
  { key: 'hsPercent', label: 'HS%', step: 0.1 },
  { key: 'kastPercent', label: 'KAST%', step: 0.1 },
  { key: 'firstKills', label: 'FK' },
  { key: 'firstDeaths', label: 'FD', bestIsLow: true },
  { key: 'multikills', label: 'MK' },
];

export default function GameFormPage() {
  const { seriesId, gameId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const series = useStore((s) => s.series.find((x) => x.id === seriesId));
  const allPlayers = useStore((s) => s.players);
  const players = useMemo(
    () =>
      series ? allPlayers.filter((p) => p.rosterId === series.rosterId) : [],
    [allPlayers, series]
  );
  const existing = useStore((s) =>
    gameId ? s.games.find((g) => g.id === gameId) : undefined
  );
  const addGame = useStore((s) => s.addGame);
  const updateGame = useStore((s) => s.updateGame);

  const isEdit = !!gameId;
  const today = new Date().toISOString().slice(0, 10);

  // Pick/ban preset for `?slot=N` (1-based map number)
  const slotParam = searchParams.get('slot');
  const slotIndex = slotParam ? parseInt(slotParam, 10) - 1 : -1;
  const presetSlot =
    !isEdit && slotIndex >= 0 && series?.format && series.pickBan
      ? playedMaps(series.format, series.pickBan)[slotIndex]
      : undefined;

  const [map, setMap] = useState<ValorantMap | ''>(
    existing?.map ?? presetSlot?.map ?? ''
  );
  const [date, setDate] = useState<string>(
    existing?.date ?? series?.date ?? today
  );
  const [startingSide, setStartingSide] = useState<Side | ''>(
    existing?.startingSide ?? presetSlot?.ourSide ?? ''
  );
  const [scoreFor, setScoreFor] = useState<string>(
    existing?.scoreFor !== undefined ? String(existing.scoreFor) : ''
  );
  const [scoreAgainst, setScoreAgainst] = useState<string>(
    existing?.scoreAgainst !== undefined ? String(existing.scoreAgainst) : ''
  );

  const [stats, setStats] = useState<GameStat[]>(() => {
    if (existing) {
      const arr = [...existing.stats];
      while (arr.length < PLAYERS_PER_GAME) arr.push(newBlankStat());
      return arr.slice(0, PLAYERS_PER_GAME);
    }
    const main = players
      .filter((p) => p.isMainRoster)
      .slice(0, PLAYERS_PER_GAME);
    return Array.from({ length: PLAYERS_PER_GAME }, (_, i) =>
      newBlankStat(main[i]?.id ?? '')
    );
  });

  const [rounds, setRounds] = useState<Round[]>(
    () => existing?.rounds ?? []
  );

  // Auto-fill blank lineup with main roster on first render only
  useEffect(() => {
    if (existing) return;
    setStats((prev) => {
      const main = players
        .filter((p) => p.isMainRoster)
        .slice(0, PLAYERS_PER_GAME);
      let changed = false;
      const next = prev.map((s, i) => {
        if (s.playerId) return s;
        const id = main[i]?.id ?? '';
        if (id) changed = true;
        return { ...s, playerId: id };
      });
      return changed ? next : prev;
    });
  }, [players, existing]);

  const usedIds = useMemo(
    () => new Set(stats.map((s) => s.playerId).filter(Boolean)),
    [stats]
  );

  // Best value per stat column among rows with a player picked.
  const bestByCol = useMemo(() => {
    const out: Partial<Record<StatField, number>> = {};
    for (const col of STAT_COLUMNS) {
      let best: number | undefined;
      for (const s of stats) {
        if (!s.playerId) continue;
        const v = s[col.key];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (best === undefined) best = v;
        else if (col.bestIsLow ? v < best : v > best) best = v;
      }
      if (best !== undefined && best !== 0) out[col.key] = best;
    }
    return out;
  }, [stats]);

  const updateStat = (idx: number, patch: Partial<GameStat>) => {
    setStats((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  };

  const updateStatNum = (idx: number, key: StatField, value: string) => {
    const n = value === '' ? 0 : Number(value);
    updateStat(idx, { [key]: Number.isFinite(n) ? n : 0 } as Partial<GameStat>);
  };

  const lineupReady = stats.every((s) => s.playerId && s.agent);

  // Score: derive from rounds if any results entered; else use manual fields.
  const tempGame = useMemo(
    () =>
      ({
        id: 'temp',
        seriesId: seriesId ?? '',
        map: (map || 'Ascent') as ValorantMap,
        date,
        startingSide: startingSide || undefined,
        rounds,
        stats,
      }) as const,
    [seriesId, map, date, startingSide, rounds, stats]
  );
  const derivedScore = useMemo(() => deriveScore(tempGame), [tempGame]);
  const economy = useMemo(() => gameEconomy(tempGame), [tempGame]);
  const mvpId = useMemo(() => gameMvpPlayerId(tempGame), [tempGame]);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seriesId) return;
    if (!map) {
      alert('Pick a map first.');
      return;
    }

    const cleanStats = stats.filter((s) => s.playerId && s.agent);
    if (cleanStats.length !== PLAYERS_PER_GAME) {
      const ok = confirm(
        `Only ${cleanStats.length} of 5 player rows are filled in (need both player and agent). Save anyway?`
      );
      if (!ok) return;
    }

    let payloadScoreFor: number | undefined;
    let payloadScoreAgainst: number | undefined;
    if (derivedScore) {
      [payloadScoreFor, payloadScoreAgainst] = derivedScore;
    } else {
      payloadScoreFor = scoreFor === '' ? undefined : Number(scoreFor);
      payloadScoreAgainst =
        scoreAgainst === '' ? undefined : Number(scoreAgainst);
    }

    const payload = {
      seriesId,
      map: map as ValorantMap,
      date,
      scoreFor: payloadScoreFor,
      scoreAgainst: payloadScoreAgainst,
      startingSide: startingSide || undefined,
      rounds: rounds.length ? rounds : undefined,
      stats: cleanStats,
    };

    if (isEdit && gameId) {
      updateGame(gameId, payload);
    } else {
      addGame(payload);
    }
    navigate(`/series/${seriesId}`);
  };

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

  if (players.length === 0) {
    return (
      <div className="card text-valorant-muted space-y-3">
        <p>You need to add players to your roster before recording a game.</p>
        <Link className="btn-primary" to="/roster">
          Manage roster
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div>
        <Link
          to={`/series/${series.id}`}
          className="text-xs text-valorant-muted hover:text-valorant-accent"
        >
          ← vs. {series.opponent}
        </Link>
        <h2 className="text-xl font-semibold mt-1">
          {isEdit ? 'Edit map' : 'New map'}
        </h2>
      </div>

      {/* Map / date / side / score */}
      <section className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Map</label>
          <MapPicker value={map} onChange={(v) => setMap(v)} />
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
          <label className="label">Starting side</label>
          <div className="inline-flex rounded overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => setStartingSide('Attack')}
              className={`px-3 py-1.5 text-sm ${
                startingSide === 'Attack'
                  ? 'bg-red-500/30 text-red-100'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Attack
            </button>
            <button
              type="button"
              onClick={() => setStartingSide('Defense')}
              className={`px-3 py-1.5 text-sm ${
                startingSide === 'Defense'
                  ? 'bg-blue-500/30 text-blue-100'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Defense
            </button>
          </div>
        </div>
        <div className="ml-auto">
          <label className="label">Score</label>
          {derivedScore ? (
            <div className="text-2xl font-semibold tabular-nums">
              <span className="text-green-300">{derivedScore[0]}</span>
              <span className="text-valorant-muted mx-2">–</span>
              <span className="text-red-300">{derivedScore[1]}</span>
              <span className="ml-2 text-xs text-valorant-muted font-normal">
                from rounds
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                className="input w-20"
                value={scoreFor}
                onChange={(e) => setScoreFor(e.target.value)}
                placeholder="Us"
              />
              <span className="self-center text-valorant-muted">–</span>
              <input
                type="number"
                min={0}
                className="input w-20"
                value={scoreAgainst}
                onChange={(e) => setScoreAgainst(e.target.value)}
                placeholder="Opp"
              />
            </div>
          )}
        </div>
      </section>

      {/* Lineup */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">1. Lineup</h3>
          <span className="text-xs text-valorant-muted">
            Pick five players and their agents.
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {stats.map((s, i) => {
            const dupe =
              s.playerId &&
              stats.findIndex((x) => x.playerId === s.playerId) !== i;
            return (
              <div
                key={i}
                className="flex gap-2 bg-valorant-panel2/40 rounded p-2"
              >
                <span className="self-center text-xs w-6 text-center text-valorant-muted">
                  #{i + 1}
                </span>
                <select
                  className={`input flex-1 ${dupe ? 'border-red-500/60' : ''}`}
                  value={s.playerId}
                  onChange={(e) =>
                    updateStat(i, { playerId: e.target.value })
                  }
                >
                  <option value="">— Select player —</option>
                  <optgroup label="Main">
                    {players
                      .filter((p) => p.isMainRoster)
                      .map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={
                            usedIds.has(p.id) && p.id !== s.playerId
                          }
                        >
                          {p.name}
                          {usedIds.has(p.id) && p.id !== s.playerId
                            ? ' (used)'
                            : ''}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Substitutes">
                    {players
                      .filter((p) => !p.isMainRoster)
                      .map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={
                            usedIds.has(p.id) && p.id !== s.playerId
                          }
                        >
                          {p.name}
                          {usedIds.has(p.id) && p.id !== s.playerId
                            ? ' (used)'
                            : ''}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <AgentPicker
                  value={s.agent}
                  onChange={(agent) => updateStat(i, { agent })}
                  className="w-44"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Stats */}
      <section className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between p-4 pb-3">
          <h3 className="font-semibold">2. Stats</h3>
          {!lineupReady ? (
            <span className="text-xs text-valorant-muted">
              Complete the lineup above to enable stat entry.
            </span>
          ) : (
            <span className="text-xs text-valorant-muted">
              MVP highlights the highest-ACS player automatically.
            </span>
          )}
        </div>
        <table className="w-full min-w-[900px]">
          <thead className="bg-valorant-panel2/40">
            <tr>
              <th className="table-head">Player</th>
              {STAT_COLUMNS.map((c) => (
                <th key={c.key} className="table-head text-right pr-5">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => {
              const player = players.find((p) => p.id === s.playerId);
              const isMvp = lineupReady && s.playerId === mvpId;
              return (
                <tr
                  key={i}
                  className={`border-t border-white/5 ${
                    !lineupReady ? 'opacity-40 pointer-events-none' : ''
                  }`}
                >
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      {s.agent && <AgentIcon agent={s.agent} size={20} />}
                      <span
                        className={`font-medium ${isMvp ? 'text-yellow-300' : ''}`}
                        title={isMvp ? 'Map MVP (highest ACS)' : undefined}
                      >
                        {player?.name ?? '—'}
                      </span>
                    </div>
                  </td>
                  {STAT_COLUMNS.map((c) => {
                    const best = bestByCol[c.key];
                    const v = s[c.key];
                    const isBest =
                      !!s.playerId &&
                      best !== undefined &&
                      typeof v === 'number' &&
                      v === best;
                    return (
                      <td key={c.key} className="table-cell text-right">
                        <input
                          type="number"
                          step={c.step ?? 1}
                          className={`input text-right w-24 ${
                            isBest ? 'text-yellow-300' : ''
                          }`}
                          value={!s[c.key] ? '' : String(s[c.key])}
                          placeholder="0"
                          onChange={(e) =>
                            updateStatNum(i, c.key, e.target.value)
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rounds */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">3. Round-by-round</h3>
          <span className="text-xs text-valorant-muted">
            First to 13, win by 2 · OT in pairs
          </span>
        </div>
        {!startingSide ? (
          <p className="text-sm text-valorant-muted">
            Choose a starting side (Attack/Defense) above to enter rounds.
          </p>
        ) : (
          <>
            <RoundsEditor
              rounds={rounds}
              startingSide={startingSide}
              onChange={setRounds}
            />
            <RoundEconomyMini economy={economy} />
          </>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Link className="btn-ghost" to={`/series/${series.id}`}>
          Cancel
        </Link>
        <button type="submit" className="btn-primary">
          {isEdit ? 'Save changes' : 'Add map'}
        </button>
      </div>
    </form>
  );
}

function RoundEconomyMini({
  economy,
}: {
  economy: ReturnType<typeof gameEconomy>;
}) {
  const cells: { label: string; key: keyof typeof economy }[] = [
    { label: 'Atk Pistol', key: 'attackPistol' },
    { label: 'Def Pistol', key: 'defensePistol' },
    { label: 'Antieco', key: 'force' },
    { label: 'Bonus', key: 'bonus' },
    { label: 'Eco', key: 'eco' },
    { label: 'Antibonus', key: 'antibonus' },
    { label: 'Gun', key: 'gun' },
    { label: 'Save', key: 'save' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
      {cells.map(({ label, key }) => {
        const b = economy[key] as { wins: number; total: number };
        const color = miniPctColor(b.wins, b.total);
        return (
          <div
            key={label}
            className="bg-valorant-panel2/40 rounded p-2"
            title={`${b.wins} / ${b.total}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-valorant-muted">
              {label}
            </div>
            <div
              className="text-sm font-semibold tabular-nums"
              style={color ? { color } : undefined}
            >
              {pct(b.wins, b.total)}
            </div>
            <div className="text-[10px] text-valorant-muted">
              {b.wins}/{b.total}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function miniPctColor(wins: number, total: number): string | undefined {
  if (total === 0) return undefined;
  const t = Math.max(0, Math.min(1, wins / total));
  const r = Math.round(255 + (186 - 255) * t);
  const g = Math.round(179 + (255 - 179) * t);
  const b = Math.round(186 + (179 - 186) * t);
  return `rgb(${r}, ${g}, ${b})`;
}
