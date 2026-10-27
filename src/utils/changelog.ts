export type ChangelogEntry = {
  version: string;
  /** Release date as an ISO `YYYY-MM-DD` string. */
  date: string;
  title: string;
  changes: string[];
};

/**
 * Format a release date for display. The `T00:00:00` suffix forces local-time
 * parsing. A bare `YYYY-MM-DD` is read as UTC, which renders a day early in
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
    version: '1.3.0',
    date: '2026-10-27',
    title: 'Heatmap overhaul',
    changes: [
      'Heatmap player, agent, and class filters now accept multiple selections',
      'With points shown, hover any dot for its agent, player, side, round time, pre/post-plant, which way they were facing, and who they fought. The opponent appears as a black dot on the map',
      '"After spike plant only" is now a Both / Pre-plant / Post-plant selector',
      'Hovering a dot also shows the date and series it came from',
      'New Invert option: shows where enemies stood when kills happened, instead of where your players stood',
      'Filter to rounds where the spike was planted on a particular site, with A/B (or A/B/C) toggles for the current map',
      'All the heatmap filters now sit in one panel beside the map, so the map takes up less room',
      'Round%: new XvX filter. Pick how many of us and how many of them were alive (1–5, or X for any) to see how often we win rounds that reached that layout, like 3v3 or 2vX. Pick players to require that they were among the ones alive',
      'Stats where higher is worse now color the right way: a rise in first deaths or plant allowed % shows red, and plant allowed % itself is colored green when low',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-01',
    title: 'Map pool autofill',
    changes: [
      'New series start with the map pool from your most recent series already filled in, so you only need to swap the maps that rotated',
      'On a series, "Import from tracker.gg" is now the primary button above "Fill in stats"',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-23',
    title: 'Round% and stat fixes',
    changes: [
      'Added a Round% tab to Stats: filter rounds by side, first blood/first death, map, spike plant (and site), multikills, kills, deaths, and assists, and see what share of those rounds we win',
      'Kill/death/assist/multikill and plant-site filters read the round-by-round detail stored with tracker.gg imports',
      'Tracker.gg imports no longer count 2k rounds as multikills. MK is now rounds with 3+ kills',
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
