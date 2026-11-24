import { ALL_AGENTS } from '../constants';
import type { Game, ScoutingReport } from '../types';

/**
 * Spelling-insensitive key for an agent name: lowercase letters and digits
 * only, so "KAY/O", "Kayo" and "kay-o" all key to "kayo". Asset lookups go
 * through this so file names don't have to match display names exactly.
 */
export function agentKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const canonicalByKey = new Map(ALL_AGENTS.map((a) => [agentKey(a), a]));

/** The app's display name for an agent (as listed in constants.ts), from any
 * spelling of it — tracker.gg's, or one stored by an older version. Unknown
 * names come back unchanged. */
export function canonicalAgent(name: string): string {
  if (!name) return name;
  return canonicalByKey.get(agentKey(name)) ?? name;
}

/** A game with every stat line's agent under its canonical name. Returns the
 * same object when nothing needs renaming. */
export function withCanonicalAgents(game: Game): Game {
  if (game.stats.every((s) => canonicalAgent(s.agent) === s.agent)) return game;
  return { ...game, stats: game.stats.map((s) => ({ ...s, agent: canonicalAgent(s.agent) })) };
}

/** Original-format reports store hand-picked comps; put their agents under
 * canonical names too (older ones may say "Kayo"). */
export function reportWithCanonicalAgents(report: ScoutingReport): ScoutingReport {
  const maps = report.maps;
  if (!maps) return report;
  const same = maps.every((m) => m.comps.every((c) => c.every((a) => canonicalAgent(a) === a)));
  if (same) return report;
  return {
    ...report,
    maps: maps.map((m) => ({ ...m, comps: m.comps.map((c) => c.map(canonicalAgent)) })),
  };
}
