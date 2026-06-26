export type AgentClass = 'controller' | 'duelist' | 'initiator' | 'sentinel';

export type ValorantMap =
  | 'Abyss'
  | 'Ascent'
  | 'Bind'
  | 'Breeze'
  | 'Lotus'
  | 'Haven'
  | 'Icebox'
  | 'Fracture'
  | 'Split'
  | 'Sunset'
  | 'Corrode'
  | 'Pearl'
  | 'Summit';

export type Side = 'Attack' | 'Defense';

export type RoundResult = 'W' | 'L';

export type RoundCategoryUser = 'gun' | 'save';

export type Round = {
  /** undefined = round not played / not entered yet */
  result?: RoundResult;
  firstBlood?: boolean;
  /** Was the spike planted this round? (regardless of which side we were on) */
  planted?: boolean;
  /** Only meaningful for rounds 4-12 of each half and OT. Auto-derived otherwise. */
  category?: RoundCategoryUser;
};

export type Roster = {
  id: string;
  name: string;
  notes?: string;
  /** At most one roster is primary; it's preselected wherever a roster is chosen. */
  isPrimary?: boolean;
};

export type Player = {
  id: string;
  rosterId: string;
  name: string;
  /** True = part of the starting 5 within this roster. */
  isMainRoster: boolean;
};

export type SeriesFormat = 'BO1' | 'BO3' | 'BO5';

export const SERIES_FORMATS: SeriesFormat[] = ['BO1', 'BO3', 'BO5'];

/** Maps required to clinch the series. */
export const FORMAT_TO_WIN: Record<SeriesFormat, number> = {
  BO1: 1,
  BO3: 2,
  BO5: 3,
};

export type SeriesPickBan = {
  /** Up to 7 maps. The pick/ban sequence runs once 7 are chosen. */
  pool: ValorantMap[];
  /** Which side we are. Defaults set on first edit. */
  team1: 'us' | 'opp';
  /** One entry per step in the format. Length matches the format's step list. */
  moves: { map?: ValorantMap; side?: Side }[];
  /** Side chosen for the leftover map by the team designated by the format. */
  deciderSide?: Side;
};

export type VodReview = {
  id: string;
  name: string;
  url: string;
  /** Game IDs from the same series this review covers (must be ≥1). */
  gameIds: string[];
  takeaways: string[];
};

export type MatchVideo = {
  id: string;
  name: string;
  url: string;
  /** Game IDs the video covers (any subset of this series). */
  gameIds: string[];
};

export type Series = {
  id: string;
  rosterId: string;
  opponent: string;
  date: string; // ISO yyyy-mm-dd
  format?: SeriesFormat;
  pickBan?: SeriesPickBan;
  videos?: MatchVideo[];
  vodReviews?: VodReview[];
  notes?: string;
  /** Optional link to a ScoutingReport. null/undefined = not linked. */
  scoutingReportId?: string | null;
};

export type GameStat = {
  playerId: string;
  agent: string;
  acs: number;
  hsPercent: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDelta: number;
  /** Average damage per round. Optional for backwards compatibility with games entered before this field existed. */
  adr?: number;
  kastPercent: number;
  firstKills: number;
  firstDeaths: number;
  multikills: number;
};

export type Game = {
  id: string;
  seriesId: string;
  map: ValorantMap;
  date: string; // ISO yyyy-mm-dd
  /** 1-based position within its series; controls display order. */
  order?: number;
  /** Manual override; if rounds[] is filled, the score is derived from rounds. */
  scoreFor?: number;
  scoreAgainst?: number;
  startingSide?: Side;
  rounds?: Round[];
  stats: GameStat[];
};

/** A single agent composition: up to 5 agent names (slots may be ''). */
export type ScoutComp = string[];

/** A scouted opponent's profile for one map. */
export type ScoutMap = {
  map: ValorantMap;
  /** Opponent's wins/losses on this map, as recorded by the user. */
  wins: number;
  losses: number;
  /** Free-text note about the record, e.g. "3 wins are against golds". */
  note?: string;
  /** Up to 3 compositions the opponent runs on this map. */
  comps: ScoutComp[];
  /** Notes on the opponent's attack-side playstyle on this map. */
  attackNotes?: string;
  /** Notes on the opponent's defense-side playstyle on this map. */
  defenseNotes?: string;
};

export type ScoutingReport = {
  id: string;
  /** Opponent team name (required). */
  teamName: string;
  /** Optional label, e.g. "NECC week 4". */
  note?: string;
  /** Optional owning roster; null/undefined means unassigned. */
  rosterId?: string | null;
  /** One entry per map in the game; ordered by record once edited. */
  maps: ScoutMap[];
};

export type AppState = {
  rosters: Roster[];
  players: Player[];
  series: Series[];
  games: Game[];
  scoutingReports: ScoutingReport[];
};
