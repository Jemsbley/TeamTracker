import { useEffect, useState } from 'react';
import { parseAsString, useQueryState } from 'nuqs';
import { useStore, canEditRoster, isRosterOwner } from '../store';
import { useAuth } from '../authStore';
import { generateMockSeries } from '../utils/mockSeed';
import { defaultRosterId } from '../utils/rosters';
import PageHeader from '../components/PageHeader';
import RosterSharing from '../components/RosterSharing';
import WriteButton, { WRITE_TOOLTIP } from '../components/WriteButton';

export default function RosterPage() {
  const rosters = useStore((s) => s.rosters);
  const players = useStore((s) => s.players);
  const series = useStore((s) => s.series);
  const addRoster = useStore((s) => s.addRoster);
  const updateRoster = useStore((s) => s.updateRoster);
  const setPrimaryRoster = useStore((s) => s.setPrimaryRoster);
  const removeRoster = useStore((s) => s.removeRoster);
  const addPlayer = useStore((s) => s.addPlayer);
  const updatePlayer = useStore((s) => s.updatePlayer);
  const removePlayer = useStore((s) => s.removePlayer);

  const [activeRosterId, setActiveRosterId] = useQueryState(
    'roster',
    parseAsString
  );
  // Default-select the primary roster (or first) if none selected, or if the
  // active one is gone.
  useEffect(() => {
    if (
      rosters.length > 0 &&
      (!activeRosterId || !rosters.find((r) => r.id === activeRosterId))
    ) {
      setActiveRosterId(defaultRosterId(rosters));
    }
  }, [rosters, activeRosterId]);

  const accountType = useAuth((s) => s.user?.accountType);
  const canEdit = useStore((s) => canEditRoster(s, activeRosterId ?? undefined));
  const isOwner = useStore((s) => isRosterOwner(s, activeRosterId ?? undefined));

  const activeRoster = rosters.find((r) => r.id === activeRosterId) ?? null;
  const rosterPlayers = activeRoster
    ? players.filter((p) => p.rosterId === activeRoster.id)
    : [];
  const mainCount = rosterPlayers.filter((p) => p.isMainRoster).length;
  const seriesCount = activeRoster
    ? series.filter((s) => s.rosterId === activeRoster.id).length
    : 0;

  const [name, setName] = useState('');
  const [isMain, setIsMain] = useState(true);
  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoster || !canEdit) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    addPlayer({
      name: trimmed,
      isMainRoster: isMain,
      rosterId: activeRoster.id,
    });
    setName('');
  };

  const onAddRoster = () => {
    const n = prompt('Roster name?', `Roster ${rosters.length + 1}`);
    if (!n) return;
    const r = addRoster({ name: n.trim() });
    setActiveRosterId(r.id);
  };

  const onRenameRoster = () => {
    if (!activeRoster) return;
    const n = prompt('Rename roster:', activeRoster.name);
    if (!n) return;
    updateRoster(activeRoster.id, { name: n.trim() });
  };

  const onDeleteRoster = () => {
    if (!activeRoster) return;
    if (rosters.length <= 1) {
      alert("Can't delete the last roster.");
      return;
    }
    const psCount = players.filter((p) => p.rosterId === activeRoster.id).length;
    const sCount = series.filter((s) => s.rosterId === activeRoster.id).length;
    if (
      !confirm(
        `Delete roster "${activeRoster.name}"? This will also remove ${psCount} player(s), ${sCount} series, and all their stats.`
      )
    )
      return;
    removeRoster(activeRoster.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rosters"
        titleGrow={false}
        description={
          <>
            {rosters.length} roster{rosters.length === 1 ? '' : 's'} ·{' '}
            {players.length} player{players.length === 1 ? '' : 's'} total
          </>
        }
      >
        <div data-grow className="flex flex-wrap items-center gap-1.5">
          {rosters.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveRosterId(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeRoster?.id === r.id
                  ? 'bg-valorant-red text-white'
                  : 'bg-valorant-panel2 text-valorant-accent hover:bg-valorant-panel'
              }`}
            >
              {r.isPrimary && (
                <span
                  className="mr-1"
                  title="Primary roster"
                  aria-label="Primary roster"
                >
                  ★
                </span>
              )}
              {r.name}
            </button>
          ))}
          <button
            type="button"
            onClick={onAddRoster}
            className="px-3 py-1.5 rounded-md text-sm border border-dashed border-white/15 text-valorant-muted hover:bg-white/5"
          >
            + New roster
          </button>
        </div>
        {accountType === 'test' && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (
                !confirm(
                  'Generate 20 mock series in the current roster (3 BO1, 15 BO3, 2 BO5; 6 maps go to OT)? Existing data will be kept.'
                )
              )
                return;
              try {
                if (!activeRoster) throw new Error('Pick a roster first.');
                const r = generateMockSeries(activeRoster.id);
                alert(
                  `Added ${r.added.series} series, ${r.added.games} maps (${r.added.otGames} OT) to "${activeRoster.name}".`
                );
              } catch (err) {
                alert((err as Error).message);
              }
            }}
          >
            Generate mock data
          </button>
        )}
      </PageHeader>

      {activeRoster && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-lg flex items-center gap-2">
                  {activeRoster.name}
                  {activeRoster.isPrimary && (
                    <span className="text-xs font-medium rounded-full bg-valorant-red/20 text-valorant-red px-2 py-0.5">
                      ★ Primary
                    </span>
                  )}
                </div>
                <div className="text-xs text-valorant-muted">
                  {mainCount} main · {rosterPlayers.length - mainCount} sub ·{' '}
                  {seriesCount} series
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPrimaryRoster(activeRoster.id)}
                  disabled={activeRoster.isPrimary}
                  title={
                    activeRoster.isPrimary
                      ? 'This is already your primary roster'
                      : 'Preselect this roster everywhere a roster is chosen'
                  }
                >
                  {activeRoster.isPrimary ? '★ Primary' : 'Set as primary'}
                </button>
                <WriteButton
                  canEdit={canEdit}
                  type="button"
                  className="btn-ghost"
                  onClick={onRenameRoster}
                >
                  Rename
                </WriteButton>
                <WriteButton
                  canEdit={isOwner}
                  type="button"
                  className="btn-danger"
                  onClick={onDeleteRoster}
                >
                  Delete roster
                </WriteButton>
              </div>
            </div>

            <form onSubmit={onAdd} className="card flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="label">Player name</label>
                <input
                  className="input disabled:opacity-50 disabled:cursor-not-allowed"
                  value={name}
                  disabled={!canEdit}
                  title={!canEdit ? WRITE_TOOLTIP : undefined}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Phantom"
                />
              </div>
              <div>
                <label className="label">Roster slot</label>
                <select
                  className="input disabled:opacity-50 disabled:cursor-not-allowed"
                  value={isMain ? 'main' : 'sub'}
                  disabled={!canEdit}
                  onChange={(e) => setIsMain(e.target.value === 'main')}
                >
                  <option value="main">Main (starting 5)</option>
                  <option value="sub">Substitute</option>
                </select>
              </div>
              <WriteButton canEdit={canEdit} type="submit" className="btn-primary">
                Add player
              </WriteButton>
            </form>
          </div>

          {!canEdit && (
            <div className="card text-sm text-valorant-muted">
              You have view-only access to this roster. Ask the roster owner for
              edit permission to make changes.
            </div>
          )}

          <div className="card overflow-hidden p-0">
            <table className="w-full">
              <thead className="bg-valorant-panel2/40">
                <tr>
                  <th className="table-head">Name</th>
                  <th className="table-head">Slot</th>
                  <th className="table-head w-px"></th>
                </tr>
              </thead>
              <tbody>
                {rosterPlayers.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="p-6 text-center text-valorant-muted"
                    >
                      No players yet — add your starting five above.
                    </td>
                  </tr>
                )}
                {rosterPlayers.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="table-cell">
                      <input
                        className="input bg-transparent border-transparent hover:border-white/10 focus:border-white/10 disabled:hover:border-transparent"
                        value={p.name}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updatePlayer(p.id, { name: e.target.value })
                        }
                      />
                    </td>
                    <td className="table-cell">
                      <select
                        className="input bg-transparent border-transparent hover:border-white/10 focus:border-white/10 w-auto disabled:hover:border-transparent"
                        value={p.isMainRoster ? 'main' : 'sub'}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updatePlayer(p.id, {
                            isMainRoster: e.target.value === 'main',
                          })
                        }
                      >
                        <option value="main">Main</option>
                        <option value="sub">Substitute</option>
                      </select>
                    </td>
                    <td className="table-cell">
                      <WriteButton
                        canEdit={canEdit}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${p.name}? Their stats will be removed from all games.`
                            )
                          )
                            removePlayer(p.id);
                        }}
                        className="btn-danger"
                      >
                        Remove
                      </WriteButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isOwner && (
            <RosterSharing rosterId={activeRoster.id} players={rosterPlayers} />
          )}
        </>
      )}
    </div>
  );
}
