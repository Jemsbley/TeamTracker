import { distance } from 'fastest-levenshtein';
import type { Player } from '../types';
import type { TrackerImportedPlayer } from './trackerImport';

type TeamColor = 'Red' | 'Blue';

// Below this normalized similarity, a fuzzy name match is considered too
// weak to trust — the dropdown is left unset rather than guessing wrong.
const FUZZY_MATCH_THRESHOLD = 0.6;

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

/** True if this tracker player has a strong (non-fuzzy) signal pointing at some roster player. */
function hasStrongRosterSignal(tp: TrackerImportedPlayer, rosterPlayers: Player[]): boolean {
  const identifier = tp.identifier.toLowerCase();
  const name = tp.name.toLowerCase();
  return rosterPlayers.some(
    (rp) => (rp.lastSeenIgn && rp.lastSeenIgn.toLowerCase() === identifier) || rp.name.toLowerCase() === name
  );
}

/**
 * Guess which in-match side is "us" by checking, for each side, how many of
 * its players are recognizable against the roster — either because we've
 * seen that exact tracker.gg identifier assigned to a roster player before,
 * or because the tracker name matches a roster player's display name.
 */
export function guessUsTeam(
  trackerPlayers: TrackerImportedPlayer[],
  rosterPlayers: Player[]
): TeamColor | null {
  const redMatches = trackerPlayers.filter(
    (p) => p.team === 'Red' && hasStrongRosterSignal(p, rosterPlayers)
  ).length;
  const blueMatches = trackerPlayers.filter(
    (p) => p.team === 'Blue' && hasStrongRosterSignal(p, rosterPlayers)
  ).length;
  if (redMatches === 0 && blueMatches === 0) return null;
  return redMatches >= blueMatches ? 'Red' : 'Blue';
}

/**
 * Match tracker.gg players (one side of a match) to roster players, in
 * priority order:
 *   1. Exact match on the roster player's remembered tracker.gg identifier
 *      (from a previous import) — the strongest possible signal.
 *   2. Exact match on the roster player's current display name.
 *   3. Closest display name by string similarity, only if it clears
 *      FUZZY_MATCH_THRESHOLD — otherwise left unassigned for manual pick.
 * Each roster player is assigned to at most one tracker player.
 */
export function matchPlayersToRoster(
  usPlayers: TrackerImportedPlayer[],
  rosterPlayers: Player[]
): Record<string, string> {
  const assignments: Record<string, string> = {};
  const used = new Set<string>();

  const assign = (tp: TrackerImportedPlayer, rp: Player) => {
    assignments[tp.identifier] = rp.id;
    used.add(rp.id);
  };

  const unassigned = () => usPlayers.filter((p) => !assignments[p.identifier]);

  for (const tp of unassigned()) {
    const identifier = tp.identifier.toLowerCase();
    const match = rosterPlayers.find(
      (rp) => !used.has(rp.id) && rp.lastSeenIgn && rp.lastSeenIgn.toLowerCase() === identifier
    );
    if (match) assign(tp, match);
  }

  for (const tp of unassigned()) {
    const name = tp.name.toLowerCase();
    const match = rosterPlayers.find((rp) => !used.has(rp.id) && rp.name.toLowerCase() === name);
    if (match) assign(tp, match);
  }

  for (const tp of unassigned()) {
    const name = tp.name.toLowerCase();
    let best: Player | null = null;
    let bestScore = 0;
    for (const rp of rosterPlayers) {
      if (used.has(rp.id)) continue;
      const score = similarity(name, rp.name.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        best = rp;
      }
    }
    if (best && bestScore >= FUZZY_MATCH_THRESHOLD) assign(tp, best);
  }

  return assignments;
}
