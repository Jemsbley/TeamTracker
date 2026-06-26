#!/usr/bin/env bash
# One-command launcher: brings up Postgres in Docker, prepares env/deps on
# first run, syncs the Prisma schema, then runs the API and frontend together.
#
# Usage: npm start  (from repo root)

set -euo pipefail

cd "$(dirname "$0")/.."

# ----- Preflight ---------------------------------------------------------

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker is required. Install Docker Desktop: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but not running. Start Docker Desktop and re-run." >&2
  exit 1
fi

# ----- First-run setup ---------------------------------------------------

if [ ! -f server/.env ]; then
  echo "→ Creating server/.env with a generated JWT_SECRET…"
  cp server/.env.example server/.env
  # Generate a real JWT secret. tr strips chars that confuse sed/dotenv.
  SECRET=$(openssl rand -base64 48 | tr -d '\n=+/' | head -c 64)
  # Use a delimiter that won't appear in the secret.
  sed -i.bak "s|change-me-to-a-long-random-string|${SECRET}|" server/.env
  rm -f server/.env.bak
fi

if [ ! -f .env ]; then
  echo "→ Creating .env from .env.example…"
  cp .env.example .env
fi

if [ ! -d node_modules ]; then
  echo "→ Installing frontend dependencies…"
  npm install
fi

if [ ! -d server/node_modules ]; then
  echo "→ Installing backend dependencies…"
  (cd server && npm install)
fi

# ----- Postgres ----------------------------------------------------------

echo "→ Starting Postgres…"
(cd server && docker compose up -d db) >/dev/null

echo -n "→ Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if (cd server && docker compose exec -T db pg_isready -U postgres) >/dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo
    echo "✗ Postgres did not become ready in 30s. Check 'docker compose -f server/docker-compose.yml logs db'." >&2
    exit 1
  fi
done

echo "→ Syncing database schema (prisma db push)…"
(cd server && npx --no-install prisma db push --skip-generate) >/dev/null

# ----- Run ---------------------------------------------------------------

cat <<EOF

  ──────────────────────────────────────────────
   API:      http://localhost:4000
   Frontend: http://localhost:5173
  ──────────────────────────────────────────────
   Ctrl-C stops both. Postgres keeps running in the
   background; run 'npm run stop' to shut it down.

EOF

exec npx --no-install concurrently \
  --names "api,web" \
  --prefix-colors "blue,magenta" \
  --kill-others \
  "npm --prefix server run dev" \
  "npm run dev"
