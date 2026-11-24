// Upper bound for the round-timeline sliders, in seconds — generous enough
// to cover a full 100s round plus the 45s spike timer.
export const TIMELINE_MAX_SECONDS = 150;

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Thumb-only styling so the transparent track of each stacked <input> lets
// clicks fall through to whichever thumb is nearest — the two handles share
// one visual bar instead of stacking as separate sliders.
const RANGE_THUMB_CLASS =
  'absolute inset-0 w-full m-0 appearance-none bg-transparent pointer-events-none ' +
  'outline-none focus:outline-none focus-visible:outline-none ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-valorant-red [&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 ' +
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-valorant-red [&::-moz-range-thumb]:border-0 ' +
  '[&::-moz-range-thumb]:cursor-pointer';

/** A single-bar dual-handle range slider. The two handles can never cross
 * (each clamps against the other), so there's no ambiguity about which one
 * a click should move — safe to render as one track instead of two. */
export default function TimelineRange({
  start,
  end,
  min,
  max,
  onChangeStart,
  onChangeEnd,
}: {
  start: number;
  end: number;
  min: number;
  max: number;
  onChangeStart: (v: number) => void;
  onChangeEnd: (v: number) => void;
}) {
  const span = max - min || 1;
  const startPct = ((start - min) / span) * 100;
  const endPct = ((end - min) / span) * 100;
  const mid = min + span / 2;
  return (
    <div className="relative flex-1 h-3.5">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-panel2" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-valorant-red"
        style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={start}
        onChange={(e) => onChangeStart(Math.min(Number(e.target.value), end))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: start > mid ? 5 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={end}
        onChange={(e) => onChangeEnd(Math.max(Number(e.target.value), start))}
        className={RANGE_THUMB_CLASS}
        style={{ zIndex: end > mid ? 3 : 5 }}
      />
    </div>
  );
}
