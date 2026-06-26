import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { withAllMaps } from '../utils/scouting';
import { defaultRosterId } from '../utils/rosters';

export default function ScoutingPage() {
  const reports = useStore((s) => s.scoutingReports);
  const rosters = useStore((s) => s.rosters);
  const addScoutingReport = useStore((s) => s.addScoutingReport);
  const removeScoutingReport = useStore((s) => s.removeScoutingReport);
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

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = teamName.trim();
    if (!name) return;
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
      <div>
        <h2 className="text-xl font-semibold">Scouting</h2>
        <p className="text-sm text-valorant-muted">
          Build scouting reports on opponents: their map records, the
          compositions they run, and how they play each map.
        </p>
      </div>

      <form onSubmit={onAdd} className="card flex flex-wrap gap-3 items-end">
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
        <button className="btn-primary" type="submit" disabled={!teamName.trim()}>
          New report
        </button>
      </form>

      {sorted.length === 0 ? (
        <div className="card text-center text-valorant-muted">
          No scouting reports yet. Create one above.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => (
            <div key={r.id} className="card flex items-start justify-between gap-3">
              <Link to={`/scouting/${r.id}`} className="min-w-0 flex-1 group">
                <div className="font-semibold truncate group-hover:text-valorant-red">
                  {r.teamName}
                </div>
                {r.note && (
                  <div className="text-sm text-valorant-muted truncate">
                    {r.note}
                  </div>
                )}
                {rosterName(r.rosterId) && (
                  <div className="text-xs text-valorant-muted truncate mt-1">
                    {rosterName(r.rosterId)}
                  </div>
                )}
              </Link>
              <button
                type="button"
                className="btn-danger shrink-0"
                onClick={() => onDelete(r.id, r.teamName)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
