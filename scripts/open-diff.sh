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

DIFF=$(git diff "${BASE}...HEAD" 2>/dev/null || git diff "${BASE}" 2>/dev/null)

if [ -z "$DIFF" ]; then
  echo "No diff found vs '${BASE}'. Are you on a feature branch with commits?"
  exit 1
fi

LINES=$(echo "$DIFF" | wc -l | tr -d ' ')
echo "Encoding diff (${LINES} lines) vs '${BASE}'..."

ENCODED=$(printf '%s' "$DIFF" | base64 | tr -d '\n')

URL="http://localhost:${PORT}/#diff=${ENCODED}"

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
