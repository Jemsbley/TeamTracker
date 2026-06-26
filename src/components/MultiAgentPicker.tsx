import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AGENTS_BY_CLASS, CLASS_LABEL } from '../constants';
import type { AgentClass } from '../types';
import AgentIcon from './AgentIcon';

const DROPDOWN_WIDTH_PX = 576; // matches w-[36rem]
const VIEWPORT_PADDING = 8;

const CLASSES = Object.keys(AGENTS_BY_CLASS) as AgentClass[];

type Props = {
  values: string[];
  onChange: (agents: string[]) => void;
  className?: string;
  emptyLabel?: string;
};

export default function MultiAgentPicker({
  values,
  onChange,
  className,
  emptyLabel = 'All agents',
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

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

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setShiftPx(0);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const desiredWidth = Math.min(
      DROPDOWN_WIDTH_PX,
      viewportWidth - VIEWPORT_PADDING * 2
    );
    const overflowRight =
      rect.left + desiredWidth - (viewportWidth - VIEWPORT_PADDING);
    if (overflowRight > 0) {
      const maxShift = rect.left - VIEWPORT_PADDING;
      setShiftPx(-Math.min(overflowRight, maxShift));
    } else {
      setShiftPx(0);
    }
  }, [open]);

  const toggle = (a: string) => {
    if (values.includes(a)) onChange(values.filter((x) => x !== a));
    else onChange([...values, a]);
  };
  const clear = () => onChange([]);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center gap-2 text-left min-w-[12rem]"
      >
        {values.length === 0 ? (
          <span className="text-valorant-muted">{emptyLabel}</span>
        ) : values.length === 1 ? (
          <>
            <AgentIcon agent={values[0]} size={20} />
            <span>{values[0]}</span>
          </>
        ) : (
          <>
            <div className="flex items-center -space-x-1">
              {values.slice(0, 5).map((a) => (
                <AgentIcon
                  key={a}
                  agent={a}
                  size={18}
                  className="ring-1 ring-valorant-panel"
                />
              ))}
            </div>
            <span>{values.length} agents</span>
          </>
        )}
        <span className="ml-auto text-valorant-muted">▾</span>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 left-0 bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1 w-[36rem] max-w-[calc(100vw-1rem)]"
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
            <span>Clear (all agents)</span>
          </button>
          <div className="grid grid-cols-4 gap-x-1 gap-y-0.5 p-1">
            {CLASSES.map((cls) => (
              <div key={cls} className="min-w-0">
                <div className="px-2 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-valorant-muted">
                  {CLASS_LABEL[cls]}
                </div>
                {AGENTS_BY_CLASS[cls].map((a) => {
                  const selected = values.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggle(a)}
                      className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-sm rounded hover:bg-valorant-panel2 ${
                        selected ? 'bg-valorant-panel2/80' : ''
                      }`}
                    >
                      <AgentIcon agent={a} size={20} />
                      <span className="truncate flex-1">{a}</span>
                      {selected && (
                        <span className="text-[10px] text-valorant-red">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
