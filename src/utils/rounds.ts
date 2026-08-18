import type { Game, Round, Side } from '../types';

export const HALF_LENGTH = 12;

export type RoundCategory =
  | 'pistol'
  | 'antieco'
  | 'eco'
  | 'bonus'
  | 'antibonus'
  | 'gun'
  | 'save'
  | 'force'
  | 'other';

export const CATEGORY_LABEL: Record<RoundCategory, string> = {
  pistol: 'Pistol',
  antieco: 'Antieco',
  eco: 'Eco',
  bonus: 'Bonus',
  antibonus: 'Antibonus',
  gun: 'Gun',
  save: 'Save',
  force: 'Force',
  other: '—',
};

/** Which slot of which half a round index belongs to. Returns null for OT. */
export function halfInfo(idx: number): { half: 1 | 2; slot: number } | null {
  if (idx < HALF_LENGTH) return { half: 1, slot: idx };
  if (idx < HALF_LENGTH * 2) return { half: 2, slot: idx - HALF_LENGTH };
  return null; // OT round
}

/** What side played a given round index, given the starting side. */
export function sideOfRound(idx: number, startingSide: Side): Side {
  const info = halfInfo(idx);
  if (info) {
    if (info.half === 1) return startingSide;
    return startingSide === 'Attack' ? 'Defense' : 'Attack';
  }
  // OT: alternate every round, starting with whichever side is "first OT side".
  // Convention: Round 25 (idx 24) is opposite of starting side; alternate from there.
  const otIdx = idx - HALF_LENGTH * 2;
  const firstOtIsStarting = otIdx % 2 === 0;
  if (startingSide === 'Attack') {
    return firstOtIsStarting ? 'Defense' : 'Attack';
  } else {
    return firstOtIsStarting ? 'Attack' : 'Defense';
  }
}

/** Categorize a round based on its position and the half's first two rounds. */
export function categorizeRound(rounds: Round[], idx: number): RoundCategory {
  const info = halfInfo(idx);
  if (!info) {
    // OT: user-tagged gun/save/force
    const r = rounds[idx];
    if (r?.category === 'gun') return 'gun';
    if (r?.category === 'save') return 'save';
    if (r?.category === 'force') return 'force';
    return 'other';
  }
  const { slot } = info;
  const halfStart = idx - slot;
  const r1 = rounds[halfStart]?.result;
  const r2 = rounds[halfStart + 1]?.result;

  if (slot === 0) return 'pistol';
  if (slot === 1) {
    if (rounds[idx]?.category === 'gun') return 'gun';
    if (rounds[idx]?.category === 'save') return 'save';
    if (rounds[idx]?.category === 'force') return 'force';
    if (r1 === 'W') return 'antieco';
    if (r1 === 'L') return 'eco';
    return 'other';
  }
  if (slot === 2) {
    if (rounds[idx]?.category === 'gun') return 'gun';
    if (rounds[idx]?.category === 'save') return 'save';
    if (rounds[idx]?.category === 'force') return 'force';
    if (r1 === 'W' && r2 === 'W') return 'bonus';
    if (r1 === 'L' && r2 === 'L') return 'antibonus';
    return 'other';
  }
  // slots 3-11
  const r = rounds[idx];
  if (r?.category === 'gun') return 'gun';
  if (r?.category === 'save') return 'save';
  if (r?.category === 'force') return 'force';
  return 'other';
}

/** True if this round position is a "user-marks-as-gun-or-save" slot. */
export function isUserCategorizedSlot(idx: number): boolean {
  const info = halfInfo(idx);
  if (!info) return true; // OT
  return info.slot >= 3;
}

/**
 * True if this round position can be tagged "force" — any round except the
 * first round of a half (the pistol round). OT rounds are always eligible.
 */
export function isForceEligibleSlot(idx: number): boolean {
  const info = halfInfo(idx);
  if (!info) return true; // OT
  return info.slot >= 1;
}

