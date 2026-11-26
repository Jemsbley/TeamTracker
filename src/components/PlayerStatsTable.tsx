import { useMemo } from 'react';
import type { Game, Player } from '../types';
import {
  aggregateForPlayer,
  aggregateTeam,
  fmt,
  fmtPct,
  fmtSigned,
  type Aggregate,
  type StatFilters,
} from '../utils/stats';
import { TRADE_STAT_INFO } from '../utils/trades';

type Col = {
  key: keyof Aggregate | 'name';
  label: string;
  align?: 'left' | 'right';
  /** Decimal places used for both the value and its comparison delta. */
  digits?: number;
  /** Render as a percentage. */
  pct?: boolean;
  /** Render the value with an explicit +/- sign. */
  signed?: boolean;
  /** Lower-is-better stats (e.g. first deaths). */
  bestIsLow?: boolean;
  /** Header hover text. */
  tooltip?: string;
};

const COLUMNS: Col[] = [
  { key: 'name', label: 'Player', align: 'left' },
  { key: 'vlrRating', label: 'VLR', digits: 2 },
  { key: 'acs', label: 'ACS', digits: 0 },
  { key: 'kdr', label: 'KDR', digits: 2 },
  { key: 'assists', label: 'A', digits: 1 },
  { key: 'damageDelta', label: 'DDΔ', digits: 0, signed: true },
  { key: 'adr', label: 'ADR', digits: 0 },
  { key: 'hsPercent', label: 'HS%', digits: 1, pct: true },
  { key: 'kastPercent', label: 'KAST%', digits: 1, pct: true },
  { key: 'firstKills', label: 'FK', digits: 1 },
  { key: 'firstDeaths', label: 'FD', digits: 1, bestIsLow: true },
  { key: 'multikills', label: 'MK', digits: 1 },
  ...(
    [
      ['fdTradedPct', TRADE_STAT_INFO.fdTraded],
      ['fbTradedPct', TRADE_STAT_INFO.fbTraded],
      ['deathTradePct', TRADE_STAT_INFO.deathTrade],
      ['killTradePct', TRADE_STAT_INFO.killTrade],
    ] as const
  ).map(
    ([key, info]): Col => ({
      key,
      label: info.short,
      digits: 0,
      pct: true,
      bestIsLow: info.lowerIsBetter,
      tooltip: `${info.label}: ${info.tooltip} (tracker.gg imports only)`,
    })
  ),
];

function fmtValue(col: Col, v: number): string {
  const digits = col.digits ?? 1;
  if (col.pct) return fmtPct(v, digits);
  if (col.signed) return fmtSigned(v, digits);
  return fmt(v, digits);
}

type Props = {
  games: Game[];
  players: Player[];
  filters: StatFilters;
  includeSubs: boolean;
  /**
   * Baseline games to compare each stat against. When provided, each numeric
   * cell is subscripted with its difference from the baseline aggregate.
   */
  compareGames?: Game[];
  /**
   * Makes player rows selectable: the Player header gets an "Any" button that
   * clears the selection, and clicking a row (with games) selects it, or
   * clears it if it's already selected.
   */
  onSelectPlayer?: (playerId: string | null) => void;
  selectedPlayerId?: string | null;
};

