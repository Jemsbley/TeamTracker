import { useEffect, useState } from 'react';
import type { Player } from '../types';
import { members, invites, type Member } from '../api/endpoints';

/**
 * Owner-only panel for a roster: manage member access levels and generate
 * per-player invite links. Rendered inside RosterPage when the current user
 * owns the active roster.
 */
export default function RosterSharing({
  rosterId,
  players,
}: {
  rosterId: string;
  players: Player[];
}) {
  const [memberList, setMemberList] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    members
      .list(rosterId)
      .then((m) => live && setMemberList(m))
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [rosterId]);

  const setRole = async (userId: string, role: 'editor' | 'viewer') => {
    setError(null);
    const prev = memberList;
    setMemberList((ms) => ms.map((m) => (m.userId === userId ? { ...m, role } : m)));
    try {
      await members.setRole(rosterId, userId, role);
    } catch (e) {
      setMemberList(prev);
      setError((e as Error).message);
    }
  };

  const removeMember = async (m: Member) => {
    if (!confirm(`Remove ${m.username ?? m.email} from this roster?`)) return;
    setError(null);
    try {
      await members.remove(rosterId, m.userId);
      setMemberList((ms) => ms.filter((x) => x.userId !== m.userId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyInvite = async (playerId: string) => {
    setError(null);
    try {
      const invite = await invites.create(rosterId, playerId, 'viewer');
      const url = `${window.location.origin}/invite/${invite.token}`;
      await navigator.clipboard.writeText(url);
      setCopied(playerId);
      setTimeout(() => setCopied((c) => (c === playerId ? null : c)), 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="card space-y-5">
      <div>
        <h3 className="font-semibold">Members &amp; sharing</h3>
        <p className="text-xs text-valorant-muted">
          Send a player's invite link to connect their account. Invited users
          start view-only — promote them to Editor to grant write access.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Current members */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-valorant-muted">
          Members
        </div>
        {loading ? (
          <p className="text-sm text-valorant-muted">Loading…</p>
        ) : (
          memberList.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between gap-3 py-1 border-b border-white/5"
            >
              <div className="min-w-0">
                <div className="text-sm truncate">{m.username ?? m.email}</div>
                <div className="text-xs text-valorant-muted truncate">{m.email}</div>
              </div>
              {m.role === 'owner' ? (
                <span className="text-xs font-medium rounded-full bg-valorant-red/20 text-valorant-red px-2 py-0.5">
                  Owner
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      setRole(m.userId, e.target.value as 'editor' | 'viewer')
                    }
                    className="bg-valorant-panel2 border border-white/10 rounded px-2 py-1 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    onClick={() => removeMember(m)}
                    className="px-2 py-1 rounded text-xs text-red-300 hover:bg-red-900/30"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Per-player invite links */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-valorant-muted">
          Invite links
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-valorant-muted">
            Add players to this roster to generate invite links.
          </p>
        ) : (
          players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className="text-sm">{p.name}</span>
              <button
                onClick={() => copyInvite(p.id)}
                className="px-2 py-1 rounded text-xs text-valorant-accent hover:bg-valorant-panel2 border border-white/10"
              >
                {copied === p.id ? 'Copied link!' : 'Copy invite link'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
