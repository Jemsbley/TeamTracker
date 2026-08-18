import { create } from 'zustand';
import { auth, me, type AuthUser } from './api/endpoints';
import { getToken, setToken } from './api/client';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  status: Status;
  user: AuthUser | null;
  /** Last network-level error (login failure, network down, etc). */
  error: string | null;
  /** Verify any stored token by fetching /me. Call once on app boot. */
  init: () => Promise<void>;
  /** Sign in / sign up with a Google ID token credential. */
  loginWithGoogle: (credential: string) => Promise<void>;
  /** Replace the cached user (e.g. after updating the username). */
  setUser: (user: AuthUser) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  status: getToken() ? 'loading' : 'unauthenticated',
  user: null,
  error: null,

  init: async () => {
    if (!getToken()) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      const u = await me.get();
      set({
        status: 'authenticated',
        user: {
          id: u.id,
          email: u.email,
          username: u.username,
          accountType: u.accountType,
        },
      });
    } catch {
      setToken(null);
      set({ status: 'unauthenticated', user: null });
    }
  },

  loginWithGoogle: async (credential) => {
    set({ error: null });
    try {
      const r = await auth.google(credential);
      setToken(r.token);
      set({ status: 'authenticated', user: r.user, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  setUser: (user) => set({ user }),

  logout: () => {
    setToken(null);
    set({ status: 'unauthenticated', user: null, error: null });
  },
}));
