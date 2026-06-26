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

const sortAlpha = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));

export const AGENTS_BY_CLASS: Record<AgentClass, string[]> = {
  controller: sortAlpha(['Brimstone', 'Viper', 'Omen', 'Harbor', 'Astra', 'Miks', 'Clove']),
  duelist: sortAlpha(['Jett', 'Raze', 'Iso', 'Neon', 'Waylay', 'Phoenix', 'Yoru', 'Reyna']),
  initiator: sortAlpha(['Sova', 'Kayo', 'Skye', 'Tejo', 'Fade', 'Breach', 'Gekko']),
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
