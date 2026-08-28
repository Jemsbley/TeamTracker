import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import generatorLogo from '../assets/icons/generator.png';
import { useAuth } from '../authStore';
import { me } from '../api/endpoints';

/**
 * Shown right after first sign-in: a new Google account has no username yet
 * and must pick one before using the app.
 */
export default function OnboardingPage() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  // Already onboarded (or signed out) — nothing to do here.
  if (!user) return <Navigate to="/login" replace />;
  if (user.username) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await me.update({ username: username.trim() });
      setUser(updated);
      nav('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-valorant-bg">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-valorant-panel p-6 rounded-lg border border-white/5 space-y-4 text-center"
      >
        <img src={generatorLogo} alt="Generator's University Team Tracking System" className="h-12 w-12 object-contain mx-auto" />
        <h1 className="text-xl font-semibold">Pick a username</h1>
        <p className="text-sm text-valorant-muted">
          Signed in as {user.email}. Choose a display name to finish setting up
          your account.
        </p>
        <input
          type="text"
          required
          minLength={1}
          maxLength={40}
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full px-3 py-2 rounded bg-valorant-panel2 border border-white/5 text-center"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || username.trim().length === 0}
          className="w-full px-3 py-2 rounded bg-valorant-red text-white font-medium disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
