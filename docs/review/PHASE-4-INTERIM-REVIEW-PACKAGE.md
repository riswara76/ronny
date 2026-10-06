# DCU Active — Phase 4 INTERIM Review Package (for external reviewer)

> Status: **Phase 4 is NOT complete.** Staging deployment, real SMTP, real-device tests and hosted
> advisors are blocked on accounts/devices the owner must provide. This package lets you review the
> work done so far and the staging plan BEFORE it is executed. The final `PHASE-4-REVIEW-PACKAGE.md`
> will only be produced when all 15 acceptance criteria have evidence.

## Instructions for the reviewer
Review as a critical senior DevSecOps / Supabase / web-security reviewer. Earlier phases (architecture,
Supabase backend with RLS + booking RPCs + exclusion constraints, React PWA) were approved.
Phase 4 = testing & hardening with these mandatory criteria: staging on hosted Supabase + HTTPS host;
full suite against staging; no wildcard redirect URLs; custom SMTP with real email tests; real iPhone
Safari/PWA and Android Chrome tests; real response headers (CSP, HSTS, nosniff, frame, Referrer,
Permissions); no CSP console violations; Supabase traffic never in Cache Storage; Security/Performance
Advisors; Lighthouse; server authority preserved; concurrency regression; CI.

Report concrete defects with severity (Critical/High/Medium/Low) and evidence, focusing on:
1. Will the staging workflow actually work and is it safe (secrets handling, `db push`, `config push`, cleanup SQL that cancels test bookings on a shared staging DB, test data identification)?
2. Is the CSP/header setup correct and complete? Any way an attacker or misconfiguration bypasses it?
3. Are the tests strong enough to prove the criteria (or could they pass vacuously)?
4. Is accepting the 19 "SECURITY DEFINER callable by signed-in users" advisor warnings justified?
5. Gaps between the 15 criteria and what is delivered / planned.
Do not summarize; list defects and risks.



---
# FILE: docs/phase-4/PHASE-4-STATUS.md

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
| 15 | CI: tests, lint, typecheck, build/secret scan, audit | ✅ | `.github/workflows/ci.yml` runs on every push: lint, typecheck, unit (TZ=New York), build + secret scan, `npm audit`, backend + concurrency, full E2E, advisors. Validated with actionlint; first GitHub runs in progress. |

## Defects found in Phase 4 so far

| # | Defect | Found by | Fix | Regression |
|---|---|---|---|---|
| 1 | Admin's own profile failed to load (HTTP 406): an unfiltered `.single()` on `profiles`, while RLS lets admins read all profiles. Effect: no name in the greeting, Profile page spinner. | CSP/console check (security spec) | `getMyProfile(userId)` filters `.eq('id', userId)` | `admin.spec.ts` dashboard test now opens the admin's Profile |
| 2 | `staging.yml` YAML parse error | First GitHub run | Quoting fixed | actionlint in the review checklist |
| 3 | 9 FK columns without covering indexes | Advisors | Migration `…000800_fk_indexes.sql` (performance only) | Backend suite green |

## Known non-blocking items

- **Bundle size:** JS is 145 KB gzipped. Biggest parts: supabase auth-js, react-router, and the unused supabase storage client. Cold mobile FCP is 3.6 s on Lighthouse's slow-4G profile. Candidate optimisation: import only the needed Supabase sub-clients.


---
# FILE: docs/phase-4/STAGING-SETUP.md

# DCU Active — Staging Setup (what you need to create)

Staging runs entirely from **GitHub Actions** (`.github/workflows/staging.yml`).

- The build container used for development cannot reach Supabase or Netlify (network policy). GitHub's runners can.
- Every credential lives in **GitHub → Settings → Environments → `staging` → Secrets**. They are never committed, never written into the app, and never shown to the assistant.
- Estimated time for you: **45–60 minutes**, once.

---

## 1. Hosted Supabase project (staging)

| | |
|---|---|
| **What** | A new Supabase project named `dcu-active-staging`, region **Southeast Asia (Singapore)** |
| **Why** | The real backend for staging: migrations, Auth, Realtime and advisors run against it |
| **Where** | https://supabase.com/dashboard → New project. The free plan is fine for staging. |
| **Never share / commit** | Database password, secret key, access token |

After it is created, collect these values:

| GitHub secret | Where to find it | Sensitive? |
|---|---|---|
| `STAGING_PROJECT_REF` | Project Settings → General → Reference ID (20 letters) | no |
| `STAGING_SUPABASE_URL` | Project Settings → API → Project URL (`https://<ref>.supabase.co`) | no (public) |
| `STAGING_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_…`) | no (public by design) |
| `STAGING_SECRET_KEY` | Project Settings → API Keys → Secret key (`sb_secret_…`) | **YES** — test harness only, never in the app |
| `STAGING_DB_URL` | Connect → Session pooler → URI. Replace `[YOUR-PASSWORD]` and percent-encode special characters. | **YES** |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → Generate token (name: `dcu-staging-ci`) | **YES** |

## 2. HTTPS static host (Netlify)

| | |
|---|---|
| **What** | A Netlify site (e.g. `dcu-active-staging.netlify.app`, or your own subdomain) |
| **Why** | A real HTTPS host that applies our `_headers` (CSP, HSTS…) and `_redirects`, the same way production will |
| **Where** | https://app.netlify.com → Add new site → **Deploy manually**. Drag any folder to create it; CI deploys the real build afterwards. |
| **Never share / commit** | Netlify personal access token |

| GitHub secret | Where |
|---|---|
| `NETLIFY_SITE_ID` | Site configuration → General → Site ID |
| `NETLIFY_AUTH_TOKEN` | User settings → Applications → Personal access tokens → New token (**sensitive**) |
| `STAGING_SITE_URL` | The site's HTTPS URL, e.g. `https://dcu-active-staging.netlify.app` (no trailing slash, **no wildcard**) |

*Alternative:* Cloudflare Pages also reads `_headers` / `_redirects`. Tell me if you prefer it; only the deploy step changes.

## 3. Custom SMTP (decision D3)

| | |
|---|---|
| **What** | An email-sending account plus a verified sender domain or address |
| **Why** | Supabase's built-in mailer only reaches project team members and is heavily rate-limited, so verification and password-reset emails would not reach real users |
| **Where** | Options: **Resend** (simple, free tier 3,000/month: resend.com → API Keys + verify domain), Brevo, SendGrid, Amazon SES, or DCU's own mail server. Add the SPF/DKIM DNS records the provider shows. |
| **Never share / commit** | SMTP password / API key |

| GitHub secret | Example (Resend) |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | the API key (**sensitive**) |
| `SMTP_ADMIN_EMAIL` | `no-reply@your-domain` (must be a verified sender) |
| `SMTP_SENDER_NAME` | `DCU Active` |

## 4. Test mailbox for automated real-email tests

