import { create } from 'zustand';
import type {
  AppState,
  Game,
  GameStat,
  Player,
  Roster,
  ScoutingReport,
  Series,
} from './types';
import * as endpoints from './api/endpoints';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function sortSeriesGames(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    if (ao !== bo) return ao - bo;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

type StoreActions = {
  /** Loaded via /me/state after auth. */
  hydrated: boolean;
  /** Pending background mutation count — used by the UI to show "Saving…". */
  pending: number;
  /** Last sync error surfaced to the user (e.g. server rejected an update). */
  syncError: string | null;

  /** Hydrate from the server. Call once after authentication. */
  loadFromServer: () => Promise<void>;
  /** Reset the in-memory state (used on logout). */
  clearLocal: () => void;

  // Rosters
  addRoster: (r: Omit<Roster, 'id'>) => Roster;
  updateRoster: (id: string, patch: Partial<Omit<Roster, 'id'>>) => void;
  /** Mark one roster primary and clear the flag on the rest. */
  setPrimaryRoster: (id: string) => void;
  removeRoster: (id: string) => void;

  // Players
  addPlayer: (p: Omit<Player, 'id'>) => Player;
  updatePlayer: (id: string, patch: Partial<Omit<Player, 'id'>>) => void;
  removePlayer: (id: string) => void;

  // Series
  addSeries: (s: Omit<Series, 'id'>) => Series;
  updateSeries: (id: string, patch: Partial<Omit<Series, 'id'>>) => void;
  removeSeries: (id: string) => void;

  // Games
  addGame: (g: Omit<Game, 'id'>) => Game;
  updateGame: (id: string, patch: Partial<Omit<Game, 'id'>>) => void;
  removeGame: (id: string) => void;

  // Scouting reports
  addScoutingReport: (r: Omit<ScoutingReport, 'id'>) => ScoutingReport;
  updateScoutingReport: (
    id: string,
    patch: Partial<Omit<ScoutingReport, 'id'>>
  ) => void;
  removeScoutingReport: (id: string) => void;

  resetAll: () => void;
  importState: (s: AppState) => void;
};

export type Store = AppState & StoreActions;

const empty: AppState = {
  rosters: [],
  players: [],
  series: [],
  games: [],
  scoutingReports: [],
};

/**
 * Wrap a background sync call with the pending/error machinery. All actions
 * are optimistic: local state is mutated synchronously before this fires.
 */
function runSync(promise: Promise<unknown>, onError?: () => void) {
  useStore.setState((s) => ({ pending: s.pending + 1 }));
  promise
    .catch((e: Error) => {
      console.error('Sync error:', e);
      useStore.setState({ syncError: e.message });
      onError?.();
    })
    .finally(() => {
      useStore.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    });
}

export const useStore = create<Store>()((set, get) => ({
  ...empty,
  hydrated: false,
  pending: 0,
  syncError: null,

  loadFromServer: async () => {
    const state = await endpoints.me.state();
    set({ ...state, hydrated: true, syncError: null });
  },
  clearLocal: () => set({ ...empty, hydrated: false, pending: 0, syncError: null }),

  addRoster: (r) => {
    const roster: Roster = { id: uid(), ...r };
    set((s) => ({ rosters: [...s.rosters, roster] }));
    runSync(
      endpoints.rosters.create(roster),
      () => set((s) => ({ rosters: s.rosters.filter((x) => x.id !== roster.id) }))
    );
    return roster;
  },
  updateRoster: (id, patch) => {
    const before = get().rosters.find((r) => r.id === id);
    set((s) => ({
      rosters: s.rosters.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
    runSync(endpoints.rosters.update(id, patch), () => {
      if (before) {
        set((s) => ({
          rosters: s.rosters.map((r) => (r.id === id ? before : r)),
        }));
      }
    });
  },
  setPrimaryRoster: (id) => {
    const before = get().rosters;
    if (!before.some((r) => r.id === id)) return;
    // Optimistically mirror the server: exactly one roster is primary. The
    // server unsets the others when it receives isPrimary: true, so we only
    // need to sync this one PATCH.
    set((s) => ({
      rosters: s.rosters.map((r) => ({ ...r, isPrimary: r.id === id })),
    }));
    runSync(endpoints.rosters.update(id, { isPrimary: true }), () =>
      set(() => ({ rosters: before }))
    );
  },
  removeRoster: (id) => {
    const snapshot = get();
    if (snapshot.rosters.length <= 1) return;
    const removedSeries = new Set(
      snapshot.series.filter((x) => x.rosterId === id).map((x) => x.id)
    );
    set((s) => ({
      rosters: s.rosters.filter((r) => r.id !== id),
      players: s.players.filter((p) => p.rosterId !== id),
      series: s.series.filter((x) => x.rosterId !== id),
      games: s.games.filter((g) => !removedSeries.has(g.seriesId)),
    }));
    runSync(endpoints.rosters.remove(id), () => {
      set(() => ({
        rosters: snapshot.rosters,
        players: snapshot.players,
        series: snapshot.series,
        games: snapshot.games,
      }));
    });
  },

  addPlayer: (p) => {
    const player: Player = { id: uid(), ...p };
    set((s) => ({ players: [...s.players, player] }));
    runSync(endpoints.players.create(player), () =>
      set((s) => ({ players: s.players.filter((x) => x.id !== player.id) }))
    );
    return player;
  },
  updatePlayer: (id, patch) => {
    const before = get().players.find((p) => p.id === id);
    set((s) => ({
      players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    runSync(endpoints.players.update(id, patch), () => {
      if (before) {
        set((s) => ({
          players: s.players.map((p) => (p.id === id ? before : p)),
        }));
      }
    });
  },
  removePlayer: (id) => {
    const snapshot = get();
    set((s) => ({
      players: s.players.filter((p) => p.id !== id),
      games: s.games.map((g) => ({
        ...g,
        stats: g.stats.filter((st) => st.playerId !== id),
      })),
    }));
    runSync(endpoints.players.remove(id), () =>
      set(() => ({ players: snapshot.players, games: snapshot.games }))
    );
  },

  addSeries: (sIn) => {
    const series: Series = { id: uid(), ...sIn };
    set((s) => ({ series: [...s.series, series] }));
    runSync(endpoints.series.create(series), () =>
      set((s) => ({ series: s.series.filter((x) => x.id !== series.id) }))
    );
    return series;
  },
  updateSeries: (id, patch) => {
    const before = get().series.find((x) => x.id === id);
    set((s) => ({
      series: s.series.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
    runSync(endpoints.series.update(id, patch), () => {
      if (before) {
        set((s) => ({
          series: s.series.map((x) => (x.id === id ? before : x)),
        }));
      }
    });
  },
  removeSeries: (id) => {
    const snapshot = get();
    set((s) => ({
      series: s.series.filter((x) => x.id !== id),
      games: s.games.filter((g) => g.seriesId !== id),
    }));
    runSync(endpoints.series.remove(id), () =>
      set(() => ({ series: snapshot.series, games: snapshot.games }))
    );
  },

  addGame: (gIn) => {
    let added: Game | null = null;
    set((s) => {
      const seriesGames = s.games.filter((g) => g.seriesId === gIn.seriesId);
      const sorted = sortSeriesGames(seriesGames);
      const idToOrder = new Map(sorted.map((g, i) => [g.id, i + 1]));
      const newGame: Game = {
        id: uid(),
        ...gIn,
        order: sorted.length + 1,
      };
      added = newGame;
      const normalized = s.games.map((g) =>
        idToOrder.has(g.id) ? { ...g, order: idToOrder.get(g.id)! } : g
      );
      return { games: [...normalized, newGame] };
    });
    const newGame = added!;
    runSync(endpoints.games.create(newGame), () =>
      set((s) => ({ games: s.games.filter((g) => g.id !== newGame.id) }))
    );
    return newGame;
  },
  updateGame: (id, patch) => {
    const before = get().games.find((g) => g.id === id);
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
    runSync(endpoints.games.update(id, patch), () => {
      if (before) {
        set((s) => ({
          games: s.games.map((g) => (g.id === id ? before : g)),
        }));
      }
    });
  },
  removeGame: (id) => {
    const before = get().games.find((g) => g.id === id);
    set((s) => ({ games: s.games.filter((g) => g.id !== id) }));
    runSync(endpoints.games.remove(id), () => {
      if (before) set((s) => ({ games: [...s.games, before] }));
    });
  },

  addScoutingReport: (rIn) => {
    const report: ScoutingReport = { id: uid(), ...rIn };
    set((s) => ({ scoutingReports: [...s.scoutingReports, report] }));
    runSync(endpoints.scoutingReports.create(report), () =>
      set((s) => ({
        scoutingReports: s.scoutingReports.filter((x) => x.id !== report.id),
      }))
    );
    return report;
  },
  updateScoutingReport: (id, patch) => {
    const before = get().scoutingReports.find((r) => r.id === id);
    set((s) => ({
      scoutingReports: s.scoutingReports.map((r) =>
        r.id === id ? { ...r, ...patch } : r
      ),
    }));
    runSync(endpoints.scoutingReports.update(id, patch), () => {
      if (before) {
        set((s) => ({
          scoutingReports: s.scoutingReports.map((r) =>
            r.id === id ? before : r
          ),
        }));
      }
    });
  },
  removeScoutingReport: (id) => {
    const before = get().scoutingReports.find((r) => r.id === id);
    set((s) => ({
      scoutingReports: s.scoutingReports.filter((r) => r.id !== id),
    }));
    runSync(endpoints.scoutingReports.remove(id), () => {
      if (before) set((s) => ({ scoutingReports: [...s.scoutingReports, before] }));
    });
  },

  /**
   * resetAll/importState mutate large amounts of state at once. Rather than
   * sync them client-side (which would require batch endpoints we don't have),
   * we keep them as local-only utilities — they're primarily for the dev
   * mockSeed/import flows.
   */
  resetAll: () => set(() => ({ ...empty, hydrated: true })),
  importState: (next) => set(() => ({ ...empty, ...next, hydrated: true })),
}));

export function newBlankStat(playerId = '', agent = ''): GameStat {
  return {
    playerId,
    agent,
    acs: 0,
    hsPercent: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDelta: 0,
    adr: 0,
    kastPercent: 0,
    firstKills: 0,
    firstDeaths: 0,
    multikills: 0,
  };
}
