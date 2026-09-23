export type ChangelogEntry = {
  version: string;
  /** Release date as an ISO `YYYY-MM-DD` string. */
  date: string;
  title: string;
  changes: string[];
};

/**
 * Format a release date for display. The `T00:00:00` suffix forces local-time
 * parsing — a bare `YYYY-MM-DD` is read as UTC, which renders a day early in
 * any negative-offset timezone.
 */
export function formatReleaseDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Newest first.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    date: '2026-09-23',
    title: 'Round% and stat fixes',
    changes: [
      'Added a Round% tab to Stats: filter rounds by side, first blood/first death, map, spike plant (and site), multikills, kills, deaths, and assists, and see what share of those rounds we win',
      'Kill/death/assist/multikill and plant-site filters read the round-by-round detail stored with tracker.gg imports',
      'Tracker.gg imports no longer count 2k rounds as multikills — MK is now rounds with 3+ kills',
      'Corrected MK on games already imported from tracker.gg',
      'Maps: Ban% and Opp Ban% are now the share of series in which the map was banned, not the share of that team\'s total bans',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-09-15',
    title: 'Public landing page',
    changes: [
      'Added a public landing page with About, Privacy, and Terms pages',
      'Moved the guest sample-data button onto the landing page',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-09',
    title: 'Heatmaps, staff roles, and invites',
    changes: [
      'Added a full Heatmap page for visualizing player and team positioning across maps',
      'Added a staff account role with elevated permissions',
      'Added invite-based sign-up so new users can join a team roster',
      'Backend data now persists to Postgres via Prisma instead of local JSON',
      'Renamed the app and refreshed the header title',
      'Added this menu!',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-02',
    title: 'Initial Release',
    changes: [],
  },
];
