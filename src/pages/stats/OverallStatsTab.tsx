import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import MapIcon from '../../components/MapIcon';
import PlayerStatsTable from '../../components/PlayerStatsTable';
import RoundEconomyPanel from '../../components/RoundEconomyPanel';
import { aggregateEconomy, deriveScore } from '../../utils/rounds';
import { computePickOutcomes } from '../../utils/mapStats';
import { gameOutcome, seriesOutcome } from '../../utils/stats';
import type { Game, Player, Series } from '../../types';
import type { StatFilters } from '../../utils/stats';

type Props = {
  scopedGames: Game[];
  scopedSeries: Series[];
  scopedPlayers: Player[];
  filteredGames: Game[];
  filters: StatFilters;
  includeSubs: boolean;
  allSeries: Series[];
};

export default function OverallStatsTab({
  scopedGames,
  scopedSeries,
  scopedPlayers,
  filteredGames,
  filters,
  includeSubs,
  allSeries,
}: Props) {
  const economy = useMemo(
    () => aggregateEconomy(filteredGames),
    [filteredGames]
  );

  const pickOutcomes = useMemo(
    () => computePickOutcomes(scopedSeries, filteredGames),
    [scopedSeries, filteredGames]
  );

  const mapRecord = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const g of filteredGames) {
      const o = gameOutcome(g);
      if (o === 'W') wins += 1;
      else if (o === 'L') losses += 1;
    }
    return { wins, total: wins + losses };
  }, [filteredGames]);

  const seriesRecord = useMemo(() => {
    const matchingSeriesIds = new Set(filteredGames.map((g) => g.seriesId));
    let wins = 0;
    let losses = 0;
    for (const s of scopedSeries) {
      if (!matchingSeriesIds.has(s.id)) continue;
      const o = seriesOutcome(s, scopedGames);
      if (o === 'W') wins += 1;
      else if (o === 'L') losses += 1;
    }
    return { wins, total: wins + losses };
  }, [scopedSeries, scopedGames, filteredGames]);

  if (scopedGames.length === 0) {
    return (
      <div className="card text-center text-valorant-muted space-y-3">
        <p>No maps tracked yet.</p>
        <Link className="btn-primary" to="/series">
          Add your first series
        </Link>
      </div>
    );
  }

  const pickTotals =
    pickOutcomes.ourPick.wins +
    pickOutcomes.ourPick.losses +
    pickOutcomes.enemyPick.wins +
    pickOutcomes.enemyPick.losses +
    pickOutcomes.decider.wins +
    pickOutcomes.decider.losses;

  return (
    <div className="space-y-6">
      {(mapRecord.total > 0 || pickTotals > 0) && (
        <div className="card space-y-2">
          <h3>Map pick performance</h3>
          <div className="stat-grid">
            <PickCell
              label="Map W%"
              wins={mapRecord.wins}
              total={mapRecord.total}
              tooltip="Overall win rate across matched maps"
            />
            <PickCell
              label="Series W%"
              wins={seriesRecord.wins}
              total={seriesRecord.total}
              tooltip="Overall win rate across matched series"
            />
            {pickTotals > 0 && (
              <>
                <PickCell
                  label="Our pick W%"
                  wins={pickOutcomes.ourPick.wins}
                  total={pickOutcomes.ourPick.wins + pickOutcomes.ourPick.losses}
                  tooltip="Win rate on maps we picked"
                />
                <PickCell
                  label="Enemy pick W%"
                  wins={pickOutcomes.enemyPick.wins}
                  total={
                    pickOutcomes.enemyPick.wins + pickOutcomes.enemyPick.losses
                  }
                  tooltip="Win rate on maps the opponent picked"
                />
                <PickCell
                  label="Decider W%"
                  wins={pickOutcomes.decider.wins}
                  total={pickOutcomes.decider.wins + pickOutcomes.decider.losses}
                  tooltip="Win rate on the leftover decider map"
                />
              </>
            )}
          </div>
        </div>
      )}
      {economy.total > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold">Round economy</h3>
          <RoundEconomyPanel economy={economy} />
        </div>
      )}
      <PlayerStatsTable
        games={scopedGames}
        players={scopedPlayers}
        filters={filters}
        includeSubs={includeSubs}
      />
      <RecentMaps games={filteredGames} series={allSeries} />
    </div>
  );
}

function RecentMaps({ games, series }: { games: Game[]; series: Series[] }) {
  const seriesById = useMemo(
    () => new Map(series.map((s) => [s.id, s])),
    [series]
  );
  const sorted = useMemo(
    () =>
      [...games]
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return (b.order ?? 0) - (a.order ?? 0);
        })
        .slice(0, 25),
    [games]
  );
  if (sorted.length === 0) return null;
  return (
    <div className="card space-y-2 p-0">
      <h3 className="font-semibold px-4 pt-4">Recent maps</h3>
      <div className="divide-y divide-white/5">
        {sorted.map((g) => {
          const ser = seriesById.get(g.seriesId);
          const score =
            deriveScore(g) ??
            (g.scoreFor !== undefined && g.scoreAgainst !== undefined
              ? ([g.scoreFor, g.scoreAgainst] as [number, number])
              : undefined);
          const win =
            score && score[0] > score[1]
              ? 'win'
              : score && score[0] < score[1]
                ? 'loss'
                : undefined;
          return (
            <Link
              key={g.id}
              to={`/series/${g.seriesId}/games/${g.id}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
            >
              <MapIcon map={g.map} width={56} height={32} />
              <span className="font-medium w-24 truncate">{g.map}</span>
              <span className="text-sm text-valorant-muted truncate flex-1">
                vs. {ser?.opponent ?? '?'}
              </span>
              {score && (
                <span
                  className={`tabular-nums font-semibold ${
                    win === 'win'
                      ? 'text-green-300'
                      : win === 'loss'
                        ? 'text-red-300'
                        : ''
                  }`}
                >
                  {score[0]}–{score[1]}
                </span>
              )}
              <span className="text-xs text-valorant-muted w-24 text-right">
                {g.date}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PickCell({
  label,
  wins,
  total,
  tooltip,
}: {
  label: string;
  wins: number;
  total: number;
  tooltip: string;
}) {
  const pct = total === 0 ? '–' : `${((wins / total) * 100).toFixed(0)}%`;
  return (
    <div className="stat-box" title={tooltip}>
      <div className="stat-box-label">{label}</div>
      <div className="stat-box-value text-xl">{pct}</div>
      <div className="stat-box-sub">
        {wins}/{total}
      </div>
    </div>
  );
}
