import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import generatorLogo from '../assets/icons/generator.png';
import { useAuth } from '../authStore';

export default function LoginPage() {
  const status = useAuth((s) => s.status);
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const clientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  return (
    <div className="min-h-screen flex items-center justify-center bg-valorant-bg">
      <div className="w-full max-w-sm bg-valorant-panel p-6 rounded-lg border border-white/5 space-y-5 text-center">
        <img src={generatorLogo} alt="Generator's University Team Tracking System" className="h-14 w-14 object-contain mx-auto" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Generator's University Team Tracking System</h1>
          <p className="text-sm text-valorant-muted">
            Sign in with your Google account to continue.
          </p>
        </div>

        {clientConfigured ? (
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={async (cred) => {
                setError(null);
                if (!cred.credential) {
                  setError('Google did not return a credential. Try again.');
                  return;
                }
                try {
                  await loginWithGoogle(cred.credential);
                  nav('/', { replace: true });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              onError={() => setError('Google sign-in failed. Try again.')}
              theme="filled_black"
              shape="pill"
            />
          </div>
        ) : (
          <p className="text-sm text-red-400">
            Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID and
            restart the dev server.
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
