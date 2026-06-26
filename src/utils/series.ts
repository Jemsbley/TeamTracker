import type { Game, Series, SeriesFormat } from '../types';
import { FORMAT_TO_WIN } from '../types';
import { deriveScore } from './rounds';

/** Returns [our map wins, opponent map wins] across decided games. */
export function mapScore(games: Game[]): [number, number] {
  let w = 0;
  let l = 0;
  for (const g of games) {
    const sc =
      deriveScore(g) ??
      (g.scoreFor !== undefined && g.scoreAgainst !== undefined
        ? ([g.scoreFor, g.scoreAgainst] as [number, number])
        : undefined);
    if (!sc) continue;
    if (sc[0] > sc[1]) w += 1;
    else if (sc[0] < sc[1]) l += 1;
  }
  return [w, l];
}

export type SeriesStatus =
  | { kind: 'won'; mapsFor: number; mapsAgainst: number }
  | { kind: 'lost'; mapsFor: number; mapsAgainst: number }
  | { kind: 'in_progress'; mapsFor: number; mapsAgainst: number; toWin: number }
  | { kind: 'unset'; mapsFor: number; mapsAgainst: number };

export function seriesStatus(series: Series, games: Game[]): SeriesStatus {
  const [mapsFor, mapsAgainst] = mapScore(games);
  if (!series.format) return { kind: 'unset', mapsFor, mapsAgainst };
  const toWin = FORMAT_TO_WIN[series.format as SeriesFormat];
  if (mapsFor >= toWin)
    return { kind: 'won', mapsFor, mapsAgainst };
  if (mapsAgainst >= toWin)
    return { kind: 'lost', mapsFor, mapsAgainst };
  return { kind: 'in_progress', mapsFor, mapsAgainst, toWin };
}