| | |
|---|---|
| **What** | A dedicated mailbox that supports plus-addressing, e.g. a new Gmail account `dcu.active.e2e@gmail.com` |
| **Why** | On staging, the registration, verification and reset tests send **real** emails. They go to `dcu.active.e2e+<random>@gmail.com` and are read back over IMAP. Never send to fake addresses: they bounce and damage your SMTP reputation. |
| **Where** | Gmail: enable 2-Step Verification → Security → **App passwords** → create one for "Mail" |
| **Never share / commit** | The app password |

| GitHub secret | Example |
|---|---|
| `TEST_MAILBOX` | `dcu.active.e2e@gmail.com` |
| `TEST_IMAP_HOST` / `TEST_IMAP_PORT` | `imap.gmail.com` / `993` |
| `TEST_IMAP_USER` | `dcu.active.e2e@gmail.com` |
| `TEST_IMAP_PASS` | the 16-character app password (**sensitive**) |

## 5. Staging test accounts (created by CI, you choose the values)

| GitHub secret | Example |
|---|---|
| `STAGING_ADMIN_EMAIL` | `dcu.active.e2e+admin@gmail.com` |
| `STAGING_USER1_EMAIL` / `STAGING_USER2_EMAIL` | `dcu.active.e2e+user1@gmail.com` / `…+user2@…` |
| `STAGING_TEST_PASSWORD` | a strong password (8+, upper, lower, digit, symbol) — **sensitive**. Also use it for the real-device tests. |

## 6. GitHub permissions

- **Settings → Environments → New environment `staging`** → add all the secrets above.
- The Claude GitHub App needs **Workflows: read & write** permission to push the workflow files (GitHub → Settings → Applications → Claude → Configure). If the push of `.github/workflows/*` was refused, this is why.

## 7. Run it

GitHub → **Actions → "Staging deploy + verification" → Run workflow**. The run:

1. migrates the database;
2. pushes the Auth config (exact staging origin, SMTP, OTP templates, password policy);
3. builds the web app with a CSP for this project and deploys it to Netlify;
4. runs pgTAP, the HTTP and concurrency suites, the full Playwright E2E with real email, header and CSP checks, advisors and Lighthouse;
5. uploads everything as the **`staging-evidence`** artifact.

I can read the run results through the GitHub integration and fix whatever fails.

## 8. Supabase dashboard checks after the first run (1 minute)

- Authentication → URL Configuration: Site URL = `STAGING_SITE_URL`; Redirect URLs = only that origin.
- Authentication → Emails → SMTP Settings: enabled, with your sender.
- Advisors → Security Advisor / Performance Advisor: visible (CI also downloads them).


---
# FILE: docs/phase-4/REAL-DEVICE-TEST-PLAN.md

# DCU Active — Real-Device Test Plan (iPhone Safari + Android Chrome)

This test cannot be automated from the build environment: it needs your physical phones.
Use the **staging URL** (`STAGING_SITE_URL`).
Use two accounts so the conflict test is real: your own new registration plus `STAGING_USER1_EMAIL`.

Record **Pass / Fail + a note or screenshot** for every row and send the filled table back (a photo of a printout is fine).
Any Fail is fixed and re-tested before Phase 4 is declared complete.

**Devices**

- **A** iPhone, Safari: iOS version ____
- **B** iPhone, installed Home-Screen app (Safari → Share → *Add to Home Screen*)
- **C** Android phone, Chrome: model ____ / Android ____ / Chrome ____

| # | Step | Expected | A | B | C |
|---|---|---|---|---|---|
| 1 | Open the staging URL (type it, or scan a QR code) | Login page, no browser warnings, padlock shown | | | |
| 2 | **Register** with your real email (name, email, password; try a weak password first) | Weak password shows the unmet rules; strong one → "Check your email" | | — | |
| 3 | Open the verification email **on the phone** → tap "Confirm my email" link → press **Confirm my email** | "Email verified" → Continue → Home greets you by first name | | — | |
| 4 | (Second email) Register another address, use the **6-digit code** instead of the link | Verified and signed in | | — | |
| 5 | **Log out → Log in** | Home shown; wrong password shows "Incorrect email or password." | | | |
| 6 | **Session persistence**: close the tab/app completely, reopen after 1 minute | Still signed in, Home shown | | | |
| 7 | **Book Tennis** tomorrow, 60 minutes | Durations only show what fits; review → **Booking confirmed** with code | | | |
| 8 | **Basketball/Futsal**: choose Basketball, book a time; with the 2nd account open Futsal at the same time | Slot shows **Booked** for Futsal | | | |
| 9 | **Air Hockey**: book; on the 2nd account the same time shows "1 spot left" | Correct counts; no table number shown | | | |
| 10 | **Live update**: keep account 2 on Tennis tomorrow; book 07:00 with account 1 | Account 2's 07:00 turns **Booked** within a few seconds, without refresh | | | |
| 11 | **Conflict**: both accounts select the same free slot and open Review; confirm on 1, then on 2 | Account 2: "Sorry, this time slot was just booked by another user…" and the grid refreshes | | | |
| 12 | **Cancel** a booking from My Bookings | Confirmation dialog → moves to History "Cancelled"; slot available again | | | |
| 13 | **Check-in**: admin creates a booking for "now" (I can prepare one on request), or book the next half-hour slot and wait | Button disabled with "Check-in opens at HH:MM" before the window; enabled inside it → **Checked in** | | | |
| 14 | **Offline**: turn on airplane mode on the booking screen | "You are offline…" message, no times shown, Review disabled; back online → times return | | | |
| 15 | **Rotate** to landscape / use large text (iOS Text Size / Android font size) | Layout usable, nothing cut off | | | |
| 16 | **Forgot password** → email link → new password → log in | Works; old password rejected | | — | |
| 17 | Home-Screen app only: launch from icon | Opens full-screen with the DCU Active icon/name; booking works | — | | (optional on C: Chrome menu → *Install app*) |

Notes for testers:

- All times are Jakarta time (WIB), even if the phone is set to another timezone.
- The 2nd account can be another phone, or a desktop browser.


---
# CI STATUS AT PACKAGING TIME

GitHub Actions CI run #3 (commit a94966e) was **in progress** when this package was created; runs #1–#2 were cancelled by newer pushes (cancel-in-progress). The same suites pass locally (see evidence below).


---
# EVIDENCE (local stack)

## Playwright E2E (38 tests)

