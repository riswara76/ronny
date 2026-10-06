#!/usr/bin/env bash
# Renders a staging/production copy of supabase/ with environment-specific Auth settings,
# for `supabase config push`. Nothing secret is written: SMTP password stays an env() reference.
#
# Required env: SITE_URL (e.g. https://dcu-active-staging.netlify.app — exact origin, no wildcard)
#               SMTP_HOST SMTP_PORT SMTP_USER SMTP_ADMIN_EMAIL SMTP_SENDER_NAME (SMTP_PASS read at push time)
# Output: path of the rendered workdir on stdout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${SITE_URL:?}" "${SMTP_HOST:?}" "${SMTP_PORT:?}" "${SMTP_USER:?}" "${SMTP_ADMIN_EMAIL:?}" "${SMTP_SENDER_NAME:?}"
case "$SITE_URL" in https://*) ;; *) echo "SITE_URL must be https://" >&2; exit 1;; esac
case "$SITE_URL" in *\**) echo "No wildcards in SITE_URL" >&2; exit 1;; esac
SITE_URL="${SITE_URL%/}"
OUT="$(mktemp -d)"
cp -r "$ROOT/supabase" "$OUT/supabase"
CFG="$OUT/supabase/config.toml"
python3 - "$CFG" <<PY
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'^site_url = .*$', 'site_url = "${SITE_URL}"', s, flags=re.M)
s = re.sub(r'^additional_redirect_urls = .*$', 'additional_redirect_urls = ["${SITE_URL}"]', s, flags=re.M)
s = re.sub(r'^(\s*)email_sent = .*$', r'\1email_sent = 60', s, flags=re.M)
s += '''
# --- rendered for hosted environment ---
[auth.email.smtp]
enabled = true
host = "${SMTP_HOST}"
port = ${SMTP_PORT}
user = "${SMTP_USER}"
pass = "env(SMTP_PASS)"
admin_email = "${SMTP_ADMIN_EMAIL}"
sender_name = "${SMTP_SENDER_NAME}"
'''
open(p, 'w').write(s)
PY
grep -nE '^(site_url|additional_redirect_urls|enable_confirmations|minimum_password_length|password_requirements)' "$CFG" >&2
echo "$OUT"
