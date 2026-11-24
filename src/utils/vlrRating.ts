/**
 * VLR Rating 2.0 estimate — a TypeScript port of vlr-rating/vlr_rating.js.
 * See vlr-rating/README.md for the algorithm, the fitted constants and how
 * accurate it is. Keep this in step with that reference implementation.
 */

export type VlrKill = {
  /** Time of the death since the round started, in ms. */
  t_ms: number;
  /** Killer's player id; the victim's own id (or null) for a fall/suicide. */
  killer: string | null;
  victim: string;
  /** Died to the spike detonation. */
  spike: boolean;
};

export type VlrMatch = {
  players: Array<{
    id: string;
    team: string;
    /** Rounds this player played on the map. */
    rounds: number;
    /** Kills on enemies only. */
    kills: number;
    assists: number;
    /** Total damage to enemies only. */
    damage: number;
  }>;
  rounds: Array<{
    /** Each team's summed loadout value at the start of the round. */
    loadout: Record<string, number>;
    /** Every death in the round, including falls, team kills and spike deaths. */
    kills: VlrKill[];
  }>;
};

export type VlrTotals = {
  rounds: number;
  kills: number;
  assists: number;
  damage: number;
  /** Kill contribution. */
  kc: number;
  /** Death contribution. */
  dc: number;
  roundsDied: number;
};

// Fitted on 470 Champions 2026 player-maps (leave-one-match-out error 0.017 vs vlr.gg).
const C = {
  a: 0.4504593877,
  C1: 0.9461549127,
  C2: 0.956890235,
  C3: 0.2676775021,
  C4: 0.0019872721,
  C5: 0.1298035295,
  C6: 0.4267176739,
  b: [1.0, 0.7435459502, 0.5506887977, 0.2272827339], // fight weight by distance from even
  beta: 0.0212970312, // economy: per $1000 of loadout advantage
  tau: 0.7231253772, // traded fight multiplier
  kappa: 1.0, // cost of a team kill to the killer
};
const TRADE_MS = 3000;

type DeathEvent = {
  t: number;
  killer: string | null;
  victim: string;
  kt: string;
  vt: string;
  nk: number;
  nv: number;
  after: Record<string, number>;
  spike: boolean;
  teamKill: string | null;
};

/** Per-player totals for one map. Add these across maps for a series rating. */
export function vlrMatchTotals(match: VlrMatch): Record<string, VlrTotals> {
  const team: Record<string, string> = {};
  for (const p of match.players) team[p.id] = p.team;
  const teams = [...new Set(Object.values(team))].sort();
  const tot: Record<string, VlrTotals> = {};
  for (const p of match.players) {
    tot[p.id] = {
      rounds: p.rounds,
      kills: p.kills,
      assists: p.assists,
      damage: p.damage,
      kc: 0,
      dc: 0,
      roundsDied: 0,
    };
  }

  for (const rnd of match.rounds) {
    const alive: Record<string, number> = {};
    for (const t of teams) alive[t] = 5;
    const events: DeathEvent[] = [];
    const kills = rnd.kills.slice().sort((x, y) => x.t_ms - y.t_ms);
    for (const k of kills) {
      const v = k.victim;
      if (!(v in team)) continue;
      const vt = team[v];
      if (alive[vt] === 0) alive[vt] = 1; // a revived player dying again
      const killer = k.killer;
      const fight = killer !== null && killer in team && team[killer] !== vt;
      const kt = fight ? team[killer!] : teams.find((t) => t !== vt) ?? vt;
      const nk = alive[kt];
      const nv = alive[vt];
      alive[vt]--;
      events.push({
        t: k.t_ms,
        killer: fight ? killer : null,
        victim: v,
        kt,
        vt,
        nk,
        nv,
        after: { ...alive },
        spike: k.spike,
        teamKill: !fight && killer !== null && killer in team && killer !== v ? killer : null,
      });
    }

    const dead = new Set<string>();
    for (const e of events) {
      dead.add(e.victim);
      if (e.spike) continue; // spike detonation deaths don't count
      if (e.teamKill) {
        tot[e.teamKill].dc += C.kappa; // killer pays a full death
        continue;
      }
      const diff = e.nk - e.nv;
      const dist = Math.min(Math.abs(diff), Math.abs(diff + 1), 3); // distance from even
      const gap = ((rnd.loadout[e.kt] || 0) - (rnd.loadout[e.vt] || 0)) / 1000;
      let w = C.b[dist] * Math.exp(-C.beta * gap);
      if (e.killer) {
        const later = events.filter((x) => x.t > e.t && x.t <= e.t + TRADE_MS);
        if (later.some((x) => x.victim === e.killer)) {
          const after = later[later.length - 1].after;
          if (after[e.kt] <= after[e.vt]) w *= C.tau; // traded: killer's team not ahead 3 s later
        }
        tot[e.killer].kc += w;
      }
      tot[e.victim].dc += w; // falls count as deaths
    }
    for (const p of dead) tot[p].roundsDied++;
  }
  return tot;
}

/** Rating for one player's totals, or null if they played no rounds. */
export function vlrRating(t: VlrTotals): number | null {
  const r = t.rounds;
  if (!r) return null;
  const x =
    C.a +
    (C.C1 * t.kc) / r -
    (C.C2 * t.dc) / r +
    (C.C3 * t.assists) / r +
    (C.C4 * t.damage) / r +
    (C.C5 * t.kills) / r +
    (C.C6 * (r - t.roundsDied)) / r;
  return Math.max(x, 0.01);
}
