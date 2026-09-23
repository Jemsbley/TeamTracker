import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AGENTS_BY_CLASS, CLASS_LABEL } from '../constants';
import type { AgentClass, Player } from '../types';
import { encodeSubject, parseSubject, subjectLabel } from '../utils/roundPct';
import AgentIcon from './AgentIcon';

const DROPDOWN_WIDTH_PX = 680; // matches w-[42.5rem]
const VIEWPORT_PADDING = 8;

const CLASSES = Object.keys(AGENTS_BY_CLASS) as AgentClass[];

type Props = {
  /** Encoded subject tokens (see utils/roundPct). */
  values: string[];
  onChange: (next: string[]) => void;
  players: Player[];
  /** Single-select closes on pick and replaces the selection. */
  multi?: boolean;
  /** Greyed out and unopenable — used when another filter hasn't enabled it yet. */
  disabled?: boolean;
  emptyLabel?: string;
  className?: string;
};

/**
 * Picks "who" a round filter is about: one of our roster players, a specific
 * agent, or a whole agent class. All three live in one dropdown because
 * they're interchangeable as filter subjects — an agent-class pick just casts
 * a wider net than a player pick.
 */
export default function SubjectPicker({
  values,
  onChange,
  players,
  multi = false,
  disabled = false,
  emptyLabel = 'Anyone',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

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

  // Same right-edge nudge MultiAgentPicker does — these dropdowns are wide
  // enough to run off-screen from a filter sitting near the right margin.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setShiftPx(0);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const desiredWidth = Math.min(DROPDOWN_WIDTH_PX, viewportWidth - VIEWPORT_PADDING * 2);
    const overflowRight = rect.left + desiredWidth - (viewportWidth - VIEWPORT_PADDING);
    setShiftPx(overflowRight > 0 ? -Math.min(overflowRight, rect.left - VIEWPORT_PADDING) : 0);
  }, [open]);

  const toggle = (token: string) => {
    if (!multi) {
      onChange(values[0] === token ? [] : [token]);
      setOpen(false);
      return;
    }
    onChange(
      values.includes(token) ? values.filter((v) => v !== token) : [...values, token]
    );
  };

  const clear = () => {
    onChange([]);
    if (!multi) setOpen(false);
  };

  const row = (token: string, icon: React.ReactNode, label: string) => {
    const selected = values.includes(token);
    return (
      <button
        key={token}
        type="button"
        onClick={() => toggle(token)}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-valorant-panel2 ${
          selected ? 'bg-valorant-panel2/80' : ''
        }`}
      >
        {icon}
        <span className="truncate flex-1">{label}</span>
        {selected && <span className="text-xs text-valorant-red">✓</span>}
      </button>
    );
  };

  const first = values[0] ? parseSubject(values[0]) : null;
  // Every pick is named in the trigger (truncated to one line) rather than
  // listed as chips underneath, so picking a second subject never changes the
  // control's height and reflows the filter card.
  const summary = values.map((v) => subjectLabel(v, players)).join(', ');

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={values.length > 0 ? summary : undefined}
        className={`input flex items-center gap-2 text-left ${
          disabled ? 'opacity-40 cursor-not-allowed' : ''
        }`}
      >
        {values.length === 0 ? (
          <span className="text-valorant-muted truncate">{emptyLabel}</span>
        ) : (
          <>
            {values.length === 1 && first?.kind === 'agent' && (
              <AgentIcon agent={first.agent} size={18} className="shrink-0" />
            )}
            <span className="truncate">{summary}</span>
          </>
        )}
        <span className="ml-auto text-valorant-muted shrink-0">▾</span>
      </button>
      {open && !disabled && (
        <div
          className="absolute z-30 mt-1 left-0 bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 w-[42.5rem] max-w-[calc(100vw-1rem)]"
          style={shiftPx ? { transform: `translateX(${shiftPx}px)` } : undefined}
        >
          <button
            type="button"
            onClick={clear}
            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 border-b border-white/5 ${
              values.length === 0 ? 'bg-valorant-panel2' : ''
            }`}
          >
            <span className="inline-block w-5 h-5 rounded-sm border border-dashed border-white/20" />
            <span>Clear ({emptyLabel.toLowerCase()})</span>
          </button>
          <div className="grid grid-cols-5 gap-x-1 gap-y-0.5 p-1">
            <div className="min-w-0">
              <div className="px-2 pt-1.5 pb-1 text-xs uppercase tracking-wider text-valorant-muted">
                Players
              </div>
              {players.length === 0 && (
                <div className="px-2 py-1 text-sm text-valorant-muted">None</div>
              )}
              {players.map((p) =>
                row(
                  encodeSubject({ kind: 'player', id: p.id }),
                  <span className="inline-flex w-5 h-5 shrink-0 items-center justify-center rounded-sm bg-white/5 text-[10px] font-semibold uppercase text-valorant-muted">
                    {p.name.slice(0, 2)}
                  </span>,
                  p.name
                )
              )}
              <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wider text-valorant-muted">
                Roles
              </div>
              {CLASSES.map((cls) =>
                row(
                  encodeSubject({ kind: 'class', cls }),
                  <span className="inline-block w-5 h-5 shrink-0" />,
                  CLASS_LABEL[cls]
                )
              )}
            </div>
            {CLASSES.map((cls) => (
              <div key={cls} className="min-w-0">
                <div className="px-2 pt-1.5 pb-1 text-xs uppercase tracking-wider text-valorant-muted">
                  {CLASS_LABEL[cls]}
                </div>
                {AGENTS_BY_CLASS[cls].map((a) =>
                  row(
                    encodeSubject({ kind: 'agent', agent: a }),
                    <AgentIcon agent={a} size={20} />,
                    a
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