```text
 Test Files  1 passed (1)
      Tests  23 passed (23)
✓ 2025 modules transformed.
✓ built in 923ms
bundle secret check passed (20 files)
  ✓   1 [android-chrome] › tests/e2e/auth.spec.ts:6:3 › Authentication journeys › register → verification email → confirm via link → signed in (any email domain)
  ✓   2 [android-chrome] › tests/e2e/auth.spec.ts:58:3 › Authentication journeys › register → verify with the 6-digit code
  ✓   3 [android-chrome] › tests/e2e/auth.spec.ts:79:3 › Authentication journeys › login errors and forgot/reset password via the emailed link
  ✓   4 [android-chrome] › tests/e2e/auth.spec.ts:106:3 › Authentication journeys › session persists across a browser restart and ends on sign-out
  ✓   5 [android-chrome] › tests/e2e/auth.spec.ts:123:3 › Authentication journeys › deactivated user is moved to "Account disabled" on the next server call
  ✓   6 [android-chrome] › tests/e2e/booking.spec.ts:28:3 › Booking journeys (Android-size viewport) › home lists the 6 facilities; availability comes from the backend
  ✓   7 [android-chrome] › tests/e2e/booking.spec.ts:43:3 › Booking journeys (Android-size viewport) › Tennis 30 / 60 / 90 minutes, and only durations that fit are offered
  ✓   8 [android-chrome] › tests/e2e/booking.spec.ts:83:3 › Booking journeys (Android-size viewport) › Basketball booking makes the shared court unavailable for Futsal
  ✓   9 [android-chrome] › tests/e2e/booking.spec.ts:106:5 › Booking journeys (Android-size viewport) › Air Hockey: tables are allocated automatically (2 spots, then full)
  ✓  10 [android-chrome] › tests/e2e/booking.spec.ts:106:5 › Booking journeys (Android-size viewport) › Foosball: tables are allocated automatically (2 spots, then full)
  ✓  11 [android-chrome] › tests/e2e/booking.spec.ts:136:3 › Booking journeys (Android-size viewport) › fair-use rules are explained: max upcoming bookings and once per facility per day
  ✓  12 [android-chrome] › tests/e2e/booking.spec.ts:161:3 › Booking journeys (Android-size viewport) › cancel a booking: confirmation, history and the slot is released
  ✓  13 [android-chrome] › tests/e2e/booking.spec.ts:182:3 › Booking journeys (Android-size viewport) › check-in: enabled inside the window, disabled before it, no-show shown in history
  ✓  14 [android-chrome] › tests/e2e/booking.spec.ts:208:3 › Booking journeys (Android-size viewport) › concurrency: slot taken between review and confirm shows the friendly message and refreshes
  ✓  15 [android-chrome] › tests/e2e/booking.spec.ts:225:3 › Booking journeys (Android-size viewport) › realtime: availability updates on screen when someone else books
  ✓  16 [android-chrome] › tests/e2e/booking.spec.ts:237:3 › Booking journeys (Android-size viewport) › offline: no stale availability and no booking actions
  ✓  17 [android-chrome] › tests/e2e/booking.spec.ts:251:3 › Booking journeys (Android-size viewport) › privacy: another user's identity never appears and their rows are not readable
  ✓  18 [desktop-chrome] › tests/e2e/a11y.spec.ts:20:3 › Accessibility baseline › no serious/critical axe violations on key screens (desktop and phone width)
  ✓  19 [desktop-chrome] › tests/e2e/a11y.spec.ts:49:3 › Accessibility baseline › keyboard only: log in, choose a time, review and confirm a booking
  ✓  20 [desktop-chrome] › tests/e2e/a11y.spec.ts:78:3 › Accessibility baseline › dialogs close with Escape and return to the page
  ✓  21 [desktop-chrome] › tests/e2e/admin.spec.ts:5:3 › Admin journeys (desktop Chrome 1440×900) › non-admins cannot reach admin screens; admins see the Admin entry
  ✓  22 [desktop-chrome] › tests/e2e/admin.spec.ts:14:3 › Admin journeys (desktop Chrome 1440×900) › dashboard shows operational metrics and utilization
  ✓  23 [desktop-chrome] › tests/e2e/admin.spec.ts:38:3 › Admin journeys (desktop Chrome 1440×900) › booking management: search, view identity, cancel with reason
  ✓  24 [desktop-chrome] › tests/e2e/admin.spec.ts:66:3 › Admin journeys (desktop Chrome 1440×900) › facility block: conflicts shown first, explicit confirmation, users see Unavailable, block removable
  ✓  25 [desktop-chrome] › tests/e2e/admin.spec.ts:118:3 › Admin journeys (desktop Chrome 1440×900) › user management: deactivate (enforced by the server) and reactivate
  ✓  26 [desktop-chrome] › tests/e2e/pwa.spec.ts:5:3 › PWA › manifest is valid for installation
  ✓  27 [desktop-chrome] › tests/e2e/pwa.spec.ts:19:3 › PWA › service worker registers, Chrome reports the app installable, backend traffic is never cached
  ✓  28 [desktop-chrome] › tests/e2e/pwa.spec.ts:43:3 › PWA › offline reload: app shell opens, shows the offline message, no availability
  ✓  29 [desktop-chrome] › tests/e2e/security.spec.ts:26:3 › Security headers and CSP › response headers on documents and assets
  ✓  30 [desktop-chrome] › tests/e2e/security.spec.ts:56:3 › Security headers and CSP › no CSP violations or console errors on user and admin screens
  ✓  31 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at iphone 390×844
  ✓  32 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at android 412×915
  ✓  33 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at tablet 820×1180
  ✓  34 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at desktop 1440×900
  ✓  35 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at desktop 1440×900
  ✓  36 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at tablet 820×1180
  ✓  37 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at android 412×915
  ✓  38 [responsive] › tests/e2e/responsive.spec.ts:129:1 › auth screens on iPhone size
  38 passed (1.9m)
```

## Backend regression (pgTAP + HTTP + concurrency)

```text
Files=6, Tests=211,  1 wallclock secs ( 0.06 usr  0.02 sys +  0.04 cusr  0.07 csys =  0.19 CPU)
Result: PASS
ℹ tests 6
ℹ pass 6
ℹ fail 0
  tennis_2_users: {"A wins":130,"B wins":70} (barrier min waiting=2)
  air_hockey_3_users_2_tables: {"loser=s2c":90,"loser=s2b":68,"loser=s2a":42} (barrier min waiting=3)
  foosball_3_users_2_tables: {"loser=s3c":68,"loser=s3b":86,"loser=s3a":46} (barrier min waiting=3)
  same_user_overlap: {"winners=foosball+tabletennis":95,"winners=tennis+tabletennis":105} (barrier min waiting=3)
  booking_vs_admin_block: {"booking first, block refused (conflict)":65,"booking first, then block cancelled it":71,"block first, booking refused":64} (barrier min waiting=2)
  cancel_vs_rebook_race: {"rebook won after cancel committed":87,"rebook saw slot still held, retry succeeded":113} (barrier min waiting=null)
  mixed_duration_overlap: {"winners=18:30/60,19:30/30":58,"winners=18:00/90,19:30/30":96,"winners=19:00/30,19:30/30":46} (barrier min waiting=4)
  basketball_vs_futsal: {"Basketball won":109,"Futsal won":91} (barrier min waiting=2)
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

## Advisors after fix (lint | level | categories | object)

```text
     20 INFO unused_index
     19 WARN authenticated_security_definer_function_executable
