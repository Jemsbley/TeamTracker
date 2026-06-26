import type { SeriesFormat, Side, ValorantMap } from '../types';

export type Team = 1 | 2;

export type PickBanStepDef = {
  team: Team;
  kind: 'ban' | 'pick';
};

/**
 * Veto sequences. The team that picks the map yields side-pick to the OTHER
 * team for `pick` steps. The remaining 7th map is the "decider" — its side is
 * picked by the team named in DECIDER_SIDE_TEAM.
 */
export const PICKBAN_STEPS: Record<SeriesFormat, PickBanStepDef[]> = {
  BO1: [
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
  ],
  BO3: [
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
    { team: 1, kind: 'pick' },
    { team: 2, kind: 'pick' },
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
  ],
  BO5: [
    { team: 1, kind: 'ban' },
    { team: 2, kind: 'ban' },
    { team: 1, kind: 'pick' },
    { team: 2, kind: 'pick' },
    { team: 1, kind: 'pick' },
    { team: 2, kind: 'pick' },
  ],
};

export const DECIDER_SIDE_TEAM: Record<SeriesFormat, Team> = {
  BO1: 1,
  BO3: 1,
  BO5: 2,
};

export const POOL_SIZE = 7;

/** For a pick step, the OTHER team picks the side. */
export function sidePickerForStep(step: PickBanStepDef): Team | undefined {
  if (step.kind !== 'pick') return undefined;
  return step.team === 1 ? 2 : 1;
}

export function otherSide(s: Side): Side {
  return s === 'Attack' ? 'Defense' : 'Attack';
}

/** Whether "us" is the given team, given team1. */
export function isUs(team: Team, team1: 'us' | 'opp'): boolean {
  return (team1 === 'us' && team === 1) || (team1 === 'opp' && team === 2);
}

/** Our team's starting side for a played map, given who picked the side and what they chose. */
export function ourStartingSide(
  sidePickerTeam: Team,
  sidePickerSide: Side,
  team1: 'us' | 'opp'
): Side {
  return isUs(sidePickerTeam, team1) ? sidePickerSide : otherSide(sidePickerSide);
}

export type PlayedMapSummary = {
  /** 1-based map number in series. */
  number: number;
  map: ValorantMap;
  /** Team that picked the map, or null for the decider. */
  pickedBy: Team | null;
  sidePickerTeam: Team;
  sidePickerSide?: Side;
  /** Our team's starting side, if the side has been picked. */
  ourSide?: Side;
};

/** Compute the ordered list of maps that will be played given current pickBan state. */
export function playedMaps(
  format: SeriesFormat,
  pickBan: {
    pool: ValorantMap[];
    team1: 'us' | 'opp';
    moves: { map?: ValorantMap; side?: Side }[];
    deciderSide?: Side;
  }
): PlayedMapSummary[] {
  const steps = PICKBAN_STEPS[format];
  const out: PlayedMapSummary[] = [];

  steps.forEach((step, i) => {
    if (step.kind !== 'pick') return;
    const move = pickBan.moves[i];
    if (!move?.map) return;
    const sidePickerTeam = sidePickerForStep(step)!;
    out.push({
      number: out.length + 1,
      map: move.map,
      pickedBy: step.team,
      sidePickerTeam,
      sidePickerSide: move.side,
      ourSide: move.side
        ? ourStartingSide(sidePickerTeam, move.side, pickBan.team1)
        : undefined,
    });
  });

  // Decider
  const usedMaps = pickBan.moves.map((m) => m?.map).filter(Boolean) as ValorantMap[];
  const remaining = pickBan.pool.filter((m) => !usedMaps.includes(m));
  if (remaining.length === 1) {
    const sidePickerTeam = DECIDER_SIDE_TEAM[format];
    out.push({
      number: out.length + 1,
      map: remaining[0],
      pickedBy: null,
      sidePickerTeam,
      sidePickerSide: pickBan.deciderSide,
      ourSide: pickBan.deciderSide
        ? ourStartingSide(sidePickerTeam, pickBan.deciderSide, pickBan.team1)
        : undefined,
    });
  }
  return out;
}
