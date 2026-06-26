import type { Game } from '../types';

/** Player ID with the highest ACS in the game, or undefined if no stats. */
export function gameMvpPlayerId(game: Game): string | undefined {
  if (!game.stats.length) return undefined;
  let bestId: string | undefined;
  let bestAcs = -Infinity;
  for (const s of game.stats) {
    if (s.acs > bestAcs) {
      bestAcs = s.acs;
      bestId = s.playerId;
    }
  }
  return bestId;
}

/** Player ID with the highest avg ACS across the given games. */
export function seriesMvpPlayerId(games: Game[]): string | undefined {
  const totals = new Map<string, { sum: number; n: number }>();
  for (const g of games) {
    for (const s of g.stats) {
      const cur = totals.get(s.playerId) ?? { sum: 0, n: 0 };
      cur.sum += s.acs;
      cur.n += 1;
      totals.set(s.playerId, cur);
    }
  }
  let bestId: string | undefined;
  let bestAvg = -Infinity;
  for (const [id, { sum, n }] of totals) {
    if (n === 0) continue;
    const avg = sum / n;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestId = id;
    }
  }
  return bestId;
}
