import { useEffect, useState } from 'react';

type Props = {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
  className?: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Parse a yyyy-mm-dd string into a UTC date (noon, to dodge TZ edges). */
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function fmtShort(iso: string): string {
  const d = fromISO(iso);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export default function DateRangePicker({ start, end, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  // The month currently shown in the calendar grid (UTC y/m).
  const [view, setView] = useState(() => {
    const base = start ? fromISO(start) : new Date();
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() };
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const label =
    start && end
      ? `${fmtShort(start)} – ${fmtShort(end)}`
      : start
        ? `From ${fmtShort(start)}`
        : end
          ? `Until ${fmtShort(end)}`
          : 'All dates';

  const pickDay = (iso: string) => {
    // No range yet, or a complete range exists -> start a fresh selection.
    if (!start || (start && end)) {
      onChange(iso, null);
      return;
    }
    // Have a start, no end -> set the second endpoint, ordering as needed.
    if (iso < start) onChange(iso, start);
    else onChange(start, iso);
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const total = v.y * 12 + v.m + delta;
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });
  };

  // Quick presets: snap the range to the current calendar month or year.
  const selectThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    onChange(
      toISO(new Date(Date.UTC(y, m, 1, 12))),
      toISO(new Date(Date.UTC(y, m + 1, 0, 12)))
    );
    setView({ y, m });
  };
  const selectThisYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    onChange(
      toISO(new Date(Date.UTC(y, 0, 1, 12))),
      toISO(new Date(Date.UTC(y, 11, 31, 12)))
    );
    setView({ y, m: now.getMonth() });
  };

  // Build the day grid for the viewed month, Monday-first, padded to weeks.
  const firstOfMonth = new Date(Date.UTC(view.y, view.m, 1, 12));
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0, 12)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toISO(new Date(Date.UTC(view.y, view.m, d, 12))));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const inRange = (iso: string) =>
    start && end ? iso >= start && iso <= end : false;
  const isEndpoint = (iso: string) => iso === start || iso === end;

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="input flex items-center gap-2 text-left"
      >
        <span className={`truncate ${start || end ? '' : 'text-valorant-muted'}`}>
          {label}
        </span>
        <span className="ml-auto text-valorant-muted shrink-0">▾</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-[320px] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="px-2 py-1 rounded hover:bg-valorant-panel2 text-valorant-muted hover:text-white"
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="font-medium">
                {MONTHS[view.m]} {view.y}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="px-2 py-1 rounded hover:bg-valorant-panel2 text-valorant-muted hover:text-white"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectThisMonth}
                className="flex-1 text-xs rounded py-1.5 bg-valorant-panel2 hover:bg-valorant-panel2/70 text-valorant-accent"
              >
                This month
              </button>
              <button
                type="button"
                onClick={selectThisYear}
                className="flex-1 text-xs rounded py-1.5 bg-valorant-panel2 hover:bg-valorant-panel2/70 text-valorant-accent"
              >
                This year
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="text-xs uppercase tracking-wider text-valorant-muted py-1"
                >
                  {w}
                </div>
              ))}
              {cells.map((iso, i) => {
                if (!iso) return <div key={`pad-${i}`} />;
                const day = fromISO(iso).getUTCDate();
                const endpoint = isEndpoint(iso);
                const within = inRange(iso) && !endpoint;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pickDay(iso)}
                    className={`text-sm rounded py-1 tabular-nums transition-colors ${
                      endpoint
                        ? 'bg-valorant-red text-white font-semibold'
                        : within
                          ? 'bg-valorant-red/25 text-white'
                          : 'hover:bg-valorant-panel2 text-valorant-accent'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-valorant-muted">
                {start && !end
                  ? 'Pick an end date'
                  : start && end
                    ? `${fmtShort(start)} – ${fmtShort(end)}`
                    : 'Pick a start date'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange(null, null)}
                  className="text-xs text-valorant-muted hover:text-white underline underline-offset-2"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-primary px-3 py-1 text-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
