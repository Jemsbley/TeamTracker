import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../authStore';
import { useStore } from '../store';
import LandingPage from '../pages/LandingPage';
import AppHeader from './AppHeader';
import { RouteSkeleton } from './skeletons';

/**
 * Wraps protected routes. While auth state is unknown, shows a spinner; once
 * authenticated, hydrates the data store from /me/state before rendering.
 *
 * Unauthenticated visitors are redirected to login, except at `/`, which
 * renders the public landing page instead.
 */
export default function AuthGuard() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const hydrated = useStore((s) => s.hydrated);
  const loadFromServer = useStore((s) => s.loadFromServer);
  const location = useLocation();

  useEffect(() => {
    if (status === 'authenticated' && !hydrated) {
      loadFromServer().catch((e) => {
        console.error('Failed to load state:', e);
      });
    }
  }, [status, hydrated, loadFromServer]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-valorant-muted">
        Loading…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // The root URL doubles as the public landing page: a visitor with no
    // session gets a real description of the site instead of an immediate
    // bounce to a bare login screen. Every other protected route still
    // redirects to login as before.
    if (location.pathname === '/') return <LandingPage />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Authenticated but hasn't chosen a username yet — force onboarding.
  if (user && !user.username) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!hydrated) {
    return (
      <div className="min-h-full flex flex-col">
        <AppHeader />
        <main className="px-4 py-6 w-full flex-1">
          <RouteSkeleton pathname={location.pathname} />
        </main>
      </div>
    );
  }

  return <Outlet />;
}
