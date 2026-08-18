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
    <div className={`text-[11px] leading-none mt-1 font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
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

const PISTOL_CELLS: { label: string; key: keyof RoundEconomy }[] = [
  { label: 'Atk Pistol', key: 'attackPistol' },
  { label: 'Def Pistol', key: 'defensePistol' },
];

const BUY_PATTERN_CELLS: { label: string; key: keyof RoundEconomy }[] = [
  { label: 'Antieco', key: 'antieco' },
  { label: 'Bonus', key: 'bonus' },
  { label: 'Eco', key: 'eco' },
  { label: 'Antibonus', key: 'antibonus' },
];

const MID_ROUND_CELLS: { label: string; key: keyof RoundEconomy }[] = [
  { label: 'Gun', key: 'gun' },
  { label: 'Save', key: 'save' },
  { label: 'Force', key: 'force' },
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
    <div className="space-y-4">
      {title && <h4 className="section-title">{title}</h4>}

      <RateSection
        label="Pistols"
        cells={PISTOL_CELLS}
        economy={economy}
        compare={compare}
        compact={compact}
      />
      <RateSection
        label="Half-buy pattern"
        cells={BUY_PATTERN_CELLS}
        economy={economy}
        compare={compare}
        compact={compact}
      />
      <RateSection
        label="Mid-round buys"
        cells={MID_ROUND_CELLS}
        economy={economy}
        compare={compare}
        compact={compact}
      />

      <div>
        <h5 className="section-title">Engagements</h5>
        <div className="stat-grid">
          <Cell
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
          <Cell
            label="Win | FB"
            tooltip={`Wins when we got first blood: ${economy.firstBlood.wins} / ${economy.firstBlood.total}`}
            wins={economy.firstBlood.wins}
            total={economy.firstBlood.total}
            compact={compact}
            cmp={compare?.firstBlood}
          />
          <Cell
            label="Win | no FB"
            tooltip={`Wins when no first blood: ${economy.noFirstBlood.wins} / ${economy.noFirstBlood.total}`}
            wins={economy.noFirstBlood.wins}
            total={economy.noFirstBlood.total}
            compact={compact}
            cmp={compare?.noFirstBlood}
          />
          <Cell
            label="Clutch W%"
            tooltip={`Marked clutches won: ${economy.clutch.wins} / ${economy.clutch.total}`}
            wins={economy.clutch.wins}
            total={economy.clutch.total}
            compact={compact}
            cmp={compare?.clutch}
          />
        </div>
      </div>

      {(economy.attack.rounds > 0 || economy.defense.rounds > 0) && (
        <div>
          <h5 className="section-title">Site control</h5>
          <div className="stat-grid">
            <Cell
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
            <Cell
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
            <Cell
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
            <Cell
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
        </div>
      )}

      {economy.total > 0 && (
        <div className="text-sm text-valorant-muted flex items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="font-medium">Round win rate:</span>
          <span
            className="font-bold"
            style={{
              color: pctColor(economy.totalWins, economy.total) ?? undefined,
            }}
          >
            {pct(economy.totalWins, economy.total)}
          </span>
          <span className="tabular-nums">({economy.totalWins}/{economy.total})</span>
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

/** A labeled group of round-category win-rate cells sharing one stat-grid row. */
function RateSection({
  label,
  cells,
  economy,
  compare,
  compact,
}: {
  label: string;
  cells: { label: string; key: keyof RoundEconomy }[];
  economy: RoundEconomy;
  compare?: RoundEconomy;
  compact?: boolean;
}) {
  return (
    <div>
      <h5 className="section-title">{label}</h5>
      <div className="stat-grid">
        {cells.map(({ label: cellLabel, key }) => {
          const b = economy[key] as Rate;
          const cmp = compare ? (compare[key] as Rate) : undefined;
          return (
            <Cell
              key={cellLabel}
              label={cellLabel}
              tooltip={`${b.wins} / ${b.total}`}
              wins={b.wins}
              total={b.total}
              compact={compact}
              cmp={cmp}
            />
          );
        })}
      </div>
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
    <span className={`font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'}
      {Math.abs(diff)}
    </span>
  );
}

function Cell({
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
    <div className="stat-box" title={tooltip}>
      <div className="stat-box-label">{label}</div>
      <div
        className={`stat-box-value ${compact ? 'text-base' : 'text-xl'}`}
        style={color ? { color } : undefined}
      >
        {pct(wins, total)}
      </div>
      <RateDelta wins={wins} total={total} cmp={cmp} />
      {!compact && <div className="stat-box-sub">{wins}/{total}</div>}
    </div>
  );
}
