import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../authStore';
import { useStore } from '../store';
import PageHeader from '../components/PageHeader';
import { TableSkeleton } from '../components/skeletons';
import { admin, type AdminUser, type AccountType } from '../api/endpoints';

const ACCOUNT_TYPES: AccountType[] = ['user', 'admin', 'test'];

export default function AdminPage() {
  const me = useAuth((s) => s.user);
  const loadUserStateAsAdmin = useStore((s) => s.loadUserStateAsAdmin);
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    admin
      .listUsers()
      .then(setUsers)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Only admins reach this page.
  if (me && me.accountType !== 'admin') return <Navigate to="/" replace />;

  const changeRole = async (id: string, accountType: AccountType) => {
    setError(null);
    const prev = users;
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, accountType } : u)));
    try {
      await admin.setAccountType(id, accountType);
    } catch (e) {
      setUsers(prev);
      setError((e as Error).message);
    }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(`Delete ${u.username ?? u.email}? This cannot be undone.`)) return;
    setError(null);
    try {
      await admin.removeUser(u.id);
      setUsers((us) => us.filter((x) => x.id !== u.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const inviteNewUser = async () => {
    setError(null);
    setInviting(true);
    try {
      const invite = await admin.createAccountInvite();
      const url = `${window.location.origin}/invite/account/${invite.token}`;
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const viewData = async (u: AdminUser) => {
    try {
      await loadUserStateAsAdmin(u.id, u.username ?? u.email);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="User management"
        description={`${users.length} user${users.length === 1 ? '' : 's'} on the platform`}
      >
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={inviteNewUser}
            disabled={inviting}
            className="px-3 py-1.5 rounded text-sm bg-valorant-red text-white font-medium disabled:opacity-50"
          >
            {inviting ? 'Generating…' : inviteCopied ? 'Copied link!' : 'Invite new user'}
          </button>
          <p className="text-xs text-valorant-muted">
            Copies a link for someone to get their own independent account and
            roster — not shared with anyone else.
          </p>
        </div>
      </PageHeader>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-valorant-muted border-b border-white/10">
                <th className="py-2 pr-3">Username</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Rosters</th>
                <th className="py-2 pr-3">Memberships</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5">
                  <td className="py-2 pr-3">{u.username ?? '—'}</td>
                  <td className="py-2 pr-3 text-valorant-muted">{u.email}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={u.accountType}
                      onChange={(e) =>
                        changeRole(u.id, e.target.value as AccountType)
                      }
                      className="bg-valorant-panel2 border border-white/10 rounded px-2 py-1"
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">{u.rosterCount}</td>
                  <td className="py-2 pr-3">{u.membershipCount}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => viewData(u)}
                      className="px-2 py-1 rounded text-xs text-valorant-accent hover:bg-valorant-panel2"
                    >
                      View data
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => removeUser(u)}
                        className="px-2 py-1 rounded text-xs text-red-300 hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
