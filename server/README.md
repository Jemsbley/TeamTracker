# Team Tracker — Backend

Node + Express + TypeScript + Prisma + Postgres. Mirrors the entity model
defined in [`../src/types.ts`](../src/types.ts) and gives the frontend an API
to read/write per-user data.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/signup` | Create account, returns `{ token, user }` |
| POST | `/auth/login` | Returns `{ token, user }` |
| GET  | `/me` | Current user info |
| GET  | `/me/state` | Returns full `{ rosters, players, series, games }` snapshot |
| GET/POST | `/rosters` | List / create |
| PATCH/DELETE | `/rosters/:id` | Update / delete |
| GET/POST/PATCH/DELETE | `/players[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/series[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/games[/:id]` | CRUD |
| GET | `/health` | Healthcheck |

All routes except `/auth/*` and `/health` require `Authorization: Bearer <jwt>`.

## Local development

```bash
cd server
cp .env.example .env       # then edit JWT_SECRET
docker compose up -d        # starts Postgres on :5432
npm install
npm run prisma:migrate -- --name init
npm run dev                 # http://localhost:4000
```

## Deploying

### Recommended: Railway (database + API together)

1. Push this repo to GitHub.
2. On [railway.app](https://railway.app), create a new project →
   "Deploy from GitHub repo" → pick this repo and the `server/` directory as
   the root.
3. Add a Postgres plugin to the project. Railway exposes `DATABASE_URL`
   automatically.
4. Set the remaining env vars in the Railway dashboard:
   - `JWT_SECRET` — long random string (`openssl rand -base64 48`)
   - `JWT_EXPIRES_IN` — e.g. `30d`
   - `CORS_ORIGIN` — your deployed frontend URL (e.g. `https://teamtracker.vercel.app`)
5. The Dockerfile + `railway.toml` handle the rest. Migrations run on every
   deploy via `prisma migrate deploy`.

### Alternative: Render + Neon

- Database: [Neon](https://neon.tech) free tier → copy `DATABASE_URL`.
- API: [Render](https://render.com) → "New Web Service" → point at this repo,
  set root to `server/`, build command `npm install && npm run build`, start
  command `npx prisma migrate deploy && node dist/index.js`.

### Alternative: Fly.io

- `fly launch` from this directory, accept the Dockerfile, attach a
  `fly postgres create` instance.

## Notes

- Passwords are bcrypt-hashed (cost 12) before storage.
- Tokens are stateless JWTs. To force-logout a user, rotate `JWT_SECRET`.
- Cascading deletes are handled at the DB level via `onDelete: Cascade` in
  the Prisma schema.
