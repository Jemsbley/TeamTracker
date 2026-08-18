import { Outlet } from 'react-router-dom';
import AppHeader from './AppHeader';

export default function Layout() {
  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />

      <main className="px-4 py-6 w-full flex-1">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-valorant-muted py-3">
        Synced to your account · accessible from any device
      </footer>
    </div>
  );
}
