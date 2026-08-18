import {
  CATEGORY_LABEL,
  HALF_LENGTH,
  categorizeRound,
  isForceEligibleSlot,
  isUserCategorizedSlot,
  sideOfRound,
  visibleRoundCount,
} from '../utils/rounds';
import type { Round, Side } from '../types';
import AgentIcon from './AgentIcon';

/** One of our lineup slots, for attributing first blood/death/clutch to a player. */
export type LineupEntry = { playerId: string; agent: string; name: string };

type Props = {
  rounds: Round[];
  startingSide: Side;
  onChange: (rounds: Round[]) => void;
  /** Our 5 players this map, for the first blood/death/clutch player pickers. */
  lineup?: LineupEntry[];
};

export default function RoundsEditor({
  rounds,
  startingSide,
  onChange,
  lineup = [],
}: Props) {
  // Ensure at least 24 rounds exist for entry; OT rounds appended on demand.
  const arr =
    rounds.length >= HALF_LENGTH * 2
      ? rounds
      : [
          ...rounds,
          ...Array.from(
            { length: HALF_LENGTH * 2 - rounds.length },
            () => ({}) as Round
          ),
        ];

  const update = (idx: number, patch: Partial<Round>) => {
    const next = arr.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(trimTrailing(next));
  };

  const setResult = (idx: number, result: Round['result']) => {
    update(idx, { result });
  };
  const toggleFB = (idx: number) => {
    const cur = arr[idx]?.firstBlood;
    // Switching sides invalidates whichever player was attributed before.
    update(idx, {
      firstBlood: cur ? false : true,
      firstBloodPlayerId: undefined,
      firstDeathPlayerId: undefined,
    });
  };
  const togglePlant = (idx: number) => {
    const cur = arr[idx]?.planted;
    update(idx, { planted: cur ? false : true });
  };
  /** Cycles a round's clutch marker: none → won → lost → none. */
  const cycleClutch = (idx: number) => {
    const r = arr[idx] ?? {};
    if (!r.clutch) {
      update(idx, { clutch: true, clutchWon: true });
    } else if (r.clutchWon !== false) {
      update(idx, { clutchWon: false });
    } else {
      update(idx, { clutch: false, clutchWon: undefined, clutchPlayerId: undefined });
    }
  };
  const setFirstBloodPlayer = (idx: number, playerId: string) => {
    const cur = arr[idx]?.firstBloodPlayerId;
    update(idx, { firstBloodPlayerId: cur === playerId ? undefined : playerId });
  };
  const setFirstDeathPlayer = (idx: number, playerId: string) => {
    const cur = arr[idx]?.firstDeathPlayerId;
    update(idx, { firstDeathPlayerId: cur === playerId ? undefined : playerId });
  };
  const setClutchPlayer = (idx: number, playerId: string) => {
    const cur = arr[idx]?.clutchPlayerId;
    update(idx, { clutchPlayerId: cur === playerId ? undefined : playerId });
  };
  const setCategory = (idx: number, category: Round['category']) => {
    update(idx, { category });
  };

  const addOt = () => {
    onChange([...arr, {}, {}]);
  };
  const removeOt = () => {
    if (arr.length <= HALF_LENGTH * 2) return;
    onChange(trimTrailing(arr.slice(0, arr.length - 2)));
  };

  const renderHalf = (start: number, length: number, title: string) => {
    if (length <= 0) return null;
    return (
      <div>
        <h4 className="text-xs uppercase tracking-wider text-valorant-muted mb-2">
          {title}
        </h4>
        <div className="space-y-1">
          {Array.from({ length }, (_, k) => start + k).map((idx) =>
            renderRow(idx)
          )}
        </div>
      </div>
    );
  };

  const renderRow = (idx: number) => {
    const r = arr[idx] ?? {};
    const cat = categorizeRound(arr, idx);
    const userSlot = isUserCategorizedSlot(idx);
    const forceSlot = isForceEligibleSlot(idx);
    const side = sideOfRound(idx, startingSide);
    return (
      <div
        key={idx}
        className="flex flex-nowrap items-center gap-1 text-xs bg-valorant-panel2/40 rounded px-2 py-1 overflow-x-auto"
      >
        <span className="w-5 shrink-0 text-valorant-muted tabular-nums">
          {idx + 1}.
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-xs uppercase tracking-wide ${
            side === 'Attack'
              ? 'bg-red-500/15 text-red-300'
              : 'bg-blue-500/15 text-blue-300'
          }`}
          title={`Side: ${side}`}
        >
          {side === 'Attack' ? 'ATK' : 'DEF'}
        </span>

        {/* Result toggle */}
        <div className="inline-flex rounded overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => setResult(idx, r.result === 'W' ? undefined : 'W')}
            className={`px-1.5 py-0.5 text-xs font-medium ${
              r.result === 'W'
                ? 'bg-green-500/30 text-green-200'
                : 'bg-transparent text-valorant-muted hover:bg-white/5'
            }`}
            title="Round won"
          >
            W
          </button>
          <button
            type="button"
            onClick={() => setResult(idx, r.result === 'L' ? undefined : 'L')}
            className={`px-1.5 py-0.5 text-xs font-medium ${
              r.result === 'L'
                ? 'bg-red-500/30 text-red-200'
                : 'bg-transparent text-valorant-muted hover:bg-white/5'
            }`}
            title="Round lost"
          >
            L
          </button>
        </div>

        {/* First blood */}
        <button
          type="button"
          onClick={() => toggleFB(idx)}
          className={`px-1.5 py-0.5 text-xs rounded border ${
            r.firstBlood
              ? 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40'
              : 'border-white/10 text-valorant-muted hover:bg-white/5'
          }`}
          title="First blood"
        >
          FB {r.firstBlood ? 'Y' : 'N'}
        </button>
        {lineup.length > 0 && (
          <PlayerPicker
            lineup={lineup}
            selected={r.firstBlood ? r.firstBloodPlayerId : r.firstDeathPlayerId}
            onPick={(pid) =>
              r.firstBlood ? setFirstBloodPlayer(idx, pid) : setFirstDeathPlayer(idx, pid)
            }
            title={(name) =>
              r.firstBlood ? `${name} got first blood` : `${name} died first`
            }
          />
        )}

        {/* Clutch: none -> won -> lost -> none */}
        <button
          type="button"
          onClick={() => cycleClutch(idx)}
          className={`px-1.5 py-0.5 text-xs rounded border ${
            r.clutch
              ? r.clutchWon !== false
                ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                : 'bg-red-500/20 text-red-200 border-red-500/40'
              : 'border-white/10 text-valorant-muted hover:bg-white/5'
          }`}
          title="Did one of our players end up in a marked 1vX clutch this round? Click to cycle: none → won → lost."
        >
          Clutch {r.clutch ? (r.clutchWon !== false ? 'Won' : 'Lost') : '—'}
        </button>
        {r.clutch && lineup.length > 0 && (
          <PlayerPicker
            lineup={lineup}
            selected={r.clutchPlayerId}
            onPick={(pid) => setClutchPlayer(idx, pid)}
            title={(name) =>
              r.clutchWon !== false ? `${name} won the clutch` : `${name} lost the clutch`
            }
          />
        )}

        {/* Plant */}
        <button
          type="button"
          onClick={() => togglePlant(idx)}
          className={`px-1.5 py-0.5 text-xs rounded border ${
            r.planted
              ? 'bg-orange-500/20 text-orange-200 border-orange-500/40'
              : 'border-white/10 text-valorant-muted hover:bg-white/5'
          }`}
          title={
            side === 'Attack'
              ? 'Did we plant the spike?'
              : 'Did the opponent plant the spike?'
          }
        >
          Plant {r.planted ? 'Y' : 'N'}
        </button>

        {/* Category */}
        {userSlot ? (
          <div className="inline-flex rounded overflow-hidden border border-white/10 ml-auto">
            <button
              type="button"
              onClick={() =>
                setCategory(idx, r.category === 'gun' ? undefined : 'gun')
              }
              className={`px-1.5 py-0.5 text-xs ${
                r.category === 'gun'
                  ? 'bg-valorant-red/30 text-white'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Gun
            </button>
            <button
              type="button"
              onClick={() =>
                setCategory(idx, r.category === 'save' ? undefined : 'save')
              }
              className={`px-1.5 py-0.5 text-xs ${
                r.category === 'save'
                  ? 'bg-cls-controller/30 text-white'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() =>
                setCategory(idx, r.category === 'force' ? undefined : 'force')
              }
              className={`px-1.5 py-0.5 text-xs ${
                r.category === 'force'
                  ? 'bg-yellow-500/30 text-white'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Force
            </button>
          </div>
        ) : forceSlot ? (
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <span className="text-xs text-valorant-muted">
              {CATEGORY_LABEL[cat]}
            </span>
            <button
              type="button"
              onClick={() =>
                setCategory(idx, r.category === 'force' ? undefined : 'force')
              }
              className={`px-1.5 py-0.5 text-xs rounded border ${
                r.category === 'force'
                  ? 'bg-yellow-500/30 text-white border-yellow-500/40'
                  : 'border-white/10 text-valorant-muted hover:bg-white/5'
              }`}
            >
              Force
            </button>
          </div>
        ) : (
          <span className="ml-auto text-xs text-valorant-muted">
            {CATEGORY_LABEL[cat]}
          </span>
        )}
      </div>
    );
  };

  const visibleCount = visibleRoundCount(arr);
  const half1Length = Math.min(HALF_LENGTH, visibleCount);
  const half2Length = Math.min(
    HALF_LENGTH,
    Math.max(0, visibleCount - HALF_LENGTH)
  );
  const otCount = Math.max(0, visibleCount - HALF_LENGTH * 2);
  const gameEnded = visibleCount < arr.length;
  const showOtControls = !gameEnded;
  const trailingOtPairs = Math.max(
    0,
    Math.floor((arr.length - HALF_LENGTH * 2) / 2)
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {renderHalf(0, half1Length, `Half 1 · ${startingSide}`)}
      {renderHalf(
        HALF_LENGTH,
        half2Length,
        `Half 2 · ${startingSide === 'Attack' ? 'Defense' : 'Attack'}`
      )}
      {otCount > 0 && (
        <div className="md:col-span-2">
          <h4 className="text-xs uppercase tracking-wider text-valorant-muted mb-2">
            Overtime ({otCount} {otCount === 1 ? 'round' : 'rounds'})
          </h4>
          <div className="space-y-1">
            {Array.from({ length: otCount }, (_, k) =>
              renderRow(HALF_LENGTH * 2 + k)
            )}
          </div>
        </div>
      )}
      {showOtControls && (
        <div className="md:col-span-2 flex gap-2">
          <button type="button" className="btn-ghost" onClick={addOt}>
            + Add OT round (pair)
          </button>
          {trailingOtPairs > 0 && (
            <button type="button" className="btn-danger" onClick={removeOt}>
              – Remove last OT pair
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Trim trailing empty rounds beyond the 24-round regulation length, but never below. */
function trimTrailing(rounds: Round[]): Round[] {
  if (rounds.length <= HALF_LENGTH * 2) return rounds;
  let end = rounds.length;
  while (end > HALF_LENGTH * 2 && isEmpty(rounds[end - 1])) end -= 1;
  // Always keep OT rounds in pairs, so round end down to even relative to 24
  const otKept = end - HALF_LENGTH * 2;
  const evenOt = otKept - (otKept % 2);
  return rounds.slice(0, HALF_LENGTH * 2 + evenOt);
}

function isEmpty(r: Round): boolean {
  return (
    !r ||
    (!r.result &&
      !r.firstBlood &&
      !r.firstBloodPlayerId &&
      !r.firstDeathPlayerId &&
      !r.clutch &&
      !r.clutchPlayerId &&
      r.clutchWon === undefined &&
      !r.planted &&
      !r.category)
  );
}

/** Row of small clickable agent icons for attributing a round event to one of our players. */
function PlayerPicker({
  lineup,
  selected,
  onPick,
  title,
}: {
  lineup: LineupEntry[];
  selected: string | undefined;
  onPick: (playerId: string) => void;
  title: (name: string) => string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {lineup.map((p) => {
        const isSelected = selected === p.playerId;
        return (
          <button
            key={p.playerId}
            type="button"
            onClick={() => onPick(p.playerId)}
            title={title(p.name)}
            className={`rounded p-0.5 border transition-opacity ${
              isSelected
                ? 'border-yellow-400 bg-yellow-500/20 opacity-100'
                : 'border-transparent opacity-40 hover:opacity-90'
            }`}
          >
            <AgentIcon agent={p.agent} size={16} />
          </button>
        );
      })}
    </div>
  );
}
