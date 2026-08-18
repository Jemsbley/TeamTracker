const RATE_RED: [number, number, number] = [0xd5, 0x54, 0x54]; // #D55454, t=0
const RATE_YELLOW: [number, number, number] = [0xc4, 0xd5, 0x54]; // #C4D554, t=0.5
const RATE_GREEN: [number, number, number] = [0x42, 0xda, 0x81]; // #42DA81, t=1

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Two-segment interpolation: red (#D55454) at t=0, through yellow (#C4D554)
 * at t=0.5, to green (#42DA81) at t=1.
 */
export function rateColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [c0, c1] = clamped < 0.5 ? [RATE_RED, RATE_YELLOW] : [RATE_YELLOW, RATE_GREEN];
  const localT = clamped < 0.5 ? clamped / 0.5 : (clamped - 0.5) / 0.5;
  const r = lerpChannel(c0[0], c1[0], localT);
  const g = lerpChannel(c0[1], c1[1], localT);
  const b = lerpChannel(c0[2], c1[2], localT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Interpolate between a deep red (0%) and a vivid, deep green (100%).
 * Returns undefined when there's no sample (so the value renders neutral).
 */
export function pctColor(wins: number, total: number): string | undefined {
  if (total === 0) return undefined;
  return rateColor(wins / total);
}
