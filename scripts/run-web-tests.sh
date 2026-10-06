#!/usr/bin/env bash
# Phase 3 web test run against the LOCAL Supabase stack:
#   unit tests -> lint/typecheck -> production build -> Playwright E2E (real Auth, RPC, Realtime, Mailpit).
# Usage: scripts/run-web-tests.sh [playwright args...]   (SKIP_RESET=1 keeps the current database)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
eval "$(supabase status -o env)"
export SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_SECRET_KEY="$SECRET_KEY"
export SUPABASE_DB_URL="$DB_URL" MAILPIT_URL="${MAILPIT_URL:-$INBUCKET_URL}"
if [[ "${SKIP_RESET:-0}" != "1" ]]; then supabase db reset >/dev/null; fi

cd web
printf "VITE_SUPABASE_URL=%s\nVITE_SUPABASE_PUBLISHABLE_KEY=%s\n" "$SUPABASE_URL" "$SUPABASE_PUBLISHABLE_KEY" > .env.local
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  TZ=America/New_York npx vitest run
  npx eslint .
  npm run build
fi
npx playwright test "$@"
