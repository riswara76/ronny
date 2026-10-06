#!/usr/bin/env bash
# Supabase Security + Performance Advisor lints (vendored splinter) against any database.
# Usage: DB_URL=postgresql://... scripts/run-advisors.sh [out.txt]
# Output columns: lint | level | categories | detail. Hosted projects can also be checked with the
# Management API (GET /v1/projects/{ref}/advisors/security|performance), which CI does on staging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-advisors.txt}"
psql "$DB_URL" -X -A -F '|' -t -f "$ROOT/supabase/advisors/splinter.sql" 2>/dev/null \
  | awk -F'|' 'NF>3{print $1"|"$3"|"$5"|"$7}' > "$OUT"
echo "advisor findings written to $OUT"
awk -F'|' '{print $2" "$1}' "$OUT" | sort | uniq -c
