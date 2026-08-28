import { NavLink, useNavigate } from 'react-router-dom';
import generatorLogo from '../assets/icons/generator.png';
import { useAuth } from '../authStore';
import { useStore } from '../store';

const linkBase =
  'px-3 py-1.5 rounded-md text-sm font-semibold transition-colors';

function nav({ isActive }: { isActive: boolean }) {
  return `${linkBase} ${
    isActive
      ? 'bg-valorant-red text-white'
      : 'text-valorant-accent hover:bg-valorant-panel2'
  }`;
}

/**
 * The app's top nav bar, shared by Layout and by AuthGuard's loading skeleton
 * so the header appears instantly instead of popping in once data hydrates.
 */
export default function AppHeader() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const clearLocal = useStore((s) => s.clearLocal);
  const pending = useStore((s) => s.pending);
  const syncError = useStore((s) => s.syncError);
  const adminViewing = useStore((s) => s.adminViewing);
  const exitAdminView = useStore((s) => s.exitAdminView);
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    clearLocal();
    navigate('/login', { replace: true });
  };

  return (
    <header className="border-b border-white/5 bg-valorant-panel/60 backdrop-blur sticky top-0 z-10">
      <div className="px-3 py-2 grid grid-cols-3 items-center gap-3">
        <div className="flex items-center gap-2 justify-self-start min-w-0">
          <img
            src={generatorLogo}
            alt="Generator's University Team Tracking System"
            className="h-8 w-8 object-contain shrink-0"
          />
          <h1 className="font-semibold tracking-wide truncate">
            Generator's University Team Tracking System
          </h1>
        </div>
        <nav className="flex items-center gap-1 justify-self-center">
          <NavLink to="/" end className={nav}>
            Stats
          </NavLink>
          <NavLink to="/maps" className={nav}>
            Maps
          </NavLink>
          <NavLink to="/agents" className={nav}>
            Agents
          </NavLink>
          <NavLink to="/players" className={nav}>
            Players
          </NavLink>
          <span
            aria-hidden="true"
            className="self-stretch w-px bg-white/15 mx-1.5 my-1"
          />
          <NavLink to="/series" className={nav}>
            Series
          </NavLink>
          <NavLink to="/scouting" className={nav}>
            Scouting
          </NavLink>
          <NavLink to="/roster" className={nav}>
            Roster
          </NavLink>
          {user?.accountType === 'admin' && (
            <NavLink to="/admin" className={nav}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="justify-self-end flex items-center gap-3 text-sm">
          {pending > 0 && (
            <span className="text-valorant-muted text-xs">Saving…</span>
          )}
          {user && (
            <>
              <button
                onClick={() => navigate('/settings')}
                className="text-valorant-accent hover:bg-valorant-panel2 px-2 py-1 rounded truncate max-w-[200px] font-medium"
                title="Account settings"
              >
                {user.username ?? user.email}
              </button>
              <button
                onClick={onLogout}
                className="px-2 py-1 rounded text-xs text-valorant-accent hover:bg-valorant-panel2"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </div>
      {adminViewing && (
        <div className="px-3 py-1.5 text-xs bg-amber-900/40 text-amber-200 text-center flex items-center justify-center gap-3">
          <span>
            Viewing <strong>{adminViewing.label}</strong>'s data (read-only)
          </span>
          <button
            onClick={() => exitAdminView()}
            className="underline hover:text-white"
          >
            Exit
          </button>
        </div>
      )}
      {syncError && (
        <div className="px-3 py-1 text-xs bg-red-900/40 text-red-200 text-center">
          Sync error: {syncError}
        </div>
      )}
    </header>
  );
}
