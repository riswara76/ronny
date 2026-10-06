#!/usr/bin/env bash
# Runs the complete Phase 2 backend test suite against the LOCAL Supabase stack.
#   1. resets the local database (all migrations + seed)
#   2. pgTAP suites           (supabase/tests/*.test.sql)
#   3. HTTP integration tests  (scripts/backend-tests/01-auth-privacy.test.mjs)
#   4. HTTP concurrency tests  (scripts/backend-tests/02-concurrency.test.mjs)
# Requires: Supabase CLI, Docker, Node 20+. Local keys come from `supabase status`;
# nothing secret is stored in the repository.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

eval "$(supabase status -o env)"
export SUPABASE_URL="$API_URL"
export SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SECRET_KEY="$SECRET_KEY"
export SUPABASE_DB_URL="$DB_URL"
export MAILPIT_URL="${MAILPIT_URL:-$INBUCKET_URL}"
export CONCURRENCY_ITERATIONS="${CONCURRENCY_ITERATIONS:-100}"
OUT="${OUT_DIR:-$ROOT/docs/phase-2/test-output}"
mkdir -p "$OUT"
export RESULTS_FILE="$OUT/concurrency-results.json"

if [[ "${SKIP_RESET:-0}" != "1" ]]; then supabase db reset; fi

echo "== pgTAP =="
supabase test db 2>&1 | grep -v NOTICE | tee "$OUT/pgtap.txt"

echo "== HTTP integration & privacy =="
(cd scripts/backend-tests && npm ci --silent && node --test --test-concurrency=1 --test-reporter=spec 01-auth-privacy.test.mjs) 2>&1 | tee "$OUT/http-integration.txt"

echo "== HTTP concurrency (${CONCURRENCY_ITERATIONS} iterations x 2 modes per scenario) =="
(cd scripts/backend-tests && node --test --test-concurrency=1 --test-reporter=spec 02-concurrency.test.mjs) 2>&1 | tee "$OUT/http-concurrency.txt"
