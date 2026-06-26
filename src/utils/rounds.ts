import type { Game, Round, Side } from '../types';

export const HALF_LENGTH = 12;

export type RoundCategory =
  | 'pistol'
  | 'force'
  | 'eco'
  | 'bonus'
  | 'antibonus'
  | 'gun'
  | 'save'
  | 'other';

export const CATEGORY_LABEL: Record<RoundCategory, string> = {
  pistol: 'Pistol',
  force: 'Antieco',
  eco: 'Eco',
  bonus: 'Bonus',
  antibonus: 'Antibonus',
  gun: 'Gun',
  save: 'Save',
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
    // OT: only user-tagged gun/save matters
    const r = rounds[idx];
    if (r?.category === 'gun') return 'gun';
    if (r?.category === 'save') return 'save';
    return 'other';
  }
  const { slot } = info;
  const halfStart = idx - slot;
  const r1 = rounds[halfStart]?.result;
  const r2 = rounds[halfStart + 1]?.result;

  if (slot === 0) return 'pistol';
  if (slot === 1) {
    if (r1 === 'W') return 'force';
    if (r1 === 'L') return 'eco';
    return 'other';
  }
  if (slot === 2) {
    if (r1 === 'W' && r2 === 'W') return 'bonus';
    if (r1 === 'L' && r2 === 'L') return 'antibonus';
    return 'other';
  }
  // slots 3-11
  const r = rounds[idx];
  if (r?.category === 'gun') return 'gun';
  if (r?.category === 'save') return 'save';
  return 'other';
}

/** True if this round position is a "user-marks-as-gun-or-save" slot. */
export function isUserCategorizedSlot(idx: number): boolean {
  const info = halfInfo(idx);
  if (!info) return true; // OT
  return info.slot >= 3;
}

export type RoundEconomy = {
  attackPistol: { wins: number; total: number };
  defensePistol: { wins: number; total: number };
  force: { wins: number; total: number };
  eco: { wins: number; total: number };
  bonus: { wins: number; total: number };
  antibonus: { wins: number; total: number };
  gun: { wins: number; total: number };
  save: { wins: number; total: number };
  /** Rounds where we got first blood (FB=true). */
  firstBlood: { wins: number; total: number };
  /** Played rounds where we did NOT get first blood (FB=false or unset). */
  noFirstBlood: { wins: number; total: number };
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
  force: { wins: 0, total: 0 },
  eco: { wins: 0, total: 0 },
  bonus: { wins: 0, total: 0 },
  antibonus: { wins: 0, total: 0 },
  gun: { wins: 0, total: 0 },
  save: { wins: 0, total: 0 },
  firstBlood: { wins: 0, total: 0 },
  noFirstBlood: { wins: 0, total: 0 },
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
    if (cat === 'pistol' && startingSide) {
      const side = sideOfRound(i, startingSide);
      const bucket =
        side === 'Attack' ? eco.attackPistol : eco.defensePistol;
      bucket.total += 1;
      if (won) bucket.wins += 1;
    } else if (
      cat === 'force' ||
      cat === 'eco' ||
      cat === 'bonus' ||
      cat === 'antibonus' ||
      cat === 'gun' ||
      cat === 'save'
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
      'force',
      'eco',
      'bonus',
      'antibonus',
      'gun',
      'save',
      'firstBlood',
      'noFirstBlood',
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

export function pct(wins: number, total: number, digits = 0): string {
  if (!total) return '–';
  return `${((wins / total) * 100).toFixed(digits)}%`;
}

export function makeBlankRound(): Round {
  return { result: undefined, firstBlood: undefined };
}