export default function PlayerStatsTable({
  games,
  players,
  filters,
  includeSubs,
  compareGames,
  onSelectPlayer,
  selectedPlayerId,
}: Props) {
  const team = useMemo(() => aggregateTeam(games, filters), [games, filters]);
  const teamCmp = useMemo(
    () => (compareGames ? aggregateTeam(compareGames, filters) : null),
    [compareGames, filters]
  );
  const playerRows = useMemo(() => {
    const list = players.filter((p) => includeSubs || p.isMainRoster);
    return list
      .map((p) => ({
        player: p,
        agg: aggregateForPlayer(games, p.id, filters),
        cmp: compareGames
          ? aggregateForPlayer(compareGames, p.id, filters)
          : null,
      }))
      // Only players who appear in at least one of the given games get a row.
      .filter((r) => r.agg.games > 0)
      .sort((a, b) => b.agg.acs - a.agg.acs);
  }, [players, games, filters, includeSubs, compareGames]);

  // Best value per column across player rows with games.
  const bestByCol = useMemo(() => {
    const out: Partial<Record<keyof Aggregate, number>> = {};
    for (const col of COLUMNS) {
      if (col.key === 'name') continue;
      let best: number | undefined;
      for (const { agg } of playerRows) {
        if (agg.games === 0) continue;
        const v = agg[col.key as keyof Aggregate] as number;
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (best === undefined) best = v;
        else if (col.bestIsLow ? v < best : v > best) best = v;
      }
      if (best !== undefined) out[col.key as keyof Aggregate] = best;
    }
    return out;
  }, [playerRows]);

  /** Comparison delta as an up/down caret subscript, green when the change is
   * an improvement (so a rise in a lower-is-better stat reads red). */
  const renderDelta = (col: Col, agg: Aggregate, cmp: Aggregate | null) => {
    if (col.key === 'name' || !cmp) return null;
    if (agg.games === 0 || cmp.games === 0) return null;
    const k = col.key as keyof Aggregate;
    const cur = agg[k] as number;
    const base = cmp[k] as number;
    if (typeof cur !== 'number' || typeof base !== 'number') return null;
    if (!isFinite(cur) || !isFinite(base)) return null;
    const digits = col.digits ?? 1;
    const diff = Number((cur - base).toFixed(digits));
    if (diff === 0) return null;
    const up = diff > 0;
    const better = col.bestIsLow ? !up : up;
    const mag = Math.abs(diff).toFixed(digits);
    return (
      <span
        className={`block text-xs leading-none mt-0.5 ${
          better ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {up ? '▲' : '▼'}
        {col.pct ? `${mag}%` : mag}
      </span>
    );
  };

  const renderValue = (col: Col, agg: Aggregate) => {
    if (col.key === 'name') return null;
    const v = agg[col.key as keyof Aggregate] as number;
    return fmtValue(col, v);
  };

  return (
    <div className="card overflow-x-auto p-0">
      <table
        // Sized to its content (no min width) with tight cell padding so it
        // fits without sideways scrolling, including the half-width slot on
        // the Win/Loss tabs. The outer edges keep a little breathing room.
        className="w-full [&_td]:px-1 [&_th]:px-1 [&_td]:text-[13px] [&_th]:text-[10px] [&_th]:tracking-normal [&_td:first-child]:pl-3 [&_th:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:last-child]:pr-3"
      >
        <thead className="bg-valorant-panel2/40">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key as string}
                className={`table-head ${c.align === 'left' ? '' : 'text-right'}`}
                title={c.tooltip}
              >
                {c.key === 'name' && onSelectPlayer ? (
                  <span className="inline-flex items-center gap-2">
                    {c.label}
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(null)}
                      className={
                        selectedPlayerId
                          ? 'text-valorant-muted hover:text-yellow-300'
                          : 'text-yellow-300'
                      }
                      title="Show every player"
                    >
                      Any
                    </button>
                  </span>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/10 bg-valorant-panel2/30 font-medium">
            <td className="table-cell">Team avg</td>
            {COLUMNS.slice(1).map((c) => (
              <td
                key={c.key as string}
                className="table-cell text-right tabular-nums align-top"
              >
                {renderValue(c, team)}
                {renderDelta(c, team, teamCmp)}
              </td>
            ))}
          </tr>
          {playerRows.map(({ player, agg, cmp }) => {
            const selectable = !!onSelectPlayer && agg.games > 0;
            const selected = selectable && selectedPlayerId === player.id;
            return (
            <tr
              key={player.id}
              onClick={
                selectable
                  ? () => onSelectPlayer(selected ? null : player.id)
                  : undefined
              }
              title={
                selectable
                  ? selected
                    ? 'Show every player'
                    : `Filter to ${player.name}`
                  : undefined
              }
              className={`border-t border-white/5 ${
                selectable ? 'cursor-pointer transition-colors' : ''
              } ${
                selected
                  ? 'bg-valorant-panel2/50'
                  : selectable
                    ? 'hover:bg-valorant-panel2/30'
                    : ''
              }`}
            >
              <td className="table-cell">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${selected ? 'text-yellow-300' : ''}`}>
                    {player.name}
                  </span>
                  {!player.isMainRoster && (
                    <span className="text-[10px] uppercase tracking-wide text-valorant-muted px-1 py-0.5 rounded bg-white/5">
                      Sub
                    </span>
                  )}
                </div>
              </td>
              {COLUMNS.slice(1).map((c) => {
                const k = c.key as keyof Aggregate;
                const v = agg[k] as number;
                const best = bestByCol[k];
                const isBest =
                  agg.games > 0 &&
                  best !== undefined &&
                  typeof v === 'number' &&
                  v === best;
                return (
                  <td
                    key={c.key as string}
                    className={`table-cell text-right tabular-nums align-top ${
                      agg.games === 0
                        ? 'text-valorant-muted'
                        : isBest
                          ? 'text-yellow-300'
                          : ''
                    }`}
                  >
                    {agg.games === 0 ? '—' : renderValue(c, agg)}
                    {agg.games === 0 ? null : renderDelta(c, agg, cmp)}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
