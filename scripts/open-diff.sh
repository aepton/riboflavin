#!/usr/bin/env bash
# Usage: ./scripts/open-diff.sh [base-branch] [port]
#
# Opens the current branch's diff vs base-branch in the Riboflavin dev server.
# Starts the dev server first if it's not already running.
#
# Examples:
#   ./scripts/open-diff.sh             # diff vs main, port 5173
#   ./scripts/open-diff.sh origin/main # diff vs remote main
#   ./scripts/open-diff.sh main 3000   # custom port

set -euo pipefail

BASE="${1:-main}"
PORT="${2:-5173}"

# Committed changes on this branch vs base
COMMITTED=$(git diff "${BASE}...HEAD" 2>/dev/null || git diff "${BASE}" 2>/dev/null)
# Uncommitted changes (staged + unstaged)
UNCOMMITTED=$(git diff HEAD 2>/dev/null)

DIFF="${COMMITTED}${UNCOMMITTED}"

if [ -z "$DIFF" ]; then
  echo "No diff found vs '${BASE}'. No committed or uncommitted changes detected."
  exit 1
fi

COMMITTED_LINES=$(echo "$COMMITTED" | wc -l | tr -d ' ')
UNCOMMITTED_LINES=$(echo "$UNCOMMITTED" | wc -l | tr -d ' ')
echo "Encoding diff vs '${BASE}' (${COMMITTED_LINES} committed lines, ${UNCOMMITTED_LINES} uncommitted lines)..."

ENCODED_COMMITTED=$(printf '%s' "$COMMITTED" | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')
ENCODED_UNCOMMITTED=$(printf '%s' "$UNCOMMITTED" | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')

URL="http://localhost:${PORT}/#committed=${ENCODED_COMMITTED}&uncommitted=${ENCODED_UNCOMMITTED}"

# Start dev server if not already running
if ! curl -sf "http://localhost:${PORT}" > /dev/null 2>&1; then
  echo "Dev server not running — starting it in the background..."
  cd "$(dirname "$0")/.." && npm run dev &
  echo "Waiting for server to start..."
  for i in $(seq 1 20); do
    sleep 0.5
    if curl -sf "http://localhost:${PORT}" > /dev/null 2>&1; then
      break
    fi
  done
fi

echo "Opening in browser..."
open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "Open manually: $URL"
