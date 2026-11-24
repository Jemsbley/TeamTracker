import type { AbilityCasts, Game } from '../types';
import { canonicalAgent } from './agentName';
import { playerIdByAgent, resolveUsTeam } from './roundPct';
import { vlrMatchTotals, vlrRating, type VlrMatch } from './vlrRating';

/**
 * Stats worked out from a stored tracker.gg match response rather than read
 * off its summary: the VLR rating, ability casts, and ADR / damage delta
 * rebuilt from the per-round damage feed.
 *
 * The damage rebuild works around a tracker.gg bug where some matches report
 * 0 damage (so 0 ADR and a damage delta of just −damage received) for every
 * player, even though the per-round damage entries are all still there.
 * Summing the enemy-only entries reproduces tracker's own `damage` exactly on
 * matches that aren't affected.
 */

type TeamColor = 'Red' | 'Blue';

type RawSegment = {
  type?: unknown;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stats?: Record<string, { value?: unknown } | undefined>;
};

export type TrackerPlayerDerived = {
  identifier: string;
  team: TeamColor;
  agent: string;
  /** True when tracker reported 0 damage but the round feed shows otherwise. */
  damageBugged: boolean;
  /** ADR from enemy damage in the round feed, rounded like the importer. */
  adr: number;
  /** (damage dealt − damage received) per round, rounded like the importer. */
  damageDelta: number;
  vlrRating: number | null;
  abilities: AbilityCasts | null;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function teamOf(v: unknown): TeamColor | null {
  return v === 'Red' || v === 'Blue' ? v : null;
}

function optNum(seg: RawSegment, key: string): number | undefined {
  const v = seg.stats?.[key]?.value;
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function num(seg: RawSegment, key: string): number {
  return optNum(seg, key) ?? 0;
}

function segmentsOf(raw: unknown): RawSegment[] | null {
  const segments = (raw as { data?: { segments?: unknown } } | null)?.data?.segments;
  return Array.isArray(segments) ? (segments as RawSegment[]) : null;
}

/** Every player's derived stats, keyed by tracker identifier. Null if `raw`
 * isn't a tracker.gg match response. */
export function deriveTrackerPlayers(raw: unknown): Map<string, TrackerPlayerDerived> | null {
  const segs = segmentsOf(raw);
  if (!segs) return null;

  const summaries = segs.filter((s) => s.type === 'player-summary');
  if (summaries.length === 0) return null;
  const teamById = new Map<string, TeamColor>();
  for (const s of summaries) {
    const id = str(s.attributes?.platformUserIdentifier);
    const team = teamOf(s.metadata?.teamId);
    if (id && team) teamById.set(id, team);
  }

  const roundCount = segs.filter((s) => s.type === 'round-summary').length;

  // Enemy-only damage dealt and received, from the per-round damage feed.
  const dealt = new Map<string, number>();
  const received = new Map<string, number>();
  for (const s of segs) {
    if (s.type !== 'player-round-damage') continue;
    const from = str(s.attributes?.platformUserIdentifier);
    const to = str(s.attributes?.opponentPlatformUserIdentifier);
    const ft = teamById.get(from);
    const tt = teamById.get(to);
    if (!ft || !tt || ft === tt) continue; // team or self damage
    const dmg = num(s, 'damage');
    dealt.set(from, (dealt.get(from) ?? 0) + dmg);
    received.set(to, (received.get(to) ?? 0) + dmg);
  }

  // Rounds played and team loadouts, for the VLR rating.
  const vlrRounds = new Map<number, VlrMatch['rounds'][number]>();
  const roundOf = (n: number) => {
    let r = vlrRounds.get(n);
    if (!r) {
      r = { loadout: {}, kills: [] };
      vlrRounds.set(n, r);
    }
    return r;
  };
  const played = new Map<string, number>();
  for (const s of segs) {
    if (s.type !== 'player-round') continue;
    const id = str(s.attributes?.platformUserIdentifier);
    const team = str(s.metadata?.teamId);
    const r = roundOf(Number(s.attributes?.round));
    r.loadout[team] = (r.loadout[team] ?? 0) + num(s, 'loadoutValue');
    played.set(id, (played.get(id) ?? 0) + 1);
  }
  for (const s of segs) {
    if (s.type !== 'player-round-kills') continue;
    const fd = (s.metadata?.finishingDamage ?? {}) as { damageType?: unknown };
    const t = Number(s.metadata?.roundTime);
    roundOf(Number(s.attributes?.round)).kills.push({
      t_ms: Number.isFinite(t) ? t : 0,
      killer: str(s.attributes?.platformUserIdentifier) || null,
      victim: str(s.attributes?.opponentPlatformUserIdentifier),
      spike: fd.damageType === 'Bomb',
    });
  }
  const nRounds = roundCount || vlrRounds.size;
  const vlrMatch: VlrMatch = {
    players: [...teamById.keys()].map((id) => {
      const seg = summaries.find((s) => str(s.attributes?.platformUserIdentifier) === id)!;
      return {
        id,
        team: teamById.get(id)!,
        rounds: played.get(id) || nRounds,
        kills: num(seg, 'kills'),
        assists: num(seg, 'assists'),
        damage: dealt.get(id) ?? 0,
      };
    }),
    rounds: [...vlrRounds.keys()].sort((a, b) => a - b).map((n) => vlrRounds.get(n)!),
  };
  const vlrTotals = vlrMatchTotals(vlrMatch);

  const out = new Map<string, TrackerPlayerDerived>();
  for (const seg of summaries) {
    const identifier = str(seg.attributes?.platformUserIdentifier);
    const team = teamById.get(identifier);
    if (!identifier || !team) continue;
    const dmg = dealt.get(identifier) ?? 0;
    const recv = received.get(identifier) ?? 0;
    const c = optNum(seg, 'grenadeCasts');
    const q = optNum(seg, 'ability1Casts');
    const e = optNum(seg, 'ability2Casts');
    const x = optNum(seg, 'ultimateCasts');
    const rounds = played.get(identifier) || nRounds;
    const totals = vlrTotals[identifier];
    out.set(identifier, {
      identifier,
      team,
      agent: canonicalAgent(str(seg.metadata?.agentName)),
      damageBugged: num(seg, 'damage') === 0 && dmg > 0,
      adr: nRounds ? Math.round(dmg / nRounds) : 0,
      damageDelta: nRounds ? Math.round((dmg - recv) / nRounds) : 0,
      vlrRating: totals ? vlrRating(totals) : null,
      abilities:
        c === undefined && q === undefined && e === undefined && x === undefined
          ? null
          : { c: c ?? 0, q: q ?? 0, e: e ?? 0, x: x ?? 0, rounds },
    });
  }
  return out;
}

/**
 * Fills a stored game's stat lines with what can be derived from its tracker
 * response: VLR rating, ability casts, and — on matches hit by tracker's
 * 0-damage bug — the real ADR and damage delta. Stat lines are matched to
 * tracker players by agent on our side, the same way the round filters do.
 * Games without a tracker response come back unchanged.
 */
export function withTrackerDerived(game: Game): Game {
  const derived = deriveTrackerPlayers(game.rawJson);
  if (!derived) return game;

  const segs = segmentsOf(game.rawJson)!;
  const winners = segs
    .filter((s) => s.type === 'round-summary')
    .sort((a, b) => Number(a.attributes?.round) - Number(b.attributes?.round))
    .map((s) => teamOf((s.stats?.winningTeam as { value?: unknown } | undefined)?.value));
  const us = resolveUsTeam(game, [...derived.values()], winners);
  if (!us) return game;

  const byAgent = playerIdByAgent(game);
  const derivedByPlayer = new Map<string, TrackerPlayerDerived>();
  for (const d of derived.values()) {
    if (d.team !== us) continue;
    const playerId = byAgent.get(d.agent);
    if (playerId) derivedByPlayer.set(playerId, d);
  }
  if (derivedByPlayer.size === 0) return game;

  return {
    ...game,
    stats: game.stats.map((s) => {
      const d = derivedByPlayer.get(s.playerId);
      if (!d || d.agent !== s.agent) return s;
      // Only repair damage the importer wrote as 0 — a hand-entered ADR wins.
      const repair = d.damageBugged && !s.adr;
      return {
        ...s,
        ...(repair ? { adr: d.adr, damageDelta: d.damageDelta } : {}),
        ...(d.vlrRating !== null ? { vlrRating: d.vlrRating } : {}),
        ...(d.abilities ? { abilities: d.abilities } : {}),
      };
    }),
  };
}
