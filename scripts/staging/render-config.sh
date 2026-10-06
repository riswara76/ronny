#!/usr/bin/env bash
# Renders a staging/production copy of supabase/ with environment-specific Auth settings,
# for `supabase config push`. Nothing secret is written: SMTP password stays an env() reference.
#
# Required env: SITE_URL (e.g. https://dcu-active-staging.netlify.app — exact origin, no wildcard)
#               SMTP_HOST SMTP_PORT SMTP_USER SMTP_ADMIN_EMAIL SMTP_SENDER_NAME (SMTP_PASS read at push time)
#               RATE_PROFILE=staging|production (default staging)
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
# Rate limits: "staging" allows the automated suite (~50 sign-ins and ~10 emails per run);
# "production" keeps conservative values that still cover normal DCU usage.
profile = "${RATE_PROFILE:-staging}"
limits = {'staging': {'email_sent': 60, 'sign_in_sign_ups': 300, 'token_verifications': 300},
          'production': {'email_sent': 30, 'sign_in_sign_ups': 30, 'token_verifications': 30}}[profile]
for k, v in limits.items():
    s = re.sub(r'^(\s*)' + k + r' = .*$', r'\g<1>' + k + ' = ' + str(v), s, flags=re.M)
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
