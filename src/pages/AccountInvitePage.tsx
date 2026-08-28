import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import generatorLogo from '../assets/icons/generator.png';
import { useAuth } from '../authStore';
import { accountInvites } from '../api/endpoints';

/**
 * Landing page for an admin-issued account invite link. Unlike InvitePage,
 * this doesn't attach the signer-upper to any roster or player — signing in
 * with Google already creates their own independent account + "Main" roster
 * (see server/src/routes/auth.ts). This page just records that the link was
 * used and drops the new user straight into the app.
 */
export default function AccountInvitePage() {
  const { token } = useParams<{ token: string }>();
  const status = useAuth((s) => s.status);
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !token) return;
    accountInvites
      .accept(token)
      .then(() => navigate('/', { replace: true }))
      .catch((e) => setError((e as Error).message));
  }, [status, token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-valorant-bg">
      <div className="w-full max-w-sm bg-valorant-panel p-6 rounded-lg border border-white/5 space-y-5 text-center">
        <img src={generatorLogo} alt="Generator's University Team Tracking System" className="h-12 w-12 object-contain mx-auto" />
        <h1 className="text-xl font-semibold">You're invited to Generator's University Team Tracking System</h1>
        <p className="text-sm text-valorant-muted">
          Sign in with Google to create your own independent account — you'll get
          your own workspace to build and manage rosters, separate from anyone
          else on the platform.
        </p>

        {status !== 'authenticated' && (
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
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              onError={() => setError('Google sign-in failed.')}
              theme="filled_black"
              shape="pill"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
