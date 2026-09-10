import { MAPS } from '../constants';
import type { AppState, Player, Roster, ScoutingReport, ValorantMap } from '../types';
import { buildMockSeriesAndGames, shuffle } from './mockSeed';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const GUEST_ROSTER_NAME = 'Sample Roster';
const GUEST_PLAYER_NAMES = ['Zeta', 'Nova', 'Rift', 'Vex', 'Onyx'];
const SCOUTED_OPPONENTS = ['MIT Esports', 'Boston University'];

function buildSampleScoutingReports(rosterId: string): ScoutingReport[] {
  return SCOUTED_OPPONENTS.map((teamName, i) => ({
    id: uid(),
    teamName,
    note: 'Sample scouting report',
    createdAt: new Date().toISOString().slice(0, 10),
    rosterId,
    maps: shuffle(MAPS)
      .slice(0, 3)
      .map((map: ValorantMap) => ({
        map,
        wins: Math.floor(Math.random() * 4) + (i === 0 ? 1 : 0),
        losses: Math.floor(Math.random() * 3),
        comps: [],
      })),
  }));
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
