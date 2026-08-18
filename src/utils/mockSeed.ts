import { AGENTS_BY_CLASS, MAPS } from '../constants';
import {
  FORMAT_TO_WIN,
  type Game,
  type GameStat,
  type Player,
  type Round,
  type Series,
  type SeriesFormat,
  type SeriesPickBan,
  type Side,
  type ValorantMap,
} from '../types';
import { useStore } from '../store';
import { PICKBAN_STEPS, playedMaps } from './pickBan';

const ALL_AGENTS = Object.values(AGENTS_BY_CLASS).flat();

const OPPONENTS = [
  'Lesley University',
  'MIT Esports',
  'Northeastern',
  'Boston University',
  'Harvard',
  'Tufts',
  'Babson',
  'Suffolk',
  'Emerson',
  'Brandeis',
  'Bentley',
  'Wentworth',
  'WPI',
  'BC Esports',
  'Simmons',
  'Roger Williams',
  'UMass Boston',
  'UMass Lowell',
  'NEU Black',
  'BU Crimson',
];

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function dateNDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function flipSide(s: Side): Side {
  return s === 'Attack' ? 'Defense' : 'Attack';
}

type Baseline = {
  acs: number;
  hsPercent: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDelta: number;
  adr: number;
  kastPercent: number;
  firstKills: number;
  firstDeaths: number;
  multikills: number;
};

const DEFAULT_BASELINE: Baseline = {
  acs: 220,
  hsPercent: 22,
  kills: 16,
  deaths: 14,
  assists: 5,
  damageDelta: 0,
  adr: 140,
  kastPercent: 72,
  firstKills: 2.2,
  firstDeaths: 2,
  multikills: 1,
};

