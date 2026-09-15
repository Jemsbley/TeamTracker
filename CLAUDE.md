# CLAUDE.md

Notes for Claude on how this repo gets built. The README covers *what* the app
is; this file covers *how I work on it*, so you can match the rhythm instead of
re-learning it every session.

## The project in one line

A Valorant match-tracking and analytics app for a
team: React + Vite SPA in `src/`, Express + Prisma + Postgres API in `server/`.
I'm the only developer, I'm the primary user, and my team uses it live during a
season — so shipped behavior matters more than architectural purity.

## How I prompt

**I write product specs, not code instructions.** A typical prompt is a
paragraph or two describing behavior in terms of the UI I'm looking at: "on the
examine closer tab, when the user selects by map, allow them to type a
scoreline…", "add staff profiles to rosters so I can add people who aren't
players". I name the page, tab, or button label and describe what it should do.
Pick the files and the implementation yourself — that's your job, not mine.

**Take it and run.** If the spec is clear enough to build, build it. Don't come
back with a plan for approval, a list of options, or clarifying questions about
things you can reasonably decide (naming, layout details, where a helper lives).
Ask only when two readings would produce genuinely different features.

**Expect tight visual iteration.** A lot of my prompts are one-liners tuning
something you just built: exact hex colors ("make the green `5EA444`"), sizing
("shrink the map win filter substantially; grow the player filter to fill the
space"), layout invariants ("keep all text on the same row and never wrap",
"the map labels should ALWAYS be above the percentages when scrolling"). These
are surgical — change the smallest thing that satisfies them, don't refactor the
surrounding component, and don't explain at length. A one-line confirmation is
plenty.

**Big features start as prototypes.** For anything substantial (the kill/death
heatmap is the canonical example) the pattern is: build a throwaway page wired
to one hardcoded dataset so I can play with the design → I iterate on knobs →
I tell you the values to freeze ("make these the official hardcoded values:
radius 50, falloff 3.0, gamma 0.65") → then I say "make it an official route
and put it in the top bar". Don't try to generalize on step one. When I say to
hardcode a tuned constant, hardcode it; don't leave the sliders in.

**Debugging looks like a paste.** I'll drop raw deploy logs, an HTTP status, a
wall of response headers, or a giant tracker.gg JSON blob with little or no
framing. Read it, tell me what it means, fix it. Don't ask me for reproduction
steps I clearly don't have.

**Ops questions are real questions.** Hosting, domains, DNS, Vercel/Railway
config, Google OAuth origins — I ask these in plain English and expect a direct
answer, not a code change. When the answer is long, I'll ask for it as a
markdown file (that's where `DEPLOYMENT.md` came from).

**I ask for cleanup and I mean it.** "Read through the entire repository and
decide if anything should be removed", "I just deleted `public/samples/havens`,
make sure every reference is gone and report back if you find one". Do the full
sweep and report findings plainly, including the ones you didn't act on.

## Conventions worth knowing

- **Types are the contract.** Domain types live once in [types.ts](src/types.ts)
  and are mirrored by [schema.prisma](server/prisma/schema.prisma). Any change to
  Roster / Player / Series / Game / ScoutingReport touches both, plus a migration
  in `server/prisma/migrations/`. Nested arrays (rounds, stats, pickBan, videos,
  vodReviews) stay JSON columns on purpose.
- **Store mutations are optimistic.** [store.ts](src/store.ts) updates local
  state synchronously, then fires the API call through `runSync` and rolls back
  on failure. New mutations follow that shape; don't make store actions async.
- **View state goes in the URL.** Every filter, sort key, active tab, and toggle
  uses nuqs `useQueryState` so views are shareable. Plain `useState` is only for
  ephemeral things (dropdown open/closed, in-progress form inputs).
- **Pure logic lives in `src/utils/`.** Stats, round economy, pick/ban,
  scouting, heatmap math, tracker import — components stay presentational and
  call into these.
- **Maps and agents come from [constants.ts](src/constants.ts)**, with art in
  `src/assets/`. New agent or map = add it there, add the image, done.
- **Releases are user-visible.** A version chip in the header opens a changelog
  modal fed by `src/utils/changelog.ts`. When a branch adds something a user
  would notice, bump `package.json` and add or extend the top changelog entry in
  the same breath.
- **Branches are `<issue-number>-<slug>`** (`1-heatmaps`, `2-scrims`). At the end
  of a branch I'll often ask you to write a `PR.md` describing it. Commit
  messages are short and lowercase; don't commit or push unless I ask.

## Verifying work

There is no test suite, and I don't want one invented mid-feature, though there will be a test suite implementation and github action eventually. Verification
means: `npm run build` (that's `tsc -b`, the real type check) and, for anything
visual or interactive, actually running the app — `npm start` from the repo root
brings up Postgres in Docker, the API on :4000, and the frontend on :5173. If
you changed something I can see, say what I should click to see it.
