import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  /** Shown when nothing is selected, e.g. "All players". */
  emptyLabel: string;
  /** Plural noun for the "3 players" summary when several are selected. */
  noun: string;
  /** Greyed out and unopenable — used when another filter hasn't enabled it yet. */
  disabled?: boolean;
  className?: string;
};

/** A dropdown of checkable options — the generic counterpart to
 * MultiAgentPicker for lists that aren't the full agent pool. An empty
 * selection means "no filter". */
export default function MultiSelect({
  values,
  options,
  onChange,
  emptyLabel,
  noun,
  disabled = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };

  const selected = options.filter((o) => values.includes(o.value));

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center gap-2 text-left disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {selected.length === 0 ? (
          <span className="text-valorant-muted truncate">{emptyLabel}</span>
        ) : selected.length === 1 ? (
          <>
            {selected[0].icon}
            <span className="truncate">{selected[0].label}</span>
          </>
        ) : (
          <span className="truncate">
            {selected.length} {noun}
          </span>
        )}
        <span className="ml-auto text-valorant-muted shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-full bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 max-h-80 overflow-y-auto">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap hover:bg-valorant-panel2 border-b border-white/5 ${
              values.length === 0 ? 'bg-valorant-panel2' : ''
            }`}
          >
            Clear ({emptyLabel.toLowerCase()})
          </button>
          {options.map((o) => {
            const isSelected = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap hover:bg-valorant-panel2 ${
                  isSelected ? 'bg-valorant-panel2/80' : ''
                }`}
              >
                {o.icon}
                <span className="flex-1">{o.label}</span>
                <span className="w-3 text-xs text-valorant-red">
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
