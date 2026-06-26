import type {
  AppState,
  Game,
  Player,
  Roster,
  ScoutingReport,
  Series,
} from '../types';
import { api } from './client';

export type AuthResponse = { token: string; user: { id: string; email: string } };

export const auth = {
  signup: (email: string, password: string) =>
    api<AuthResponse>('/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
};

export const me = {
  get: () => api<{ id: string; email: string; createdAt: string }>('/me'),
  state: () => api<AppState>('/me/state'),
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