export type RoundEconomy = {
  attackPistol: { wins: number; total: number };
  defensePistol: { wins: number; total: number };
  antieco: { wins: number; total: number };
  eco: { wins: number; total: number };
  bonus: { wins: number; total: number };
  antibonus: { wins: number; total: number };
  gun: { wins: number; total: number };
  save: { wins: number; total: number };
  force: { wins: number; total: number };
  /** Rounds where we got first blood (FB=true). */
  firstBlood: { wins: number; total: number };
  /** Played rounds where we did NOT get first blood (FB=false or unset). */
  noFirstBlood: { wins: number; total: number };
  /** Rounds where one of our players won a marked 1vX clutch. */
  clutch: { wins: number; total: number };
  /** Attack-side rounds. plants = we planted; postplantWins = won after our plant. */
  attack: { rounds: number; plants: number; postplantWins: number };
  /** Defense-side rounds. plantsAllowed = opp planted; retakeWins = won after opp planted. */
  defense: { rounds: number; plantsAllowed: number; retakeWins: number };
  /** Total played rounds (any category) */
  total: number;
  totalWins: number;
};

const blank = (): RoundEconomy => ({
  attackPistol: { wins: 0, total: 0 },
  defensePistol: { wins: 0, total: 0 },
  antieco: { wins: 0, total: 0 },
  eco: { wins: 0, total: 0 },
  bonus: { wins: 0, total: 0 },
  antibonus: { wins: 0, total: 0 },
  gun: { wins: 0, total: 0 },
  save: { wins: 0, total: 0 },
  force: { wins: 0, total: 0 },
  firstBlood: { wins: 0, total: 0 },
  noFirstBlood: { wins: 0, total: 0 },
  clutch: { wins: 0, total: 0 },
  attack: { rounds: 0, plants: 0, postplantWins: 0 },
  defense: { rounds: 0, plantsAllowed: 0, retakeWins: 0 },
  total: 0,
  totalWins: 0,
});

export function gameEconomy(game: Game): RoundEconomy {
  const eco = blank();
  const rounds = game.rounds ?? [];
  const startingSide = game.startingSide;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (!r?.result) continue;
    const cat = categorizeRound(rounds, i);
    const won = r.result === 'W';
    eco.total += 1;
    if (won) eco.totalWins += 1;
    const fb = r.firstBlood === true;
    if (fb) {
      eco.firstBlood.total += 1;
      if (won) eco.firstBlood.wins += 1;
    } else {
      eco.noFirstBlood.total += 1;
      if (won) eco.noFirstBlood.wins += 1;
    }
    if (r.clutch === true) {
      eco.clutch.total += 1;
      if (effectiveClutchWon(r)) eco.clutch.wins += 1;
    }
    if (cat === 'pistol' && startingSide) {
      const side = sideOfRound(i, startingSide);
      const bucket =
        side === 'Attack' ? eco.attackPistol : eco.defensePistol;
      bucket.total += 1;
      if (won) bucket.wins += 1;
    } else if (
      cat === 'antieco' ||
      cat === 'eco' ||
      cat === 'bonus' ||
      cat === 'antibonus' ||
      cat === 'gun' ||
      cat === 'save' ||
      cat === 'force'
    ) {
      const bucket = eco[cat];
      bucket.total += 1;
      if (won) bucket.wins += 1;
    }
    if (startingSide) {
      const side = sideOfRound(i, startingSide);
      const planted = r.planted === true;
      if (side === 'Attack') {
        eco.attack.rounds += 1;
        if (planted) {
          eco.attack.plants += 1;
          if (won) eco.attack.postplantWins += 1;
        }
      } else {
        eco.defense.rounds += 1;
        if (planted) {
          eco.defense.plantsAllowed += 1;
          if (won) eco.defense.retakeWins += 1;
        }
      }
    }
  }
  return eco;
}

export function mergeEconomy(a: RoundEconomy, b: RoundEconomy): RoundEconomy {
  const out = blank();
  (
    [
      'attackPistol',
      'defensePistol',
      'antieco',
      'eco',
      'bonus',
      'antibonus',
      'gun',
      'save',
      'force',
      'firstBlood',
      'noFirstBlood',
      'clutch',
    ] as const
  ).forEach((k) => {
    out[k] = {
      wins: a[k].wins + b[k].wins,
      total: a[k].total + b[k].total,
    };
  });
  out.attack = {
    rounds: a.attack.rounds + b.attack.rounds,
    plants: a.attack.plants + b.attack.plants,
    postplantWins: a.attack.postplantWins + b.attack.postplantWins,
  };
  out.defense = {
    rounds: a.defense.rounds + b.defense.rounds,
    plantsAllowed: a.defense.plantsAllowed + b.defense.plantsAllowed,
    retakeWins: a.defense.retakeWins + b.defense.retakeWins,
  };
  out.total = a.total + b.total;
  out.totalWins = a.totalWins + b.totalWins;
  return out;
}

