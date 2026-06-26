type Props = {
  wins: number;
  losses: number;
  onChange: (wins: number, losses: number) => void;
};

/**
 * Win/loss record editor: a caret above and below each number to step it, with
 * a hyphen between. Wins are green, losses red.
 *
 *   ▲   ▲
 *   3 - 1
 *   ▼   ▼
 */
export default function RecordStepper({ wins, losses, onChange }: Props) {
  // No record entered yet → show dashes instead of "0 - 0".
  const empty = wins === 0 && losses === 0;
  return (
    <div className="flex items-center gap-2 select-none">
      <Stepper
        value={wins}
        display={empty ? '–' : String(wins)}
        colorClass="text-green-400"
        label="wins"
        onChange={(v) => onChange(v, losses)}
      />
      <span className="text-valorant-muted text-lg pb-0.5">–</span>
      <Stepper
        value={losses}
        display={empty ? '–' : String(losses)}
        colorClass="text-red-400"
        label="losses"
        onChange={(v) => onChange(wins, v)}
      />
    </div>
  );
}

function Stepper({
  value,
  display,
  colorClass,
  label,
  onChange,
}: {
  value: number;
  display: string;
  colorClass: string;
  label: string;
  onChange: (v: number) => void;
}) {
  const caret =
    'leading-none text-xs text-valorant-muted hover:text-valorant-accent disabled:opacity-30 disabled:hover:text-valorant-muted';
  // When showing a dash, dim it like a placeholder.
  const isDash = display === '–';
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        className={caret}
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
      >
        ▲
      </button>
      <span
        className={`text-lg font-semibold tabular-nums w-7 text-center ${
          isDash ? 'text-valorant-muted' : colorClass
        }`}
      >
        {display}
      </span>
      <button
        type="button"
        className={caret}
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        ▼
      </button>
    </div>
  );
}
