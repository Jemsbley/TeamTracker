import type {
  AppState,
  Game,
  Player,
  Roster,
  Role,
  ScoutingReport,
  Series,
} from '../types';
import { api } from './client';

export type AccountType = 'user' | 'admin' | 'test';

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  accountType: AccountType;
};

export type AuthResponse = { token: string; user: AuthUser };

export const auth = {
  /** Exchange a Google ID token (credential) for our session token. */
  google: (credential: string) =>
    api<AuthResponse>('/auth/google', { method: 'POST', body: { credential } }),
};

export const me = {
  get: () => api<AuthUser & { createdAt: string }>('/me'),
  state: () => api<AppState>('/me/state'),
  update: (patch: { username: string }) =>
    api<AuthUser>('/me', { method: 'PATCH', body: patch }),
  remove: () => api<void>('/me', { method: 'DELETE' }),
  /** Wipe every roster the caller owns, plus unattached scouting reports. */
  clearData: () => api<void>('/me/data', { method: 'DELETE' }),
};

function crud<T extends { id: string }>(path: string) {
  return {
    create: (body: Omit<T, 'id'> & { id?: string }) =>
      api<T>(path, { method: 'POST', body }),
    update: (id: string, patch: Partial<Omit<T, 'id'>>) =>
      api<T>(`${path}/${id}`, { method: 'PATCH', body: patch }),
    remove: (id: string) => api<void>(`${path}/${id}`, { method: 'DELETE' }),
  };
}

export const rosters = crud<Roster>('/rosters');
export const players = crud<Player>('/players');
export const series = crud<Series>('/series');
export const games = crud<Game>('/games');
export const scoutingReports = crud<ScoutingReport>('/scouting-reports');

export type Member = {
  userId: string;
  role: Role;
  email: string;
  username: string | null;
};

export const members = {
  list: (rosterId: string) => api<Member[]>(`/rosters/${rosterId}/members`),
  setRole: (rosterId: string, userId: string, role: 'editor' | 'viewer') =>
    api<{ userId: string; role: Role }>(`/rosters/${rosterId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),
  remove: (rosterId: string, userId: string) =>
    api<void>(`/rosters/${rosterId}/members/${userId}`, { method: 'DELETE' }),
};

export type Invite = {
  id: string;
  token: string;
  rosterId: string;
  playerId: string;
  role: Role;
  acceptedBy: string | null;
  createdAt: string;
};

export type InviteInfo = {
  rosterName: string;
  playerName: string;
  role: Role;
  accepted: boolean;
};

export const invites = {
  create: (rosterId: string, playerId: string, role?: 'editor' | 'viewer') =>
    api<Invite>(`/rosters/${rosterId}/invites`, {
      method: 'POST',
      body: { playerId, role },
    }),
  listForRoster: (rosterId: string) => api<Invite[]>(`/rosters/${rosterId}/invites`),
  info: (token: string) => api<InviteInfo>(`/invites/${token}`),
  accept: (token: string) =>
    api<{ rosterId: string }>(`/invites/${token}/accept`, { method: 'POST' }),
};

export type AccountInvite = {
  id: string;
  token: string;
  createdBy: string;
  acceptedBy: string | null;
  createdAt: string;
};

export const accountInvites = {
  info: (token: string) => api<{ accepted: boolean }>(`/account-invites/${token}`),
  accept: (token: string) =>
    api<{ ok: true }>(`/account-invites/${token}/accept`, { method: 'POST' }),
};

export type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  accountType: AccountType;
  createdAt: string;
  rosterCount: number;
  membershipCount: number;
};

export const admin = {
  listUsers: () => api<AdminUser[]>('/admin/users'),
  setAccountType: (id: string, accountType: AccountType) =>
    api<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: { accountType } }),
  removeUser: (id: string) => api<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  userState: (id: string) =>
    api<{ user: AuthUser; state: AppState }>(`/admin/users/${id}/state`),
  createAccountInvite: () =>
    api<AccountInvite>('/admin/account-invites', { method: 'POST' }),
};