export function aggregateEconomy(games: Game[]): RoundEconomy {
  return games.reduce<RoundEconomy>(
    (acc, g) => mergeEconomy(acc, gameEconomy(g)),
    blank()
  );
}

/**
 * Number of rounds that should be displayed/considered "played" given the
 * current entries. If a contiguous prefix of rounds completes the game (first
 * to 13 with a 2+ lead in regulation; in OT, decided after each completed
 * pair), returns the index just past the deciding round. Otherwise returns
 * the natural length: 24 for regulation or rounds.length if OT pairs were
 * appended.
 *
 * Empty rounds before the deciding round taint the scan and prevent early
 * truncation, so partially-entered games don't get cut off.
 */
export function visibleRoundCount(rounds: Round[]): number {
  let our = 0;
  let opp = 0;
  let tainted = false;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (!r?.result) {
      tainted = true;
      continue;
    }
    if (r.result === 'W') our += 1;
    else opp += 1;
    if (tainted) continue;
    if (i < HALF_LENGTH * 2) {
      if (our >= 13 && our - opp >= 2) return i + 1;
      if (opp >= 13 && opp - our >= 2) return i + 1;
    } else {
      const otIdx = i - HALF_LENGTH * 2;
      if (otIdx % 2 === 1 && Math.abs(our - opp) >= 2) return i + 1;
    }
  }
  return Math.max(rounds.length, HALF_LENGTH * 2);
}

/** Score [our, opponent] derived from rounds; returns undefined if no rounds. */
export function deriveScore(game: Game): [number, number] | undefined {
  if (!game.rounds || game.rounds.length === 0) return undefined;
  let f = 0;
  let a = 0;
  for (const r of game.rounds) {
    if (r.result === 'W') f += 1;
    else if (r.result === 'L') a += 1;
  }
  return [f, a];
}

/**
 * True if the running score ever equaled (us, them) at some point during the
 * map — not just at the final score. Falls back to comparing the final
 * manual score when no round-by-round data was entered.
 */
export function scorelineOccurred(game: Game, us: number, them: number): boolean {
  const rounds = game.rounds;
  if (rounds && rounds.length > 0) {
    let f = 0;
    let a = 0;
    if (f === us && a === them) return true;
    for (const r of rounds) {
      if (!r.result) continue;
      if (r.result === 'W') f += 1;
      else a += 1;
      if (f === us && a === them) return true;
    }
    return false;
  }
  if (game.scoreFor !== undefined && game.scoreAgainst !== undefined) {
    return game.scoreFor === us && game.scoreAgainst === them;
  }
  return false;
}

export function pct(wins: number, total: number, digits = 0): string {
  if (!total) return '–';
  return `${((wins / total) * 100).toFixed(digits)}%`;
}

export function makeBlankRound(): Round {
  return { result: undefined, firstBlood: undefined };
}

/**
 * Whether a marked clutch round was won. Falls back to the round result for
 * older entries (including tracker.gg imports before clutchWon existed)
 * where clutch was tracked as a win-only flag with no explicit outcome.
 */
export function effectiveClutchWon(r: Round): boolean {
  return r.clutchWon !== undefined ? r.clutchWon : r.result === 'W';
}

/**
 * Total rounds played in a game, for use as the denominator of per-round
 * rates (first blood %, first death %, clutch %) — from round-by-round
 * entries when present, else from the manual score fields.
 */
export function roundsPlayedIn(game: Game): number {
  if (game.rounds && game.rounds.length) {
    return game.rounds.filter((r) => r.result).length;
  }
  if (game.scoreFor !== undefined && game.scoreAgainst !== undefined) {
    return game.scoreFor + game.scoreAgainst;
  }
  return 0;
}

/** Fields a single timeline condition can test on one round index. */
export type RoundConditionField =
  | 'result'
  | 'category'
  | 'firstBlood'
  | 'firstBloodPlayer'
  | 'firstDeathPlayer'
  | 'planted'
  | 'clutch'
  | 'clutchResult'
  | 'clutchPlayer';

