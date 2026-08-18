import { useEffect, useRef, useState } from 'react';
import { MAPS } from '../constants';
import type { ValorantMap } from '../types';
import MapIcon from './MapIcon';

type Props = {
  values: ValorantMap[];
  onChange: (maps: ValorantMap[]) => void;
  className?: string;
  emptyLabel?: string;
};

/** Multi-select map dropdown, mirroring MultiAgentPicker's UX for a flat map list. */
export default function MultiMapPicker({
  values,
  onChange,
  className,
  emptyLabel = 'All maps',
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const toggle = (m: ValorantMap) => {
    if (values.includes(m)) onChange(values.filter((x) => x !== m));
    else onChange([...values, m]);
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
            <MapIcon map={values[0]} width={24} height={16} />
            <span>{values[0]}</span>
          </>
        ) : (
          <span>{values.length} maps</span>
        )}
        <span className="ml-auto text-valorant-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-72 max-h-96 overflow-auto bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1">
          <button
            type="button"
            onClick={clear}
            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 border-b border-white/5 ${
              values.length === 0 ? 'bg-valorant-panel2' : ''
            }`}
          >
            <span className="inline-block w-7 h-[16px] rounded-sm border border-dashed border-white/20" />
            <span>Clear ({emptyLabel.toLowerCase()})</span>
          </button>
          {MAPS.map((m) => {
            const selected = values.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggle(m)}
                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 ${
                  selected ? 'bg-valorant-panel2/80' : ''
                }`}
              >
                <MapIcon map={m} width={28} height={18} />
                <span className="flex-1 truncate">{m}</span>
                {selected && <span className="text-xs text-valorant-red">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
