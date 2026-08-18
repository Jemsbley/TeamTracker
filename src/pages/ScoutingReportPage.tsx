import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { MAPS } from '../constants';
import { useStore, canEditRoster } from '../store';
import { WRITE_TOOLTIP } from '../components/WriteButton';
import type { ScoutComp, ScoutMap, ScoutingReport, ValorantMap } from '../types';
import { sortScoutMaps, withAllMaps } from '../utils/scouting';
import AgentPicker from '../components/AgentPicker';
import PageHeader from '../components/PageHeader';
import MapIcon from '../components/MapIcon';
import RecordStepper from '../components/RecordStepper';

const MAX_COMPS = 3;
const COMP_SIZE = 5;

export default function ScoutingReportPage() {
  const { reportId } = useParams();
  const report = useStore((s) =>
    s.scoutingReports.find((r) => r.id === reportId)
  );

  if (!report) {
    return (
      <div className="space-y-4">
        <Link to="/scouting" className="text-sm text-valorant-muted hover:text-valorant-accent">
          ← Scouting
        </Link>
        <div className="card text-center text-valorant-muted">
          Scouting report not found.
        </div>
      </div>
    );
  }

  return <ReportEditor key={report.id} report={report} />;
}

function ReportEditor({ report }: { report: ScoutingReport }) {
  const update = useStore((s) => s.updateScoutingReport);
  const rosters = useStore((s) => s.rosters);
  const linkedSeries = useStore((s) =>
    s.series.filter((x) => x.scoutingReportId === report.id)
  );
  // Roster-attached reports need edit access on that roster; unattached
  // (personal) reports are editable by their owner unless this is an admin view.
  const canEdit = useStore((s) =>
    report.rosterId ? canEditRoster(s, report.rosterId) : !s.adminViewing
  );

  const [selectedMap, setSelectedMap] = useQueryState(
    'map',
    parseAsStringEnum<ValorantMap>([...MAPS])
  );

  // Backfill maps for older reports so every map has a row. Skip for view-only
  // users — they can't write, and firing it would surface a sync error.
  useEffect(() => {
    if (!canEdit) return;
    const haveAll =
      report.maps.length === MAPS.length &&
      MAPS.every((m) => report.maps.some((x) => x.map === m));
    if (!haveAll) update(report.id, { maps: withAllMaps(report.maps) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, canEdit]);

  const setMaps = (maps: ScoutMap[]) => {
    if (!canEdit) return;
    update(report.id, { maps });
  };
  const patchMap = (map: ValorantMap, changes: Partial<ScoutMap>) =>
    setMaps(report.maps.map((m) => (m.map === map ? { ...m, ...changes } : m)));

  // Sort by record when focus leaves the records section. Read the freshest
  // maps from the store so any just-committed edit is included.
  const onRecordsBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const current = useStore
      .getState()
      .scoutingReports.find((r) => r.id === report.id);
    if (current) setMaps(sortScoutMaps(current.maps));
  };

  const active = selectedMap
    ? report.maps.find((m) => m.map === selectedMap) ?? null
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={report.teamName || 'Untitled report'}
        description={
          <Link
            to="/scouting"
            className="text-xs text-valorant-muted hover:text-valorant-accent"
          >
            ← Scouting
          </Link>
        }
      />

      {linkedSeries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-valorant-muted">Linked series:</span>
          {linkedSeries.map((s) => (
            <Link
              key={s.id}
              to={`/series/${s.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-valorant-panel2 px-2.5 py-1 hover:text-valorant-red"
            >
              vs. {s.opponent}
              <span className="text-valorant-muted">· {s.date}</span>
            </Link>
          ))}
        </div>
      )}

      {!canEdit && (
        <div className="card text-sm text-valorant-muted">
          You have view-only access to this scouting report. Ask your roster
          manager for edit permission to make changes.
        </div>
      )}

      {/* Team name + note */}
      <div className="card">
        <fieldset
          disabled={!canEdit}
          title={!canEdit ? WRITE_TOOLTIP : undefined}
          className="flex flex-wrap gap-3 items-end min-w-0 border-0 p-0 m-0 disabled:opacity-60"
        >
          <div className="flex-1 min-w-[220px]">
            <label className="label">Team name</label>
            <input
              className="input"
              value={report.teamName}
              onChange={(e) => update(report.id, { teamName: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="label">Note</label>
            <input
              className="input"
              value={report.note ?? ''}
              placeholder="e.g. NECC week 4"
              onChange={(e) =>
                update(report.id, { note: e.target.value || undefined })
              }
            />
          </div>
          {rosters.length > 0 && (
            <div className="min-w-[180px]">
              <label className="label">Roster</label>
              <select
                className="input"
                value={report.rosterId ?? ''}
                onChange={(e) =>
                  update(report.id, { rosterId: e.target.value || null })
                }
              >
                <option value="">— Unassigned —</option>
                {rosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isPrimary ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>
      </div>

      {/* Map records — sorts by record when you click off the section */}
      <div className="card space-y-1" onBlur={onRecordsBlur}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Map record</h3>
          <p className="text-xs text-valorant-muted">
            Click a map to add compositions & playstyle notes
          </p>
        </div>
        <div className="divide-y divide-white/5">
          {report.maps.map((m) => {
            const isActive = selectedMap === m.map;
            const compCount = m.comps.filter((c) =>
              c.some((a) => a)
            ).length;
            const hasNotes = !!(m.attackNotes?.trim() || m.defenseNotes?.trim());
            return (
              <div
                key={m.map}
                className={`flex items-center gap-4 py-2 px-2 -mx-2 rounded ${
                  isActive ? 'bg-valorant-panel2' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedMap(isActive ? null : m.map)}
                  className="flex items-center gap-2 w-44 shrink-0 text-left hover:text-valorant-red"
                >
                  <MapIcon map={m.map} width={40} height={24} />
                  <span className="font-medium truncate">{m.map}</span>
                </button>

                <span
                  className={!canEdit ? 'opacity-50' : undefined}
                  title={!canEdit ? WRITE_TOOLTIP : undefined}
                >
                  <RecordStepper
                    wins={m.wins}
                    losses={m.losses}
                    onChange={(wins, losses) => patchMap(m.map, { wins, losses })}
                  />
                </span>

                <input
                  className="input flex-1 min-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Record note — e.g. 3 wins are against golds"
                  value={m.note ?? ''}
                  disabled={!canEdit}
                  title={!canEdit ? WRITE_TOOLTIP : undefined}
                  onChange={(e) => patchMap(m.map, { note: e.target.value })}
                />

                {(compCount > 0 || hasNotes) && (
                  <span className="text-xs text-valorant-muted shrink-0 whitespace-nowrap">
                    {compCount > 0 && `${compCount} comp${compCount > 1 ? 's' : ''}`}
                    {compCount > 0 && hasNotes && ' · '}
                    {hasNotes && 'notes'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-map detail: compositions + attack/defense notes */}
      {active && (
        <MapDetail
          map={active}
          canEdit={canEdit}
          onClose={() => setSelectedMap(null)}
          onChange={(changes) => patchMap(active.map, changes)}
        />
      )}
    </div>
  );
}

function MapDetail({
  map,
  canEdit,
  onClose,
  onChange,
}: {
  map: ScoutMap;
  canEdit: boolean;
  onClose: () => void;
  onChange: (changes: Partial<ScoutMap>) => void;
}) {
  const updateComp = (compIdx: number, slotIdx: number, agent: string) => {
    const comps = map.comps.map((c, i) =>
      i === compIdx ? c.map((a, j) => (j === slotIdx ? agent : a)) : c
    );
    onChange({ comps });
  };

  const addComp = () => {
    if (map.comps.length >= MAX_COMPS) return;
    const blank: ScoutComp = Array(COMP_SIZE).fill('');
    onChange({ comps: [...map.comps, blank] });
  };

  const removeComp = (compIdx: number) => {
    onChange({ comps: map.comps.filter((_, i) => i !== compIdx) });
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-3">
        <MapIcon map={map.map} width={56} height={32} />
        <h3 className="text-lg font-semibold flex-1">{map.map}</h3>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <fieldset
        disabled={!canEdit}
        title={!canEdit ? WRITE_TOOLTIP : undefined}
        className="space-y-5 min-w-0 border-0 p-0 m-0 disabled:opacity-60"
      >
      {/* Compositions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Compositions</h4>
          <span className="text-xs text-valorant-muted">
            {map.comps.length}/{MAX_COMPS}
          </span>
        </div>

        {map.comps.length === 0 && (
          <p className="text-sm text-valorant-muted">
            No compositions recorded yet.
          </p>
        )}

        {map.comps.map((comp, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <span className="text-xs text-valorant-muted w-5 shrink-0">
              {ci + 1}.
            </span>
            <div className="grid grid-cols-5 gap-2 flex-1">
              {Array.from({ length: COMP_SIZE }).map((_, si) => (
                <AgentPicker
                  key={si}
                  value={comp[si] ?? ''}
                  includeEmpty
                  emptyLabel="—"
                  onChange={(agent) => updateComp(ci, si, agent)}
                  className="w-full"
                />
              ))}
            </div>
            <button
              type="button"
              className="text-valorant-muted hover:text-valorant-accent shrink-0 px-1"
              aria-label={`Remove composition ${ci + 1}`}
              onClick={() => removeComp(ci)}
            >
              ×
            </button>
          </div>
        ))}

        {map.comps.length < MAX_COMPS && (
          <button type="button" className="btn-ghost" onClick={addComp}>
            + Add composition
          </button>
        )}
      </div>

      {/* Attack / Defense playstyle notes, side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Attack</label>
          <textarea
            className="input min-h-[140px] resize-y"
            placeholder="How they play attack on this map…"
            value={map.attackNotes ?? ''}
            onChange={(e) => onChange({ attackNotes: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Defense</label>
          <textarea
            className="input min-h-[140px] resize-y"
            placeholder="How they play defense on this map…"
            value={map.defenseNotes ?? ''}
            onChange={(e) => onChange({ defenseNotes: e.target.value })}
          />
        </div>
      </div>
      </fieldset>
    </div>
  );
}