export type RoundCondition = {
  id: string;
  /** Absent (not 'count') distinguishes this from a CountCondition. */
  kind?: 'round';
  /** 0-based round index (round 1 = 0). */
  roundIndex: number;
  field: RoundConditionField;
  /**
   * Encoded target value:
   * - result: 'W' | 'L'
   * - category: a RoundCategory
   * - firstBlood: 'us' | 'them'
   * - firstBloodPlayer / firstDeathPlayer / clutchPlayer: a Player id
   * - planted / clutch: 'yes' | 'no'
   * - clutchResult: 'won' | 'lost'
   */
  value: string;
};

export const ROUND_CONDITION_FIELD_LABEL: Record<RoundConditionField, string> = {
  result: 'Round result',
  category: 'Round category',
  firstBlood: 'First blood',
  firstBloodPlayer: 'First blood by',
  firstDeathPlayer: 'First death of',
  planted: 'Spike planted',
  clutch: 'Clutch',
  clutchResult: 'Clutch result',
  clutchPlayer: 'Clutch by',
};

/** True if the given game's round at `cond.roundIndex` satisfies `cond`. */
export function roundConditionMatches(game: Game, cond: RoundCondition): boolean {
  const rounds = game.rounds ?? [];
  const r = rounds[cond.roundIndex];
  if (!r) return false;
  switch (cond.field) {
    case 'result':
      return r.result === cond.value;
    case 'category':
      return categorizeRound(rounds, cond.roundIndex) === cond.value;
    case 'firstBlood':
      return cond.value === 'us' ? r.firstBlood === true : r.firstBlood === false;
    case 'firstBloodPlayer':
      return !!r.firstBloodPlayerId && r.firstBloodPlayerId === cond.value;
    case 'firstDeathPlayer':
      return !!r.firstDeathPlayerId && r.firstDeathPlayerId === cond.value;
    case 'planted':
      return (r.planted === true) === (cond.value === 'yes');
    case 'clutch':
      return (r.clutch === true) === (cond.value === 'yes');
    case 'clutchResult':
      return r.clutch === true && effectiveClutchWon(r) === (cond.value === 'won');
    case 'clutchPlayer':
      return !!r.clutchPlayerId && r.clutchPlayerId === cond.value;
    default:
      return true;
  }
}

/** True if a game satisfies every condition in the list (empty list = always true). */
export function roundConditionsMatch(game: Game, conditions: RoundCondition[]): boolean {
  return conditions.every((c) => roundConditionMatches(game, c));
}

/** Per-player events a count condition can tally across a whole game. */
export type CountConditionField =
  | 'firstBloodPlayer'
  | 'firstDeathPlayer'
  | 'clutchWonPlayer'
  | 'clutchLostPlayer';

export const COUNT_CONDITION_FIELD_LABEL: Record<CountConditionField, string> = {
  firstBloodPlayer: 'First bloods by',
  firstDeathPlayer: 'First deaths of',
  clutchWonPlayer: 'Clutches won by',
  clutchLostPlayer: 'Clutches lost by',
};

/**
 * A frequency filter: match games where a player's tally of some event
 * reaches at least `count` across the whole game, regardless of which
 * round(s) it happened in — e.g. "2+ clutches lost by Player1 in a map".
 */
export type CountCondition = {
  id: string;
  kind: 'count';
  field: CountConditionField;
  playerId: string;
  count: number;
};

/** Any condition the round timeline / player filter can add to the list. */
export type TimelineCondition = RoundCondition | CountCondition;

export function countConditionMatches(game: Game, cond: CountCondition): boolean {
  const rounds = game.rounds ?? [];
  let n = 0;
  for (const r of rounds) {
    switch (cond.field) {
      case 'firstBloodPlayer':
        if (r.firstBloodPlayerId === cond.playerId) n += 1;
        break;
      case 'firstDeathPlayer':
        if (r.firstDeathPlayerId === cond.playerId) n += 1;
        break;
      case 'clutchWonPlayer':
        if (r.clutch === true && r.clutchPlayerId === cond.playerId && effectiveClutchWon(r)) {
          n += 1;
        }
        break;
      case 'clutchLostPlayer':
        if (r.clutch === true && r.clutchPlayerId === cond.playerId && !effectiveClutchWon(r)) {
          n += 1;
        }
        break;
    }
  }
  return n >= cond.count;
}

/** True if a game satisfies every round- or count-based condition in the list. */
export function timelineConditionsMatch(game: Game, conditions: TimelineCondition[]): boolean {
  return conditions.every((c) =>
    c.kind === 'count' ? countConditionMatches(game, c) : roundConditionMatches(game, c)
  );
}
