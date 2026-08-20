import { MAPS } from '../constants';
import type { GameStat, Round, RoundCategoryUser, Side, ValorantMap } from '../types';
import { halfInfo } from './rounds';

type TeamColor = 'Red' | 'Blue';

type TrackerStatValue = { value: number } | undefined;

type TrackerSegment = {
  type: string;
  attributes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  stats: Record<string, TrackerStatValue>;
};

export type TrackerImportedPlayer = {
  identifier: string; // e.g. "Generator#9393"
  name: string; // handle before the '#'
  team: TeamColor;
  agent: string;
  stat: Omit<GameStat, 'playerId'>;
};

export type TrackerImportResult = {
  map: ValorantMap | null;
  date: string; // yyyy-mm-dd
  /** The full parsed tracker.gg response, kept verbatim for storage alongside the extracted fields. */
  raw: unknown;
  teams: Record<
    TeamColor,
    { roundsWon: number; roundsLost: number; startingSide: Side | null }
  >;
  players: TrackerImportedPlayer[];
  /** One entry per played round, in order. */
  rounds: Array<{
    winner: TeamColor;
    planted: boolean;
    firstBloodTeam: TeamColor | null;
    /** Tracker identifier of the player who got the round's first kill. */
    firstBloodIdentifier: string | null;
    /** Tracker identifier of the player who died first this round. */
    firstDeathIdentifier: string | null;
    /** Tracker identifier of the player tagged as winning a 1vX clutch this round. */
    clutchWonIdentifier: string | null;
    /** Tracker identifier of the last player standing in a 1vX clutch they lost this round. */
    clutchLostIdentifier: string | null;
    /** Each team's players' loadout value (buy) for this round. */
    loadoutByTeam: Record<TeamColor, number[]>;
  }>;
};

