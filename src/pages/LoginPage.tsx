import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../authStore';

export default function LoginPage() {
  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
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
        className="w-full max-w-sm bg-valorant-panel p-6 rounded-lg border border-white/5 space-y-4"
      >
        <h1 className="text-xl font-semibold">Log in</h1>
        <div className="space-y-1">
          <label className="text-sm text-valorant-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded bg-valorant-panel2 border border-white/5"
            autoComplete="email"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-valorant-muted">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded bg-valorant-panel2 border border-white/5"
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-3 py-2 rounded bg-valorant-red text-white font-medium disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
        <p className="text-sm text-valorant-muted text-center">
          No account?{' '}
          <Link to="/signup" className="text-valorant-accent underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