```

## Lighthouse (local; only /login is a cold load, other pages were served warm from the SW cache)

```json
[
  {
    "page": "login",
    "path": "/login",
    "profile": "mobile",
    "performance": 82,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "3.6 s",
    "lcp": "3.7 s",
    "tbt": "10 ms",
    "cls": "0"
  },
  {
    "page": "register",
    "path": "/register",
    "profile": "mobile",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.1 s",
    "lcp": "0.1 s",
    "tbt": "0 ms",
    "cls": "0"
  },
  {
    "page": "home",
    "path": "/",
    "profile": "mobile",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.1 s",
    "lcp": "0.1 s",
    "tbt": "10 ms",
    "cls": "0"
  },
  {
    "page": "book-tennis",
    "path": "/book/tennis",
    "profile": "mobile",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.1 s",
    "lcp": "0.1 s",
    "tbt": "0 ms",
    "cls": "0"
  },
  {
    "page": "my-bookings",
    "path": "/bookings",
    "profile": "mobile",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.1 s",
    "lcp": "0.1 s",
    "tbt": "0 ms",
    "cls": "0"
  },
  {
    "page": "admin-dashboard",
    "path": "/admin",
    "profile": "desktop",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.0 s",
    "lcp": "0.0 s",
    "tbt": "0 ms",
    "cls": "0"
  },
  {
    "page": "admin-bookings",
    "path": "/admin/bookings",
    "profile": "desktop",
    "performance": 100,
    "accessibility": 100,
    "bestPractices": 100,
    "fcp": "0.0 s",
    "lcp": "0.0 s",
    "tbt": "0 ms",
    "cls": "0"
  }
]
```


---
# SOURCE (Phase 4 changes)


## FILE: .github/workflows/ci.yml

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  web-static:
    name: Web — lint, typecheck, unit, build + secret scan, audit
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          TZ: America/New_York      # proves all displayed times are Jakarta time
      - name: Build (placeholder public config) + bundle secret scan
        run: npm run build
        env:
          VITE_SUPABASE_URL: https://ci-placeholder.supabase.co
          VITE_SUPABASE_PUBLISHABLE_KEY: sb_publishable_ci_placeholder
      - name: Dependency audit (runtime dependencies)
        run: npm audit --omit=dev --audit-level=moderate

  backend-and-e2e:
    name: Backend (pgTAP, HTTP, concurrency) + Playwright E2E on local Supabase
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            web/package-lock.json
            scripts/backend-tests/package-lock.json
      - uses: supabase/setup-cli@v1
        with:
          version: 2.119.0
      - name: Start local Supabase
        run: supabase start -x studio,imgproxy,vector,logflare,storage-api,edge-runtime,postgres-meta,supavisor
      - name: Backend suite (pgTAP + HTTP + concurrency regression)
        run: ./scripts/run-backend-tests.sh
        env:
          CONCURRENCY_ITERATIONS: 50
          OUT_DIR: ${{ github.workspace }}/artifacts/backend
      - name: Install web deps and Playwright Chromium
        working-directory: web
        run: |
          npm ci
          npx playwright install --with-deps chromium
      - name: Web suite (unit + lint + build + E2E incl. security headers/CSP, PWA, a11y)
        run: ./scripts/run-web-tests.sh
      - name: Advisors (Security + Performance lints)
        if: always()
        run: |
          eval "$(supabase status -o env)"
          DB_URL="$DB_URL" ./scripts/run-advisors.sh artifacts/advisors.txt
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ci-evidence
          path: |
            artifacts/
            web/test-results/
          retention-days: 14

```


## FILE: .github/workflows/staging.yml

```yaml
name: Staging deploy + verification

# Manual: Actions → "Staging deploy + verification" → Run workflow.
# All credentials come from the "staging" GitHub Environment secrets (see docs/phase-4/STAGING-SETUP.md).
on:
  workflow_dispatch:
    inputs:
      deploy:
        description: Deploy database + Auth config + web before testing
        type: boolean
        default: true
      concurrency_iterations:
        description: Iterations per mode for the concurrency regression
        default: '50'

permissions:
  contents: read

concurrency:
  group: staging
  cancel-in-progress: false

jobs:
  staging:
    runs-on: ubuntu-latest
    environment: staging
    timeout-minutes: 90
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ${{ secrets.STAGING_PROJECT_REF }}
      SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
      SUPABASE_PUBLISHABLE_KEY: ${{ secrets.STAGING_PUBLISHABLE_KEY }}
      SUPABASE_SECRET_KEY: ${{ secrets.STAGING_SECRET_KEY }}
      SUPABASE_DB_URL: ${{ secrets.STAGING_DB_URL }}
      STAGING_SITE_URL: ${{ secrets.STAGING_SITE_URL }}
      TEST_MAILBOX: ${{ secrets.TEST_MAILBOX }}
      TEST_IMAP_HOST: ${{ secrets.TEST_IMAP_HOST }}
      TEST_IMAP_PORT: ${{ secrets.TEST_IMAP_PORT }}
      TEST_IMAP_USER: ${{ secrets.TEST_IMAP_USER }}
      TEST_IMAP_PASS: ${{ secrets.TEST_IMAP_PASS }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: supabase/setup-cli@v1
        with:
          version: 2.119.0
      - run: sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client

      - name: Migrate hosted database
        if: inputs.deploy
        run: supabase db push --db-url "$SUPABASE_DB_URL" --yes

      - name: Push Auth config (exact staging origin, SMTP, OTP templates, password policy)
        if: inputs.deploy
        env:
          SITE_URL: ${{ secrets.STAGING_SITE_URL }}
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          SMTP_ADMIN_EMAIL: ${{ secrets.SMTP_ADMIN_EMAIL }}
          SMTP_SENDER_NAME: ${{ secrets.SMTP_SENDER_NAME }}
        run: |
          WORK="$(scripts/staging/render-config.sh)"
          supabase config push --workdir "$WORK" --project-ref "$PROJECT_REF" --yes

      - name: Build web for staging
        working-directory: web
        env:
          VITE_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.STAGING_PUBLISHABLE_KEY }}
        run: |
          npm ci
          npm run build

      - name: Deploy web to Netlify (HTTPS)
        if: inputs.deploy
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
        run: npx --yes netlify-cli@17 deploy --dir web/dist --prod --site "$NETLIFY_SITE_ID" --auth "$NETLIFY_AUTH_TOKEN" --message "staging ${GITHUB_SHA::7}"

      - name: Test accounts (idempotent)
        env:
          DCU_ADMIN_EMAIL: ${{ secrets.STAGING_ADMIN_EMAIL }}
          DCU_USER1_EMAIL: ${{ secrets.STAGING_USER1_EMAIL }}
          DCU_USER2_EMAIL: ${{ secrets.STAGING_USER2_EMAIL }}
          DCU_TEST_PASSWORD: ${{ secrets.STAGING_TEST_PASSWORD }}
        run: |
          node scripts/create-test-users.mjs | sed -E 's/password: .*/password: (hidden)/'

      - name: Playwright Chromium
        working-directory: web
        run: npx playwright install --with-deps chromium

      - name: Complete automated suite against staging
        env:
          CONCURRENCY_ITERATIONS: ${{ inputs.concurrency_iterations }}
          OUT_DIR: ${{ github.workspace }}/evidence
        run: ./scripts/staging/run-staging-tests.sh

      - name: Supabase Security + Performance Advisor (Management API)
        if: always()
        run: |
          mkdir -p evidence
          for kind in security performance; do
            curl -sSf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
              "https://api.supabase.com/v1/projects/$PROJECT_REF/advisors/$kind" -o "evidence/advisors-$kind.json" || echo "advisor API ($kind) unavailable"
          done

      - name: Lighthouse on staging
        if: always()
        working-directory: web
        env:
          LH_BASE_URL: ${{ secrets.STAGING_SITE_URL }}
          LH_EMAIL: ${{ secrets.STAGING_ADMIN_EMAIL }}
          LH_PASSWORD: ${{ secrets.STAGING_TEST_PASSWORD }}
          LH_OUT: ${{ github.workspace }}/evidence/lighthouse
        run: node scripts/lighthouse.mjs

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: staging-evidence
          path: |
            evidence/
            web/test-results/
          retention-days: 30

```


