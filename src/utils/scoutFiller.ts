import type { AbilityUsage } from './abilities';
import type { HeatmapEvent, MapDetails } from './heatmapData';

/**
 * Made-up data shown blurred behind the scouting report's "click on a map"
 * prompts, so the empty heatmap and abilities boxes hint at what they'll
 * hold instead of sitting blank. Never shown unblurred and never counted.
 */

/** Haven's minimap transform, as tracker.gg reports it. */
export const FILLER_MAP = 'Haven';
export const FILLER_MAP_DETAILS: MapDetails = {
  xMultiplier: 0.000075,
  yMultiplier: -0.000075,
  xScalarToAdd: 1.09345,
  yScalarToAdd: 0.642728,
};

// Seeded so the filler looks the same on every render.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough clusters (minimap fractions) for the fake fights. */
const CLUSTERS = [
  { u: 0.22, v: 0.3, spread: 0.06, n: 40 },
  { u: 0.5, v: 0.28, spread: 0.05, n: 30 },
  { u: 0.78, v: 0.32, spread: 0.06, n: 38 },
  { u: 0.35, v: 0.55, spread: 0.07, n: 26 },
  { u: 0.65, v: 0.58, spread: 0.07, n: 26 },
  { u: 0.5, v: 0.78, spread: 0.06, n: 20 },
];

function buildFillerEvents(): HeatmapEvent[] {
  const rand = mulberry32(2026);
  const d = FILLER_MAP_DETAILS;
  const events: HeatmapEvent[] = [];
  for (const c of CLUSTERS) {
    for (let i = 0; i < c.n; i++) {
      // Sum of two uniforms ≈ a soft bell around the cluster centre.
      const u = c.u + (rand() + rand() - 1) * c.spread * 2;
      const v = c.v + (rand() + rand() - 1) * c.spread * 2;
      // Invert gameToImageUV: u = y·xMul + xAdd, v = x·yMul + yAdd.
      const x = (v - d.yScalarToAdd) / d.yMultiplier;
      const y = (u - d.xScalarToAdd) / d.xMultiplier;
      events.push({
        gameId: 'filler',
        round: 1,
        kind: rand() < 0.55 ? 'kill' : 'death',
        team: 'Blue',
        side: rand() < 0.5 ? 'attacker' : 'defender',
        player: 'filler',
        agent: '',
        x,
        y,
        roundTime: 0,
        afterPlant: false,
        opponent: '',
        opponentAgent: '',
      });
    }
  }
  return events;
}

export const FILLER_EVENTS: HeatmapEvent[] = buildFillerEvents();

const usage = (c: number, q: number, e: number, x: number): AbilityUsage => ({
  c,
  q,
  e,
  x,
  totals: { c: 0, q: 0, e: 0, x: 0 },
  rounds: 0,
  maps: 0,
});

/** A plausible Haven comp's worth of ability rows. */
export const FILLER_ABILITY_ROWS: Array<{ name: string; agent: string; usage: AbilityUsage }> = [
  { name: 'Player one', agent: 'Cypher', usage: usage(1.9, 1.2, 0.86, 2.0) },
  { name: 'Player two', agent: 'Neon', usage: usage(0.48, 0.73, 0.99, 2.3) },
  { name: 'Player three', agent: 'Omen', usage: usage(0.55, 0.57, 2.06, 1.8) },
  { name: 'Player four', agent: 'Phoenix', usage: usage(0.44, 0.78, 1.02, 3.1) },
  { name: 'Player five', agent: 'Sova', usage: usage(0.44, 1.05, 0.97, 2.6) },
];
