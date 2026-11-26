import { useId, useState, type MouseEvent } from 'react';

type Hover = { section: 'thead' | 'tbody'; row: number; col: number };

/** Background tints for the hovered row/column and the hovered cell itself. */
const LINE_BG = 'rgba(255, 255, 255, 0.025)';
const CELL_BG = 'rgba(255, 255, 255, 0.06)';

/**
 * Crosshair hover for a table: the cell under the pointer is highlighted,
 * along with its whole row and column. Spread `tableProps` onto the <table>
 * (merging `className`) and render `style` anywhere next to it.
 *
 * Columns are matched by position, so this assumes no colspans.
 */
export function useTableCrosshair() {
  const cls = `xh-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [hover, setHover] = useState<Hover | null>(null);

  const onMouseOver = (e: MouseEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest('td, th') as HTMLTableCellElement | null;
    const tr = cell?.parentElement as HTMLTableRowElement | null;
    const section = tr?.parentElement?.tagName.toLowerCase();
    if (!cell || !tr || (section !== 'thead' && section !== 'tbody')) return;
    const next: Hover = { section, row: tr.sectionRowIndex, col: cell.cellIndex };
    setHover((h) =>
      h && h.section === next.section && h.row === next.row && h.col === next.col ? h : next
    );
  };

  const style = hover ? (
    <style>{`
      .${cls} > ${hover.section} > tr:nth-child(${hover.row + 1}) > * { background-color: ${LINE_BG}; }
      .${cls} > * > tr > :nth-child(${hover.col + 1}) { background-color: ${LINE_BG}; }
      .${cls} > ${hover.section} > tr:nth-child(${hover.row + 1}) > :nth-child(${hover.col + 1}) { background-color: ${CELL_BG}; }
    `}</style>
  ) : null;

  return {
    tableProps: { className: cls, onMouseOver, onMouseLeave: () => setHover(null) },
    style,
  };
}