function num(seg: TrackerSegment | undefined, key: string): number {
  const v = seg?.stats?.[key];
  return typeof v?.value === 'number' && isFinite(v.value) ? v.value : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Parses the JSON copied from tracker.gg's match API response (Network tab). */
export function parseTrackerMatchJson(raw: string): TrackerImportResult {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    throw new Error('That doesn’t look like valid JSON. Paste the full response body.');
  }
  const data = (root as { data?: unknown })?.data as
    | { metadata?: Record<string, unknown>; segments?: TrackerSegment[] }
    | undefined;
  const segments = data?.segments;
  if (!data || !Array.isArray(segments)) {
    throw new Error(
      'Unrecognized format — expected the tracker.gg match API response (an object with data.segments).'
    );
  }

  const metadata = data.metadata ?? {};
  const mapName = typeof metadata.mapName === 'string' ? metadata.mapName : '';
  const map = (MAPS as string[]).includes(mapName) ? (mapName as ValorantMap) : null;
  const dateStarted =
    typeof metadata.dateStarted === 'string' ? metadata.dateStarted : '';
  const date = dateStarted ? dateStarted.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const teamSummaries = segments.filter((s) => s.type === 'team-summary');
  const roundSummaries = segments
    .filter((s) => s.type === 'round-summary')
    .sort(
      (a, b) => (Number(a.attributes.round) || 0) - (Number(b.attributes.round) || 0)
    );
  const playerRounds = segments.filter((s) => s.type === 'player-round');
  const playerRoundKills = segments.filter((s) => s.type === 'player-round-kills');
  const playerSummaries = segments.filter((s) => s.type === 'player-summary');

  const teams: TrackerImportResult['teams'] = {
    Red: { roundsWon: 0, roundsLost: 0, startingSide: null },
    Blue: { roundsWon: 0, roundsLost: 0, startingSide: null },
  };
  for (const seg of teamSummaries) {
    const teamId = seg.attributes.teamId as TeamColor;
    if (teamId !== 'Red' && teamId !== 'Blue') continue;
    teams[teamId].roundsWon = num(seg, 'roundsWon');
    teams[teamId].roundsLost = num(seg, 'roundsLost');
  }

  // Determine each team's starting side from round-1 player-round entries.
  for (const seg of playerRounds) {
    if (Number(seg.attributes.round) !== 1) continue;
    const teamId = seg.metadata.teamId as TeamColor;
    const teamSide = seg.metadata.teamSide as string;
    if (teamId !== 'Red' && teamId !== 'Blue') continue;
    if (teams[teamId].startingSide) continue;
    teams[teamId].startingSide = teamSide === 'attacker' ? 'Attack' : 'Defense';
  }

  // teamId per player per round, needed to resolve first-blood team.
  const teamByPlayerRound = new Map<string, TeamColor>();
  for (const seg of playerRounds) {
    const roundNum = Number(seg.attributes.round);
    const identifier = seg.attributes.platformUserIdentifier as string;
    const teamId = seg.metadata.teamId as TeamColor;
    if (!identifier || (teamId !== 'Red' && teamId !== 'Blue')) continue;
    teamByPlayerRound.set(`${roundNum}:${identifier}`, teamId);
  }

  // Earliest kill per round -> first-blood (killer) / first-death (victim) identifiers.
  const firstKillByRound = new Map<
    number,
    { identifier: string; victimIdentifier: string | null; time: number }
  >();
  for (const seg of playerRoundKills) {
    const roundNum = Number(seg.attributes.round);
    const identifier = seg.attributes.platformUserIdentifier as string;
    const victimIdentifier =
      (seg.attributes.opponentPlatformUserIdentifier as string) ?? null;
    const time = Number(seg.metadata.roundTime);
    if (!identifier || !isFinite(time)) continue;
    const cur = firstKillByRound.get(roundNum);
    if (!cur || time < cur.time) {
      firstKillByRound.set(roundNum, { identifier, victimIdentifier, time });
    }
  }

  // Clutch tags live on player-summary segments as e.g.
  // { key: "clutch1v2", rounds: [8] } (won) or
  // { key: "clutchLost1v1", rounds: [8] } (lost, last player standing).
  // At most one of each is expected per round.
  const clutchWonByRound = new Map<number, string>();
  const clutchLostByRound = new Map<number, string>();
  for (const seg of playerSummaries) {
    const identifier = seg.attributes.platformUserIdentifier as string;
    if (!identifier) continue;
    const tags = Array.isArray((seg.metadata as { tags?: unknown }).tags)
      ? ((seg.metadata as { tags: unknown[] }).tags as Array<Record<string, unknown>>)
      : [];
    for (const tag of tags) {
      const key = typeof tag.key === 'string' ? tag.key : '';
      if (!key.startsWith('clutch')) continue;
      const roundsArr = Array.isArray(tag.rounds)
        ? (tag.rounds as unknown[]).filter((n): n is number => typeof n === 'number')
        : [];
      if (roundsArr.length === 0) continue;
      const target = key.startsWith('clutchLost') ? clutchLostByRound : clutchWonByRound;
      for (const rn of roundsArr) target.set(rn, identifier);
    }
  }

  // Loadout value (buy) per player per round, split by team.
  const loadoutByRoundTeam = new Map<string, number[]>();
  for (const seg of playerRounds) {
    const roundNum = Number(seg.attributes.round);
    const teamId = seg.metadata.teamId as TeamColor;
    if (teamId !== 'Red' && teamId !== 'Blue') continue;
    const key = `${roundNum}:${teamId}`;
    const arr = loadoutByRoundTeam.get(key) ?? [];
    arr.push(num(seg, 'loadoutValue'));
    loadoutByRoundTeam.set(key, arr);
  }

  const rounds: TrackerImportResult['rounds'] = roundSummaries.map((seg) => {
    const roundNum = Number(seg.attributes.round);
    const winner = (seg.stats.winningTeam as unknown as { value: string })?.value as
      | TeamColor
      | undefined;
    const planted = seg.metadata.plant != null;
    const fk = firstKillByRound.get(roundNum);
    const firstBloodTeam = fk
      ? teamByPlayerRound.get(`${roundNum}:${fk.identifier}`) ?? null
      : null;
    return {
      winner: winner === 'Blue' ? 'Blue' : 'Red',
      planted,
      firstBloodTeam,
      firstBloodIdentifier: fk?.identifier ?? null,
      firstDeathIdentifier: fk?.victimIdentifier ?? null,
      clutchWonIdentifier: clutchWonByRound.get(roundNum) ?? null,
      clutchLostIdentifier: clutchLostByRound.get(roundNum) ?? null,
      loadoutByTeam: {
        Red: loadoutByRoundTeam.get(`${roundNum}:Red`) ?? [],
        Blue: loadoutByRoundTeam.get(`${roundNum}:Blue`) ?? [],
      },
    };
  });

  const players: TrackerImportedPlayer[] = playerSummaries.map((seg) => {
    const identifier = seg.attributes.platformUserIdentifier as string;
    const name = identifier?.split('#')[0] ?? identifier ?? 'Unknown';
    const team = (seg.metadata.teamId as TeamColor) === 'Blue' ? 'Blue' : 'Red';
    const agent = typeof seg.metadata.agentName === 'string' ? seg.metadata.agentName : '';
    const multikills =
      num(seg, 'doubleKills') +
      num(seg, 'tripleKills') +
      num(seg, 'quadraKills') +
      num(seg, 'pentaKills');
    const stat: Omit<GameStat, 'playerId'> = {
      agent,
      acs: Math.round(num(seg, 'scorePerRound')),
      hsPercent: round1(num(seg, 'hsAccuracy')),
      kills: num(seg, 'kills'),
      deaths: num(seg, 'deaths'),
      assists: num(seg, 'assists'),
      damageDelta: Math.round(num(seg, 'damageDeltaPerRound')),
      adr: Math.round(num(seg, 'damagePerRound')),
      kastPercent: round1(num(seg, 'kast')),
      firstKills: num(seg, 'firstKills'),
      firstDeaths: num(seg, 'firstDeaths'),
      multikills,
    };
    return { identifier, name, team, agent, stat };
  });

  return { map, date, raw: root, teams, players, rounds };
}

function countAbove(loadouts: number[], threshold: number): number {
  return loadouts.filter((v) => v > threshold).length;
}