## FILE: scripts/staging/render-config.sh

```bash
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

```


## FILE: scripts/staging/cleanup-test-data.sql

```sql
-- STAGING ONLY. Releases slots held by automated-test accounts so the E2E/concurrency suites can
-- re-run on the same days. Test accounts are identified by the reserved test domain (example.com)
-- or by plus-addresses of the dedicated test mailbox (:'mailbox_local'+…@:'mailbox_domain').
-- Bookings are never deleted (trigger forbids it): they are admin-cancelled, which frees the resource.
\set ON_ERROR_STOP on
with test_users as (
  select id from public.profiles
  where email like '%@example.com'
     or (:'mailbox_local' <> '' and email like :'mailbox_local' || '+%@' || :'mailbox_domain')
)
update public.bookings b
set status = 'ADMIN_CANCELLED', cancelled_at = now(), cancellation_type = 'ADMIN',
    cancellation_reason = 'Automated test cleanup (staging)'
where b.status in ('CONFIRMED', 'CHECKED_IN') and b.user_id in (select id from test_users);

update public.facility_blocks k
set removed_at = now(), removed_by = k.created_by
where k.removed_at is null
  and k.created_by in (select id from public.profiles where email like '%@example.com');

```


## FILE: scripts/staging/run-staging-tests.sh

```bash
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

```


## FILE: scripts/run-advisors.sh

```bash
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

```


## FILE: supabase/migrations/20261006000800_fk_indexes.sql

```sql
-- DCU Active — Phase 4 hardening: covering indexes for foreign keys
-- (Supabase Performance Advisor lint 0001 "unindexed_foreign_keys").
-- Performance only: no behaviour, permission or business-rule change.

create index if not exists bookings_facility_activity_idx on public.bookings (facility_id, activity_id);
create index if not exists bookings_facility_resource_idx on public.bookings (facility_id, resource_id);
create index if not exists bookings_cancelled_by_idx on public.bookings (cancelled_by) where cancelled_by is not null;
create index if not exists facility_blocks_facility_resource_idx on public.facility_blocks (facility_id, resource_id);
create index if not exists facility_blocks_created_by_idx on public.facility_blocks (created_by);
create index if not exists facility_blocks_removed_by_idx on public.facility_blocks (removed_by) where removed_by is not null;
create index if not exists profiles_deactivated_by_idx on public.profiles (deactivated_by) where deactivated_by is not null;
create index if not exists admin_actions_admin_idx on public.admin_actions (admin_id);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);

```


## FILE: web/public/_headers

```text
# Security and cache headers (Netlify / Cloudflare Pages format).
# __SUPABASE_HTTP__ / __SUPABASE_WS__ are replaced at build time by scripts/write-hosting-config.mjs
# with the origin of VITE_SUPABASE_URL, so the CSP always matches the project it was built for.
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' __SUPABASE_HTTP__ __SUPABASE_WS__; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable

```


## FILE: web/scripts/write-hosting-config.mjs

```ts
// Fills the Supabase origin into dist/_headers (CSP connect-src). Runs after `vite build`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const f of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (m) return m[1].trim();
  }
  return undefined;
}

const url = envValue('VITE_SUPABASE_URL');
if (!url) {
  console.error('VITE_SUPABASE_URL is not set; cannot build the CSP.');
  process.exit(1);
}
const httpOrigin = new URL(url).origin;
const wsOrigin = httpOrigin.replace(/^http/, 'ws');
const file = 'dist/_headers';
const text = readFileSync(file, 'utf8').replaceAll('__SUPABASE_HTTP__', httpOrigin).replaceAll('__SUPABASE_WS__', wsOrigin);
if (text.includes('__SUPABASE_')) {
  console.error('Unreplaced placeholder in dist/_headers');
  process.exit(1);
}
writeFileSync(file, text);
console.log(`dist/_headers: CSP connect-src ${httpOrigin} ${wsOrigin}`);

```


## FILE: web/scripts/serve-dist.mjs

```ts
// Minimal static server for dist/ that applies dist/_headers and the SPA fallback exactly like
// Netlify / Cloudflare Pages do. Used by the E2E suite so the real CSP is enforced in every test.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = 'dist';
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

// Parse Netlify-format _headers: a path line, then indented "Name: value" lines.
const rules = [];
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
  else rules.at(-1)?.headers.push(line.trim().split(/:\s(.*)/s).slice(0, 2));
}
const matches = (pattern, path) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(400).end(); return; }
  let served = path;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');            // _redirects: /*  /index.html  200
    served = path;
  }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  if (extname(file) === '.html') headers['Cache-Control'] = 'public, max-age=0, must-revalidate';  // host default
  for (const r of rules) if (matches(r.pattern, served)) for (const [k, v] of r.headers) headers[k] = v;
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(port, () => console.log(`serving ${root} with _headers on http://localhost:${port}`));

