import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import generatorLogo from '../assets/icons/generator.png';
import { useAuth } from '../authStore';
import { useStore } from '../store';
import { Bone } from '../components/skeletons';
import { invites, type InviteInfo } from '../api/endpoints';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const status = useAuth((s) => s.status);
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const loadFromServer = useStore((s) => s.loadFromServer);
  const navigate = useNavigate();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (status === 'loading' || !token) return;
    // Only fetch invite details once authenticated (the endpoint requires auth).
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    invites
      .info(token)
      .then(setInfo)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, status]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      await invites.accept(token);
      await loadFromServer();
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-valorant-bg">
      <div className="w-full max-w-sm bg-valorant-panel p-6 rounded-lg border border-white/5 space-y-5 text-center">
        <img src={generatorLogo} alt="Generator's University Team Tracking System" className="h-12 w-12 object-contain mx-auto" />
        <h1 className="text-xl font-semibold">Roster invite</h1>

        {status !== 'authenticated' ? (
          <>
            <p className="text-sm text-valorant-muted">
              Sign in with Google to view and accept this invite.
            </p>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={async (cred) => {
                  if (cred.credential) {
                    try {
                      await loginWithGoogle(cred.credential);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }
                }}
                onError={() => setError('Google sign-in failed.')}
                theme="filled_black"
                shape="pill"
              />
            </div>
          </>
        ) : loading ? (
          <div className="space-y-4">
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-2/3 mx-auto" />
            <Bone className="h-9 w-full rounded" />
          </div>
        ) : info ? (
          <>
            <p className="text-sm text-valorant-muted">
              You've been invited to join the roster{' '}
              <strong className="text-white">{info.rosterName}</strong> as{' '}
              <strong className="text-white">{info.playerName}</strong>.
            </p>
            <p className="text-xs text-valorant-muted">
              You'll get {info.role === 'editor' ? 'edit' : 'view-only'} access to
              all of this roster's data.
            </p>
            <button
              onClick={accept}
              disabled={accepting}
              className="w-full px-3 py-2 rounded bg-valorant-red text-white font-medium disabled:opacity-50"
            >
              {accepting ? 'Joining…' : 'Accept invite'}
            </button>
          </>
        ) : null}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
