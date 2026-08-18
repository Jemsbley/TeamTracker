import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authStore';
import { useStore } from '../store';
import PageHeader from '../components/PageHeader';
import DateRangePicker from '../components/DateRangePicker';
import { me } from '../api/endpoints';

type ClearMode = 'all' | 'filtered';

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const logout = useAuth((s) => s.logout);
  const clearLocal = useStore((s) => s.clearLocal);
  const rosters = useStore((s) => s.rosters);
  const players = useStore((s) => s.players);
  const clearAllData = useStore((s) => s.clearAllData);
  const clearFilteredData = useStore((s) => s.clearFilteredData);
  const navigate = useNavigate();

  const [username, setUsername] = useState(user?.username ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [clearMode, setClearMode] = useState<ClearMode>('all');
  const [clearRosterId, setClearRosterId] = useState('');
  const [clearStart, setClearStart] = useState<string | null>(null);
  const [clearEnd, setClearEnd] = useState<string | null>(null);

  if (!user) return null;

  const saveUsername = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNameMsg(null);
    setSavingName(true);
    try {
      const updated = await me.update({ username: username.trim() });
      setUser(updated);
      setNameMsg('Username updated.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const onClearData = () => {
    if (clearMode === 'all') {
      const owned = rosters.filter((r) => r.myRole === 'owner');
      const ownedPlayers = players.filter((p) =>
        owned.some((r) => r.id === p.rosterId)
      );
      if (
        !confirm(
          `This will permanently delete EVERYTHING: ${owned.length} roster(s), ${ownedPlayers.length} player(s), and all their series and stats.\n\nAre you sure?`
        )
      )
        return;
      if (prompt('Type DELETE in all caps to confirm:') !== 'DELETE') {
        alert('Cancelled.');
        return;
      }
      clearAllData();
      return;
    }

    const rosterName = clearRosterId
      ? rosters.find((r) => r.id === clearRosterId)?.name
      : null;
    const scopeParts = [
      rosterName ? `roster "${rosterName}"` : null,
      clearStart || clearEnd
        ? `dated ${clearStart ?? 'the start'} through ${clearEnd ?? 'now'}`
        : null,
    ].filter(Boolean);
    const scopeDesc = scopeParts.length
      ? scopeParts.join(', ')
      : 'ALL series, games, and scouting reports you have access to';
    if (
      !confirm(
        `This will permanently delete series, games, and scouting reports matching: ${scopeDesc}.\n\nAre you sure?`
      )
    )
      return;
    if (prompt('Type DELETE in all caps to confirm:') !== 'DELETE') {
      alert('Cancelled.');
      return;
    }
    const result = clearFilteredData({
      rosterId: clearRosterId || undefined,
      startDate: clearStart || undefined,
      endDate: clearEnd || undefined,
    });
    alert(
      `Deleted ${result.series} series and ${result.reports} scouting report(s).`
    );
  };

  const deleteAccount = async () => {
    if (
      !confirm(
        'Delete your account permanently? This removes the rosters you created and all their data. This cannot be undone.'
      )
    )
      return;
    setError(null);
    setDeleting(true);
    try {
      await me.remove();
      logout();
      clearLocal();
      navigate('/login', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <PageHeader
        title="Account settings"
        description={`Signed in with Google as ${user.email}`}
      />

      <form onSubmit={saveUsername} className="space-y-3">
        <label className="block text-sm text-valorant-muted">Username</label>
        <input
          type="text"
          value={username}
          maxLength={40}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded bg-valorant-panel2 border border-white/5"
        />
        <button
          type="submit"
          disabled={savingName || username.trim().length === 0}
          className="px-3 py-2 rounded bg-valorant-red text-white font-medium disabled:opacity-50"
        >
          {savingName ? 'Saving…' : 'Save username'}
        </button>
        {nameMsg && <p className="text-sm text-green-400">{nameMsg}</p>}
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="border-t-2 border-red-500/40 pt-6 space-y-6">
        <h3 className="text-lg font-semibold text-red-300">Danger zone</h3>

        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-valorant-accent">
              Clear data
            </h4>
            <p className="text-sm text-valorant-muted">
              "Everything" wipes every roster you own, including its players,
              series, and stats. "Filtered" only deletes series, games, and
              scouting reports matching the roster and/or date range below —
              rosters and players are kept.
            </p>
          </div>

          <div className="inline-flex rounded overflow-hidden border border-white/10">
            <button
              type="button"
              onClick={() => setClearMode('all')}
              className={`px-3 py-1.5 text-sm ${
                clearMode === 'all'
                  ? 'bg-valorant-red text-white'
                  : 'bg-valorant-panel2 text-valorant-muted hover:text-white'
              }`}
            >
              Everything
            </button>
            <button
              type="button"
              onClick={() => setClearMode('filtered')}
              className={`px-3 py-1.5 text-sm ${
                clearMode === 'filtered'
                  ? 'bg-valorant-red text-white'
                  : 'bg-valorant-panel2 text-valorant-muted hover:text-white'
              }`}
            >
              Filtered
            </button>
          </div>

          <div
            className={`flex flex-wrap gap-3 items-end ${
              clearMode === 'filtered' ? '' : 'invisible'
            }`}
          >
            <div className="w-48">
              <label className="label">Roster</label>
              <select
                className="input truncate"
                value={clearRosterId}
                onChange={(e) => setClearRosterId(e.target.value)}
              >
                <option value="">All rosters</option>
                {rosters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="label">Date range</label>
              <DateRangePicker
                start={clearStart}
                end={clearEnd}
                onChange={(s, e) => {
                  setClearStart(s);
                  setClearEnd(e);
                }}
              />
            </div>
          </div>

          <button type="button" onClick={onClearData} className="btn-danger">
            Clear data
          </button>
        </div>

        <div className="space-y-3 border-t border-white/10 pt-6">
          <div>
            <h4 className="text-sm font-medium text-valorant-accent">
              Delete account
            </h4>
            <p className="text-sm text-valorant-muted">
              Deleting your account removes the rosters you created and all
              their data.
            </p>
          </div>
          <button
            onClick={deleteAccount}
            disabled={deleting}
            className="btn-danger"
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