```


## FILE: web/scripts/check-bundle-secrets.mjs

```ts
// Build guard: fail if anything that looks like a privileged Supabase key ended up in dist/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const banned = [/sb_secret_[A-Za-z0-9_-]+/, /"role"\s*:\s*"service_role"/, /service_role/];
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk('dist');
let bad = 0;
for (const f of files) {
  if (!/\.(js|html|css|json|webmanifest|map)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  // A JWT-shaped string whose payload says service_role is also a privileged key.
  const jwts = text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
  const privilegedJwt = jwts.some((j) => Buffer.from(j.split('.')[1], 'base64url').toString().includes('service_role'));
  if (banned.some((r) => r.test(text)) || privilegedJwt) {
    console.error(`SECRET-LIKE VALUE FOUND in ${f}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`bundle secret check passed (${files.length} files)`);

```


## FILE: web/scripts/lighthouse.mjs

```ts
// Lighthouse on public and signed-in screens.
// Env: LH_BASE_URL (default http://localhost:4173), LH_EMAIL + LH_PASSWORD (an ADMIN test account),
//      LH_OUT (default ../docs/phase-4/lighthouse/local), PW_CHROMIUM (optional Chromium path).
// Participant screens use Lighthouse's mobile profile (throttled 4G, Moto G-class CPU);
// admin screens use the desktop profile.
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = (process.env.LH_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const out = process.env.LH_OUT ?? '../docs/phase-4/lighthouse/local';
const port = 9333;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: [`--remote-debugging-port=${port}`],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();

async function audit(name, path, { desktop = false } = {}) {
  const flags = {
    port, output: ['html', 'json'], logLevel: 'error', disableStorageReset: true,
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
  };
  const result = await lighthouse(`${base}${path}`, flags, desktop ? desktopConfig : undefined);
  const [html, json] = result.report;
  writeFileSync(`${out}/${name}.html`, html);
  writeFileSync(`${out}/${name}.json`, json);
  const c = result.lhr.categories;
  const a = result.lhr.audits;
  return {
    page: name, path, profile: desktop ? 'desktop' : 'mobile',
    performance: Math.round(c.performance.score * 100),
    accessibility: Math.round(c.accessibility.score * 100),
    bestPractices: Math.round(c['best-practices'].score * 100),
    fcp: a['first-contentful-paint'].displayValue, lcp: a['largest-contentful-paint'].displayValue,
    tbt: a['total-blocking-time'].displayValue, cls: a['cumulative-layout-shift'].displayValue,
  };
}

const rows = [];
rows.push(await audit('login', '/login'));
rows.push(await audit('register', '/register'));

if (process.env.LH_EMAIL && process.env.LH_PASSWORD) {
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill(process.env.LH_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.LH_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  rows.push(await audit('home', '/'));
  rows.push(await audit('book-tennis', '/book/tennis'));
  rows.push(await audit('my-bookings', '/bookings'));
  rows.push(await audit('admin-dashboard', '/admin', { desktop: true }));
  rows.push(await audit('admin-bookings', '/admin/bookings', { desktop: true }));
}
await browser.close();

writeFileSync(`${out}/summary.json`, JSON.stringify(rows, null, 2));
console.table(rows);

```


## FILE: web/vite.config.ts

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',           // never swap versions under the user; show "Reload" banner
      injectRegister: null,             // registered from src/components/UpdatePrompt.tsx
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'DCU Active',
        short_name: 'DCU Active',
        description: 'Book DCU sports facilities.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f7f9',
        theme_color: '#0b5cad',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the built static app shell is precached.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Never cache backend traffic: availability and bookings must always be live.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/auth/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/realtime/'), handler: 'NetworkOnly' },
        ],
        navigateFallbackDenylist: [/^\/auth\/v1\//, /^\/rest\/v1\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

```


## FILE: web/playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test';

// Local: the production build served with its real _headers (scripts/serve-dist.mjs) + local Supabase.
// Staging: set E2E_BASE_URL=https://<staging host> and point the SUPABASE_* env at the hosted project.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,                      // tests share one database; keep runs deterministic
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: remote ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    // The device is deliberately NOT in Jakarta: all times on screen must still be WIB.
    timezoneId: 'America/New_York',
  },
  webServer: remote ? undefined : {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'] }, testMatch: /(auth|booking)\.spec\.ts/ },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: /(admin|pwa|a11y|security)\.spec\.ts/ },
    { name: 'responsive', use: { ...devices['Desktop Chrome'] }, testMatch: /responsive\.spec\.ts/ },
  ],
});

```


## FILE: web/tests/e2e/security.spec.ts

```ts
import { test, expect, type Page } from '@playwright/test';
import { createUser, jakartaDate, login, SUPABASE_URL } from './support';

const isRemote = !!process.env.E2E_BASE_URL;

/** Records CSP violations and console errors from the first script onwards. */
async function watch(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return async () => {
    const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
    return [...problems, ...csp.map((c) => `csp: ${c}`)];
  };
}

test.describe('Security headers and CSP', () => {
  test('response headers on documents and assets', async ({ request }) => {
    const doc = await request.get('/book');            // SPA route served via fallback
    const h = doc.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(new URL(SUPABASE_URL).origin);   // connect-src matches the backend in use
    expect(csp).not.toContain('__SUPABASE');
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toContain('geolocation=()');
    expect(h['cache-control'] ?? '').toMatch(/no-cache|max-age=0/);

    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    expect(sw.headers()['cache-control'] ?? '').toMatch(/no-cache|max-age=0/);

    const html = await doc.text();
    const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(asset).toBeTruthy();
    const a = await request.get(asset!);
    expect(a.headers()['cache-control']).toContain('immutable');
    if (isRemote) expect(doc.url()).toMatch(/^https:/);
  });

  test('no CSP violations or console errors on user and admin screens', async ({ page }) => {
    const admin = await createUser('cspadmin', { admin: true });
    const collect = await watch(page);
    const day = await jakartaDate(5);
    await page.goto('/login');
    await page.goto('/register');
    await login(page, admin);
    for (const path of ['/', '/book', `/book/tennis?date=${day}`, `/book/basketball_futsal`, '/bookings', '/bookings?tab=history',
      '/profile', '/admin', '/admin/bookings', '/admin/blocks', '/admin/users']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    // Realtime (WebSocket) must be allowed by connect-src.
    await page.goto(`/book/tennis?date=${day}`);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.realtime), { timeout: 15_000 }).toBe('SUBSCRIBED');
    expect(await collect()).toEqual([]);
  });
});

```


## FILE: web/tests/e2e/pwa.spec.ts

```ts
import { test, expect } from '@playwright/test';
import { createUser, jakartaDate, login, SUPABASE_URL } from './support';

test.describe('PWA', () => {
  test('manifest is valid for installation', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(m.name).toBe('DCU Active');
    expect(m.short_name).toBe('DCU Active');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
  });

  test('service worker registers, Chrome reports the app installable, backend traffic is never cached', async ({ page, context }) => {
    const u = await createUser('pwa');
    await login(page, u);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors, JSON.stringify(installabilityErrors)).toEqual([]);

    await page.goto(`/book/tennis?date=${await jakartaDate(1)}`);
    await expect(page.getByTestId('slot-06:00')).toBeVisible();
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      }
      return urls;
    });
    expect(cached.length).toBeGreaterThan(5);                                // app shell is precached
    expect(cached.filter((u) => u.startsWith(SUPABASE_URL) || /\/rest\/v1\/|\/auth\/v1\//.test(u))).toEqual([]);
  });

  test('offline reload: app shell opens, shows the offline message, no availability', async ({ page, context }) => {
    const u = await createUser('pwaoffline');
    await login(page, u);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.goto('/book/tennis');
    await expect(page.getByText('You are offline. Connect to the internet to view live availability or make a booking.')).toBeVisible();
    await expect(page.locator('.slot')).toHaveCount(0);
    await context.setOffline(false);
  });
});

```


## FILE: web/tests/e2e/support.ts

```ts
// Test-only helpers. Runs in Node (never bundled into the app). Uses the LOCAL Supabase
// secret key only to create test users and fixtures, exactly like an operator script would.
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}: run scripts/run-web-tests.sh`);
  return v;
};
export const SUPABASE_URL = env('SUPABASE_URL');
const PUBLISHABLE = env('SUPABASE_PUBLISHABLE_KEY');
const SECRET = env('SUPABASE_SECRET_KEY');
// Email backend for auth tests: local Mailpit, or (staging) a real mailbox read over IMAP.
const MAILPIT = process.env.MAILPIT_URL;
const IMAP = process.env.TEST_IMAP_HOST
  ? { host: process.env.TEST_IMAP_HOST, port: Number(process.env.TEST_IMAP_PORT ?? 993), user: env('TEST_IMAP_USER'), pass: env('TEST_IMAP_PASS') }
  : null;
const MAILBOX = process.env.TEST_MAILBOX;              // e.g. dcu.e2e@gmail.com (plus-addressing must be supported)
if (!MAILPIT && !IMAP) throw new Error('Set MAILPIT_URL (local) or TEST_IMAP_* + TEST_MAILBOX (staging)');

/**
 * An address whose mail the tests can read. Locally any address works (Mailpit catches everything);
 * on staging real SMTP is used, so it is a plus-address of the test mailbox (never a fake domain that would bounce).
 */
export function inboxAddress(tag: string, localDomain = 'example.com'): string {
  const u = `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  if (IMAP && MAILBOX) {
    const [local, domain] = MAILBOX.split('@');
    return `${local}+${u}@${domain}`;
  }
  return `${u}@${localDomain}`;
}
export const PASSWORD = 'Dcu-Test-2026!';      // local test value; meets the policy

export const pool = new pg.Pool({ connectionString: env('SUPABASE_DB_URL'), max: 4 });
export const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query(sql, params)).rows as T[];

let seq = 0;
const run = Date.now().toString(36);
export interface TestUser { email: string; id: string; name: string; token?: string }

export async function createUser(prefix: string, opts: { admin?: boolean; name?: string; realInbox?: boolean } = {}): Promise<TestUser> {
  const email = opts.realInbox ? inboxAddress(prefix) : `${prefix}.${run}.${++seq}@example.com`;
  const name = opts.name ?? `${prefix[0]!.toUpperCase()}${prefix.slice(1)} Tester`;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`createUser ${email}: ${JSON.stringify(body)}`);
  if (opts.admin) await q(`update public.profiles set role = 'ADMIN' where id = $1`, [body.id]);
  return { email, id: body.id, name };
}

export async function tokenFor(u: TestUser): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: PUBLISHABLE, 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`token ${u.email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Call an RPC as a user over HTTP (used to create competing bookings during UI tests). */
export async function rpcAs(u: TestUser, fn: string, args: Record<string, unknown> = {}) {
  u.token ??= await tokenFor(u);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE, authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export async function restAs(u: TestUser, path: string) {
  u.token ??= await tokenFor(u);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: PUBLISHABLE, authorization: `Bearer ${u.token}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

export const facilityId = async (code: string) => (await q<{ id: string }>('select id from public.facilities where code = $1', [code]))[0]!.id;
export const activityId = async (code: string) => (await q<{ id: string }>('select id from public.activities where code = $1', [code]))[0]!.id;

export async function bookAs(u: TestUser, facility: string, activity: string, date: string, time: string, minutes = 30) {
  return rpcAs(u, 'create_booking', {
    p_facility_id: await facilityId(facility), p_activity_id: await activityId(activity),
    p_date: date, p_start_time: time, p_duration_minutes: minutes,
  });
}

/** Jakarta calendar date `offset` days from the server's today. */
export async function jakartaDate(offset: number): Promise<string> {
  return (await q<{ d: string }>(`select ((now() at time zone 'Asia/Jakarta')::date + $1::int)::text as d`, [offset]))[0]!.d;
}

/**
 * Inserts a booking directly (fixture) for states the RPC cannot create on purpose,
 * e.g. one that starts right now (check-in) or one in the past (no-show presentation).
 */
export async function insertBookingFixture(u: TestUser, facility: string, startSql: string, minutes = 30) {
  const rows = await q<{ id: string; start_at: string }>(`
    with f as (select id from public.facilities where code = $2),
         a as (select a.id from public.activities a, f where a.facility_id = f.id order by a.sort_order limit 1),
         r as (select r.id from public.resources r, f where r.facility_id = f.id order by r.sort_order limit 1),
         t as (select (${startSql}) as s)
    insert into public.bookings (booking_code, user_id, facility_id, activity_id, resource_id, start_at, end_at)
    select private.new_booking_code(), $1, f.id, a.id, r.id, t.s, t.s + make_interval(mins => $3)
    from f, a, r, t returning id, start_at`, [u.id, facility, minutes]);
  return rows[0]!;
}

/** A :00/:30 start such that "now" is inside its check-in window (−15/+15 min). */
export const CHECKIN_NOW_START = `
  case when now() - (date_trunc('hour', now()) + interval '30 min' * floor(extract(minute from now()) / 30)) <= interval '15 min'
       then date_trunc('hour', now()) + interval '30 min' * floor(extract(minute from now()) / 30)
       else date_trunc('hour', now()) + interval '30 min' * (floor(extract(minute from now()) / 30) + 1) end`;

// ---------- Email ----------
function parseEmail(subject: string, html: string) {
  const link = /href="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, '&');
  const code = /letter-spacing:\s*4px[^>]*>\s*(\d{6})\s*</.exec(html)?.[1];
  return { subject, link, code };
}

export async function latestEmail(to: string, after: number) {
  if (MAILPIT) {
    for (let i = 0; i < 60; i++) {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
      const m = (list.messages ?? []).find((x: { Created: string }) => new Date(x.Created).getTime() > after);
      if (m) {
        const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
        return parseEmail(full.Subject as string, full.HTML ?? '');
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`no email to ${to}`);
  }
  // Real mailbox over IMAP (staging): poll up to ~2 minutes for SMTP delivery.
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  for (let i = 0; i < 40; i++) {
    const client = new ImapFlow({ host: IMAP!.host, port: IMAP!.port, secure: true, auth: { user: IMAP!.user, pass: IMAP!.pass }, logger: false });
    await client.connect();
    try {
      for (const box of ['INBOX', '[Gmail]/Spam']) {
        const lock = await client.getMailboxLock(box).catch(() => null);
        if (!lock) continue;
        try {
          const uids = (await client.search({ to, since: new Date(after - 60_000) }, { uid: true })) || [];
          for (const uid of [...uids].reverse()) {
            const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
            if (!msg || !msg.source) continue;
            if (msg.internalDate && new Date(msg.internalDate).getTime() < after - 5_000) continue;
            const parsed = await simpleParser(msg.source);
            return parseEmail(parsed.subject ?? '', typeof parsed.html === 'string' ? parsed.html : '');
          }
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`no email to ${to} within 2 minutes`);
}

// ---------- UI helpers ----------
export async function login(page: Page, u: TestUser) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening|night)/);
}

export async function noHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, 'page must not scroll horizontally').toBeLessThanOrEqual(iw);
}

/** Accessible name of a date chip, tolerant of ICU differences ("Tuesday, 6 October 2026" vs without comma). */
export function dayButton(date: string): RegExp {
  const d = new Date(`${date}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(d);
  return new RegExp(`^${part({ weekday: 'long' })},? ${part({ day: 'numeric' })} ${part({ month: 'long' })} ${part({ year: 'numeric' })}$`);
}

```


## FILE: web/src/lib/api.ts

```ts
// Thin typed wrappers around the Phase 2 RPCs. No business rule lives here.
import { supabase } from './supabase';
import { AppError, toAppError } from './errors';
import type {
  AdminBlock, AdminDashboard, AdminStats, AdminUser, AppConfig, Booking, BlockReason, FacilityOverview,
  FacilityRow, Paged, Profile, Slot,
} from './types';

type Listener = () => void;
const disabledListeners = new Set<Listener>();

/** Called whenever the server says the account is disabled (any RPC). */
export function onAccountDisabled(fn: Listener): () => void {
  disabledListeners.add(fn);
  return () => disabledListeners.delete(fn);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch (e) {
    throw toAppError(e);
  }
  if (result.error) {
    const err = toAppError(result.error);
    if (err.code === 'ACCOUNT_DISABLED') disabledListeners.forEach((l) => l());
    throw err;
  }
  return result.data as T;
}

// ---------- User ----------
export const getAppConfig = () => rpc<AppConfig>('get_app_config');
export const getFacilitiesOverview = (date?: string) => rpc<FacilityOverview[]>('get_facilities_overview', { p_date: date ?? null });
export const getAvailability = (facilityId: string, date: string) =>
  rpc<Slot[]>('get_availability', { p_facility_id: facilityId, p_date: date });
export const createBooking = (a: { facilityId: string; activityId: string; date: string; startTime: string; duration: number }) =>
  rpc<Booking>('create_booking', {
    p_facility_id: a.facilityId, p_activity_id: a.activityId, p_date: a.date,
    p_start_time: a.startTime, p_duration_minutes: a.duration,
  });
export const cancelBooking = (id: string) => rpc<Booking>('cancel_booking', { p_booking_id: id });
export const checkIn = (id: string) => rpc<Booking>('check_in', { p_booking_id: id });
export const getMyBookings = (scope: 'UPCOMING' | 'HISTORY') => rpc<Booking[]>('get_my_bookings', { p_scope: scope, p_limit: 100 });
export const getBooking = (id: string) => rpc<Booking>('get_booking', { p_booking_id: id });

// Always filter by id: for admins RLS returns every profile, so an unfiltered .single() would fail.
export async function getMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, is_active').eq('id', userId).single();
  if (error) throw toAppError(error);
  return data as Profile;
}

// ---------- Admin ----------
export const adminDashboard = (date?: string) => rpc<AdminDashboard>('admin_dashboard', { p_date: date ?? null });
export const adminStats = (from: string, to: string) => rpc<AdminStats>('admin_stats', { p_from: from, p_to: to });
export const adminListBookings = (f: {
  from?: string; to?: string; facilityId?: string; status?: string; search?: string; limit?: number; offset?: number;
}) =>
  rpc<Paged<Booking>>('admin_list_bookings', {
    p_date_from: f.from || null, p_date_to: f.to || null, p_facility_id: f.facilityId || null,
    p_status: f.status || null, p_search: f.search || null, p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
  });
export const adminCancelBooking = (id: string, reason: string) =>
  rpc<Booking>('admin_cancel_booking', { p_booking_id: id, p_reason: reason || null });
export const adminListBlocks = (includePast = false) => rpc<AdminBlock[]>('admin_list_blocks', { p_include_past: includePast });
export const adminCreateBlock = (b: {
  facilityId: string; resourceId: string | null; startDate: string; startTime: string; endDate: string; endTime: string;
  reason: BlockReason; note: string; cancelConflicts: boolean;
}) =>
  rpc<{ block: { id: string }; cancelled_bookings: Booking[] }>('admin_create_block', {
    p_facility_id: b.facilityId, p_resource_id: b.resourceId, p_start_date: b.startDate, p_start_time: b.startTime,
    p_end_date: b.endDate, p_end_time: b.endTime, p_reason_type: b.reason, p_note: b.note || null,
    p_cancel_conflicts: b.cancelConflicts,
  });
export const adminRemoveBlock = (id: string) => rpc<unknown>('admin_remove_block', { p_block_id: id });
export const adminListUsers = (search: string, offset = 0) =>
  rpc<Paged<AdminUser>>('admin_list_users', { p_search: search || null, p_limit: 50, p_offset: offset });
export const adminSetUserActive = (id: string, active: boolean, reason: string) =>
  rpc<{ cancelled_bookings: number }>('admin_set_user_active', { p_user_id: id, p_active: active, p_reason: reason || null });
export const adminSetUserRole = (id: string, role: 'USER' | 'ADMIN') => rpc<unknown>('admin_set_user_role', { p_user_id: id, p_role: role });

export async function adminFacilities(): Promise<FacilityRow[]> {
  const { data, error } = await supabase
    .from('facilities')
    .select('id, code, name, sort_order, resources(id, name, sort_order)')
    .order('sort_order');
  if (error) throw toAppError(error);
  return (data as FacilityRow[]).map((f) => ({ ...f, resources: [...f.resources].sort((a, b) => a.sort_order - b.sort_order) }));
}

export { AppError };

```


## FILE: web/src/app/auth.tsx

```ts
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getAppConfig, getMyProfile, onAccountDisabled } from '../lib/api';
import type { AppConfig, Profile } from '../lib/types';
import type { AppError } from '../lib/errors';

interface AuthState {
  session: Session | null;
  sessionLoading: boolean;
  config: AppConfig | undefined;
  configError: AppError | null;
  profile: Profile | undefined;
  /** Server time offset (ms) so countdowns and button states follow the server clock, not the phone's. */
  clockOffset: number;
  disabled: boolean;
  isAdmin: boolean;
  refreshConfig: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setDisabled(false);
        queryClient.clear();
      }
    });
    const off = onAccountDisabled(() => setDisabled(true));
    return () => {
      data.subscription.unsubscribe();
      off();
    };
  }, [queryClient]);

  const userId = session?.user.id;

  const configQuery = useQuery({
    queryKey: ['config', userId],
    enabled: !!userId,
    queryFn: async () => {
      const sent = Date.now();
      const config = await getAppConfig();
      const received = Date.now();
      return { config, offset: new Date(config.server_now).getTime() - (sent + received) / 2 };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
  });

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId && !disabled,
    queryFn: () => getMyProfile(userId!),
    staleTime: 5 * 60_000,
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const configError = (configQuery.error as AppError | null) ?? null;
  const value = useMemo<AuthState>(
    () => ({
      session,
      sessionLoading,
      config: configQuery.data?.config,
      configError,
      profile: profileQuery.data,
      clockOffset: configQuery.data?.offset ?? 0,
      disabled: disabled || configError?.code === 'ACCOUNT_DISABLED',
      isAdmin: !!configQuery.data?.config.is_admin,
      refreshConfig: () => void configQuery.refetch(),
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, sessionLoading, configQuery.data, configError, profileQuery.data, disabled, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

```
