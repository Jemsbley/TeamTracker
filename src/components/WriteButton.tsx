import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Shown on hover for any control a view-only user can't use. */
export const WRITE_TOOLTIP =
  'You have view-only access — ask your roster manager for edit permission.';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Whether the current user may perform this write action. */
  canEdit: boolean;
  children: ReactNode;
};

/**
 * A button that, when the user lacks write access, is greyed out, disabled,
 * and shows an explanatory tooltip. A disabled <button> swallows its own
 * `title`, so when blocked we wrap it in a span that carries the tooltip
 * (the span still receives hover events over the inert button).
 */
export default function WriteButton({
  canEdit,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  const blocked = !canEdit;
  const button = (
    <button
      {...rest}
      disabled={blocked || disabled}
      className={`${className} ${blocked ? 'opacity-50 cursor-not-allowed' : ''}`.trim()}
    >
      {children}
    </button>
  );
  if (!blocked) return button;
  return (
    <span title={WRITE_TOOLTIP} className="inline-block cursor-not-allowed">
      {button}
    </span>
  );
}
