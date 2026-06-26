import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../authStore';
import { useStore } from '../store';

/**
 * Wraps protected routes. While auth state is unknown, shows a spinner; once
 * authenticated, hydrates the data store from /me/state before rendering.
 */
export default function AuthGuard() {
  const status = useAuth((s) => s.status);
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
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-valorant-muted">
        Loading your data…
      </div>
    );
  }

  return <Outlet />;
}
