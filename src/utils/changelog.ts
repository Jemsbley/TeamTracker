export type ChangelogEntry = {
  version: string;
  title: string;
  changes: string[];
};

// Newest first.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
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
    title: 'Initial Release',
    changes: [],
  },
];
