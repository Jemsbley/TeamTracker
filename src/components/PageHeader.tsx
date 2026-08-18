import { Children, isValidElement, type ReactNode } from 'react';

type Props = {
  title: string;
  description?: ReactNode;
  /** Set false to size the title box to a fixed width (matched across every
   * page's title box, sized to the widest of them) instead of growing to
   * fill available space — use this when a child box should be the wide one
   * instead (mark it with `data-grow` to claim that space). Default true. */
  titleGrow?: boolean;
  /** The page's first horizontal control row (filters, sort menu, tabs…),
   * shown beside the title in plain, deliberately less prominent boxes. Each
   * direct child is boxed separately, so pass multiple children to show
   * several bubbles side by side (e.g. a filter, then a form). A child with
   * a `data-grow` prop fills remaining space instead of fitting its content. */
  children?: ReactNode;
};

/**
 * Shared page header: a large, bold title (+ optional description) in its
 * own prominent card, with the page's first control row beside it in plain
 * cards, one per direct child. Wraps to stack on narrow screens.
 */
export default function PageHeader({
  title,
  description,
  titleGrow = true,
  children,
}: Props) {
  const boxes = Children.toArray(children).filter(
    (child) => typeof child !== 'boolean'
  );
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div
        className={`card bg-valorant-panel2 border-4 border-valorant-red/50 flex flex-col justify-center ${
          titleGrow ? 'flex-1 min-w-[240px]' : 'w-[300px] shrink-0'
        }`}
      >
        <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
          {title}
        </h2>
        {description && (
          <div className="text-sm text-valorant-muted mt-1">{description}</div>
        )}
      </div>
      {boxes.map((box, i) => {
        const grow = isValidElement(box) && !!box.props['data-grow'];
        return (
          <div key={i} className={`card ${grow ? 'flex-1 min-w-[240px]' : 'shrink-0'}`}>
            {box}
          </div>
        );
      })}
    </div>
  );
}