/**
 * Guesses the gun/save/force tag for a round from our team's loadout values.
 * Only applies to the rounds the app lets a user tag this way (pistols are
 * never overridden) — with exceptions handled specially here:
 * - A round is never tagged "force" if at least 3 players have a loadout
 *   over 4000 — that's a full buy (gun), not a force.
 * - Round 2 of a half (slot 1) is only ever force-eligible if the pistol was
 *   lost — winning the pistol always leaves it as antieco (categorizeRound's
 *   default), no matter how the team buys.
 * - Round 3 of a half (slot 2) is always bonus if both prior rounds were won.
 *   If both were lost, it can only be force if round 2 was itself a force —
 *   otherwise the team saved through round 2 and round 3 is a guaranteed gun
 *   round. If the first two rounds split (one win, one loss), the normal
 *   loadout-based force/gun check applies.
 */
function guessRoundCategory(
  idx: number,
  loadouts: number[],
  usResults: Array<'W' | 'L'>,
  priorCategories: Array<RoundCategoryUser | undefined>
): RoundCategoryUser | undefined {
  const info = halfInfo(idx);
  const slot = info?.slot;
  if (slot === 0) return undefined; // pistol — never overridden

  if (slot === 1) {
    const halfStart = idx - slot;
    if (usResults[halfStart] === 'W') return undefined; // won pistol -> always antieco
    if (loadouts.length === 0) return undefined;
    if (countAbove(loadouts, 4000) >= 3) return 'gun';
    return countAbove(loadouts, 1500) >= 3 ? 'force' : undefined;
  }

  if (slot === 2) {
    const halfStart = idx - slot;
    const r1 = usResults[halfStart];
    const r2 = usResults[halfStart + 1];
    if (r1 === 'W' && r2 === 'W') return undefined; // won both -> always bonus
    if (r1 === 'L' && r2 === 'L') {
      if (priorCategories[halfStart + 1] !== 'force') return 'gun';
      if (loadouts.length === 0) return undefined;
      if (countAbove(loadouts, 4000) >= 3) return 'gun';
      return loadouts.every((v) => v < 3000) ? undefined : 'force';
    }
    // Split: one round won, one lost.
    if (loadouts.length === 0) return undefined;
    if (countAbove(loadouts, 4000) >= 3) return 'gun';
    return loadouts.every((v) => v < 3000) ? undefined : 'force';
  }

  if (loadouts.length === 0) return undefined;
  if (countAbove(loadouts, 3900) >= 4) return 'gun';
  if (loadouts.every((v) => v < 3000)) return 'save';
  if (countAbove(loadouts, 4000) >= 3) return 'gun';
  return 'force';
}

/**
 * Builds our Round[] + startingSide for the given "us" team color.
 * `assignments` maps tracker.gg player identifiers to roster player ids (as
 * chosen in the import review UI) — used to attribute first blood/first
 * death to a specific one of our players when possible.
 */
export function projectRoundsForTeam(
  result: TrackerImportResult,
  usTeam: TeamColor,
  assignments: Record<string, string> = {}
): { startingSide: Side | undefined; rounds: Round[] } {
  const startingSide = result.teams[usTeam].startingSide ?? undefined;
  const usResults: Array<'W' | 'L'> = result.rounds.map((r) => (r.winner === usTeam ? 'W' : 'L'));
  const identifierTeam = new Map(result.players.map((p) => [p.identifier, p.team]));
  const categories: Array<RoundCategoryUser | undefined> = [];
  const rounds: Round[] = result.rounds.map((r, idx) => {
    const category = guessRoundCategory(idx, r.loadoutByTeam[usTeam], usResults, categories);
    categories.push(category);
    const weGotFirstBlood = r.firstBloodTeam ? r.firstBloodTeam === usTeam : undefined;

    // Only attribute a clutch when the tagged player is one of ours — either
    // one of our players won it, or one of our players was the last one
    // standing in a clutch they lost. Opponent-only clutches are left unset.
    let clutch: boolean | undefined;
    let clutchWon: boolean | undefined;
    let clutchPlayerId: string | undefined;
    if (r.clutchWonIdentifier && identifierTeam.get(r.clutchWonIdentifier) === usTeam) {
      clutch = true;
      clutchWon = true;
      clutchPlayerId = assignments[r.clutchWonIdentifier];
    } else if (r.clutchLostIdentifier && identifierTeam.get(r.clutchLostIdentifier) === usTeam) {
      clutch = true;
      clutchWon = false;
      clutchPlayerId = assignments[r.clutchLostIdentifier];
    }

    return {
      result: usResults[idx],
      planted: r.planted,
      firstBlood: weGotFirstBlood,
      firstBloodPlayerId: weGotFirstBlood
        ? (r.firstBloodIdentifier ? assignments[r.firstBloodIdentifier] : undefined)
        : undefined,
      firstDeathPlayerId:
        weGotFirstBlood === false
          ? (r.firstDeathIdentifier ? assignments[r.firstDeathIdentifier] : undefined)
          : undefined,
      clutch,
      clutchWon,
      clutchPlayerId,
      category,
    };
  });
  return { startingSide, rounds };
}
