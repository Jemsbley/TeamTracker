import { AGENT_CLASS, CLASS_LABEL } from '../constants';
import type { AgentClass, Game, Player, Side, ValorantMap } from '../types';
import { sideOfRound } from './rounds';

/** Bomb sites tracker.gg reports. Most maps only use A and B. */
export const PLANT_SITES = ['A', 'B', 'C'] as const;
export type PlantSite = (typeof PLANT_SITES)[number];

/* ----------------------------------------------------------------- subjects */

/**
 * "Who" a round filter is about. Encoded as a single string so a subject can
 * live in the URL and sit in a flat multi-select alongside the other kinds:
 * `p:<playerId>`, `a:<Agent>`, `c:<agentClass>`.
 */
export type Subject =
  | { kind: 'player'; id: string }
  | { kind: 'agent'; agent: string }
  | { kind: 'class'; cls: AgentClass };

export function encodeSubject(s: Subject): string {
  if (s.kind === 'player') return `p:${s.id}`;
  if (s.kind === 'agent') return `a:${s.agent}`;
  return `c:${s.cls}`;
}

export function parseSubject(token: string): Subject | null {
  const value = token.slice(2);
  if (!value) return null;
  if (token.startsWith('p:')) return { kind: 'player', id: value };
  if (token.startsWith('a:')) return { kind: 'agent', agent: value };
  if (token.startsWith('c:')) {
    return value in CLASS_LABEL ? { kind: 'class', cls: value as AgentClass } : null;
  }
  return null;
}

export function subjectLabel(token: string, players: Player[]): string {
  const s = parseSubject(token);
  if (!s) return '—';
  if (s.kind === 'player') {
    return players.find((p) => p.id === s.id)?.name ?? 'Unknown player';
  }
  if (s.kind === 'agent') return s.agent;
  return CLASS_LABEL[s.cls];
}

/* ------------------------------------------------- per-round detail (raw JSON) */

type TeamColor = 'Red' | 'Blue';

type RawSegment = {
  type?: unknown;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stats?: Record<string, { value?: unknown } | undefined>;
};

/** One of our players' line for a single round. */
export type RoundActor = {
  identifier: string;
  /** Roster player this tracker.gg identifier resolves to, when known. */
  playerId?: string;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
};

export type RoundDetail = {
  plantSite?: PlantSite;
  /** Our team only — the opponent's per-round lines are never filtered on. */
  actors: RoundActor[];
};

/** Per-round detail for one game, index-aligned with `game.rounds`. */
export type GameDetail = { rounds: RoundDetail[] };

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function teamOf(v: unknown): TeamColor | null {
  return v === 'Red' || v === 'Blue' ? v : null;
}

function roundAttr(seg: RawSegment): number {
  const n = Number(seg.attributes?.round);
  return Number.isFinite(n) ? n : -1;
}

