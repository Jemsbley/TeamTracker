import type { RoundEconomy } from '../utils/rounds';
import { pct } from '../utils/rounds';

/**
 * Interpolate between pastel rose red (0%) and pastel lime green (100%).
 * Returns undefined when there's no sample (so the value renders neutral).
 */
function pctColor(wins: number, total: number): string | undefined {
  if (total === 0) return undefined;
  const t = Math.max(0, Math.min(1, wins / total));
  const r = Math.round(255 + (186 - 255) * t);
  const g = Math.round(179 + (255 - 179) * t);
  const b = Math.round(186 + (179 - 186) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

type Rate = { wins: number; total: number };

/**
 * Percentage-point change of a rate vs. a baseline, as a green up-caret /
 * red down-caret subscript. Null when either side has no sample or no change.
 */
function RateDelta({ wins, total, cmp }: { wins: number; total: number; cmp?: Rate }) {
  if (!cmp || !total || !cmp.total) return null;
  const diff = Math.round((wins / total) * 100 - (cmp.wins / cmp.total) * 100);
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <div
      className={`text-[10px] leading-none mt-0.5 ${
        up ? 'text-green-400' : 'text-red-400'
      }`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(diff)}
    </div>
  );
}

type Props = {
  economy: RoundEconomy;
  /** Display title — optional. */
  title?: string;
  /** Compact (no labels under value) */
  compact?: boolean;
  /** Baseline economy to compare each rate against. */
  compare?: RoundEconomy;
};

const TYPE_CELLS: { label: string; key: keyof RoundEconomy }[] = [
  { label: 'Atk Pistol', key: 'attackPistol' },
  { label: 'Def Pistol', key: 'defensePistol' },
  { label: 'Antieco', key: 'force' },
  { label: 'Bonus', key: 'bonus' },
  { label: 'Eco', key: 'eco' },
  { label: 'Antibonus', key: 'antibonus' },
  { label: 'Gun', key: 'gun' },
  { label: 'Save', key: 'save' },
];

export default function RoundEconomyPanel({
  economy,
  title,
  compact,
  compare,
}: Props) {
  const fbRate = {
    wins: economy.firstBlood.total,
    total: economy.total,
  };

  return (
    <div className="space-y-2">
      {title && (
        <h4 className="text-xs uppercase tracking-wider text-valorant-muted">
          {title}
        </h4>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
        {TYPE_CELLS.map(({ label, key }) => {
          const b = economy[key] as Rate;
          const cmp = compare ? (compare[key] as Rate) : undefined;
          const color = pctColor(b.wins, b.total);
          return (
            <div
              key={label}
              className="bg-valorant-panel2/40 rounded p-2"
              title={`${b.wins} / ${b.total}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-valorant-muted">
                {label}
              </div>
              <div
                className={`font-semibold tabular-nums ${compact ? 'text-sm' : 'text-base'}`}
                style={color ? { color } : undefined}
              >
                {pct(b.wins, b.total)}
              </div>
              <RateDelta wins={b.wins} total={b.total} cmp={cmp} />
              {!compact && (
                <div className="text-[10px] text-valorant-muted">
                  {b.wins}/{b.total}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <FbCell
          label="FB rate"
          tooltip={`Rounds with first blood: ${fbRate.wins} / ${fbRate.total}`}
          wins={fbRate.wins}
          total={fbRate.total}
          compact={compact}
          cmp={
            compare
              ? { wins: compare.firstBlood.total, total: compare.total }
              : undefined
          }
        />
        <FbCell
          label="Win | FB"
          tooltip={`Wins when we got first blood: ${economy.firstBlood.wins} / ${economy.firstBlood.total}`}
          wins={economy.firstBlood.wins}
          total={economy.firstBlood.total}
          compact={compact}
          cmp={compare?.firstBlood}
        />
        <FbCell
          label="Win | no FB"
          tooltip={`Wins when no first blood: ${economy.noFirstBlood.wins} / ${economy.noFirstBlood.total}`}
          wins={economy.noFirstBlood.wins}
          total={economy.noFirstBlood.total}
          compact={compact}
          cmp={compare?.noFirstBlood}
        />
      </div>

      {(economy.attack.rounds > 0 || economy.defense.rounds > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <FbCell
            label="Atk plant %"
            tooltip={`Attack rounds we planted: ${economy.attack.plants} / ${economy.attack.rounds}`}
            wins={economy.attack.plants}
            total={economy.attack.rounds}
            compact={compact}
            cmp={
              compare
                ? { wins: compare.attack.plants, total: compare.attack.rounds }
                : undefined
            }
          />
          <FbCell
            label="Postplant W%"
            tooltip={`Won attack rounds where we planted: ${economy.attack.postplantWins} / ${economy.attack.plants}`}
            wins={economy.attack.postplantWins}
            total={economy.attack.plants}
            compact={compact}
            cmp={
              compare
                ? {
                    wins: compare.attack.postplantWins,
                    total: compare.attack.plants,
                  }
                : undefined
            }
          />
          <FbCell
            label="Plant allowed"
            tooltip={`Defense rounds where opponent planted: ${economy.defense.plantsAllowed} / ${economy.defense.rounds}`}
            wins={economy.defense.plantsAllowed}
            total={economy.defense.rounds}
            compact={compact}
            cmp={
              compare
                ? {
                    wins: compare.defense.plantsAllowed,
                    total: compare.defense.rounds,
                  }
                : undefined
            }
          />
          <FbCell
            label="Retake W%"
            tooltip={`Won defense rounds after a plant: ${economy.defense.retakeWins} / ${economy.defense.plantsAllowed}`}
            wins={economy.defense.retakeWins}
            total={economy.defense.plantsAllowed}
            compact={compact}
            cmp={
              compare
                ? {
                    wins: compare.defense.retakeWins,
                    total: compare.defense.plantsAllowed,
                  }
                : undefined
            }
          />
        </div>
      )}

      {economy.total > 0 && (
        <div className="text-xs text-valorant-muted flex items-center gap-1">
          Round win rate:{' '}
          <span
            style={{
              color: pctColor(economy.totalWins, economy.total) ?? undefined,
            }}
          >
            {pct(economy.totalWins, economy.total)}
          </span>{' '}
          ({economy.totalWins}/{economy.total})
          <RoundWinDelta
            wins={economy.totalWins}
            total={economy.total}
            cmp={
              compare
                ? { wins: compare.totalWins, total: compare.total }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

/** Inline variant of the rate delta for the round-win-rate footer line. */
function RoundWinDelta({ wins, total, cmp }: { wins: number; total: number; cmp?: Rate }) {
  if (!cmp || !total || !cmp.total) return null;
  const diff = Math.round((wins / total) * 100 - (cmp.wins / cmp.total) * 100);
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span className={up ? 'text-green-400' : 'text-red-400'}>
      {up ? '▲' : '▼'}
      {Math.abs(diff)}
    </span>
  );
}

function FbCell({
  label,
  tooltip,
  wins,
  total,
  compact,
  cmp,
}: {
  label: string;
  tooltip: string;
  wins: number;
  total: number;
  compact?: boolean;
  cmp?: Rate;
}) {
  const color = pctColor(wins, total);
  return (
    <div className="bg-valorant-panel2/40 rounded p-2" title={tooltip}>
      <div className="text-[10px] uppercase tracking-wider text-valorant-muted">
        {label}
      </div>
      <div
        className={`font-semibold tabular-nums ${compact ? 'text-sm' : 'text-base'}`}
        style={color ? { color } : undefined}
      >
        {pct(wins, total)}
      </div>
      <RateDelta wins={wins} total={total} cmp={cmp} />
      {!compact && (
        <div className="text-[10px] text-valorant-muted">
          {wins}/{total}
        </div>
      )}
    </div>
  );
}
