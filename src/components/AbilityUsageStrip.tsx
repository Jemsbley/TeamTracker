import { ABILITY_SLOTS, abilityIconUrl, abilityName, type AbilityUsage } from '../utils/abilities';

type Props = {
  agent: string;
  usage: AbilityUsage;
  /** One map: the ultimate shows its cast count rather than a per-map average. */
  single?: boolean;
  size?: number;
};

/**
 * An agent's C / Q / E / X icons, each with its usage: casts per round for
 * the basic abilities, casts per map (or the raw count on a single map) for
 * the ultimate. Exact counts are in each icon's tooltip.
 */
export default function AbilityUsageStrip({ agent, usage, single, size = 20 }: Props) {
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap">
      {ABILITY_SLOTS.map((slot) => {
        const isUlt = slot === 'x';
        const name = abilityName(agent, slot);
        const url = abilityIconUrl(agent, slot);
        const total = usage.totals[slot];
        const value = isUlt ? (single ? usage.x.toFixed(0) : usage.x.toFixed(1)) : usage[slot].toFixed(2);
        const title = isUlt
          ? single
            ? `${name} (X): ${total} ${total === 1 ? 'cast' : 'casts'} this map`
            : `${name} (X): ${usage.x.toFixed(2)} casts per map — ${total} over ${usage.maps} ${usage.maps === 1 ? 'map' : 'maps'}`
          : `${name} (${slot.toUpperCase()}): ${usage[slot].toFixed(2)} casts per round — ${total} over ${usage.rounds} rounds`;
        return (
          <span
            key={slot}
            className={`inline-flex items-center gap-1 tabular-nums ${
              isUlt ? 'pl-2.5 border-l border-white/10' : ''
            }`}
            title={title}
          >
            {url ? (
              <img
                src={url}
                alt={name}
                className="inline-block object-contain opacity-90"
                style={{ width: size, height: size }}
              />
            ) : (
              <span className="text-[10px] font-semibold text-valorant-muted w-4 text-center">
                {slot.toUpperCase()}
              </span>
            )}
            <span className={isUlt ? 'text-valorant-accent' : ''}>{value}</span>
          </span>
        );
      })}
    </div>
  );
}
