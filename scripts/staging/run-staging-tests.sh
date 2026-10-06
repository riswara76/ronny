#!/usr/bin/env bash
# Complete automated suite against STAGING (hosted Supabase + HTTPS static host).
# Required env (from CI secrets — never commit):
#   STAGING_SITE_URL            https://… (the deployed web app)
#   SUPABASE_URL                https://<ref>.supabase.co
#   SUPABASE_PUBLISHABLE_KEY    sb_publishable_…
#   SUPABASE_SECRET_KEY         sb_secret_…   (test harness only: creates test users/fixtures)
#   SUPABASE_DB_URL             postgresql://postgres.<ref>:<pw>@…pooler.supabase.com:5432/postgres (session mode)
#   TEST_MAILBOX TEST_IMAP_HOST TEST_IMAP_PORT TEST_IMAP_USER TEST_IMAP_PASS   (real-email tests)
#   CONCURRENCY_ITERATIONS (default 50)  OUT_DIR (default docs/phase-4/staging-output)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="${OUT_DIR:-$ROOT/docs/phase-4/staging-output}"
mkdir -p "$OUT"
export E2E_BASE_URL="${STAGING_SITE_URL%/}"
local_part="${TEST_MAILBOX%@*}"; domain="${TEST_MAILBOX#*@}"
status=0

echo "== 0. response headers =="
curl -sSI "$E2E_BASE_URL/" | tee "$OUT/headers-root.txt"
curl -sSI "$E2E_BASE_URL/book" > "$OUT/headers-spa-route.txt"
curl -sSI "$E2E_BASE_URL/sw.js" > "$OUT/headers-sw.txt"

echo "== 1. release slots held by previous test runs =="
psql "$SUPABASE_DB_URL" -v mailbox_local="$local_part" -v mailbox_domain="$domain" -f scripts/staging/cleanup-test-data.sql | tee "$OUT/cleanup.txt"

echo "== 2. pgTAP against the hosted database (each file runs in a rolled-back transaction) =="
supabase test db --db-url "$SUPABASE_DB_URL" 2>&1 | grep -v NOTICE | tee "$OUT/pgtap.txt" || status=1

echo "== 3. HTTP integration/privacy + concurrency regression (Phase 2 suite) =="
(cd scripts/backend-tests && npm ci --silent && \
  RESULTS_FILE="$OUT/concurrency-results.json" CONCURRENCY_ITERATIONS="${CONCURRENCY_ITERATIONS:-50}" \
  node --test --test-concurrency=1 --test-reporter=spec 01-auth-privacy.test.mjs 02-concurrency.test.mjs) 2>&1 | tee "$OUT/backend-http.txt" || status=1

echo "== 4. Playwright E2E against the deployed site (real SMTP via IMAP mailbox) =="
psql "$SUPABASE_DB_URL" -v mailbox_local="$local_part" -v mailbox_domain="$domain" -f scripts/staging/cleanup-test-data.sql >/dev/null
(cd web && npx playwright test --reporter=list,json 2>&1) | tee "$OUT/e2e.txt" || status=1

echo "== 5. advisors (splinter, same lints as the dashboard) =="
DB_URL="$SUPABASE_DB_URL" scripts/run-advisors.sh "$OUT/advisors.txt" || status=1
exit $status
