import { AGENT_ABILITIES } from '../constants';
import type { AbilityCasts } from '../types';
import { agentKey } from './agentName';

export type AbilitySlot = 'c' | 'q' | 'e' | 'x';
export const ABILITY_SLOTS: AbilitySlot[] = ['c', 'q', 'e', 'x'];

/**
 * Ability usage over one or more maps: C/Q/E as casts per round played, the
 * ultimate as casts per map. `totals`, `rounds` and `maps` are what the rates
 * were computed from.
 */
export type AbilityUsage = {
  c: number;
  q: number;
  e: number;
  x: number;
  totals: Record<AbilitySlot, number>;
  rounds: number;
  maps: number;
};

/** Pools casts across maps; null if none of them recorded ability casts. */
export function aggregateAbilities(list: Array<AbilityCasts | undefined>): AbilityUsage | null {
  const totals: Record<AbilitySlot, number> = { c: 0, q: 0, e: 0, x: 0 };
  let rounds = 0;
  let maps = 0;
  for (const a of list) {
    if (!a) continue;
    totals.c += a.c;
    totals.q += a.q;
    totals.e += a.e;
    totals.x += a.x;
    rounds += a.rounds;
    maps += 1;
  }
  if (maps === 0) return null;
  const perRound = (n: number) => (rounds ? n / rounds : 0);
  return {
    c: perRound(totals.c),
    q: perRound(totals.q),
    e: perRound(totals.e),
    x: totals.x / maps,
    totals,
    rounds,
    maps,
  };
}

const iconModules = import.meta.glob('../assets/abilities/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconMap: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const parts = path.split('/');
  const slot = (parts.pop() ?? '').replace(/\.png$/i, '');
  const agent = parts.pop() ?? '';
  iconMap[`${agentKey(agent)}:${slot}`] = url;
}

const namesByAgent = new Map(
  Object.entries(AGENT_ABILITIES).map(([agent, names]) => [agentKey(agent), names])
);

export function abilityIconUrl(agent: string, slot: AbilitySlot): string | undefined {
  return iconMap[`${agentKey(agent)}:${slot}`];
}

export function abilityName(agent: string, slot: AbilitySlot): string {
  return namesByAgent.get(agentKey(agent))?.[slot] ?? slot.toUpperCase();
}
