#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== BeeProdeXa POC backend (macOS) =="
echo "Project: $ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo "ERROR: .env file not found in $ROOT_DIR"
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Rebuilding better-sqlite3 for this machine..."
npm rebuild better-sqlite3 >/dev/null

if [[ -f "node_modules/.bin/nodemon" ]]; then
  chmod +x node_modules/.bin/nodemon || true
fi

echo "Starting server..."
echo "Health: http://localhost:8080/health"
echo "Sync:   http://localhost:8080/sync/status"
echo "Route:  http://localhost:8080/network/preferred"
echo ""

node src/index.js

