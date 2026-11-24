import type { ReactNode } from 'react';

/** A small "?" badge that reveals its children as a tooltip on hover. */
export default function HelpTip({
  children,
  widthClass = 'w-64',
}: {
  children: ReactNode;
  /** Tailwind width class for the tooltip box. */
  widthClass?: string;
}) {
  return (
    <span className="group relative flex -translate-y-px">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/30 text-[10px] font-bold text-valorant-muted cursor-help">
        ?
      </span>
      <span
        className={`pointer-events-none absolute right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-2 z-20 ${widthClass} rounded-md border border-white/10 bg-valorant-panel px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 transition-opacity duration-100 group-hover:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}
