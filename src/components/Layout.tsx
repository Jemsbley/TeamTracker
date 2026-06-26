import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import nutLogo from '../assets/icons/nut.png';
import { useAuth } from '../authStore';
import { useStore } from '../store';

const linkBase =
  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors';

function nav({ isActive }: { isActive: boolean }) {
  return `${linkBase} ${
    isActive
      ? 'bg-valorant-red text-white'
      : 'text-valorant-accent hover:bg-valorant-panel2'
  }`;
}

export default function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const clearLocal = useStore((s) => s.clearLocal);
  const pending = useStore((s) => s.pending);
  const syncError = useStore((s) => s.syncError);
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    clearLocal();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-white/5 bg-valorant-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="px-3 py-2 grid grid-cols-3 items-center gap-3">
          <div className="flex items-center gap-2 justify-self-start min-w-0">
            <img
              src={nutLogo}
              alt="Team Tracker"
              className="h-8 w-8 object-contain shrink-0"
            />
            <h1 className="font-semibold tracking-wide truncate">
              Northeastern University Team Tracking System
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
            <NavLink to="/series" className={nav}>
              Series
            </NavLink>
            <NavLink to="/scouting" className={nav}>
              Scouting
            </NavLink>
            <NavLink to="/roster" className={nav}>
              Roster
            </NavLink>
          </nav>
          <div className="justify-self-end flex items-center gap-3 text-sm">
            {pending > 0 && (
              <span className="text-valorant-muted text-xs">Saving…</span>
            )}
            {user && (
              <>
                <span className="text-valorant-muted truncate max-w-[200px]">
                  {user.email}
                </span>
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
        {syncError && (
          <div className="px-3 py-1 text-xs bg-red-900/40 text-red-200 text-center">
            Sync error: {syncError}
          </div>
        )}
      </header>

      <main className="px-3 py-4 w-full flex-1">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-valorant-muted py-3">
        Synced to your account · accessible from any device
      </footer>
    </div>
  );
}
