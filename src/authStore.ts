import { create } from 'zustand';
import { auth, me } from './api/endpoints';
import { getToken, setToken } from './api/client';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type AuthUser = { id: string; email: string };

type AuthState = {
  status: Status;
  user: AuthUser | null;
  /** Last network-level error (login failure, network down, etc). */
  error: string | null;
  /** Verify any stored token by fetching /me. Call once on app boot. */
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
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
      const user = await me.get();
      set({ status: 'authenticated', user: { id: user.id, email: user.email } });
    } catch {
      setToken(null);
      set({ status: 'unauthenticated', user: null });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const r = await auth.login(email, password);
      setToken(r.token);
      set({ status: 'authenticated', user: r.user, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  signup: async (email, password) => {
    set({ error: null });
    try {
      const r = await auth.signup(email, password);
      setToken(r.token);
      set({ status: 'authenticated', user: r.user, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  logout: () => {
    setToken(null);
    set({ status: 'unauthenticated', user: null, error: null });
  },
}));
