import type { AppState, Player, Roster, ScoutingReport } from '../types';
import { buildMockSeriesAndGames, shuffle } from './mockSeed';
import { DEFAULT_MIN_PLAYERS, scoutKey } from './scouting';
import { uid } from './uid';

const GUEST_ROSTER_NAME = 'Sample Roster';
const GUEST_PLAYER_NAMES = ['Zeta', 'Nova', 'Rift', 'Vex', 'Onyx'];
const SCOUTED_OPPONENTS: Array<{ teamName: string; tags: string[] }> = [
  { teamName: 'MIT Esports', tags: ['Tesla#MIT', 'Quark#MIT', 'Lambda#MIT', 'Sigma#MIT', 'Pixel#MIT'] },
  { teamName: 'Boston University', tags: ['Terrier#BU', 'Rhett#BU', 'Comm#BU', 'Kenmore#BU', 'Charles#BU'] },
];

/** Sample reports filled with generated matches, so guests see a finished one. */
function buildSampleScoutingReports(rosterId: string): ScoutingReport[] {
  return SCOUTED_OPPONENTS.map(({ teamName, tags }) => {
    const players: Player[] = tags.map((tag) => ({
      id: scoutKey(tag),
      rosterId,
      name: tag,
      isMainRoster: true,
    }));
    const { games } = buildMockSeriesAndGames(rosterId, players, []);
    const names = Object.fromEntries(tags.map((t) => [scoutKey(t), t]));
    const sample = shuffle(games).slice(0, 14);
    return {
      id: uid(),
      teamName,
      note: 'Sample scouting report',
      createdAt: new Date().toISOString().slice(0, 10),
      rosterId,
      tags,
      includeMR24: false,
      minPlayers: DEFAULT_MIN_PLAYERS,
      // Generated dates span months, so count them all rather than the default cutoff.
      since: sample.map((g) => g.date).sort()[0],
      matches: sample.map((g) => ({
          id: uid(),
          map: g.map,
          date: g.date,
          startingSide: g.startingSide,
          rounds: g.rounds ?? [],
          stats: g.stats,
          names,
        })),
    };
  });
}

/**
 * Locally-generated read-only data for guest ("window shopping") mode. No
 * network calls and no `myRole` on the roster, so every edit control in the
 * app is gated off the same way it is for admin read-only views.
 */
export function buildGuestSampleState(): AppState {
  const rosterId = uid();
  const roster: Roster = {
    id: rosterId,
    name: GUEST_ROSTER_NAME,
    isPrimary: true,
  };
  const players: Player[] = GUEST_PLAYER_NAMES.map((name) => ({
    id: uid(),
    rosterId,
    name,
    isMainRoster: true,
  }));

  const { series, games } = buildMockSeriesAndGames(rosterId, players, []);

  return {
    rosters: [roster],
    players,
    series,
    games,
    scoutingReports: buildSampleScoutingReports(rosterId),
  };
}
