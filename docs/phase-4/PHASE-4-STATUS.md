# DCU Active — Phase 4 Status (in progress, NOT complete)

This tracks the 15 mandatory acceptance criteria. `PHASE-4-REVIEW-PACKAGE.md` will be produced only when every criterion is met with evidence.

Legend: ✅ done with evidence · 🟡 built and verified locally, waiting for staging credentials · ⛔ blocked on you (devices or accounts)

| # | Criterion | Status | Evidence / what is pending |
|---|---|---|---|
| 1 | Staging on hosted Supabase + real HTTPS host | 🟡 | `.github/workflows/staging.yml` (migrate → push Auth config → build with project CSP → Netlify deploy). Needs the accounts and secrets in `STAGING-SETUP.md`. |
| 2 | Complete automated suite against staging | 🟡 | `scripts/staging/run-staging-tests.sh`: headers, cleanup, pgTAP (`--db-url`), HTTP + concurrency, Playwright with `E2E_BASE_URL` and real email over IMAP, advisors. |
| 3 | Production-like redirect URLs, no wildcards | 🟡 | `scripts/staging/render-config.sh` sets `site_url` and `additional_redirect_urls` to the exact HTTPS origin. It refuses `http://` and `*` (verified). |
| 4 | Custom SMTP + real verification and reset tests | 🟡 ⛔ | SMTP is pushed via `config push`. The E2E auth tests send real mail to `TEST_MAILBOX+…` and read it back over IMAP. Needs the SMTP provider and test mailbox (D3). |
| 5 | Real iPhone Safari (+ Home Screen PWA) | ⛔ | `REAL-DEVICE-TEST-PLAN.md`: 17 steps. Needs your iPhone and the staging URL. |
| 6 | Real Android Chrome | ⛔ | Same plan, column C |
| 7 | Login / registration / verification / booking / cancel / check-in / session on devices | ⛔ | Same plan, rows 1–16. Session persistence is also automated now (`auth.spec.ts` "session persists…"). |
| 8 | Real response headers (CSP, HSTS, nosniff, frame, Referrer, Permissions) | 🟡 ✅ local | `security.spec.ts` asserts every header. Locally it runs against `serve-dist.mjs`, which applies the real `_headers`. On staging the same spec plus `curl -I` dumps run against Netlify. |
| 9 | Browser console / CSP violations on major screens | ✅ local, 🟡 staging | `security.spec.ts` visits 13 user and admin screens with the CSP enforced: **0 violations, 0 console errors**. A negative control (CSP with the Supabase origin removed) makes it fail, as intended. It also found a real bug (see below). |
| 10 | Supabase traffic never in Cache Storage; no stale offline availability | ✅ local, 🟡 staging | `pwa.spec.ts` (Cache Storage contains no Supabase, `/rest`, `/auth` or realtime URLs), `booking.spec.ts` (offline hides the grid and disables Review), `pwa.spec.ts` (offline reload shows the offline message, no slots) |
| 11 | Security + Performance Advisors, resolve material findings | ✅ local, 🟡 hosted | Splinter (dashboard lints) run locally. **Fixed:** 9 unindexed foreign keys (migration `20261006000800_fk_indexes.sql`). **Accepted by design:** 19 WARN "SECURITY DEFINER RPC callable by signed-in users". These are the RPC API and each function authorizes the caller; switching to SECURITY INVOKER would require client table writes. **Info:** unused indexes on a fresh database (re-judged on staging after traffic). The hosted run uses the Management API. |
| 12 | Lighthouse + accessibility on staging | ✅ local, 🟡 staging | Local, cold `/login` on mobile throttling: performance 82, accessibility 100, best practices 100, FCP 3.6 s. axe: 0 serious/critical on 11 screens × 2 widths. The staging run is in the workflow. |
| 13 | Server authority preserved | ✅ | No rule moved to React. The only client change was a bug fix: the profile query now filters by the user's id. |
| 14 | Concurrency guarantees + Phase 2 regression | ✅ local, 🟡 staging | Local: pgTAP 211/211, HTTP 6/6, concurrency 9/9 at 100 × 2 iterations (1,600 races, 0 violations). The staging run uses 50 × 2. |
| 15 | CI: tests, lint, typecheck, build/secret scan, audit | ✅ | `.github/workflows/ci.yml` runs on every push: lint, typecheck, unit (TZ=New York), build + secret scan, `npm audit`, backend + concurrency, full E2E, advisors. Validated with actionlint. First complete GitHub run [#5](https://github.com/riswara76/ronny/actions/runs/37409043063): web-static job green; backend + concurrency green; E2E 37/38. The one failure was the local email rate limit (defect 4), now fixed and re-verified locally; the confirmation run follows this commit. |

## Defects found in Phase 4 so far

| # | Defect | Found by | Fix | Regression |
|---|---|---|---|---|
| 1 | Admin's own profile failed to load (HTTP 406): an unfiltered `.single()` on `profiles`, while RLS lets admins read all profiles. Effect: no name in the greeting, Profile page spinner. | CSP/console check (security spec) | `getMyProfile(userId)` filters `.eq('id', userId)` | `admin.spec.ts` dashboard test now opens the admin's Profile |
| 2 | `staging.yml` YAML parse error | First GitHub run | Quoting fixed | actionlint in the review checklist |
| 3 | 9 FK columns without covering indexes | Advisors | Migration `…000800_fk_indexes.sql` (performance only) | Backend suite green |
| 4 | Password-reset E2E failed on CI: the local Auth `email_sent` limit (2/hour) was exceeded by earlier test emails | First CI run (#5) | Local/CI limit raised to 100. Hosted limits are now explicit per profile in `render-config.sh` (staging: 60 emails, 300 sign-ins; production: 30/30/30) | Backend then web suites run back-to-back locally (CI order): all green |

## Known non-blocking items

- **Bundle size:** JS is 145 KB gzipped. Biggest parts: supabase auth-js, react-router, and the unused supabase storage client. Cold mobile FCP is 3.6 s on Lighthouse's slow-4G profile. Candidate optimisation: import only the needed Supabase sub-clients.
