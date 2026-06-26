import { useState } from 'react';
import { MAPS } from '../constants';
import { useStore } from '../store';
import type { Series, SeriesFormat, SeriesPickBan, Side, ValorantMap } from '../types';
import {
  DECIDER_SIDE_TEAM,
  PICKBAN_STEPS,
  POOL_SIZE,
  isUs,
  playedMaps,
  sidePickerForStep,
  type Team,
} from '../utils/pickBan';
import MapIcon from './MapIcon';

type Props = {
  series: Series;
};

const blankPB = (): SeriesPickBan => ({
  pool: [],
  team1: 'us',
  moves: [],
});

export default function PickBanCard({ series }: Props) {
  const updateSeries = useStore((s) => s.updateSeries);
  const format = series.format;
  const [collapsed, setCollapsed] = useState(false);

  if (!format) {
    return (
      <div className="card text-sm text-valorant-muted">
        Pick a series format (BO1/BO3/BO5) above to enable map veto.
      </div>
    );
  }

  const pb = series.pickBan ?? blankPB();
  const steps = PICKBAN_STEPS[format];

  const update = (patch: Partial<SeriesPickBan>) => {
    updateSeries(series.id, {
      pickBan: { ...blankPB(), ...pb, ...patch },
    });
  };

  const togglePool = (m: ValorantMap) => {
    if (pb.pool.includes(m)) {
      // Removing a map invalidates any moves referencing it.
      const nextMoves = pb.moves.map((mv) =>
        mv?.map === m ? { ...mv, map: undefined } : mv
      );
      const deciderStillFromPool =
        pb.deciderSide && remainingAfter(pb.pool.filter((x) => x !== m), nextMoves).length === 1;
      update({
        pool: pb.pool.filter((x) => x !== m),
        moves: nextMoves,
        deciderSide: deciderStillFromPool ? pb.deciderSide : undefined,
      });
    } else if (pb.pool.length < POOL_SIZE) {
      update({ pool: [...pb.pool, m] });
    }
  };

  const setMove = (i: number, patch: Partial<{ map: ValorantMap; side: Side }>) => {
    const next = ensureLength(pb.moves, steps.length);
    next[i] = { ...next[i], ...patch };
    update({ moves: next });
  };

  const reset = () => {
    if (!confirm('Reset the map veto for this series?')) return;
    updateSeries(series.id, { pickBan: undefined });
  };

  const usedMaps = pb.moves.map((m) => m?.map).filter(Boolean) as ValorantMap[];
  const deciderRemaining = pb.pool.filter((m) => !usedMaps.includes(m));
  const allMovesDone =
    pb.pool.length === POOL_SIZE && pb.moves.filter((m) => m?.map).length === steps.length;

  const deciderTeam: Team = DECIDER_SIDE_TEAM[format];
  const summary = playedMaps(format, pb);

  const movesDone = pb.moves.filter((m) => m?.map).length;
  const statusLabel =
    pb.pool.length === 0
      ? 'Not started'
      : pb.pool.length < POOL_SIZE
        ? `Pool ${pb.pool.length}/${POOL_SIZE}`
        : !allMovesDone
          ? `Sequence ${movesDone}/${steps.length}`
          : !pb.deciderSide
            ? 'Awaiting decider side'
            : 'Complete';

  return (
    <div className={`card ${collapsed ? '' : 'space-y-5'}`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="text-valorant-muted text-xs w-4 inline-block">
            {collapsed ? '▶' : '▼'}
          </span>
          <h3 className="font-semibold">Map veto · {format}</h3>
          <span className="text-xs text-valorant-muted">· {statusLabel}</span>
        </button>
        {!collapsed && (pb.pool.length > 0 || pb.moves.length > 0) && (
          <button type="button" className="btn-danger" onClick={reset}>
            Reset
          </button>
        )}
      </div>

      {!collapsed && (
        <>
      {/* Pool */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">
            Map pool ({pb.pool.length}/{POOL_SIZE})
          </h4>
          {pb.pool.length === POOL_SIZE && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/20 text-green-200">
              ready
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {MAPS.map((m) => {
            const inPool = pb.pool.includes(m);
            const order = inPool ? pb.pool.indexOf(m) + 1 : null;
            return (
              <button
                key={m}
                type="button"
                onClick={() => togglePool(m)}
                className={`relative rounded overflow-hidden transition ${
                  inPool ? 'ring-2 ring-valorant-red' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <MapIcon map={m} fill rounded="" />
                <div className="absolute inset-x-0 bottom-0 px-1 py-1 bg-black/70 text-xs text-center font-medium">
                  {m}
                </div>
                {order !== null && (
                  <div className="absolute top-1 right-1 text-[10px] font-semibold w-4 h-4 rounded-full bg-valorant-red text-white flex items-center justify-center">
                    {order}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Team 1 */}
      <div>
        <h4 className="text-sm font-medium mb-2">Team 1</h4>
        <div className="inline-flex rounded overflow-hidden border border-white/10">
          <button
            type="button"
            onClick={() => update({ team1: 'us' })}
            className={`px-3 py-1.5 text-sm ${
              pb.team1 === 'us'
                ? 'bg-valorant-red/30 text-white'
                : 'bg-transparent text-valorant-muted hover:bg-white/5'
            }`}
          >
            Us
          </button>
          <button
            type="button"
            onClick={() => update({ team1: 'opp' })}
            className={`px-3 py-1.5 text-sm ${
              pb.team1 === 'opp'
                ? 'bg-valorant-red/30 text-white'
                : 'bg-transparent text-valorant-muted hover:bg-white/5'
            }`}
          >
            {series.opponent}
          </button>
        </div>
      </div>

      {/* Steps */}
      {pb.pool.length === POOL_SIZE && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Sequence</h4>
          <div className="space-y-1.5">
            {steps.map((step, i) => (
              <StepRow
                key={i}
                index={i}
                step={step}
                team1={pb.team1}
                opponent={series.opponent}
                allOptions={pb.pool}
                used={(pb.moves
                  .slice(0, i)
                  .map((m) => m?.map)
                  .filter(Boolean) as ValorantMap[])}
                value={pb.moves[i] ?? {}}
                onChange={(patch) => setMove(i, patch)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Decider */}
      {pb.pool.length === POOL_SIZE && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Decider · Map {steps.filter((s) => s.kind === 'pick').length + 1}</h4>
          {deciderRemaining.length === 1 ? (
            <div className="flex items-center gap-3 bg-valorant-panel2/40 rounded p-2">
              <MapIcon map={deciderRemaining[0]} width={64} height={36} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{deciderRemaining[0]}</div>
                <div className="text-xs text-valorant-muted">
                  {teamLabel(deciderTeam, pb.team1, series.opponent)} picks side
                </div>
              </div>
              <SideToggle
                value={pb.deciderSide}
                onChange={(s) => update({ deciderSide: s })}
              />
            </div>
          ) : (
            <p className="text-xs text-valorant-muted">
              Fill in the sequence above to determine the decider.
            </p>
          )}
        </div>
      )}

      {/* Summary of maps to play */}
      {summary.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Maps to play</h4>
          <div className="space-y-1.5">
            {summary.map((m) => (
              <div
                key={m.number}
                className="flex items-center gap-3 bg-valorant-panel2/40 rounded p-2"
              >
                <span className="text-xs text-valorant-muted w-10 text-center">
                  Map {m.number}
                </span>
                <MapIcon map={m.map} width={56} height={32} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.map}</div>
                  <div className="text-xs text-valorant-muted">
                    {m.pickedBy === null
                      ? 'Decider'
                      : `Picked by ${teamLabel(m.pickedBy, pb.team1, series.opponent)}`}
                    {' · '}
                    {teamLabel(m.sidePickerTeam, pb.team1, series.opponent)} picks side
                    {m.sidePickerSide && (
                      <>
                        {' · '}
                        <span className="text-valorant-accent">
                          {teamLabel(m.sidePickerTeam, pb.team1, series.opponent)} starts{' '}
                          {m.sidePickerSide}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {m.ourSide && (
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      m.ourSide === 'Attack'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-blue-500/15 text-blue-300'
                    }`}
                  >
                    We start {m.ourSide}
                  </span>
                )}
              </div>
            ))}
          </div>
          {allMovesDone && pb.deciderSide && (
            <p className="text-xs text-green-300">Veto complete.</p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function StepRow({
  index,
  step,
  team1,
  opponent,
  allOptions,
  used,
  value,
  onChange,
}: {
  index: number;
  step: { team: Team; kind: 'ban' | 'pick' };
  team1: 'us' | 'opp';
  opponent: string;
  allOptions: ValorantMap[];
  used: ValorantMap[];
  value: { map?: ValorantMap; side?: Side };
  onChange: (patch: Partial<{ map: ValorantMap; side: Side }>) => void;
}) {
  const optionMaps = allOptions.filter(
    (m) => !used.includes(m) || value.map === m
  );
  const sidePicker = sidePickerForStep(step);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded p-2 ${
        step.kind === 'ban'
          ? 'bg-red-500/5 border border-red-500/10'
          : 'bg-green-500/5 border border-green-500/10'
      }`}
    >
      <span className="text-xs text-valorant-muted w-10 text-center">
        Step {index + 1}
      </span>
      <div className="text-sm flex-1 min-w-[180px]">
        <span className="font-medium">
          {teamLabel(step.team, team1, opponent)}
        </span>{' '}
        {step.kind === 'ban' ? 'bans' : 'picks'}
        {step.kind === 'pick' && sidePicker !== undefined && (
          <span className="text-valorant-muted">
            {' · '}
            {teamLabel(sidePicker, team1, opponent)} picks side
          </span>
        )}
      </div>
      <select
        className="input w-44"
        value={value.map ?? ''}
        onChange={(e) =>
          onChange({ map: (e.target.value || undefined) as ValorantMap | undefined })
        }
      >
        <option value="">— Map —</option>
        {optionMaps.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {value.map && <MapIcon map={value.map} width={48} height={28} />}
      {step.kind === 'pick' && (
        <SideToggle
          value={value.side}
          onChange={(s) => onChange({ side: s })}
        />
      )}
    </div>
  );
}

function SideToggle({
  value,
  onChange,
}: {
  value: Side | undefined;
  onChange: (s: Side) => void;
}) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-white/10">
      <button
        type="button"
        onClick={() => onChange('Attack')}
        className={`px-2.5 py-1 text-xs ${
          value === 'Attack'
            ? 'bg-red-500/30 text-red-100'
            : 'bg-transparent text-valorant-muted hover:bg-white/5'
        }`}
      >
        Attack
      </button>
      <button
        type="button"
        onClick={() => onChange('Defense')}
        className={`px-2.5 py-1 text-xs ${
          value === 'Defense'
            ? 'bg-blue-500/30 text-blue-100'
            : 'bg-transparent text-valorant-muted hover:bg-white/5'
        }`}
      >
        Defense
      </button>
    </div>
  );
}

function teamLabel(team: Team, team1: 'us' | 'opp', opponent: string): string {
  const label = team === 1 ? 'T1' : 'T2';
  const who = isUs(team, team1) ? 'Us' : opponent;
  return `${label} (${who})`;
}

function ensureLength<T>(arr: T[], length: number): T[] {
  const next = [...arr];
  while (next.length < length) next.push({} as T);
  return next.slice(0, length);
}

function remainingAfter(
  pool: ValorantMap[],
  moves: { map?: ValorantMap }[]
): ValorantMap[] {
  const used = moves.map((m) => m?.map).filter(Boolean) as ValorantMap[];
  return pool.filter((m) => !used.includes(m));
}

