import { useEffect, useRef, useState } from 'react';
import { MAPS } from '../constants';
import type { ValorantMap } from '../types';
import MapIcon from './MapIcon';

type Props = {
  value: ValorantMap | '';
  onChange: (map: ValorantMap | '') => void;
  className?: string;
  placeholder?: string;
  includeEmpty?: boolean;
  emptyLabel?: string;
};

export default function MapPicker({
  value,
  onChange,
  className,
  placeholder = '— Map —',
  includeEmpty,
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

  const select = (v: ValorantMap | '') => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center gap-2 text-left"
      >
        {value ? (
          <>
            <MapIcon map={value} width={28} height={18} className="shrink-0" />
            <span className="truncate">{value}</span>
          </>
        ) : (
          <span className="text-valorant-muted truncate">
            {includeEmpty ? emptyLabel : placeholder}
          </span>
        )}
        <span className="ml-auto text-valorant-muted shrink-0">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-96 overflow-auto bg-valorant-panel border border-white/10 rounded-md shadow-lg py-1">
          {includeEmpty && (
            <button
              type="button"
              onClick={() => select('')}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 ${
                value === '' ? 'bg-valorant-panel2' : ''
              }`}
            >
              <span className="inline-block w-7 h-[18px] rounded-sm border border-dashed border-white/20" />
              <span>{emptyLabel}</span>
            </button>
          )}
          {MAPS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => select(m)}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-valorant-panel2 ${
                m === value ? 'bg-valorant-panel2' : ''
              }`}
            >
              <MapIcon map={m} width={28} height={18} />
              <span>{m}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