function statNum(seg: RawSegment, key: string): number {
  const v = seg.stats?.[key]?.value;
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

/**
 * Which tracker.gg team is us. Round-by-round results are the strongest
 * signal — 24 coin flips agreeing isn't a coincidence — so they win whenever
 * enough rounds were entered. Otherwise fall back to which side's agents the
 * imported stat lines came from.
 */
function resolveUsTeam(
  game: Game,
  summaries: Array<{ team: TeamColor; agent: string }>,
  winners: Array<TeamColor | null>
): TeamColor | null {
  const rounds = game.rounds ?? [];
  let agreeRed = 0;
  let compared = 0;
  for (let i = 0; i < Math.min(rounds.length, winners.length); i++) {
    const result = rounds[i]?.result;
    const winner = winners[i];
    if (!result || !winner) continue;
    compared += 1;
    if ((result === 'W') === (winner === 'Red')) agreeRed += 1;
  }
  if (compared >= 5) {
    if (agreeRed / compared >= 0.9) return 'Red';
    if (agreeRed / compared <= 0.1) return 'Blue';
  }

  const ourAgents = new Set(game.stats.map((s) => s.agent).filter(Boolean));
  let red = 0;
  let blue = 0;
  for (const s of summaries) {
    if (!s.agent || !ourAgents.has(s.agent)) continue;
    if (s.team === 'Red') red += 1;
    else blue += 1;
  }
  if (red === blue) return null;
  return red > blue ? 'Red' : 'Blue';
}

/**
 * Agent -> roster player for this game's stat lines. An agent picked up by two
 * stat rows is dropped rather than guessed at (never happens in a real match,
 * but stat lines are hand-editable).
 */
function playerIdByAgent(game: Game): Map<string, string> {
  const seen = new Map<string, string | null>();
  for (const s of game.stats) {
    if (!s.agent || !s.playerId) continue;
    seen.set(s.agent, seen.has(s.agent) ? null : s.playerId);
  }
  const out = new Map<string, string>();
  for (const [agent, id] of seen) if (id) out.set(agent, id);
  return out;
}

function buildGameDetail(game: Game): GameDetail | null {
  const segments = (game.rawJson as { data?: { segments?: unknown } } | null)
    ?.data?.segments;
  if (!Array.isArray(segments)) return null;
  const segs = segments as RawSegment[];

  const summaries: Array<{ identifier: string; team: TeamColor; agent: string }> = [];
  for (const s of segs) {
    if (s.type !== 'player-summary') continue;
    const identifier = str(s.attributes?.platformUserIdentifier);
    const team = teamOf(s.metadata?.teamId);
    if (!identifier || !team) continue;
    summaries.push({ identifier, team, agent: str(s.metadata?.agentName) });
  }
  if (summaries.length === 0) return null;

  // Sorted round-summary position is the index into game.rounds — the same
  // projection the tracker importer used when it wrote those rounds.
  const roundSegs = segs
    .filter((s) => s.type === 'round-summary')
    .sort((a, b) => roundAttr(a) - roundAttr(b));
  if (roundSegs.length === 0) return null;

  const winners = roundSegs.map((s) =>
    teamOf((s.stats?.winningTeam as { value?: unknown } | undefined)?.value)
  );
  const us = resolveUsTeam(game, summaries, winners);
  if (!us) return null;

  const byAgent = playerIdByAgent(game);
  const playerIdByIdentifier = new Map<string, string>();
  for (const s of summaries) {
    if (s.team !== us) continue;
    const id = byAgent.get(s.agent);
    if (id) playerIdByIdentifier.set(s.identifier, id);
  }

  const indexByRoundNumber = new Map<number, number>();
  roundSegs.forEach((s, i) => indexByRoundNumber.set(roundAttr(s), i));

  const rounds: RoundDetail[] = roundSegs.map((s) => {
    const plant = s.metadata?.plant as { site?: unknown } | null | undefined;
    const site = str(plant?.site).toUpperCase();
    return {
      plantSite: (PLANT_SITES as readonly string[]).includes(site)
        ? (site as PlantSite)
        : undefined,
      actors: [],
    };
  });

  for (const s of segs) {
    if (s.type !== 'player-round') continue;
    if (teamOf(s.metadata?.teamId) !== us) continue;
    const idx = indexByRoundNumber.get(roundAttr(s));
    if (idx === undefined) continue;
    const identifier = str(s.attributes?.platformUserIdentifier);
    rounds[idx].actors.push({
      identifier,
      playerId: playerIdByIdentifier.get(identifier),
      agent: str(s.metadata?.agentName),
      kills: statNum(s, 'kills'),
      deaths: statNum(s, 'deaths'),
      assists: statNum(s, 'assists'),
    });
  }

  return { rounds };
}

// Parsing a ~1MB tracker.gg blob per game on every filter keystroke is far too
// slow, and game objects are replaced wholesale by the store on every edit, so
// they're safe cache keys.
const detailCache = new WeakMap<Game, GameDetail | null>();

/** Per-round kill/death/assist/plant-site detail, or null if this game has no
 * usable tracker.gg response behind it (manual entry, or a foreign import). */
export function gameRoundDetail(game: Game): GameDetail | null {
  const cached = detailCache.get(game);
  if (cached !== undefined) return cached;
  const built = buildGameDetail(game);
  detailCache.set(game, built);
  return built;
}

/* ------------------------------------------------------------------ filters */

export type FirstEvent = 'any' | 'fb' | 'fd';
export type PlantMode = 'any' | 'yes' | 'no';
export type SideMode = 'both' | Side;

export type RoundPctFilters = {
  side: SideMode;
  firstEvent: FirstEvent;
  /** '' = any — otherwise the encoded subject the first kill/death must be. */
  firstSubject: string;
  maps: ValorantMap[];
  plant: PlantMode;
  /** Only meaningful when plant === 'yes'. Empty = any site. */
  plantSites: PlantSite[];
  /** '' = off. Rounds where this subject got a multikill (3+ kills). */
  multikill: string;
  /** Every listed subject must have gotten a kill in the round. */
  kills: string[];
  /** Every listed subject must have died in the round. */
  deaths: string[];
  /** Every listed subject must have gotten an assist in the round. */
  assists: string[];
};

/** True if any filter needs data that only lives in a tracker.gg response. */
export function needsRoundDetail(f: RoundPctFilters): boolean {
  return (
    (f.plant === 'yes' && f.plantSites.length > 0) ||
    f.multikill !== '' ||
    f.kills.length > 0 ||
    f.deaths.length > 0 ||
    f.assists.length > 0
  );
}

/* --------------------------------------------------------------- evaluation */

type ActorField = 'kills' | 'deaths' | 'assists' | 'multikill';

/** True if `token`'s subject did `field` at least once this round. */
function subjectActed(token: string, actors: RoundActor[], field: ActorField): boolean {
  const s = parseSubject(token);
  if (!s) return true; // unparseable token acts as "no constraint"
  return actors.some((a) => {
    if (s.kind === 'player' && a.playerId !== s.id) return false;
    if (s.kind === 'agent' && a.agent !== s.agent) return false;
    if (s.kind === 'class' && AGENT_CLASS[a.agent] !== s.cls) return false;
    if (field === 'multikill') return a.kills >= 3;
    return a[field] >= 1;
  });
}

/** True if `token`'s subject is the roster player `playerId` was in this game. */
function subjectIsPlayer(
  token: string,
  playerId: string | undefined,
  agentByPlayer: Map<string, string>
): boolean {
  const s = parseSubject(token);
  if (!s) return true;
  if (!playerId) return false;
  if (s.kind === 'player') return playerId === s.id;
  const agent = agentByPlayer.get(playerId);
  if (!agent) return false;
  if (s.kind === 'agent') return agent === s.agent;
  return AGENT_CLASS[agent] === s.cls;
}

export type Tally = { wins: number; total: number };

export type MatchedGame = {
  game: Game;
  /** 1-based round numbers that matched, in order. */
  rounds: number[];
  wins: number;
};

export type RoundPctResult = {
  overall: Tally;
  /** Every played round in scope, ignoring the tab's own filters. */
  baseline: Tally;
  bySide: Record<Side, Tally>;
  byMap: Array<{ map: ValorantMap; tally: Tally }>;
  matches: MatchedGame[];
  /** Maps that could be searched for matching rounds. */
  gamesConsidered: number;
  /** Maps skipped because a filter needed detail they don't carry. */
  gamesWithoutDetail: number;
};

function bump(t: Tally, won: boolean) {
  t.total += 1;
  if (won) t.wins += 1;
}

export function evaluateRoundPct(games: Game[], f: RoundPctFilters): RoundPctResult {
  const needDetail = needsRoundDetail(f);
  const overall: Tally = { wins: 0, total: 0 };
  const baseline: Tally = { wins: 0, total: 0 };
  const bySide: Record<Side, Tally> = {
    Attack: { wins: 0, total: 0 },
    Defense: { wins: 0, total: 0 },
  };
  const mapTallies = new Map<ValorantMap, Tally>();
  const matches: MatchedGame[] = [];
  let gamesConsidered = 0;
  let gamesWithoutDetail = 0;

  for (const game of games) {
    const rounds = game.rounds ?? [];
    for (const r of rounds) {
      if (r?.result) bump(baseline, r.result === 'W');
    }

    if (f.maps.length > 0 && !f.maps.includes(game.map)) continue;

    const detail = needDetail ? gameRoundDetail(game) : null;
    if (needDetail && !detail) {
      gamesWithoutDetail += 1;
      continue;
    }
    gamesConsidered += 1;

    const agentByPlayer = new Map(
      game.stats.filter((s) => s.playerId && s.agent).map((s) => [s.playerId, s.agent])
    );
    const matchedRounds: number[] = [];
    let matchedWins = 0;

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      if (!r?.result) continue;

      const side = game.startingSide ? sideOfRound(i, game.startingSide) : null;
      if (f.side !== 'both' && side !== f.side) continue;

      if (f.firstEvent === 'fb') {
        if (r.firstBlood !== true) continue;
        if (f.firstSubject && !subjectIsPlayer(f.firstSubject, r.firstBloodPlayerId, agentByPlayer))
          continue;
      } else if (f.firstEvent === 'fd') {
        if (r.firstBlood !== false) continue;
        if (f.firstSubject && !subjectIsPlayer(f.firstSubject, r.firstDeathPlayerId, agentByPlayer))
          continue;
      }

      if (f.plant === 'yes' && r.planted !== true) continue;
      if (f.plant === 'no' && r.planted === true) continue;

      const rd = detail?.rounds[i];
      if (f.plant === 'yes' && f.plantSites.length > 0) {
        if (!rd?.plantSite || !f.plantSites.includes(rd.plantSite)) continue;
      }
      // A round the tracker response doesn't cover can't satisfy an actor
      // filter, so drop it rather than let it through unchecked.
      if (needDetail && !rd) continue;
      const actors = rd?.actors ?? [];

      if (f.multikill && !subjectActed(f.multikill, actors, 'multikill')) continue;
      if (!f.kills.every((s) => subjectActed(s, actors, 'kills'))) continue;
      if (!f.deaths.every((s) => subjectActed(s, actors, 'deaths'))) continue;
      if (!f.assists.every((s) => subjectActed(s, actors, 'assists'))) continue;

      const won = r.result === 'W';
      bump(overall, won);
      if (side) bump(bySide[side], won);
      let mapTally = mapTallies.get(game.map);
      if (!mapTally) {
        mapTally = { wins: 0, total: 0 };
        mapTallies.set(game.map, mapTally);
      }
      bump(mapTally, won);
      matchedRounds.push(i + 1);
      if (won) matchedWins += 1;
    }

    if (matchedRounds.length > 0) {
      matches.push({ game, rounds: matchedRounds, wins: matchedWins });
    }
  }

  const byMap = [...mapTallies.entries()]
    .map(([map, tally]) => ({ map, tally }))
    .sort((a, b) => b.tally.total - a.tally.total || a.map.localeCompare(b.map));

  return {
    overall,
    baseline,
    bySide,
    byMap,
    matches,
    gamesConsidered,
    gamesWithoutDetail,
  };
}
