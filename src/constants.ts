import type { AgentClass, ValorantMap } from './types';

export const MAPS: ValorantMap[] = [
  'Abyss',
  'Ascent',
  'Bind',
  'Breeze',
  'Corrode',
  'Fracture',
  'Haven',
  'Icebox',
  'Lotus',
  'Pearl',
  'Split',
  'Summit',
  'Sunset',
];

/** Bomb sites per map — Haven and Lotus have a C site, everything else is
 * A/B. */
export const MAP_SITES: Record<ValorantMap, string[]> = Object.fromEntries(
  MAPS.map((m) => [m, m === 'Haven' || m === 'Lotus' ? ['A', 'B', 'C'] : ['A', 'B']])
) as Record<ValorantMap, string[]>;

const sortAlpha = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));

export const AGENTS_BY_CLASS: Record<AgentClass, string[]> = {
  controller: sortAlpha(['Brimstone', 'Viper', 'Omen', 'Harbor', 'Astra', 'Miks', 'Clove']),
  duelist: sortAlpha(['Jett', 'Raze', 'Iso', 'Neon', 'Waylay', 'Phoenix', 'Yoru', 'Reyna', 'Hush']),
  initiator: sortAlpha(['Sova', 'KAY/O', 'Skye', 'Tejo', 'Fade', 'Breach', 'Gekko']),
  sentinel: sortAlpha(['Deadlock', 'Sage', 'Vyse', 'Cypher', 'Killjoy', 'Veto', 'Chamber']),
};

export const ALL_AGENTS: string[] = (
  Object.values(AGENTS_BY_CLASS).flat() as string[]
).sort((a, b) => a.localeCompare(b));

export const AGENT_CLASS: Record<string, AgentClass> = (() => {
  const m: Record<string, AgentClass> = {};
  (Object.keys(AGENTS_BY_CLASS) as AgentClass[]).forEach((cls) => {
    AGENTS_BY_CLASS[cls].forEach((a) => (m[a] = cls));
  });
  return m;
})();

export const CLASS_LABEL: Record<AgentClass, string> = {
  controller: 'Controller',
  duelist: 'Duelist',
  initiator: 'Initiator',
  sentinel: 'Sentinel',
};

export const CLASS_COLOR: Record<AgentClass, string> = {
  controller: 'bg-cls-controller/20 text-cls-controller',
  duelist: 'bg-cls-duelist/20 text-cls-duelist',
  initiator: 'bg-cls-initiator/20 text-cls-initiator',
  sentinel: 'bg-cls-sentinel/20 text-cls-sentinel',
};

export const PLAYERS_PER_GAME = 5;

/** Ability names per agent by keybind slot, matching the icons in
 * src/assets/abilities/<Agent>/<slot>.png (both from valorant-api.com). */
export const AGENT_ABILITIES: Record<string, { c: string; q: string; e: string; x: string }> = {
  Astra: { c: 'Gravity Well', q: 'Nova Pulse', e: 'Nebula', x: 'Cosmic Divide' },
  Breach: { c: 'Aftershock', q: 'Flashpoint', e: 'Fault Line', x: 'Rolling Thunder' },
  Brimstone: { c: 'Stim Beacon', q: 'Incendiary', e: 'Sky Smoke', x: 'Orbital Strike' },
  Chamber: { c: 'Trademark', q: 'Headhunter', e: 'Rendezvous', x: 'Tour De Force' },
  Clove: { c: 'Pick-me-up', q: 'Meddle', e: 'Ruse', x: 'Not Dead Yet' },
  Cypher: { c: 'Trapwire', q: 'Cyber Cage', e: 'Spycam', x: 'Neural Theft' },
  Deadlock: { c: 'Barrier Mesh', q: 'Sonic Sensor', e: 'GravNet', x: 'Annihilation' },
  Fade: { c: 'Prowler', q: 'Seize', e: 'Haunt', x: 'Nightfall' },
  Gekko: { c: 'Mosh Pit', q: 'Wingman', e: 'Dizzy', x: 'Thrash' },
  Hush: { c: 'Flow', q: 'Flashbulb', e: 'Displacement', x: 'Suspension' },
  Harbor: { c: 'Storm Surge', q: 'High Tide', e: 'Cove', x: 'Reckoning' },
  Iso: { c: 'Contingency', q: 'Undercut', e: 'Double Tap', x: 'Kill Contract' },
  Jett: { c: 'Cloudburst', q: 'Updraft', e: 'Tailwind', x: 'Blade Storm' },
  'KAY/O': { c: 'FRAG/ment', q: 'FLASH/drive', e: 'ZERO/point', x: 'NULL/cmd' },
  Killjoy: { c: 'Nanoswarm', q: 'Alarmbot', e: 'Turret', x: 'Lockdown' },
  Miks: { c: 'M-pulse', q: 'Harmonize', e: 'Waveform', x: 'Bassquake' },
  Neon: { c: 'Fast Lane', q: 'Relay Bolt', e: 'High Gear', x: 'Overdrive' },
  Omen: { c: 'Shrouded Step', q: 'Paranoia', e: 'Dark Cover', x: 'From the Shadows' },
  Phoenix: { c: 'Blaze', q: 'Hot Hands', e: 'Curveball', x: 'Run It Back' },
  Raze: { c: 'Boom Bot', q: 'Blast Pack', e: 'Paint Shells', x: 'Showstopper' },
  Reyna: { c: 'Leer', q: 'Devour', e: 'Dismiss', x: 'Empress' },
  Sage: { c: 'Barrier Orb', q: 'Slow Orb', e: 'Healing Orb', x: 'Resurrection' },
  Skye: { c: 'Regrowth', q: 'Trailblazer', e: 'Guiding Light', x: 'Seekers' },
  Sova: { c: 'Owl Drone', q: 'Shock Bolt', e: 'Recon Bolt', x: "Hunter's Fury" },
  Tejo: { c: 'Stealth Drone', q: 'Special Delivery', e: 'Guided Salvo', x: 'Armageddon' },
  Veto: { c: 'Crosscut', q: 'Chokehold', e: 'Interceptor', x: 'Evolution' },
  Viper: { c: 'Snake Bite', q: 'Poison Cloud', e: 'Toxic Screen', x: "Viper's Pit" },
  Vyse: { c: 'Razorvine', q: 'Shear', e: 'Arc Rose', x: 'Steel Garden' },
  Waylay: { c: 'Saturate', q: 'Lightspeed', e: 'Refract', x: 'Convergent Paths' },
  Yoru: { c: 'Fakeout', q: 'Blindside', e: 'Gatecrash', x: 'Dimensional Drift' },
};
