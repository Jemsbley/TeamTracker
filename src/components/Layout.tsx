import { Outlet } from 'react-router-dom';
import AppHeader from './AppHeader';

export default function Layout() {
  return (
    <div className="min-h-full flex flex-col">
      <AppHeader />

      <main className="px-4 py-6 w-full flex-1">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-valorant-muted py-3 space-y-1">
        <p>Synced to your account · accessible from any device</p>
        {/* Plain anchors, not <Link>: the public info pages are standalone
            static HTML served outside the SPA. */}
        <p className="flex flex-wrap justify-center gap-x-4">
          <a href="/about" className="hover:text-valorant-accent">
            About
          </a>
          <a href="/privacy" className="hover:text-valorant-accent">
            Privacy
          </a>
          <a href="/terms" className="hover:text-valorant-accent">
            Terms
          </a>
        </p>
      </footer>
    </div>
  );
}
