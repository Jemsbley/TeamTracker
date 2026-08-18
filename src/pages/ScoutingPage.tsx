import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, canEditRoster } from '../store';
import PageHeader from '../components/PageHeader';
import WriteButton from '../components/WriteButton';
import MapIcon from '../components/MapIcon';
import { favoriteMap, withAllMaps } from '../utils/scouting';
import { defaultRosterId } from '../utils/rosters';

export default function ScoutingPage() {
  const reports = useStore((s) => s.scoutingReports);
  const rosters = useStore((s) => s.rosters);
  const addScoutingReport = useStore((s) => s.addScoutingReport);
  const removeScoutingReport = useStore((s) => s.removeScoutingReport);
  const series = useStore((s) => s.series);
  const adminViewing = useStore((s) => s.adminViewing);
  const gate = { rosters, series, adminViewing };
  const navigate = useNavigate();

  const [teamName, setTeamName] = useState('');
  const [note, setNote] = useState('');
  const [rosterId, setRosterId] = useState<string>(() =>
    defaultRosterId(rosters)
  );

  // Keep the picker pointed at a real roster as rosters load/change.
  if (rosterId && !rosters.find((r) => r.id === rosterId)) {
    setRosterId(defaultRosterId(rosters));
  }

  const rosterName = (id?: string | null) =>
    rosters.find((r) => r.id === id)?.name ?? null;

  // Attaching to a roster requires write access there; unattached (personal)
  // reports can always be created by their owner.
  const canCreate = !rosterId || canEditRoster(gate, rosterId);

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = teamName.trim();
    if (!name || !canCreate) return;
    const report = addScoutingReport({
      teamName: name,
      note: note.trim() || undefined,
      rosterId: rosterId || null,
      maps: withAllMaps(),
    });
    setTeamName('');
    setNote('');
    navigate(`/scouting/${report.id}`);
  };

  const onDelete = (id: string, name: string) => {
    if (window.confirm(`Delete the scouting report for "${name}"?`)) {
      removeScoutingReport(id);
    }
  };

  const sorted = [...reports].sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scouting"
        titleGrow={false}
        description="Insights on opponents"
      >
      <form onSubmit={onAdd} className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Team name</label>
          <input
            className="input"
            value={teamName}
            placeholder="Opponent team"
            onChange={(e) => setTeamName(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="label">Note (optional)</label>
          <input
            className="input"
            value={note}
            placeholder="e.g. NECC week 4"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {rosters.length > 0 && (
          <div>
            <label className="label">Roster</label>
            <select
              className="input"
              value={rosterId}
              onChange={(e) => setRosterId(e.target.value)}
            >
              {rosters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.isPrimary ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <WriteButton
          canEdit={canCreate}
          className="btn-primary"
          type="submit"
          disabled={!teamName.trim()}
        >
          New report
        </WriteButton>
      </form>
      </PageHeader>

      <div className="card space-y-3">
        <h3 className="font-semibold">Reports</h3>
        {sorted.length === 0 ? (
          <div className="text-valorant-muted">
            No scouting reports yet. Create one above.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((r) => {
              const favMap = favoriteMap(r.maps);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-white/10 p-3 flex items-start justify-between gap-3"
                >
                  <Link to={`/scouting/${r.id}`} className="min-w-0 flex-1 group">
                    <div className="font-semibold truncate group-hover:text-valorant-red">
                      {r.teamName}
                    </div>
                    {r.note && (
                      <div className="text-sm text-valorant-muted truncate">
                        {r.note}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-valorant-muted truncate mt-1">
                      {rosterName(r.rosterId) && <span>{rosterName(r.rosterId)}</span>}
                      {rosterName(r.rosterId) && r.createdAt && <span>·</span>}
                      {r.createdAt && <span>{r.createdAt}</span>}
                    </div>
                    {favMap && (
                      <div className="flex items-center gap-1.5 text-xs text-valorant-muted mt-1.5">
                        <MapIcon map={favMap} width={20} height={20} />
                        <span>Favorite map: {favMap}</span>
                      </div>
                    )}
                  </Link>
                  <WriteButton
                    canEdit={!r.rosterId || canEditRoster(gate, r.rosterId)}
                    type="button"
                    className="btn-danger shrink-0"
                    onClick={() => onDelete(r.id, r.teamName)}
                  >
                    Delete
                  </WriteButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
