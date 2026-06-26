import {
  CATEGORY_LABEL,
  HALF_LENGTH,
  categorizeRound,
  isUserCategorizedSlot,
  sideOfRound,
  visibleRoundCount,
} from '../utils/rounds';
import type { Round, Side } from '../types';

type Props = {
  rounds: Round[];
  startingSide: Side;
  onChange: (rounds: Round[]) => void;
};

export default function RoundsEditor({
  rounds,
  startingSide,
  onChange,
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
    update(idx, { firstBlood: cur ? false : true });
  };
  const togglePlant = (idx: number) => {
    const cur = arr[idx]?.planted;
    update(idx, { planted: cur ? false : true });
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
    const side = sideOfRound(idx, startingSide);
    return (
      <div
        key={idx}
        className="flex flex-wrap items-center gap-2 text-sm bg-valorant-panel2/40 rounded px-2 py-1"
      >
        <span className="w-7 text-valorant-muted tabular-nums">
          {idx + 1}.
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
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
            className={`px-2 py-0.5 text-xs font-medium ${
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
            className={`px-2 py-0.5 text-xs font-medium ${
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
          className={`px-2 py-0.5 text-xs rounded border ${
            r.firstBlood
              ? 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40'
              : 'border-white/10 text-valorant-muted hover:bg-white/5'
          }`}
          title="First blood"
        >
          FB {r.firstBlood ? 'Y' : 'N'}
        </button>

        {/* Plant */}
        <button
          type="button"
          onClick={() => togglePlant(idx)}
          className={`px-2 py-0.5 text-xs rounded border ${
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
              className={`px-2 py-0.5 text-xs ${
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
              className={`px-2 py-0.5 text-xs ${
                r.category === 'save'
                  ? 'bg-cls-controller/30 text-white'
                  : 'bg-transparent text-valorant-muted hover:bg-white/5'
              }`}
            >
              Save
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
  return !r || (!r.result && !r.firstBlood && !r.planted && !r.category);
}
