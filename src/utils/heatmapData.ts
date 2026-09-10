export type Team = 'Blue' | 'Red';
export type Side = 'attacker' | 'defender';
export type EventKind = 'kill' | 'death';

/** A single kill or death, positioned in raw in-game map units, tagged with
 * the team/side/agent of whichever player the point represents (the killer
 * for a "kill" point, the victim for a "death" point). */
export type HeatmapEvent = {
  round: number;
  kind: EventKind;
  team: Team;
  side: Side;
  player: string;
  agent: string;
  x: number;
  y: number;
  /** Milliseconds elapsed in the round when this happened — the timeline
   * filter's start/end bounds are compared against this. */
  roundTime: number;
  /** Whether this happened after the spike was planted in its round (always
   * false for rounds with no plant). */
  afterPlant: boolean;
};

export type RosterEntry = {
  alias: string;
  id: string;
  team: Team;
  agent: string;
  /** Display name from the roster's Player record, when this raw tracker.gg
   * identifier has been linked to one via Player.lastSeenIgn — undefined for
   * e.g. pub-queue teammates who were never assigned an app player. */
  appName?: string;
};

export type MapDetails = {
  xMultiplier: number;
  yMultiplier: number;
  xScalarToAdd: number;
  yScalarToAdd: number;
};

export type HeatmapMatch = {
  map: string;
  mapDetails: MapDetails;
  players: RosterEntry[];
  events: HeatmapEvent[];
};

/** Shape of the raw tracker.gg match export — just the fields the
 * heatmap page reads out of the much larger `segments` array. */
