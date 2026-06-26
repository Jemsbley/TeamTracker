#!/usr/bin/env bash
# Stops the Postgres container started by `npm start`.

set -euo pipefail
cd "$(dirname "$0")/.."

(cd server && docker compose down)
echo "✓ Stopped."
