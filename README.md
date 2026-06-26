# Team Tracker

A match-tracking and analytics app for the **Northeastern University Valorant
team**. Record your series and maps round-by-round, then slice the data into
team, map, agent, and player analytics, build map vetoes, attach VODs, and
scout upcoming opponents.

It's a React + Vite single-page app talking to a Node + Express + Postgres
API. Every account owns its own data and it syncs to the cloud, so the same
roster, matches, and reports are reachable from any device.

```
.
├── src/                 # Frontend (Vite + React + TypeScript + Zustand)
├── server/              # Backend (Express + Prisma + Postgres)
├── scripts/             # One-command dev launcher (dev.sh / stop.sh)
└── README.md            # ← you are here
```

---

## Table of contents

- [Features](#features)
  - [Accounts & sync](#accounts--sync)
  - [Rosters & players](#rosters--players)
  - [Series & games](#series--games)
  - [Round-by-round entry & economy](#round-by-round-entry--economy)
  - [Map vetoes (pick/ban)](#map-vetoes-pickban)
  - [VODs & match videos](#vods--match-videos)
  - [Stats & analytics](#stats--analytics)
  - [Maps & Agents pages](#maps--agents-pages)
  - [Player breakdowns](#player-breakdowns)
  - [Opponent scouting](#opponent-scouting)
- [Tech stack](#tech-stack)
- [Running locally](#running-locally)
- [Developing](#developing)
- [Data model](#data-model)
- [Deployment](#deployment)

---

## Features

### Accounts & sync

- **Multi-user accounts.** Sign up with email + password; every account owns
  its own rosters, players, series, games, and scouting reports.
- **Cloud sync from any device.** State hydrates from the API on login and all
  edits sync in the background. The header shows a **"Saving…"** indicator
  while a write is in flight and a **sync-error banner** if the server rejects
  one.
- **Optimistic updates.** Edits apply instantly in the UI and roll back
  automatically if the server call fails.
- **Stateless JWT auth.** Tokens are stored in `localStorage` and verified on
  boot; passwords are bcrypt-hashed (cost 12) on the server.

### Rosters & players

- **Multiple rosters** per account — useful for alternating lineups, A/B teams,
  or separate squads. One roster can be marked **primary** (★), which makes it
  the default selection everywhere a roster must be chosen.
- **Players** belong to a roster and are flagged as **main roster** (starting 5)
  or **substitute**. Mains and subs are color-coded throughout the UI.
- An **include/exclude subs** toggle on the stats views lets you analyze the
  starting 5 in isolation or the full roster.
- Dev helpers on the Roster page: **generate mock data** to explore the app and
  **clear all data**.

### Series & games

- A **series** is a match vs. one opponent on a date, in **BO1 / BO3 / BO5**
  format, owned by a roster. Each series can optionally link to a scouting
  report.
- The **Series list** shows every series as a card: opponent, roster, format,
  date, map count, **win/loss result with score** (e.g. "Won 2–1"), and the
  **series MVP** (top ACS). Filter by roster.
- A **game** is one map within a series: map, date, starting side, final score,
  the 5-player lineup with agents, full per-player stats, and an optional
  round-by-round log.
- Games are auto-ordered within their series; the score is **derived from the
  rounds** if you log them, or entered manually otherwise.

### Round-by-round entry & economy

- The **Rounds editor** captures all 24 regulation rounds (12 per half) plus
  **overtime in pairs**. For each round you set: **result (W/L)**, **first
  blood**, whether the **spike was planted**, and — for non-opening rounds —
  a **gun / save** tag.
- Round **categories are auto-derived** from position and outcome: round 1 is a
  **pistol**, round 2 becomes a **force/antieco** or **eco** depending on the
  pistol result, round 3 a **bonus/antibonus**, and later rounds use your
  gun/save tag.
- The **Round Economy panel** turns that log into win rates: attack/defense
  pistol, eco, force/antieco, bonus, gun, save, plus first-blood rate,
  win-given-first-blood, post-plant win % (attack), retake win % and
  plants-allowed % (defense), and overall round win %. Cells are color-coded
  red→green, and a **comparison mode** shows percentage-point deltas vs. a
  baseline.

### Map vetoes (pick/ban)

- The **Pick/Ban card** builds a map veto for a series: choose a pool of up to
  7 maps, set which team is "team 1", then step through the pick/ban sequence
  for the chosen format. For each pick you can assign the **side** the
  defending team chooses, and the **decider** auto-fills when one map remains.
- The result renders as a clean "maps to play" summary: map order, who picked
  each, who picks side, and our starting side. This feeds the map-pick/ban
  analytics on the Stats and Maps pages.

### VODs & match videos

- **Match videos:** attach recording URLs to a series and tag which maps each
  one covers.
- **VOD reviews:** attach a review URL, tag the maps it covers, and keep an
  editable list of **key takeaways** per review.

### Stats & analytics

The **Stats** page is the analytical hub, organized into five tabs. All tabs
share a common filter bar — **roster, map, agents, series, date range, and
include/exclude subs** — and **every filter is synced to the URL** (via nuqs),
so any view is bookmarkable and shareable.

- **Overall** — team round-economy win rates, map pick/ban performance (our
  picks, enemy picks, deciders), a sortable player stats table, and the 25 most
  recent maps with scores and outcomes.
- **When We Win** / **When We Lose** — compares the winning (or losing) slice of
  matches against your baseline, at either map or series granularity. Stats are
  ranked by how much they differ, alongside a scoreboard of that slice and a
  list of the best winning maps / highest-statted losses.
- **Examine Closer** — dual-range sliders let you bracket any stat (ACS, HS%,
  round win %, plant rate, etc.) and instantly see which maps/series fall in
  range, their combined win rate, and the matching list.
- **Progression** — weekly time-series charts of round-economy metrics; overlay
  up to four comparison stats and click any point to jump to the Overall view
  for that week.

Player and team aggregates compute ACS, KDR, kills/deaths/assists, damage
delta, ADR, HS%, KAST%, first kills, first deaths, and multikills. **Best
values per column are highlighted in gold.**

### Maps & Agents pages

- **Maps** — a sortable table of per-map performance: plays, W–L, your pick %
  and ban %, opponent ban %, attack/defense/pistol round win %, and the top
  5-agent composition you run on that map with its win rate. Click a row to
  filter the Stats page to that map.
- **Agents** — grouped agent cards (by class: controller / duelist / initiator /
  sentinel) showing selections, overall win rate, and average ACS. Each card
  surfaces the best player on that agent, the strongest agent **duos**, and a
  per-map breakdown. Sort by selections, win rate, average ACS, or win rate on a
  chosen map.

### Player breakdowns

The **Players** page shows a per-agent breakdown for one player: every agent
they've played with game count and full stats (ACS, KDR, assists, damage delta,
ADR, HS%, KAST%, FK, FD, multikills), the best value in each column highlighted,
and the player's best map per agent. Filter by map, series, and date range.

### Opponent scouting

- **Scouting reports** profile an upcoming opponent: team name, an optional note
  (e.g. "NECC week 4"), and an optional owning roster.
- Each report has a **per-map breakdown**: the opponent's **win/loss record** on
  that map (with a free-text context note), up to **3 agent compositions** they
  run, and separate **attack-side and defense-side playstyle notes**. Maps
  auto-sort by record so their strongest maps surface first.
- A series can be linked to a scouting report so prep is one click away.

---

## Tech stack

**Frontend**
- React 18 + TypeScript, built with Vite 5
- React Router 6 for routing
- Zustand for state (`store.ts` for app data, `authStore.ts` for auth)
- nuqs for URL-synced filter/sort/tab state
- Tailwind CSS for styling

**Backend**
- Node + Express 4 + TypeScript (ESM, run with `tsx` in dev)
- Prisma 5 ORM over PostgreSQL
- Zod for request validation
- bcryptjs for password hashing, jsonwebtoken for stateless auth
- CORS configurable via `CORS_ORIGIN`

---

## Running locally

### The one-command way (recommended)

Requires **Docker Desktop running** (for Postgres). From the repo root:

```bash
npm start
```

That single command (`scripts/dev.sh`):

1. Generates `.env` and `server/.env` on first run, with a real random
   `JWT_SECRET`.
2. Installs frontend + backend dependencies if missing.
3. Starts Postgres in Docker and waits for it to accept connections.
4. Syncs the Prisma schema to the database (`prisma db push`).
5. Runs the API (**:4000**) and frontend (**:5173**) together, with prefixed
   `[api]` / `[web]` output.

Open <http://localhost:5173>, click **Sign up**, and you're in.

`Ctrl-C` stops both servers. Postgres keeps running in the background; to shut
the container down too:

```bash
npm run stop
```

### Running the pieces separately

Useful when debugging migrations or running against a remote DB:

```bash
# 1. Backend + database
cd server
cp .env.example .env          # then edit JWT_SECRET
docker compose up -d          # Postgres on :5432
npm install
npm run prisma:migrate -- --name init
npm run dev                   # API on http://localhost:4000

# 2. Frontend (in another terminal, from repo root)
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

### Environment variables

**Frontend** (`.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Base URL of the API (default `http://localhost:4000`) |

**Backend** (`server/.env`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret used to sign JWTs (`openssl rand -base64 48`) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `30d` |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated; `*` for dev only |
| `PORT` | API listen port (default `4000`) |

---

## Developing

### Scripts

Frontend (repo root):

| Command | What it does |
|---------|--------------|
| `npm start` | One-command dev: Postgres + API + frontend |
| `npm run stop` | Stop the Postgres container |
| `npm run dev` | Frontend dev server only |
| `npm run build` | Type-check (`tsc -b`) and production build |
| `npm run preview` | Preview the production build |

Backend (`server/`):

| Command | What it does |
|---------|--------------|
| `npm run dev` | API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:deploy` | Apply migrations (production) |
| `npm run prisma:generate` | Regenerate the Prisma client |

### Project layout

```
src/
  api/            # Typed API client + endpoint wrappers
  components/     # Reusable UI (PickBanCard, RoundsEditor, pickers, …)
  pages/          # Route pages; pages/stats/* are the Stats tabs
  utils/          # Pure logic: stats, rounds/economy, pickBan, scouting, …
  store.ts        # Zustand app-data store (optimistic + background sync)
  authStore.ts    # Auth/session store
  types.ts        # Source-of-truth domain types
  constants.ts    # Maps, agents-by-class, agent classes

server/
  src/routes/     # auth, me, rosters, players, series, games, scoutingReports
  src/auth.ts     # JWT issue/verify + requireAuth middleware
  prisma/         # schema.prisma
```

### How state & sync work

`store.ts` holds all app data in Zustand. Every mutation is **optimistic**: it
updates local state synchronously, then fires the matching API call in the
background through a `runSync` wrapper that tracks a `pending` count and rolls
the change back on failure. After login the store hydrates once from
`GET /me/state`, which returns the full `{ rosters, players, series, games,
scoutingReports }` snapshot.

### API endpoints

All routes except `/auth/*` and `/health` require `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/signup` | Create account → `{ token, user }` |
| POST | `/auth/login` | Authenticate → `{ token, user }` |
| GET | `/me` | Current user |
| GET | `/me/state` | Full data snapshot for the user |
| GET/POST | `/rosters` | List / create |
| PATCH/DELETE | `/rosters/:id` | Update / delete |
| GET/POST/PATCH/DELETE | `/players[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/series[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/games[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/scouting-reports[/:id]` | CRUD |
| GET | `/health` | Healthcheck |

---

## Data model

Domain types are defined once in [`src/types.ts`](src/types.ts) and mirrored by
Prisma in [`server/prisma/schema.prisma`](server/prisma/schema.prisma). The
top-level entities (`User`, `Roster`, `Player`, `Series`, `Game`,
`ScoutingReport`) are tables; nested arrays (rounds, stats, pick/ban moves,
videos, VOD reviews, scout maps) are stored as **JSON columns** to keep the API
shape identical to the frontend types. Deletes cascade at the DB level via
`onDelete: Cascade` (a deleted roster keeps its scouting reports but unlinks
them via `SetNull`).

---

## Deployment

The frontend and API deploy independently.

### Frontend — Vercel (recommended)

1. Push the repo to GitHub.
2. On [vercel.com](https://vercel.com), import the repo. Framework preset:
   **Vite**; root directory: `./`.
3. Set `VITE_API_URL` to your deployed API URL.
4. Deploy — Vercel auto-deploys on every push to `main`.

Netlify and Cloudflare Pages work the same way; just set `VITE_API_URL`.

### Backend — Railway (recommended)

1. Create a Railway project → "Deploy from GitHub repo", root `server/`.
2. Add the **Postgres plugin** (provides `DATABASE_URL` automatically).
3. Set `JWT_SECRET`, `JWT_EXPIRES_IN`, and `CORS_ORIGIN` (your frontend URL).
4. The `Dockerfile` + `railway.toml` handle the build; migrations run on each
   deploy via `prisma migrate deploy`.

Alternatives: **Render + Neon** or **Fly.io** — see
[`server/README.md`](server/README.md) for the exact steps.

### Putting it together

| Piece | Service | Cost |
|-------|---------|------|
| Frontend | Vercel | Free for personal use |
| Backend | Railway (Docker) | ~$5/month, free trial available |
| Database | Railway Postgres plugin | Included with backend |

After both are live, point `CORS_ORIGIN` (API) at your frontend URL and
`VITE_API_URL` (frontend) at your API URL, then sign up — your data now syncs
to Postgres and is reachable from any device.

## Auth model

Multi-user; each account owns its own data. Passwords are bcrypt-hashed
(cost 12). Auth is stateless JWT — to force-logout all users, rotate
`JWT_SECRET` on the API.
</content>
</invoke>