function computeBaselines(
  players: Player[],
  games: Game[]
): Map<string, Baseline> {
  const out = new Map<string, Baseline>();
  for (const p of players) {
    const stats = games.flatMap((g) => g.stats).filter((s) => s.playerId === p.id);
    if (stats.length === 0) {
      out.set(p.id, { ...DEFAULT_BASELINE });
      continue;
    }
    const avg = (key: keyof GameStat, fallback: number): number => {
      const values = stats
        .map((s) => (typeof s[key] === 'number' ? (s[key] as number) : NaN))
        .filter((v) => !Number.isNaN(v));
      if (values.length === 0) return fallback;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    out.set(p.id, {
      acs: avg('acs', DEFAULT_BASELINE.acs),
      hsPercent: avg('hsPercent', DEFAULT_BASELINE.hsPercent),
      kills: avg('kills', DEFAULT_BASELINE.kills),
      deaths: avg('deaths', DEFAULT_BASELINE.deaths),
      assists: avg('assists', DEFAULT_BASELINE.assists),
      damageDelta: avg('damageDelta', DEFAULT_BASELINE.damageDelta),
      adr: avg('adr' as keyof GameStat, DEFAULT_BASELINE.adr),
      kastPercent: avg('kastPercent', DEFAULT_BASELINE.kastPercent),
      firstKills: avg('firstKills', DEFAULT_BASELINE.firstKills),
      firstDeaths: avg('firstDeaths', DEFAULT_BASELINE.firstDeaths),
      multikills: avg('multikills', DEFAULT_BASELINE.multikills),
    });
  }
  return out;
}

function genStats(
  playerIds: string[],
  baselines: Map<string, Baseline>
): GameStat[] {
  const agents = shuffle(ALL_AGENTS).slice(0, 5);
  return playerIds.map((pid, i) => {
    const b = baselines.get(pid) ?? DEFAULT_BASELINE;
    return {
      playerId: pid,
      agent: agents[i],
      acs: clamp(Math.round(b.acs + randFloat(-50, 50)), 30, 600),
      hsPercent: clamp(Math.round(b.hsPercent + randFloat(-10, 10)), 0, 100),
      kills: clamp(Math.round(b.kills + randFloat(-5, 5)), 0, 50),
      deaths: clamp(Math.round(b.deaths + randFloat(-4, 4)), 1, 50),
      assists: clamp(Math.round(b.assists + randFloat(-3, 3)), 0, 30),
      damageDelta: clamp(Math.round(b.damageDelta + randFloat(-50, 50)), -300, 300),
      adr: clamp(Math.round(b.adr + randFloat(-30, 30)), 0, 300),
      kastPercent: clamp(Math.round(b.kastPercent + randFloat(-15, 15)), 0, 100),
      firstKills: clamp(Math.round(b.firstKills + randFloat(-2, 2)), 0, 10),
      firstDeaths: clamp(Math.round(b.firstDeaths + randFloat(-2, 2)), 0, 10),
      multikills: clamp(Math.round(b.multikills + randFloat(-1, 1)), 0, 8),
    };
  });
}

function sideOfRound(idx: number, starting: Side): Side {
  if (idx < 12) return starting;
  if (idx < 24) return flipSide(starting);
  const otIdx = idx - 24;
  return otIdx % 2 === 0 ? flipSide(starting) : starting;
}

function plantedFor(side: Side): boolean {
  // Attack rounds (we attack): we plant ~60% of the time
  // Defense rounds: opp plants ~50% of the time
  return Math.random() < (side === 'Attack' ? 0.6 : 0.5);
}

function categoryFor(idx: number): 'gun' | 'save' | 'force' | undefined {
  const slot = idx < 12 ? idx : idx < 24 ? idx - 12 : null;
  if (slot === 0) return undefined;
  if (slot === null || slot >= 3) {
    const roll = Math.random();
    if (roll < 0.6) return 'gun';
    if (roll < 0.85) return 'save';
    return 'force';
  }
  // Slots 1-2: occasionally tag as a force buy; otherwise auto-derived.
  return Math.random() < 0.2 ? 'force' : undefined;
}

function buildRound(idx: number, won: boolean, startingSide: Side): Round {
  return {
    result: won ? 'W' : 'L',
    firstBlood: Math.random() < 0.5,
    planted: plantedFor(sideOfRound(idx, startingSide)),
    category: categoryFor(idx),
  };
}

/**
 * Generate a regulation-decided game. winnerIsUs decides who wins.
 * Returns rounds: total = (winner score) + (loser score) where winner=13, loser ∈ [0,11].
 */
function genRegulation(winnerIsUs: boolean, startingSide: Side): Round[] {
  const targetOur = winnerIsUs ? 13 : randInt(0, 11);
  const targetOpp = winnerIsUs ? randInt(0, 11) : 13;
  const interior: boolean[] = [];
  for (let i = 0; i < (winnerIsUs ? targetOur - 1 : targetOpp - 1); i++) {
    interior.push(winnerIsUs);
  }
  for (let i = 0; i < (winnerIsUs ? targetOpp : targetOur); i++) {
    interior.push(!winnerIsUs);
  }
  const pattern = [...shuffle(interior), winnerIsUs];
  return pattern.map((won, i) => buildRound(i, won, startingSide));
}

/**
 * Generate an OT-decided game. Regulation ends 12-12. OT plays in pairs;
 * tied pairs continue, the deciding pair is 2-0 for the winner.
 */
function genOvertime(winnerIsUs: boolean, startingSide: Side): Round[] {
  // Total OT round count: 2, 4, or 6.
  const otRounds = rand([2, 4, 6]);

  // Regulation: 12 wins each, shuffled.
  const reg: boolean[] = [];
  for (let i = 0; i < 12; i++) reg.push(true);
  for (let i = 0; i < 12; i++) reg.push(false);
  const shuffledReg = shuffle(reg);

  // OT: tied pairs (1-1) until the last pair (2-0 for winner).
  const otPattern: boolean[] = [];
  const numPairs = otRounds / 2;
  for (let p = 0; p < numPairs - 1; p++) {
    if (Math.random() < 0.5) otPattern.push(true, false);
    else otPattern.push(false, true);
  }
  otPattern.push(winnerIsUs, winnerIsUs);

  const pattern = [...shuffledReg, ...otPattern];
  return pattern.map((won, i) => buildRound(i, won, startingSide));
}

function genPickBan(format: SeriesFormat): SeriesPickBan {
  const pool = shuffle(MAPS).slice(0, 7) as ValorantMap[];
  const team1: 'us' | 'opp' = Math.random() < 0.5 ? 'us' : 'opp';
  const steps = PICKBAN_STEPS[format];
  let remaining = [...pool];
  const moves: { map?: ValorantMap; side?: Side }[] = [];
  for (const step of steps) {
    const map = rand(remaining);
    remaining = remaining.filter((m) => m !== map);
    if (step.kind === 'pick') {
      const side: Side = Math.random() < 0.5 ? 'Attack' : 'Defense';
      moves.push({ map, side });
    } else {
      moves.push({ map });
    }
  }
  const deciderSide: Side = Math.random() < 0.5 ? 'Attack' : 'Defense';
  return { pool, team1, moves, deciderSide };
}

export function generateMockSeries(rosterId: string): {
  added: { series: number; games: number; otGames: number };
} {
  const state = useStore.getState();
  if (!state.rosters.find((r) => r.id === rosterId)) {
    throw new Error('Roster not found.');
  }
  const players = state.players.filter((p) => p.rosterId === rosterId);
  if (players.length < 5) {
    throw new Error('Need at least 5 players in this roster.');
  }

  // Build baselines from games tied to series in this roster
  const rosterSeriesIds = new Set(
    state.series.filter((s) => s.rosterId === rosterId).map((s) => s.id)
  );
  const rosterGames = state.games.filter((g) => rosterSeriesIds.has(g.seriesId));
  const baselines = computeBaselines(players, rosterGames);

  // Build a stable lineup from main roster, padded with subs if needed.
  const mainIds = players.filter((p) => p.isMainRoster).map((p) => p.id);
  const subIds = players.filter((p) => !p.isMainRoster).map((p) => p.id);
  const lineupIds = [...mainIds, ...subIds].slice(0, 5);
  if (lineupIds.length < 5) throw new Error('Need at least 5 players.');

  // Format distribution: 3 BO1, 15 BO3, 2 BO5
  const formats: SeriesFormat[] = shuffle([
    ...Array(3).fill('BO1'),
    ...Array(15).fill('BO3'),
    ...Array(2).fill('BO5'),
  ]) as SeriesFormat[];

  const opponents = shuffle(OPPONENTS);

  const newSeries: Series[] = [];
  const newGames: Game[] = [];

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i];
    const opponent = opponents[i] ?? `Opponent ${i + 1}`;
    const date = dateNDaysAgo(randInt(1, 90));
    const seriesId = uid();
    const pickBan = genPickBan(format);
    const summary = playedMaps(format, pickBan);
    const toWin = FORMAT_TO_WIN[format];

    let usMapWins = 0;
    let oppMapWins = 0;

    for (let mi = 0; mi < summary.length; mi++) {
      if (usMapWins >= toWin || oppMapWins >= toWin) break;
      const slot = summary[mi];
      const startingSide = slot.ourSide ?? 'Attack';
      const winnerIsUs = Math.random() < 0.55; // slight bias toward us
      const rounds = genRegulation(winnerIsUs, startingSide);

      if (winnerIsUs) usMapWins++;
      else oppMapWins++;

      newGames.push({
        id: uid(),
        seriesId,
        map: slot.map,
        date,
        startingSide,
        rounds,
        stats: genStats(lineupIds, baselines),
        order: mi + 1,
      });
    }

    newSeries.push({
      id: seriesId,
      rosterId,
      opponent,
      date,
      format,
      pickBan,
    });
  }

  // Convert exactly 6 random games to OT (preserving each game's winner).
  const targetOT = 6;
  const indices = shuffle(newGames.map((_, i) => i)).slice(0, targetOT);
  for (const idx of indices) {
    const g = newGames[idx];
    const ourScore = g.rounds!.filter((r) => r.result === 'W').length;
    const oppScore = g.rounds!.filter((r) => r.result === 'L').length;
    const winnerIsUs = ourScore > oppScore;
    g.rounds = genOvertime(winnerIsUs, g.startingSide ?? 'Attack');
  }

  // Persist via the store actions so the server stays in sync. We add each
  // series, then map the local seriesId placeholder to the real id returned
  // by addSeries before adding the games that belong to it.
  const { addSeries, addGame } = useStore.getState();
  const seriesIdMap = new Map<string, string>();
  for (const s of newSeries) {
    const { id: oldId, ...rest } = s;
    const created = addSeries(rest);
    seriesIdMap.set(oldId, created.id);
  }
  for (const g of newGames) {
    const realSeriesId = seriesIdMap.get(g.seriesId);
    if (!realSeriesId) continue;
    const { id: _oldId, order: _ignoredOrder, ...rest } = g;
    addGame({ ...rest, seriesId: realSeriesId });
  }

  return {
    added: {
      series: newSeries.length,
      games: newGames.length,
      otGames: targetOT,
    },
  };
}
