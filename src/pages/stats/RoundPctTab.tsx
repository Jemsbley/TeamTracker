import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseAsArrayOf, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import MapIcon from '../../components/MapIcon';
import MultiMapPicker from '../../components/MultiMapPicker';
import SubjectPicker from '../../components/SubjectPicker';
import { MAPS } from '../../constants';
import { pct } from '../../utils/rounds';
import {
  PLANT_SITES,
  evaluateRoundPct,
  needsRoundDetail,
  type FirstEvent,
  type PlantMode,
  type PlantSite,
  type RoundPctFilters,
  type SideMode,
  type Tally,
} from '../../utils/roundPct';
import type { Game, Player, Series, ValorantMap } from '../../types';

type Props = {
  scopedPlayers: Player[];
  scopedSeries: Series[];
  filteredGames: Game[];
};

/**
 * "Round%": pick a set of round-level circumstances, see what share of rounds
 * we win under them. Every filter narrows the round pool; the headline
 * compares that pool's win rate against every round in scope.
 */
export default function RoundPctTab({ scopedPlayers, scopedSeries, filteredGames }: Props) {
  const [side, setSide] = useQueryState(
    'rpSide',
    parseAsStringEnum<SideMode>(['both', 'Attack', 'Defense']).withDefault('both')
  );
  const [firstEvent, setFirstEvent] = useQueryState(
    'rpFirst',
    parseAsStringEnum<FirstEvent>(['any', 'fb', 'fd']).withDefault('any')
  );
  const [firstSubject, setFirstSubject] = useQueryState(
    'rpFirstWho',
    parseAsString.withDefault('')
  );
  const [maps, setMaps] = useQueryState(
    'rpMaps',
    parseAsArrayOf(parseAsStringEnum<ValorantMap>([...MAPS])).withDefault([])
  );
  const [plant, setPlant] = useQueryState(
    'rpPlant',
    parseAsStringEnum<PlantMode>(['any', 'yes', 'no']).withDefault('any')
  );
  const [plantSites, setPlantSites] = useQueryState(
    'rpSites',
    parseAsArrayOf(parseAsStringEnum<PlantSite>([...PLANT_SITES])).withDefault([])
  );
  const [multikill, setMultikill] = useQueryState('rpMk', parseAsString.withDefault(''));
  const [kills, setKills] = useQueryState(
    'rpKills',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [deaths, setDeaths] = useQueryState(
    'rpDeaths',
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [assists, setAssists] = useQueryState(
    'rpAssists',
    parseAsArrayOf(parseAsString).withDefault([])
  );

  const filters: RoundPctFilters = useMemo(
    () => ({
      side,
      firstEvent,
      // The subject is only meaningful alongside a first blood/death pick.
      firstSubject: firstEvent === 'any' ? '' : firstSubject,
      maps,
      plant,
      // Sites only narrow a "planted" query; a stale pick left in the URL
      // after switching back to Any/No plant shouldn't filter anything.
      plantSites: plant === 'yes' ? plantSites : [],
      multikill,
      kills,
      deaths,
      assists,
    }),
    [side, firstEvent, firstSubject, maps, plant, plantSites, multikill, kills, deaths, assists]
  );

  const result = useMemo(
    () => evaluateRoundPct(filteredGames, filters),
    [filteredGames, filters]
  );

  // Checked against the raw URL state rather than the normalized filters, so
  // a value that's currently inert (sites picked, then plant set back to Any)
  // can still be cleared.
  const active =
    side !== 'both' ||
    firstEvent !== 'any' ||
    firstSubject !== '' ||
    maps.length > 0 ||
    plant !== 'any' ||
    plantSites.length > 0 ||
    multikill !== '' ||
    kills.length > 0 ||
    deaths.length > 0 ||
    assists.length > 0;

  const reset = () => {
    setSide(null);
    setFirstEvent(null);
    setFirstSubject(null);
    setMaps(null);
    setPlant(null);
    setPlantSites(null);
    setMultikill(null);
    setKills(null);
    setDeaths(null);
    setAssists(null);
  };

  const sitesEnabled = plant === 'yes';

  const delta =
    result.overall.total > 0 && result.baseline.total > 0
      ? (result.overall.wins / result.overall.total) * 100 -
        (result.baseline.wins / result.baseline.total) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="card space-y-3 flex-1 min-w-[320px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Round circumstances</h3>
              <p className="text-xs text-valorant-muted">
                Each filter narrows the pool of rounds. Where several subjects are
                picked for one event, every one of them has to have done it in the
                same round.
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={!active}
              className="shrink-0 text-xs text-valorant-muted hover:text-white underline underline-offset-2 disabled:opacity-40 disabled:hover:text-valorant-muted disabled:no-underline disabled:cursor-default"
            >
              Reset
            </button>
          </div>

          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <Field label="Side">
              <Segmented
                value={side}
                onChange={setSide}
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'Attack', label: 'Attack' },
                  { value: 'Defense', label: 'Defense' },
                ]}
              />
            </Field>

            <Field label="First blood / death">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={firstEvent}
                  onChange={setFirstEvent}
                  options={[
                    { value: 'any', label: 'Any' },
                    { value: 'fb', label: 'First blood' },
                    { value: 'fd', label: 'First death' },
                  ]}
                />
                <SubjectPicker
                  className="w-44"
                  values={firstSubject ? [firstSubject] : []}
                  onChange={(next) => setFirstSubject(next[0] ?? '')}
                  players={scopedPlayers}
                  disabled={firstEvent === 'any'}
                  emptyLabel="Anyone"
                />
              </div>
            </Field>

            <Field label="Maps">
              <MultiMapPicker
                values={maps}
                onChange={(next) => setMaps(next.length ? next : null)}
              />
            </Field>

            <Field label="Spike plant">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={plant}
                  onChange={setPlant}
                  options={[
                    { value: 'any', label: 'Any' },
                    { value: 'yes', label: 'Planted' },
                    { value: 'no', label: 'No plant' },
                  ]}
                />
                <div className="flex items-center gap-1">
                  {PLANT_SITES.map((s) => {
                    const on = sitesEnabled && plantSites.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!sitesEnabled}
                        title={
                          sitesEnabled
                            ? `Spike planted on ${s}`
                            : 'Pick "Planted" to filter by site'
                        }
                        onClick={() =>
                          setPlantSites(
                            on
                              ? plantSites.filter((x) => x !== s)
                              : [...plantSites, s].sort()
                          )
                        }
                        className={`w-8 py-1 rounded text-sm font-semibold border transition-colors ${
                          on
                            ? 'bg-valorant-red text-white border-valorant-red'
                            : 'bg-valorant-panel2/40 text-valorant-muted border-white/10'
                        } ${
                          sitesEnabled
                            ? 'hover:text-white'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>

            <Field label="Multikill by">
              <SubjectPicker
                className="w-44"
                values={multikill ? [multikill] : []}
                onChange={(next) => setMultikill(next[0] ?? '')}
                players={scopedPlayers}
                emptyLabel="Anyone"
              />
            </Field>

            <SubjectField
              label="Got a kill"
              values={kills}
              onChange={(next) => setKills(next.length ? next : null)}
              players={scopedPlayers}
            />
            <SubjectField
              label="Died"
              values={deaths}
              onChange={(next) => setDeaths(next.length ? next : null)}
              players={scopedPlayers}
            />
            <SubjectField
              label="Got an assist"
              values={assists}
              onChange={(next) => setAssists(next.length ? next : null)}
              players={scopedPlayers}
            />
          </div>
        </div>
      </div>

      <div className="card space-y-2">
        <h3 className="font-semibold">Round win rate</h3>
        <div className="stat-grid">
          <StatBox
            label="Round W%"
            tally={result.overall}
            tooltip="Share of matching rounds we won"
            big
          />
          <StatBox
            label="All rounds"
            tally={result.baseline}
            tooltip="Every played round in the current stats filters, ignoring this tab's filters"
          />
          <div className="stat-box" title="Matching round win rate minus the baseline">
            <div className="stat-box-label">Vs. baseline</div>
            <div
              className={`stat-box-value text-xl ${
                delta === null
                  ? ''
                  : delta > 0.05
                    ? 'text-green-300'
                    : delta < -0.05
                      ? 'text-red-300'
                      : ''
              }`}
            >
              {delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
            </div>
            <div className="stat-box-sub">points</div>
          </div>
          <StatBox
            label="Attack"
            tally={result.bySide.Attack}
            tooltip="Matching rounds played on attack"
          />
          <StatBox
            label="Defense"
            tally={result.bySide.Defense}
            tooltip="Matching rounds played on defense"
          />
        </div>
        {needsRoundDetail(filters) && (
          <p className="text-xs text-valorant-muted">
            {result.gamesWithoutDetail > 0
              ? `${result.gamesWithoutDetail} of ${
                  result.gamesConsidered + result.gamesWithoutDetail
                } maps were skipped — kill, death, assist, multikill, and plant-site filters need the round-by-round detail that only tracker.gg imports carry.`
              : 'Kill, death, assist, multikill, and plant-site filters read the round-by-round detail from each map’s tracker.gg import.'}
          </p>
        )}
      </div>

      {result.byMap.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold">By map</h3>
          <div className="space-y-1">
            {result.byMap.map(({ map, tally }) => (
              <div key={map} className="flex items-center gap-3">
                <MapIcon map={map} width={40} height={24} />
                <span className="w-20 shrink-0 truncate text-sm font-medium">{map}</span>
                <div className="relative h-2 flex-1 min-w-[60px] rounded bg-white/10 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-valorant-red/70"
                    style={{ width: `${(tally.wins / tally.total) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {pct(tally.wins, tally.total)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-valorant-muted tabular-nums">
                  {tally.wins}/{tally.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MatchedRounds matches={result.matches} series={scopedSeries} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-valorant-muted mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

/** A multi-select subject filter. Picks are named in the picker's own button,
 * so the field is always exactly one control tall. */
function SubjectField({
  label,
  values,
  onChange,
  players,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  players: Player[];
}) {
  return (
    <Field label={label}>
      <SubjectPicker
        className="w-44"
        values={values}
        onChange={onChange}
        players={players}
        multi
        emptyLabel="Anyone"
      />
    </Field>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2 py-1 whitespace-nowrap text-sm ${
            value === o.value
              ? 'bg-valorant-red text-white'
              : 'bg-valorant-panel2/40 text-valorant-muted hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatBox({
  label,
  tally,
  tooltip,
  big,
}: {
  label: string;
  tally: Tally;
  tooltip: string;
  big?: boolean;
}) {
  return (
    <div className="stat-box" title={tooltip}>
      <div className="stat-box-label">{label}</div>
      <div className={`stat-box-value ${big ? 'text-2xl text-valorant-accent' : 'text-xl'}`}>
        {pct(tally.wins, tally.total)}
      </div>
      <div className="stat-box-sub">
        {tally.wins}/{tally.total} rounds
      </div>
    </div>
  );
}

function MatchedRounds({
  matches,
  series,
}: {
  matches: { game: Game; rounds: number[]; wins: number }[];
  series: Series[];
}) {
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);
  const sorted = useMemo(
    () =>
      [...matches].sort((a, b) => {
        if (a.game.date !== b.game.date) return b.game.date.localeCompare(a.game.date);
        return (b.game.order ?? 0) - (a.game.order ?? 0);
      }),
    [matches]
  );

  if (sorted.length === 0) {
    return (
      <div className="card text-center text-valorant-muted text-sm">
        No rounds match these circumstances yet.
      </div>
    );
  }

  return (
    <div className="card space-y-2 p-0">
      <h3 className="font-semibold px-4 pt-4">Matching rounds</h3>
      <div className="divide-y divide-white/5">
        {sorted.map(({ game, rounds, wins }) => (
          <Link
            key={game.id}
            to={`/series/${game.seriesId}/games/${game.id}`}
            className="flex items-center gap-3 px-4 py-2 hover:bg-valorant-panel2/40"
          >
            <MapIcon map={game.map} width={56} height={32} />
            <span className="font-medium w-24 truncate">{game.map}</span>
            <span className="text-sm text-valorant-muted truncate flex-1">
              vs. {seriesById.get(game.seriesId)?.opponent ?? '?'}
            </span>
            <span
              className="text-xs text-valorant-muted truncate max-w-[40%]"
              title={`Rounds ${rounds.join(', ')}`}
            >
              R{rounds.join(', ')}
            </span>
            <span className="tabular-nums font-semibold w-14 text-right">
              {wins}/{rounds.length}
            </span>
            <span className="text-xs text-valorant-muted w-24 text-right">{game.date}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