type RawSegment = {
  type: string;
  attributes: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type RawExport = {
  data: {
    metadata: {
      map: string;
      mapName: string;
      mapDetails: MapDetails;
    };
    segments: RawSegment[];
  };
};

/** Structural check for Game.rawJson, which is stored as opaque `unknown` —
 * older/manually-entered games have no rawJson at all, and some may have
 * been imported from a source that isn't this tracker.gg export shape. */
export function isHeatmapRawExport(raw: unknown): raw is RawExport {
  if (!raw || typeof raw !== 'object') return false;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return false;
  const metadata = (data as { metadata?: unknown }).metadata;
  const segments = (data as { segments?: unknown }).segments;
  return (
    !!metadata &&
    typeof metadata === 'object' &&
    typeof (metadata as { mapName?: unknown }).mapName === 'string' &&
    Array.isArray(segments)
  );
}

/** Converts a raw tracker.gg match export into the flat event list the
 * heatmap renders from. Player identity/team/agent come from the
 * `player-summary` segments; per-round side comes from `player-round`
 * (tracked directly per player per round, so no attacker/defender-switch
 * guessing is needed); kill positions come from `player-round-kills`, whose
 * `playerLocations` holds the killer's own location (matched by identifier)
 * and whose `opponentLocation` is the victim's location. */
export function buildHeatmapMatchFromRawExport(raw: RawExport): HeatmapMatch {
  const segs = raw.data.segments;

  const roster = new Map<string, RosterEntry>();
  for (const s of segs) {
    if (s.type !== 'player-summary') continue;
    const id = s.attributes.platformUserIdentifier as string;
    const meta = s.metadata as { teamId: Team; agentName: string };
    roster.set(id, { alias: id, id, team: meta.teamId, agent: meta.agentName });
  }

  const sideByRoundPlayer = new Map<string, Side>();
  for (const s of segs) {
    if (s.type !== 'player-round') continue;
    const round = s.attributes.round as number;
    const id = s.attributes.platformUserIdentifier as string;
    const meta = s.metadata as { teamSide: Side };
    sideByRoundPlayer.set(`${round}:${id}`, meta.teamSide);
  }

  const plantTimeByRound = new Map<number, number>();
  for (const s of segs) {
    if (s.type !== 'round-summary') continue;
    const round = s.attributes.round as number;
    const meta = s.metadata as { plant: { roundTime: number } | null };
    if (meta.plant) plantTimeByRound.set(round, meta.plant.roundTime);
  }

  const events: HeatmapEvent[] = [];
  for (const s of segs) {
    if (s.type !== 'player-round-kills') continue;
    const round = s.attributes.round as number;
    const killerId = s.attributes.platformUserIdentifier as string;
    const victimId = s.attributes.opponentPlatformUserIdentifier as string;
    const killer = roster.get(killerId);
    const victim = roster.get(victimId);
    const meta = s.metadata as {
      playerLocations: { platformUserIdentifier: string; location: { x: number; y: number } }[];
      opponentLocation: { x: number; y: number };
      roundTime: number;
    };
    const killerLoc = meta.playerLocations.find(
      (l) => l.platformUserIdentifier === killerId
    )?.location;
    const victimLoc = meta.opponentLocation;
    const roundTime = meta.roundTime;
    const plantTime = plantTimeByRound.get(round);
    const afterPlant = plantTime !== undefined && roundTime > plantTime;

    if (killer && killerLoc) {
      events.push({
        round,
        kind: 'kill',
        team: killer.team,
        side: sideByRoundPlayer.get(`${round}:${killerId}`) ?? 'attacker',
        player: killer.id,
        agent: killer.agent,
        x: killerLoc.x,
        y: killerLoc.y,
        roundTime,
        afterPlant,
      });
    }
    if (victim && victimLoc) {
      events.push({
        round,
        kind: 'death',
        team: victim.team,
        side: sideByRoundPlayer.get(`${round}:${victimId}`) ?? 'attacker',
        player: victim.id,
        agent: victim.agent,
        x: victimLoc.x,
        y: victimLoc.y,
        roundTime,
        afterPlant,
      });
    }
  }

  return {
    map: raw.data.metadata.mapName,
    mapDetails: raw.data.metadata.mapDetails,
    players: Array.from(roster.values()),
    events,
  };
}

/** Merges several matches (one per qualifying Game) into one heatmap
 * dataset, keeping only the team an "anchor" identifier played on in each.
 * These matches are separate lobbies, so Blue/Red don't refer to the same
 * real team from match to match — but a roster player's tracker.gg
 * identifier (Player.lastSeenIgn) reliably picks out "our" side each time.
 * Matches with no anchor identifier present (no linked roster player in
 * that game) are skipped entirely. Returns null if none qualify. */
export function mergeHeatmapMatches(
  matches: HeatmapMatch[],
  anchorIdentifiers: ReadonlySet<string>,
  nameByIdentifier: ReadonlyMap<string, string>
): HeatmapMatch | null {
  const players: RosterEntry[] = [];
  const seenPlayers = new Set<string>();
  const events: HeatmapEvent[] = [];
  let mapInfo: Pick<HeatmapMatch, 'map' | 'mapDetails'> | null = null;

  for (const m of matches) {
    const anchor = m.players.find((p) => anchorIdentifiers.has(p.id));
    if (!anchor) continue;
    mapInfo ??= { map: m.map, mapDetails: m.mapDetails };
    for (const p of m.players) {
      if (p.team !== anchor.team || seenPlayers.has(p.id)) continue;
      seenPlayers.add(p.id);
      players.push({ ...p, appName: nameByIdentifier.get(p.id) });
    }
    for (const e of m.events) {
      if (e.team === anchor.team) events.push(e);
    }
  }

  if (!mapInfo) return null;
  return { ...mapInfo, players, events };
}

/** Converts raw in-game coordinates to a 0..1 fraction of the (square)
 * minimap image, using the map's own affine transform (the same
 * xMultiplier/yMultiplier/xScalarToAdd/yScalarToAdd convention Riot's map
 * data uses). The world and image axes are swapped — world X (Unreal's
 * "north/south") drives the image's *vertical* position, world Y drives its
 * *horizontal* position — confirmed empirically: computing this straight
 * (x->u, y->v) puts every point in this match between roughly 0.8 and 1.6,
 * clipped off the right/bottom of any 0..1 canvas; swapped, everything
 * lands inside ~[0.09, 0.92], and known A/C site plants separate cleanly on
 * the axis you'd expect. */
export function gameToImageUV(
  x: number,
  y: number,
  mapDetails: MapDetails
): { u: number; v: number } {
  return {
    u: y * mapDetails.xMultiplier + mapDetails.xScalarToAdd,
    v: x * mapDetails.yMultiplier + mapDetails.yScalarToAdd,
  };
}
