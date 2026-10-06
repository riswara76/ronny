# DCU Active — Phase 3 Review Package (for external reviewer)

## Instructions for the reviewer
Review this Phase 3 deliverable as a critical senior web-security, React/TypeScript and Supabase reviewer.
Context: Phase 1 (architecture) and Phase 2 (Supabase backend: RLS, booking RPCs, exclusion constraints) were approved earlier.
Phase 3 changed the client from an Android APK to a responsive Web/PWA. The backend business rules must NOT be duplicated client-side.

Please report concrete defects with severity (Critical/High/Medium/Low), focusing on:
1. Security: secrets in browser, auth/session handling, redirect URLs, open redirect, XSS, CSP, service-worker caching of API data.
2. Correctness: does the client ever decide business rules instead of the server? Race/stale-state bugs in the booking flow.
3. Auth flows: email verification by link (token_hash) and by code, password reset, deactivated user handling.
4. PWA/offline: could stale availability ever be shown as current? Version update strategy.
5. Accessibility and responsive UX on iPhone/Android.
6. Gaps between the brief and what was delivered / tested.
Do not summarize; list defects and risks with evidence from the files below.



---
# FILE: docs/phase-3/PHASE-3-REPORT.md

# DCU Active — Phase 3 Report: Web / PWA Application

Status: **Complete, waiting for approval.** Phase 4 has not been started.

**Result:** a responsive React + TypeScript PWA is connected to the unchanged Phase 2 backend. Test results:

- 23/23 unit tests pass.
- Lint and typecheck are clean.
- The production build passes the bundle secret check.
- **35/35 Playwright journeys pass**, run in Chromium against the real local Supabase stack (Auth + emails via Mailpit, RPCs, RLS, Realtime).
- The Phase 2 backend suites were re-run after the Auth configuration changes and are still 211 pgTAP + 6 HTTP + 9 concurrency, all green.

## 1. Architecture amendment (summary)

Full text: `docs/architecture/WEB-PWA-ARCHITECTURE-AMENDMENT.md`.

- **Delivery model:** the primary V1 client changes from an Android APK to a responsive web app / PWA. Users open a URL or QR code and nothing has to be installed. A native app is out of scope for V1.
- **Backend:** schema, RPCs, RLS, constraints, concurrency and timezone logic are **unchanged**.
- **Configuration-only changes (no SQL migrations):**
  - Email templates carry a web link plus a 6-digit code.
  - The web origins are allow-listed for Auth redirects.
  - **Password policy:** at least 8 characters with lowercase, uppercase, a digit and a symbol (your requirement #17).
- **Frontend design areas:** browser routing, scanner-safe email-link confirmation, PWA manifest and service worker (static assets only, API `NetworkOnly`), update prompt, cache headers, CSP and security headers, breakpoints, accessibility.

## 2. Frontend technology decision

Full text: `docs/architecture/WEB-FRONTEND-DECISION.md`.

**React 18 + TypeScript (Vite) + vite-plugin-pwa.**

- The repository contained **no Flutter code at all**, so switching discarded nothing. That is why I did not stop for approval.
- Flutter Web renders into a canvas: a heavy first load on mobile data, weaker iOS Safari behaviour, no browser autofill, weaker accessibility, and awkward browser E2E testing.
- Its only advantage, a future native app, is out of scope for V1. The backend stays client-agnostic, so a native app can still be built later.

## 3. Implemented screens

| Area | Screens |
|---|---|
| Auth | Login · Register (live password rules) · Check-your-email / 6-digit code · Confirm email (link landing, with "Confirm my email" button) · Forgot password · Reset password (link or code) · Account disabled · Not found |
| Participant / trainer | Home (greeting, **Book a facility**, My next booking with View / Check in / Cancel, facility cards with "N times left today") · Book (facility list) · Booking flow (activity → date strip → time grid → duration → review → result) · My Bookings (Upcoming / History tabs) · Booking detail · Profile (name, email, account status, sign out) |
| Admin (shown only to admins) | Dashboard (6 metrics + utilization bars + that day's bookings) · Bookings (date/facility/status/search filters, identity, detail, cancel with reason) · Facility blocks (list, create with conflict confirmation, remove) · Users (search, activate/deactivate with reason, make/remove admin) |
| Global | Offline banner · "New version available — Reload" prompt · toasts (`aria-live`) · skip link |

## 4. User journeys

A normal booking takes **4–6 actions after login**:

1. Tap the facility card.
2. (Basketball/Futsal only) choose the activity.
3. Pick a date.
4. Pick a time.
5. (Tennis/Basketball only) pick a duration.
6. Tap Review, then Confirm.

| Journey | What the user sees | Backend authority |
|---|---|---|
| Choose a time | 30-min grid 06:00–20:30, WIB. States: Available / "N spots left" / Booked / Full / Unavailable · reason / Your booking. Past times are hidden. | `get_availability` |
| Duration | Only durations that fit the continuous free range (`max_duration_minutes`) | Server-computed |
| Conflict during review | "Sorry, this time slot was just booked by another user. Please choose another available time." The grid then refreshes. | `create_booking` → `SLOT_UNAVAILABLE` |
| Two-table facilities | No table choice. "2 spots left", then "1 spot left", then "Full". | Automatic allocation |
| Check-in | Button enabled 15 minutes before to 15 minutes after the start. Before that: disabled, with "Check-in opens at 17:45". After: shown as No-show. | `check_in` |
| Cancel | Dialog "Cancel this booking?", with a note that the time becomes available to others. Then a refetch of all affected data. | `cancel_booking` |

## 5. Admin journeys

- **Dashboard:** bookings on the day, upcoming, checked in, cancellations, no-shows (7 days), active users, utilization per facility, and the day's booking list.
- **Booking management:** filter, see owner and email plus the physical resource, cancel with a reason. The user then sees "Cancelled by admin" with that reason.
- **Blocks:** first submit → if bookings conflict, a **"This block affects existing bookings"** list appears and nothing is written yet → explicit "Cancel N bookings and create block". Users see "Unavailable · Maintenance"; admin notes are never shown to them.
- **Users:** deactivation cancels future bookings and is enforced on the user's very next RPC. Admins cannot deactivate or demote themselves in the UI, and the server's `LAST_ADMIN` guard also applies.

## 6. Supabase integration status

| Item | Status |
|---|---|
| All user and admin RPCs wired with typed wrappers | ✅ No business rule duplicated client-side |
| Error mapping | ✅ Every RPC and Auth code maps to business text. Raw SQL, constraint names and P0001 never reach the UI (asserted in tests). |
| Realtime | ✅ Private `availability` channel. Another user's booking updates an open grid **within 8 s, without reload** (tested). A 60 s refetch is the fallback. |
| Hosted Supabase project | ⏳ Not created yet (needs your account). Everything ran against the local stack using the same Supabase images. |

## 7. Authentication status

| Flow | Status (tested end-to-end with real emails in Mailpit) |
|---|---|
| Register (any email domain) | ✅ |
| Verification by link | ✅ The link opens a confirm page and only the button redeems the token (scanner-safe). A re-used link shows the invalid/expired state with "already verified? log in" and resend. |
| Verification by 6-digit code | ✅ A wrong code is rejected; the right code signs the user in |
| Unverified login | ✅ Refused with a clear message and a link to enter the code |
| Login errors | ✅ "Incorrect email or password." |
| Forgot / reset password | ✅ Link flow, then log in with the new password |
| Password policy (8+, lower, upper, digit, symbol) | ✅ Enforced by Supabase Auth (verified: `Abcdefg1` is rejected with `weak_password`). The UI checklist uses the same symbol set as Supabase. |
| Deactivated user | ✅ The next RPC returns `ACCOUNT_DISABLED` and the app moves to the "Account disabled" screen, even with the same session |

## 8. Responsive testing results

All responsive checks pass at four viewports. Each one checks:

- no horizontal page scroll;
- navigation placement;
- touch targets of at least 44 px on phones;
- the full booking flow up to review.

| Viewport | User app | Admin |
|---|---|---|
| iPhone size 390×844 (iOS user agent, DPR 3) | ✅ bottom tab bar | — |
| Android 412×915 (Pixel 7) | ✅ bottom tab bar; all journeys run here | ✅ tab strip, cards instead of tables |
| Tablet 820×1180 | ✅ side rail | ✅ |
| Desktop Chrome 1440×900 | ✅ side rail, 6-column grid | ✅ sidebar, tables |

The device timezone in every E2E test is `America/New_York`: all times shown are still Jakarta time.

## 9. PWA status

| Check | Result |
|---|---|
| Manifest: name and short name "DCU Active", standalone, `start_url /`, icons 192 / 512 / maskable 512 + apple-touch | ✅ |
| Service worker registers and controls the page | ✅ |
| **Chrome installability** (`Page.getInstallabilityErrors`) | ✅ No errors |
| Supabase traffic never in Cache Storage | ✅ Asserted |
| Offline reload | ✅ The app shell opens from cache with the offline message; no availability is shown |
| Update strategy | `registerType: 'prompt'` → "Reload" banner; hashed assets; `no-cache` on `index.html` / `sw.js` / manifest (`_headers`, `vercel.json`) |

## 10. Automated test results

| Suite | Result |
|---|---|
| Unit (Vitest, run under `TZ=America/New_York`) | **23 / 23** — error mapping (no SQL leakage), Jakarta time/dates, 8-day window, password policy, open-redirect guard, slot labels |
| Lint (ESLint, incl. `dangerouslySetInnerHTML` ban, no `console.log`) + TypeScript strict | ✅ clean |
| Build + bundle secret scan | ✅ No `sb_secret_` / `service_role` in `dist/` |
| Playwright E2E | **35 / 35** (output: `docs/phase-3/test-output/web-full-run.txt`) |
| Phase 2 backend regression | pgTAP **211/211**, HTTP **6/6**, concurrency **9/9** |
| `npm audit --omit=dev` | **0 vulnerabilities** (after upgrading react-router, see §13) |

### Brief items 1–32 → evidence

| # | Item | Test |
|---|---|---|
| 1–3 | Register, email verification, login | auth #1, #2, #3 |
| 4 | Forgot / reset password | auth #3 |
| 5 | User deactivation | auth #4, admin #5 |
| 6–7 | Facility listing, availability retrieval | booking #1 |
| 8–10 | Tennis 30 / 60 / 90 | booking #2 |
| 11–12 | Basketball booking, Futsal conflict | booking #3 |
| 13–14 | Air Hockey / Foosball allocation | booking #4, #5 (DB confirms Table 1 + Table 2) |
| 15–16 | Max future bookings, once per facility per day | booking #6 |
| 17 | Cancellation | booking #7 |
| 18–19 | Check-in, no-show presentation | booking #8 |
| 20–21 | Admin block, admin cancellation | admin #4, #3 |
| 22 | Privacy between users | booking #12 (page HTML + REST) |
| 23 | Realtime refresh | booking #10 |
| 24 | Concurrency error presentation | booking #9 |
| 25–29 | Mobile, desktop, iPhone-size, Android-size, desktop Chrome | responsive #1–#8, desktop project |
| 30 | Keyboard navigation baseline | a11y #2 (login + full booking by keyboard), a11y #3 (Escape) |
| 31 | Offline state | booking #11, pwa #3 |
| 32 | PWA installability | pwa #1, #2 |
| — | Accessibility | a11y #1: **no serious/critical axe (WCAG 2.1 AA) violations** on 11 screens at 1440 px and 390 px |

## 11. Manual verification performed

I reviewed the screenshots by eye. That review found two real layout issues, both fixed:

- **Full-page captures distorted the fixed bars.** Captures for phones and tablets now use the viewport.
- **Date inputs overflowed the admin filter card on phones.** Fixed with `min-width: 0` on grid children.

**Not done:** testing on physical devices or Safari/WebKit. This container only has Chromium; the "iPhone" run is Chromium with an iPhone viewport and user agent. **A real iPhone Safari and Android Chrome check is needed in Phase 4.**

## 12. Defects found and fixed during Phase 3

| # | Defect | Fix |
|---|---|---|
| 1 | After a password reset by link, the login form had no email (the link carries none) | Email taken from the recovery session |
| 2 | Reloading the app while offline showed an endless spinner | Offline cold start now shows the offline message |
| 3 | The "Email verified" welcome banner was dropped by a redirect race after code verification | Guard no longer races the navigation |
| 4 | The client symbol rule accepted characters Supabase rejects (space, accents) | Aligned with Supabase's symbol set |
| 5 | Admin filter date inputs overflowed on phones | `min-width: 0` |
| 6 | 90 minutes was displayed as "1h 30m" | All durations shown in minutes, as specified |
| 7 | `react-router` 6 had 2 moderate advisories (open redirect via backslash, SSR) | Upgraded to v7. The open redirect was already blocked by `safeNext`; SSR is not used. |

## 13. Backend changes

- **No SQL migration and no business-rule change.** The Phase 2 rules are untouched and their tests are green.
- **Auth configuration only:**
  - `supabase/config.toml` (local):
    - `site_url` / `additional_redirect_urls` → web origins;
    - `password_requirements = "lower_upper_letters_digits_symbols"` (your item #17).
  - `supabase/templates/*.html`: link + code.
- `scripts/create-test-users.mjs`: generated passwords now meet the new policy.
- No genuine backend problem was found that would require a rule change.

## 14. Security observations

- Only the URL and the **publishable** key are in the bundle. A build step fails if a secret or service-role key appears.
- All authorization stays in RPCs and RLS. Admin navigation is cosmetic, and tests prove non-admins get `NOT_AUTHORIZED` from the server.
- Availability carries no identity. Tests assert that another user's name and email never appear in the page HTML and that REST reads return `[]`.
- XSS: React escaping only. `dangerouslySetInnerHTML` is lint-banned and there is no HTML from users.
- Strict CSP prepared (`script-src 'self'`; `connect-src` limited to the Supabase project) in `_headers` / `vercel.json`, plus HSTS, nosniff, frame-deny, referrer and permissions policies.
- Session tokens live in `localStorage` (supabase-js default). This is acceptable with the CSP + no-HTML-injection rules; noted as a residual XSS-dependent risk.
- `?next=` accepts relative paths only (open-redirect guard, unit-tested).
- No PII or tokens are written to the console in production builds (lint rule).
- `robots.txt` disallows indexing (internal app).

## 15. Screenshots

All in `docs/phase-3/screenshots/` (37 files). The requested representative set:

| Requested | File |
|---|---|
| Mobile Home | `iphone-home.png`, `android-home.png` |
| Mobile booking | `iphone-booking-slots.png`, `iphone-booking.png` (duration + CTA), `iphone-booking-review.png`, `iphone-activity.png` |
| Mobile My Bookings | `iphone-my-bookings.png`, `android-my-bookings.png` |
| Desktop Admin Dashboard | `desktop-admin-dashboard.png` |
| Desktop Admin Booking Management | `desktop-admin-bookings.png` |
| Others | tablet/desktop user screens, admin blocks/users at all sizes, login/register on iPhone |

## 16. Known issues and limitations

1. **Not yet on hosted Supabase / a real host.** You need to:
   - create the Supabase project;
   - apply the migrations;
   - set the Auth URL configuration, templates and password policy;
   - set up SMTP;
   - pick a static host.

   Steps are in `web/README.md` § "Before the first production deploy".
2. **D3 SMTP still open.** Without custom SMTP, verification and reset emails only reach project team members.
3. **No real Safari/iOS run** (Chromium-only environment). iOS PWA install is "Add to Home Screen" from Safari's share menu; there is no install prompt on iOS.
4. **JS bundle is ~145 KB gzipped.** Fine for V1; can be trimmed in Phase 4.
5. **The Profile page does not allow editing the name or changing the password while signed in.** The brief asked for show + sign out; users can still change their password through "Forgot password".
6. **Admin date inputs use the browser's locale format** (e.g. mm/dd on en-US browsers). All other dates are app-formatted.

## 17. Recommended Phase 4 hardening

1. Deploy to staging: hosted Supabase plus a static host with the production CSP. Re-run the full E2E suite against staging.
2. Real-device pass on iPhone Safari (browser and home-screen PWA) and on Android Chrome, plus a screen reader check (VoiceOver, TalkBack).
3. Configure SMTP. Verify SPF/DKIM, and test the email link and code from Gmail and Outlook (link scanners).
4. Lighthouse (performance, PWA, accessibility) on staging. Consider code-splitting supabase-js Realtime and trimming the bundle.
5. Run the Supabase Security and Performance Advisors on the hosted project.
6. Error monitoring without PII (optional), and a short load test of `get_availability` at peak hours.
7. Add `npm audit` and the test scripts to CI.

PHASE 3 COMPLETE — WAITING FOR APPROVAL.


---
# FILE: docs/architecture/WEB-PWA-ARCHITECTURE-AMENDMENT.md

# DCU Active — Architecture Amendment: Web / PWA as the Primary Client

Amends: `docs/PHASE-1-ARCHITECTURE.md` (sections B, G, H, I, J) · Date: 2026-10-06
Companion: `docs/architecture/WEB-FRONTEND-DECISION.md` (stack choice)

## A. Previous decision

The primary V1 deliverable was an **internally distributed Android APK** built with Flutter.
iOS was deferred, and onboarding meant downloading and side-loading an APK.

## B. New decision

The primary V1 client is a **responsive web application, installable as a PWA**.

- **Users:** participants and trainers get a mobile-first experience at 360–430 px. It also works on tablets and desktops.
- **Admins:** a desktop-first experience that stays usable on a tablet or phone.
- **Access:** scan a QR code or open the URL, then register or log in. **Nothing has to be installed.**
- **Optional install:** "Add to Home Screen" / PWA install where the browser supports it. It changes nothing functionally.
- **Out of scope for V1:** native Android or iOS apps.

## C. Reasons

DCU Active is transactional, online-only, lightweight and used often by short-term participants and trainers. It needs no native capability (no GPS, NFC, camera or push in V1).

A URL behind a QR code removes the biggest onboarding barrier: an APK side-load with "unknown sources" warnings. It also covers iPhone users, who could not install an APK at all.

## D. Backend impact — unchanged

All Phase 2 work stays the source of truth, **unchanged in behaviour**:

- Supabase Auth.
- The PostgreSQL schema and migrations.
- The GiST exclusion constraints.
- The once-per-facility-per-day unique index.
- The lock-ordered booking RPCs and automatic resource allocation.
- The Basketball/Futsal shared court.
- The 2-table allocation for Air Hockey and Foosball.
- The booking rules:
  - max 2 active bookings;
  - horizon today … today + 7;
  - only slots that haven't started yet;
  - cancellation before start;
  - check-in from −15 to +15 minutes;
  - no-show handling and release of the rest of the slot.
- Admin RPCs, the block-conflict confirmation flow, the audit log, and RLS on every table.
- The pg_cron lifecycle job, the Realtime availability ping, and Asia/Jakarta business time.

The browser client **re-implements no rule**. It shows what the RPCs return: slot status, `max_duration_minutes`, `can_cancel`, `can_check_in`, `effective_status`.

### Configuration-only changes (no SQL migration)

| Change | Where | Why |
|---|---|---|
| Email templates now carry **a link and a 6-digit code**. The link goes to the web app (`/auth/confirm`, `/auth/reset-password`) with a `token_hash`. | `supabase/templates/*.html`, `config.toml` | Web needs a link that opens in the browser. The code is still there as a fallback (another device, link scanners). |
| `site_url` / `additional_redirect_urls` point to the web app origins | `config.toml` (local) and the hosted Auth settings | The redirect allow-list for web |
| **Password policy: minimum 8 characters with lowercase, uppercase, a digit and a symbol** (`lower_upper_letters_digits_symbols`) | `config.toml` and the hosted Auth settings | Explicit product decision in the Phase 3 brief (#17). Phase 2 used letters + digits. Enforced by Supabase Auth on the server; the web form shows the same rules for guidance only. |

## E. Frontend impact

| Topic | Design |
|---|---|
| **Navigation** | Browser history routes (`react-router`). Every screen has a URL, so back/forward and deep links work. Unknown paths fall back to `index.html` on the host. |
| **Layouts** | Mobile-first CSS. User app: bottom tab bar under 768 px; at 768 px and above, a left rail and centred content (max 960 px). Admin: sidebar at 1024 px and above, a top tab strip below that; tables at 768 px and above, stacked cards below. |
| **Breakpoints** | `< 768` phone · `768–1023` tablet · `≥ 1024` desktop. Touch targets are at least 44 × 44 px. |
| **Authentication** | `supabase-js` email + password. The session is kept by `supabase-js` (localStorage) with automatic token refresh. Route guards redirect to `/login?next=…`. Guards are UX only; every RPC re-checks identity and role on the server. |
| **Email verification** | The email link opens `/auth/confirm?token_hash=…&type=signup`. The page shows a **"Confirm my email"** button. Only a human click calls `verifyOtp({token_hash})`, so link scanners that pre-fetch URLs cannot consume the token. States: success, invalid/expired (with an "already verified? log in" hint), resend. Entering the 6-digit code on `/verify` works on any device. |
| **Password reset** | `/forgot-password` sends the email. The link opens `/auth/reset-password?token_hash=…&type=recovery`, where the user sets a new password; `verifyOtp` runs on submit, then `updateUser`. The code is the fallback. No deep links or custom URL schemes. |
| **Session management** | One Supabase client per tab, with session refresh handled by the SDK. Sign-out clears the session and the React Query cache. `ACCOUNT_DISABLED` from **any** RPC immediately sends the user to `/account-disabled` (server decision, not cached state). |
| **PWA manifest** | Name/short name "DCU Active", `display: standalone`, theme colour, 192/512 and maskable icons, apple-touch icon, `start_url: /`. |
| **Service worker** | Workbox via `vite-plugin-pwa`: **precache only the built static assets** (hashed JS/CSS, icons, `index.html`). Every Supabase request (`/auth`, `/rest`, `/realtime`) is **`NetworkOnly`**, so availability and booking responses are never cached. No background sync, no queued writes. |
| **Version updates** | Assets are content-hashed. A new deployment produces a new SW. The app checks for updates on load and every 60 min, then shows a "New version available — Reload" banner (`registerType: 'prompt'`). `index.html` and `sw.js` are served with `Cache-Control: no-cache` so browsers always revalidate. |
| **Caching** | Static assets get `Cache-Control: public, max-age=31536000, immutable` (safe because of hashed names). API data is held only in React Query memory. Availability has `staleTime: 0`, refetches on focus/reconnect/Realtime ping, and is **hidden while offline**. |
| **Offline** | A banner says "You are offline. Connect to the internet to view live availability or make a booking." Availability grids and booking/cancel/check-in buttons are replaced or disabled while offline. Nothing is queued. |
| **Realtime** | A private channel `availability`. A `availability_changed` ping triggers a refetch of the matching facility/date. It is a UX hint only; correctness stays in the RPCs. |
| **Hosting** | Any static host (Netlify, Vercel, Cloudflare Pages). SPA fallback and security headers ship as `web/public/_headers`, `web/public/_redirects` (Netlify/Cloudflare) and `web/vercel.json`. There is no server-side code, so no business logic depends on the host. |
| **Environment** | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only, set at build time. `web/.env.example` documents them. |
| **Accessibility** | Semantic HTML (buttons, labels, fieldsets, headings, landmarks). Visible `:focus-visible` ring. AA contrast tokens. Status is always shown with text, never colour alone. `aria-live` for booking results and errors. Respects `prefers-reduced-motion`. Automated axe checks in E2E. |

### Superseded Phase 1 sections

- **§H project structure** → `web/src/{app,lib,features/*,components}`.
- **Phase 5 "APK"** → "production web build + hosting + PWA".
- The APK-related **§I risks** (Android SDK download, side-loading) are retired. New web risks are listed below.

## F. Security impact

| Topic | Position |
|---|---|
| Publishable key in the browser | Expected and safe **by design**. It identifies the project and can only do what RLS and GRANTs allow, which is nothing for `anon`. |
| Service-role / secret key | **Never** in the web bundle, repo or host env for the frontend. Used only by operator scripts on a trusted machine. A build check fails if `sb_secret_` or `service_role` appears in `dist/`. |
| RLS | Remains mandatory on every table (tested in Phase 2). |
| The browser is untrusted | All rules and authorization live in RPCs and RLS. Hidden admin navigation is cosmetic. `/admin` routes also call admin RPCs, which return `NOT_AUTHORIZED` to non-admins. |
| Role state | `is_admin` comes from `get_app_config()` (a DB read) and is used only to choose navigation. It is never sent back as proof of anything. |
| Availability privacy | `get_availability` returns aggregates only (status, counts, max duration, block reason category). There are no names, ids or resource numbers. Unchanged from Phase 2. |
| XSS | React escapes all output. **No `dangerouslySetInnerHTML`** anywhere (lint-checked). User-controlled strings (names, notes, reasons) are rendered as text. A strict CSP is the second line of defence. |
| Browser storage | The Supabase session (access + refresh token) lives in `localStorage`, which XSS could read; hence the zero-HTML-injection rule plus a strict CSP. Nothing else sensitive is stored, and no booking data is persisted. Sign-out clears the session and caches. |
| Redirect URLs | Only the app's own origins are allow-listed in Supabase Auth (`site_url` + `additional_redirect_urls`). Production: exactly the production origin, plus a preview origin if used. Wildcards are not used in production. The app's own `?next=` parameter accepts **relative paths only** (open-redirect guard). |
| Content Security Policy | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. React's inline `style={…}` props are set via CSSOM, which `style-src 'self'` permits. |
| Other headers | `Strict-Transport-Security` (production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`. |
| HTTPS | Production must be HTTPS only (service workers and secure-context APIs require it anyway). |
| Logging | No tokens, emails or booking payloads are written to `console` in production builds. Error screens show business messages only. Raw PostgREST/SQL errors never reach the UI. |
| Dependencies | Small, mainstream set (see the decision doc). `npm audit --omit=dev` runs in CI/Phase 4. Lockfile committed. |

### New web-specific risks

| Risk | Rating | Mitigation |
|---|---|---|
| XSS leading to session theft | MEDIUM | No HTML injection, strict CSP, small dependency set |
| Stale app version after deploy | MEDIUM | Hashed assets, no-cache `index.html`/`sw.js`, update prompt |
| Stale availability shown as current | MEDIUM | Network-only API, `staleTime 0`, Realtime refetch, hidden while offline |
| iOS Safari PWA quirks (storage eviction, install UX) | LOW | Install is optional; the app works fully in the browser tab |
| Redirect misconfiguration on hosted Auth | MEDIUM | Documented allow-list; E2E covers the link flows |
| Email delivery (open decision D3) | HIGH until SMTP configured | Custom SMTP before real users |


---
# FILE: docs/architecture/WEB-FRONTEND-DECISION.md

# DCU Active — Web Frontend Technology Decision

Status: **Decided — React + TypeScript (Vite) PWA.**
Date: 2026-10-06. Backend (Phase 2) is unaffected by this decision.

## 1. Starting point (what the repository actually contained)

| Area | State before Phase 3 |
|---|---|
| Flutter code (`pubspec.yaml`, `lib/`, `android/`) | **None.** Phase 1 only *planned* a Flutter structure; no Dart file was ever written. |
| Flutter SDK in the build environment | Not installed. |
| Backend (Supabase migrations, RPCs, RLS, tests) | Complete and tested (Phase 2). Framework-agnostic: any client calls the same RPCs. |

So the choice is between two **new** codebases. Choosing React discards **zero** frontend work.
The approval gate in the brief ("stop if changing stack discards substantial work") is therefore not triggered.

## 2. Comparison

| Criterion | Option A — Flutter Web | Option B — React + TypeScript (Vite) | Winner |
|---|---|---|---|
| Existing work to preserve | None | None | — |
| Mobile-browser UX | Renders to a `<canvas>` (CanvasKit/Skwasm). First load downloads a large engine. Text selection, browser autofill, zoom and scroll feel non-native, especially on iOS Safari. | Native HTML: browser autofill for email/password, native date/keyboard behaviour, small bundle. | **B** |
| First-load size (people who scan a QR code on mobile data) | Engine alone is multiple MB | ~150–250 KB gzipped for the whole app | **B** |
| Accessibility | Builds a semantics tree beside the canvas; workable but weaker with screen readers and keyboard focus | Real semantic HTML elements, labels, focus and ARIA come for free | **B** |
| PWA (manifest, service worker, update prompt) | Generated service worker with limited control over caching rules | `vite-plugin-pwa` / Workbox: explicit precache + `NetworkOnly` for Supabase, controlled update prompt | **B** |
| Supabase integration | `supabase_flutter` (good) | `@supabase/supabase-js` — the reference client; Realtime private channels, OTP/token-hash flows documented first for JS | Tie / slight **B** |
| Admin desktop UX (tables, filters) | Possible, but tables and dense layouts are more custom work | HTML tables, CSS grid, sticky headers — routine | **B** |
| Testing | Widget tests; browser E2E is awkward because the DOM is a canvas | Vitest (unit) + Playwright (real Chromium driving real DOM against real Supabase) | **B** |
| Security controls | CSP for CanvasKit needs `wasm-unsafe-eval` and extra script origins | Strict CSP possible (`script-src 'self'`) | **B** |
| Hosting | Static files | Static files | Tie |
| Future optional native app | Same codebase → Android/iOS | Would need a wrapper (Capacitor) or a separate native app later | **A** |
| Team familiarity / hiring | Smaller web pool | Very large pool | **B** |

## 3. Decision

**React 18 + TypeScript + Vite**, delivered as a responsive PWA.

The only real argument for Flutter was a possible native app later. That is explicitly **out of scope for V1**.
Even then, the backend is client-agnostic: a future native app could be built later without touching it.
For a web-first, mobile-browser-first, QR-code-onboarding product, rendering into a canvas is the wrong trade-off.

### Libraries (kept deliberately small)

| Purpose | Library | Why |
|---|---|---|
| UI | `react`, `react-dom` | — |
| Routing | `react-router-dom` | Browser history routes, deep links for auth redirects |
| Backend | `@supabase/supabase-js` | Auth, RPC, Realtime |
| Server state | `@tanstack/react-query` | Loading/error/refetch semantics. Availability is never served stale (`staleTime: 0`, refetch on focus/reconnect/Realtime ping). |
| Icons | `lucide-react` (ISC licence) | Tree-shaken SVG icons, no external font/CDN |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, precache of static assets, update prompt |
| Tests | `vitest`, `@playwright/test`, `@axe-core/playwright` | Unit, end-to-end, accessibility |

There is no CSS framework: one hand-written stylesheet with design tokens, so there is nothing to learn and no extra dependency surface.
There are no analytics or tracking SDKs, and no web fonts (the system font stack keeps CSP simple and first paint fast).

## 4. Consequences

- `web/` is the frontend project. `supabase/` (backend) is unchanged apart from Auth/email-template configuration (see the amendment).
- The Phase 1 Flutter project structure (§H) is superseded by `web/src/…` (documented in the amendment).
- A native app, if ever needed, remains possible against the same RPCs.


---
# FILE: web/README.md

# DCU Active — Web / PWA client

A mobile-first responsive web app that participants and trainers open from a URL or QR code.
Installing it as a PWA is optional. The Admin area is desktop-first and stays usable on tablets and phones.

The backend is the Phase 2 Supabase project in `../supabase`. **Every business rule is enforced there**; this client only displays what the RPCs return.

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript, Vite |
| Routing / data | react-router, TanStack Query |
| Backend client | `@supabase/supabase-js` (Auth, RPC, Realtime private channel) |
| PWA | `vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'prompt'`) |
| Tests | Vitest (unit), Playwright + axe-core (E2E against the real local Supabase) |

See `../docs/architecture/WEB-FRONTEND-DECISION.md` and `../docs/architecture/WEB-PWA-ARCHITECTURE-AMENDMENT.md`.

## Environment variables

Both are **public by design**: the publishable key can only do what RLS and grants allow.
Never put the secret / service-role key in this app or its hosting environment.

| Variable | Example | Where to get it |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://abcd1234.supabase.co` | Supabase dashboard → Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | same page, "Publishable key" |

Copy `.env.example` to `.env.local` for local work (gitignored). On a host, set them in the host's build environment.

## Run locally

```bash
# 1. Backend (from the repo root): Docker + Supabase CLI
supabase start
# 2. Web app
cd web
npm ci
cp .env.example .env.local     # fill with `supabase status -o env` values (API_URL, PUBLISHABLE_KEY)
npm run dev                    # http://localhost:5173
```

Emails (verification and password reset) go to the local Mailpit inbox at the `INBUCKET_URL` / `MAILPIT_URL` shown by `supabase status`.

## Tests

```bash
npm test                         # unit tests (Vitest)
../scripts/run-web-tests.sh      # reset DB → unit → lint → build → Playwright E2E (all journeys)
../scripts/run-web-tests.sh booking.spec.ts   # a single spec
```

The E2E suite drives the **production build** (`vite preview`) in Chromium against the real local stack: Auth with emails via Mailpit, RPCs, RLS and Realtime.
The browser timezone is deliberately `America/New_York`, to prove that every time shown is Jakarta time.

## Build and deploy

```bash
npm run build      # tsc + vite build + bundle secret check → dist/
```

`dist/` is a static site. Any static host works; nothing in the app depends on the host.

| Host | What to configure |
|---|---|
| **Netlify** / **Cloudflare Pages** | Build command `npm run build`, publish dir `web/dist`, root `web`. `public/_redirects` (SPA fallback) and `public/_headers` (security + cache headers) are picked up automatically. |
| **Vercel** | Root `web`, framework "Vite". `vercel.json` provides the SPA rewrite and headers. |
| Other (nginx, S3 + CloudFront) | Serve `index.html` for unknown paths. Send `Cache-Control: no-cache` for `index.html`, `sw.js` and `manifest.webmanifest`, and `immutable` for `/assets/*`. Copy the headers from `public/_headers`. |

**Before the first production deploy:**

1. Replace `<project-ref>` in `public/_headers` and `vercel.json` (the CSP `connect-src`) with your Supabase project ref.
2. In Supabase → Authentication → URL Configuration:
   - Site URL = your production origin (e.g. `https://active.dcu.example`).
   - Redirect URLs = that origin only, plus a preview origin if you use one. Do not use wildcards in production.
3. In Supabase → Authentication → Email Templates, paste `../supabase/templates/confirmation.html` (Confirm signup) and `recovery.html` (Reset password).
4. In Supabase → Authentication → Providers → Email:
   - "Confirm email" ON;
   - minimum password length 8;
   - password requirements: "Lowercase, uppercase letters, digits and symbols".
5. Configure custom SMTP (Project Settings → Auth → SMTP). The built-in mailer only delivers to project team members.
6. HTTPS only (all the hosts above do this by default).

## Updates and caching

- JS and CSS files have content hashes and are cached forever. `index.html` and `sw.js` are always revalidated.
- A new deployment installs a new service worker in the background. Users see **"A new version of DCU Active is available — Reload"**; the app never swaps versions mid-booking.
- The service worker precaches only the static app shell. Supabase requests (`/auth`, `/rest`, `/realtime`) are `NetworkOnly`, so availability and bookings are never served from cache. Offline, the app shows a clear offline message and hides availability.

## Project structure

```
web/
├── public/             favicon, PWA icons, _headers, _redirects, robots.txt
├── scripts/            generate-icons.mjs, check-bundle-secrets.mjs
├── src/
│   ├── app/            App (routes + guards), auth context, hooks, Realtime bridge
│   ├── components/     UI primitives (Button, Modal, Field…), shells (user/admin/auth), toasts, icons
│   ├── features/
│   │   ├── auth/       login, register, verify (code), confirm (link), forgot/reset, account disabled
│   │   ├── home/       home dashboard
│   │   ├── booking/    facility list, booking flow
│   │   ├── bookings/   my bookings, booking detail, check-in/cancel actions
│   │   ├── profile/
│   │   └── admin/      dashboard, bookings, facility blocks, users
│   ├── lib/            supabase client, typed RPC wrappers, error mapping, Jakarta time, labels, password rules
│   └── styles.css      design tokens + mobile-first layout
└── tests/e2e/          Playwright specs (auth, booking, admin, responsive, a11y, pwa)
```


---
# SOURCE CODE (key files)


## FILE: web/vite.config.ts

```tsx
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


## FILE: web/public/_headers

```text
# Security and cache headers (Netlify / Cloudflare Pages format). Replace <project-ref>.
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
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


## FILE: web/vercel.json

```json
{
  "rewrites": [{ "source": "/((?!assets/|icons/|sw.js|workbox-|manifest.webmanifest|favicon.svg|apple-touch-icon.png|robots.txt).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" }
      ]
    },
    { "source": "/(index.html|sw.js|manifest.webmanifest)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}

```


## FILE: web/src/lib/supabase.ts

```tsx
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (see web/.env.example).');
}

// The publishable key is public by design; every permission is enforced by RLS and RPCs.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Email links are handled explicitly by /auth/confirm and /auth/reset-password (token_hash),
    // so the SDK must not try to parse the URL on every page load.
    detectSessionInUrl: false,
  },
});

```


## FILE: web/src/lib/api.ts

```tsx
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

export async function getMyProfile(): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, is_active').single();
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


## FILE: web/src/lib/errors.ts

```tsx
// Turns anything thrown by Supabase/PostgREST/fetch into a business-friendly message.
// Raw SQL text, constraint names and stack traces never reach the UI.

export const MESSAGES: Record<string, string> = {
  // Booking
  SLOT_UNAVAILABLE: 'Sorry, this time slot was just booked by another user. Please choose another available time.',
  SLOT_FULL: 'Sorry, all tables were just taken for this time. Please choose another available time.',
  FACILITY_BLOCKED: 'This facility is unavailable during the selected time.',
  MAX_ACTIVE_BOOKINGS: 'You already have the maximum number of upcoming bookings.',
  ALREADY_BOOKED_TODAY: 'You already have a booking for this facility on that day.',
  USER_OVERLAP: 'You already have another booking at that time.',
  OUTSIDE_HORIZON: 'This date is outside the booking period.',
  OUTSIDE_HOURS: 'Bookings are only possible between 06:00 and 21:00.',
  PAST_SLOT: 'This time has already started. Please choose a later time.',
  INVALID_DURATION: 'This duration is not available for this facility.',
  INVALID_START_TIME: 'Please choose one of the listed start times.',
  INVALID_ACTIVITY: 'Please choose what you would like to play.',
  FACILITY_NOT_FOUND: 'This facility is not available.',
  // Booking management
  BOOKING_NOT_FOUND: 'We could not find this booking.',
  BOOKING_NOT_CANCELLABLE: 'This booking can no longer be cancelled.',
  CANNOT_CANCEL_STARTED: 'This booking has already started and can no longer be cancelled.',
  ALREADY_CHECKED_IN: 'You are already checked in.',
  CHECKIN_NOT_ALLOWED: 'Check-in is not possible for this booking.',
  CHECKIN_TOO_EARLY: 'Check-in is not open yet.',
  CHECKIN_EXPIRED: 'The check-in time for this booking has passed.',
  // Account
  NOT_AUTHENTICATED: 'Your session has ended. Please log in again.',
  ACCOUNT_DISABLED: 'Your account has been disabled. Please contact the DCU administrator.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',
  PROFILE_NOT_FOUND: 'Your profile could not be found. Please contact the DCU administrator.',
  NOT_AUTHORIZED: 'You do not have permission to do this.',
  // Admin
  BLOCK_CONFLICTS: 'This block overlaps existing bookings.',
  BLOCK_NOT_FOUND: 'This block no longer exists.',
  BLOCK_ALREADY_ENDED: 'This block has already ended.',
  BLOCK_IN_PAST: 'The block must end in the future.',
  INVALID_BLOCK_TIME: 'Please choose a valid start and end time (30-minute steps, end after start).',
  INVALID_RESOURCE: 'Please choose a resource that belongs to this facility.',
  INVALID_REASON: 'Please choose a reason.',
  USER_NOT_FOUND: 'User not found.',
  LAST_ADMIN: 'At least one active administrator is required.',
  INVALID_ROLE: 'Invalid role.',
  INVALID_SETTINGS: 'One of the settings is out of range.',
  INVALID_INPUT: 'Some information is missing or invalid.',
  // Client-side
  NETWORK: "We couldn't connect to DCU Active. Please check your internet connection and try again.",
  OFFLINE: 'You are offline. Connect to the internet to view live availability or make a booking.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

// Supabase Auth error codes → friendly text.
const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please verify your email address first. We sent you a link and a code.',
  user_already_exists: 'An account with this email already exists. Try logging in instead.',
  email_exists: 'An account with this email already exists. Try logging in instead.',
  weak_password: 'Password must be at least 8 characters with uppercase, lowercase, a number and a symbol.',
  otp_expired: 'This link or code is invalid or has expired.',
  over_email_send_rate_limit: 'Too many emails were requested. Please wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  same_password: 'Please choose a password different from your current one.',
  validation_failed: 'Please check the information you entered.',
};

export class AppError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message?: string, details?: unknown) {
    super(message ?? MESSAGES[code] ?? MESSAGES.UNKNOWN);
    this.code = code;
    this.details = details;
  }
}

function parseDetails(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw === '') return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Normalizes PostgREST, Supabase Auth and network errors. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AppError('OFFLINE');

  const e = err as { code?: string; message?: string; details?: unknown; name?: string; status?: number } | null;
  if (!e) return new AppError('UNKNOWN');

  // Business errors from our RPCs: code P0001 + stable message.
  if (e.code === 'P0001' && e.message && MESSAGES[e.message]) {
    return new AppError(e.message, undefined, parseDetails(e.details));
  }
  // Supabase Auth errors carry a string code.
  if (e.name === 'AuthApiError' || e.name === 'AuthWeakPasswordError' || (e.code && AUTH_MESSAGES[e.code])) {
    const code = e.code ?? '';
    return new AppError(code || 'UNKNOWN', AUTH_MESSAGES[code] ?? MESSAGES.UNKNOWN);
  }
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || /fetch|network/i.test(e.message ?? '')) {
    return new AppError('NETWORK');
  }
  if (e.code === 'PGRST301' || e.status === 401) return new AppError('NOT_AUTHENTICATED');
  if (e.code === '42501') return new AppError('NOT_AUTHORIZED');
  return new AppError('UNKNOWN');
}

```


## FILE: web/src/lib/password.ts

```tsx
// Mirrors the Supabase Auth policy (min 8, lower + upper + digit + symbol) for guidance only.
// Supabase Auth enforces it server-side; this never replaces that check.

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  // Same symbol set Supabase Auth accepts.
  { id: 'symbol', label: 'A symbol (e.g. ! ? # @ .)', test: (p) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(p) },
];

export const passwordProblems = (pw: string) => PASSWORD_RULES.filter((r) => !r.test(pw));
export const isStrongPassword = (pw: string) => passwordProblems(pw).length === 0;

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** Only same-origin relative paths are accepted as post-login destinations (open-redirect guard). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

```


## FILE: web/src/lib/time.ts

```tsx
// All display is in Asia/Jakarta regardless of the device timezone.
// Business decisions (what is past, bookable, check-in-able) are made by the server.

export const TZ = 'Asia/Jakarta';

/** "YYYY-MM-DD" → Date at 00:00 UTC (only used for calendar arithmetic/formatting). */
function dateOnly(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

export function addDays(d: string, n: number): string {
  const x = dateOnly(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDateLong(d: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(dateOnly(d));
}

export function formatDateShort(d: string): { weekday: string; day: string; month: string } {
  const x = dateOnly(d);
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(x),
    day: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' }).format(x),
    month: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(x),
  };
}

/** "Today", "Tomorrow" or "Tue 6 Oct" relative to the server's Jakarta today. */
export function relativeDay(d: string, today: string): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  const s = formatDateShort(d);
  return `${s.weekday} ${s.day} ${s.month}`;
}

/** "18:00:00" → "18:00" */
export const hhmm = (t: string) => t.slice(0, 5);

export function addMinutesToTime(t: string, minutes: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = h! * 60 + m! + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** ISO timestamp → "HH:MM" in Jakarta. */
export function timeInJakarta(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function dateTimeInJakarta(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}

export function greeting(nowMs: number): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(nowMs)));
  if (hour < 11) return 'Good morning';
  if (hour < 15) return 'Good afternoon';
  if (hour < 19) return 'Good evening';
  return 'Good night';
}

export function formatDuration(minutes: number): string {
  return `${minutes} minutes`;
}

/** Half-hour options between two "HH:MM" values (inclusive). */
export function halfHourOptions(from = '00:00', to = '23:30'): string[] {
  const out: string[] = [];
  for (let t = from; t <= to; t = addMinutesToTime(t, 30)) {
    out.push(t);
    if (t === '23:30') break;
  }
  return out;
}

```


## FILE: web/src/app/App.tsx

```tsx
import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { RealtimeBridge } from './RealtimeBridge';
import { AdminShell, UserShell, UpdatePrompt } from '../components/shells';
import { Spinner, ErrorState, OfflineNotice } from '../components/ui';
import { useOnline } from './hooks';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { VerifyCodePage } from '../features/auth/VerifyCodePage';
import { ConfirmEmailPage } from '../features/auth/ConfirmEmailPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { AccountDisabledPage } from '../features/auth/AccountDisabledPage';
import { HomePage } from '../features/home/HomePage';
import { FacilityListPage } from '../features/booking/FacilityListPage';
import { BookFacilityPage } from '../features/booking/BookFacilityPage';
import { MyBookingsPage } from '../features/bookings/MyBookingsPage';
import { BookingDetailPage } from '../features/bookings/BookingDetailPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { NotFoundPage } from '../features/NotFoundPage';

// Admin screens are loaded on demand: participants never download them.
const AdminDashboardPage = lazy(() => import('../features/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminBookingsPage = lazy(() => import('../features/admin/AdminBookingsPage').then((m) => ({ default: m.AdminBookingsPage })));
const AdminBlocksPage = lazy(() => import('../features/admin/AdminBlocksPage').then((m) => ({ default: m.AdminBlocksPage })));
const AdminUsersPage = lazy(() => import('../features/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));

/** UX guard only. Every RPC re-checks identity, verification and activity on the server. */
function RequireAuth() {
  const { session, sessionLoading, disabled, config, configError, refreshConfig } = useAuth();
  const location = useLocation();
  const online = useOnline();
  if (sessionLoading) return <div className="center-page"><Spinner /></div>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (disabled) return <Navigate to="/account-disabled" replace />;
  // Opened (or reloaded) without a connection: nothing live can be shown, so say so clearly.
  if (!config && !online) return <div className="center-page"><OfflineNotice /></div>;
  if (configError && configError.code !== 'ACCOUNT_DISABLED') {
    return <div className="center-page"><ErrorState message={configError.message} onRetry={refreshConfig} /></div>;
  }
  if (!config) return <div className="center-page"><Spinner /></div>;
  return (
    <>
      <RealtimeBridge />
      <Outlet />
    </>
  );
}

/** Cosmetic: hides admin screens from non-admins. The admin RPCs enforce the real check. */
function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Suspense fallback={<div className="center-page"><Spinner /></div>}><Outlet /></Suspense>;
}

/** Logged-in users visiting /login or /register go home. */
function GuestOnly() {
  const { session, sessionLoading } = useAuth();
  if (sessionLoading) return <div className="center-page"><Spinner /></div>;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <>
      <UpdatePrompt />
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="/verify" element={<VerifyCodePage />} />
        <Route path="/auth/confirm" element={<ConfirmEmailPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/account-disabled" element={<AccountDisabledPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<UserShell />}>
            <Route index element={<HomePage />} />
            <Route path="/book" element={<FacilityListPage />} />
            <Route path="/book/:code" element={<BookFacilityPage />} />
            <Route path="/bookings" element={<MyBookingsPage />} />
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route element={<AdminShell />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/bookings" element={<AdminBookingsPage />} />
              <Route path="/admin/blocks" element={<AdminBlocksPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

```


## FILE: web/src/app/auth.tsx

```tsx
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
    queryFn: getMyProfile,
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


## FILE: web/src/app/RealtimeBridge.tsx

```tsx
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from './auth';

/**
 * Listens to the private "availability" broadcast (payload: facility_id + date range only)
 * and refetches what is on screen. A UX hint only: correctness is enforced by the booking RPC.
 */
export function RealtimeBridge() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = supabase
        .channel('availability', { config: { private: true } })
        .on('broadcast', { event: 'availability_changed' }, ({ payload }) => {
          const facilityId = (payload as { facility_id?: string }).facility_id;
          if (facilityId) void queryClient.invalidateQueries({ queryKey: ['availability', facilityId] });
          void queryClient.invalidateQueries({ queryKey: ['overview'] });
        })
        .subscribe((status) => {
          if (import.meta.env.DEV && status !== 'SUBSCRIBED') console.warn('realtime', status);
          document.documentElement.dataset.realtime = status;
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [token, queryClient]);

  return null;
}

```


## FILE: web/src/features/auth/ConfirmEmailPage.tsx

```tsx
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { useResend } from './VerifyCodePage';

type State = 'ready' | 'verifying' | 'success' | 'invalid';

/**
 * Landing page of the verification link: /auth/confirm?token_hash=…&type=signup
 * The token is only redeemed when the person presses the button, so email security
 * scanners that pre-open links cannot use up the one-time token.
 */
export function ConfirmEmailPage() {
  useDocumentTitle('Confirm email');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenHash = params.get('token_hash');
  const type = (params.get('type') ?? 'signup') as EmailOtpType;
  const [state, setState] = useState<State>(tokenHash ? 'ready' : 'invalid');
  const [email, setEmail] = useState('');
  const { cooldown, message, resend } = useResend('signup');

  async function confirm() {
    if (!tokenHash) return;
    setState('verifying');
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === 'email' ? 'email' : 'signup' });
    setState(error ? 'invalid' : 'success');
  }

  return (
    <AuthLayout>
      {(state === 'ready' || state === 'verifying') && (
        <>
          <div className="auth-hero-icon" aria-hidden><MailCheck size={36} /></div>
          <h1>Confirm your email</h1>
          <p className="muted">Press the button to finish verifying your DCU Active account.</p>
          <Button block size="lg" onClick={() => void confirm()} loading={state === 'verifying'} disabled={!online}>
            Confirm my email
          </Button>
        </>
      )}
      {state === 'success' && (
        <div role="status">
          <div className="auth-hero-icon success" aria-hidden><CheckCircle2 size={36} /></div>
          <h1>Email verified</h1>
          <p className="muted">Your account is ready. You can now book facilities.</p>
          <Button block size="lg" onClick={() => navigate('/', { replace: true })}>Continue to DCU Active</Button>
        </div>
      )}
      {state === 'invalid' && (
        <>
          <div className="auth-hero-icon danger" aria-hidden><XCircle size={36} /></div>
          <h1>This link is invalid or has expired</h1>
          <Alert tone="info">
            If you already verified your email, just <Link to="/login">log in</Link>.
          </Alert>
          <p className="muted">Otherwise, request a new verification email:</p>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button block variant="secondary" onClick={() => void resend(email)} disabled={cooldown > 0 || !online}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new verification email'}
          </Button>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <p className="auth-alt"><Link to={`/verify${email ? `?email=${encodeURIComponent(email)}` : ''}`}>I have a 6-digit code</Link></p>
        </>
      )}
    </AuthLayout>
  );
}

```


## FILE: web/src/features/auth/VerifyCodePage.tsx

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field } from '../../components/ui';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';

/** Resend button with a cooldown (Supabase also rate-limits on the server). */
export function useResend(type: 'signup') {
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  async function resend(email: string) {
    setMessage(null);
    if (!isValidEmail(email)) {
      setMessage({ tone: 'danger', text: 'Please enter a valid email address.' });
      return;
    }
    const { error } = await supabase.auth.resend({
      type, email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    if (error) setMessage({ tone: 'danger', text: toAppError(error).message });
    else {
      setMessage({ tone: 'success', text: 'We sent a new verification email.' });
      setCooldown(60);
    }
  }
  return { cooldown, message, resend };
}

export function VerifyCodePage() {
  useDocumentTitle('Verify your email');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const { session } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { cooldown, message, resend } = useResend('signup');

  if (session && !loading) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email) || !/^\d{6}$/.test(code.trim())) {
      setError('Please enter your email and the 6-digit code from the email.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'signup' });
    if (err) {
      setLoading(false);
      setError(toAppError(err).message);
      return;
    }
    // Keep `loading` set so the "already signed in" redirect above doesn't race this navigation.
    navigate('/?welcome=1', { replace: true });
  }

  return (
    <AuthLayout>
      <div className="auth-hero-icon" aria-hidden><MailCheck size={36} /></div>
      <h1>Check your email</h1>
      <p className="muted">
        {params.get('sent') ? 'We sent a verification email' : 'Your verification email was sent'}
        {email ? <> to <strong>{email}</strong></> : ''}. Open the link in the email, or enter the 6-digit code here.
      </p>
      <form onSubmit={submit} noValidate>
        {!params.get('email') && (
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <Field label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="code-input" />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Verify email</Button>
      </form>
      <div className="resend">
        <p className="muted">Didn't get it? Check your spam folder or</p>
        <Button variant="secondary" onClick={() => void resend(email)} disabled={cooldown > 0 || !online}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
      <p className="auth-alt">Already verified? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}

```


## FILE: web/src/features/auth/ResetPasswordPage.tsx

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isStrongPassword, isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

/**
 * Reached from the reset email link (?token_hash=…&type=recovery) or with a 6-digit code (?email=…).
 * The one-time token is redeemed only when the person submits the new password.
 */
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const tokenHash = params.get('token_hash');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<{ text: string; expired?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tokenHash && (!isValidEmail(email) || !/^\d{6}$/.test(code))) {
      setError({ text: 'Please enter your email and the 6-digit code from the email.' });
      return;
    }
    if (!isStrongPassword(password)) {
      setError({ text: 'Password does not meet all the requirements.' });
      return;
    }
    if (password !== confirm) {
      setError({ text: 'Passwords do not match.' });
      return;
    }
    setLoading(true);
    if (!verified) {
      const { error: vErr } = tokenHash
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        : await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
      if (vErr) {
        setLoading(false);
        setError({ text: 'This reset link or code is invalid or has expired.', expired: true });
        return;
      }
      setVerified(true);
    }
    const { data: updated, error: uErr } = await supabase.auth.updateUser({ password });
    if (uErr) {
      setLoading(false);
      setError({ text: toAppError(uErr).message });
      return;
    }
    // Start fresh: sign out of the recovery session and log in with the new password.
    // The link flow carries no email in the URL, so take it from the recovery session.
    const accountEmail = updated.user?.email ?? email.trim();
    await supabase.auth.signOut();
    setLoading(false);
    navigate(`/login?reset=1${accountEmail ? `&email=${encodeURIComponent(accountEmail)}` : ''}`, { replace: true });
  }

  return (
    <AuthLayout>
      <h1>Choose a new password</h1>
      <form onSubmit={submit} noValidate>
        {!tokenHash && (
          <>
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Reset code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="code-input" />
          </>
        )}
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" showRules />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <Alert tone="danger">
            {error.text} {error.expired && <Link to="/forgot-password">Request a new one</Link>}
          </Alert>
        )}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Save new password</Button>
      </form>
      <p className="auth-alt"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}

```


## FILE: web/src/features/auth/RegisterPage.tsx

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { toAppError } from '../../lib/errors';
import { isStrongPassword, isValidEmail } from '../../lib/password';
import { AuthLayout } from '../../components/shells';
import { Alert, Button, Field, PasswordField } from '../../components/ui';
import { useDocumentTitle, useOnline } from '../../app/hooks';

export function RegisterPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const online = useOnline();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const errors = {
    name: name.trim().length < 2 ? 'Please enter your full name.' : name.trim().length > 100 ? 'Name is too long.' : '',
    email: !isValidEmail(email) ? 'Please enter a valid email address.' : '',
    password: !isStrongPassword(password) ? 'Password does not meet all the requirements.' : '',
    confirm: confirm !== password || !confirm ? 'Passwords do not match.' : '',
  };
  const valid = !Object.values(errors).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (err) {
      setError(toAppError(err).message);
      return;
    }
    navigate(`/verify?email=${encodeURIComponent(email.trim())}&sent=1`, { replace: true });
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] || undefined : undefined);

  return (
    <AuthLayout>
      <h1>Create your account</h1>
      <p className="muted">For DCU participants and trainers. We'll email you a link and a code to verify your address.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={show('name')} required />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} error={show('email')} required />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" showRules error={show('password')} />
        <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={show('confirm')} />
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" block size="lg" loading={loading} disabled={!online}>Create account</Button>
      </form>
      <p className="auth-alt">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}

```


## FILE: web/src/features/booking/BookFacilityPage.tsx

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, WifiOff } from 'lucide-react';
import { createBooking, getAvailability, getFacilitiesOverview } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { Booking, Slot } from '../../lib/types';
import { addMinutesToTime, dateRange, formatDateLong, formatDateShort, formatDuration, hhmm } from '../../lib/time';
import { slotLabel } from '../../lib/labels';
import { useAuth } from '../../app/auth';
import { useDocumentTitle, useOnline } from '../../app/hooks';
import { Alert, Button, Card, EmptyState, ErrorState, Modal, Spinner, StatusBadge } from '../../components/ui';
import { FacilityIcon } from '../../components/FacilityIcon';

const CONFLICT_CODES = new Set(['SLOT_UNAVAILABLE', 'SLOT_FULL', 'FACILITY_BLOCKED', 'PAST_SLOT']);

export function BookFacilityPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { config } = useAuth();
  const online = useOnline();
  const qc = useQueryClient();
  const today = config!.today;
  const dates = useMemo(() => dateRange(today, config!.last_bookable_date), [today, config]);

  const overview = useQuery({ queryKey: ['overview', today], queryFn: () => getFacilitiesOverview(today), enabled: online });
  const facility = overview.data?.find((f) => f.code === code.toUpperCase());
  useDocumentTitle(facility ? `Book ${facility.name}` : 'Book');

  const needsActivity = (facility?.activities.length ?? 0) > 1;
  const date = params.get('date') && dates.includes(params.get('date')!) ? params.get('date')! : today;
  const activityId = needsActivity ? params.get('activity') : facility?.activities[0]?.id ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Booking | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const availability = useQuery({
    queryKey: ['availability', facility?.facility_id, date],
    queryFn: () => getAvailability(facility!.facility_id, date),
    enabled: !!facility && online && (!needsActivity || !!activityId),
    staleTime: 0,
    refetchInterval: 60_000,          // fallback if Realtime is unavailable
  });
  const slots = availability.data ?? [];
  const multiDuration = (facility?.allowed_durations.length ?? 0) > 1;

  // Live data can take a chosen time away (another user, an admin block). While the user is
  // still choosing, treat it as unselected and say so. During review we keep it: the server decides.
  const liveSlot = slots.find((s) => s.slot_start === slot) ?? null;
  const slotGone = !!slot && !!availability.data && !reviewOpen && (!liveSlot || liveSlot.status !== 'AVAILABLE');
  const activeSlot = slotGone ? null : slot;
  const selected = activeSlot ? liveSlot : null;
  const durations = facility
    ? facility.allowed_durations.filter((d) => !selected || d <= selected.max_duration_minutes)
    : [];
  // Standard facilities only have 30 minutes, so it is implied; longer ones must still fit.
  const activeDuration = !facility ? null
    : !multiDuration ? facility.allowed_durations[0]!
    : duration && (reviewOpen || durations.includes(duration)) ? duration : null;
  const shownNotice = notice ?? (slotGone ? `${hhmm(slot!)} is no longer available. Please choose another time.` : null);

  const book = useMutation({
    mutationFn: () => createBooking({
      facilityId: facility!.facility_id, activityId: activityId!, date, startTime: hhmm(slot!), duration: activeDuration!,
    }),
    onSuccess: (b) => {
      setReviewOpen(false);
      setResult(b);
      void qc.invalidateQueries({ queryKey: ['myBookings'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: AppError) => {
      if (CONFLICT_CODES.has(e.code)) {
        setReviewOpen(false);
        setSlot(null);
        setNotice(e.message);
        void availability.refetch();
      }
    },
  });

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  if (!online && !facility) {
    return <div className="page"><BackLink /><OfflineAvailability /></div>;
  }
  if (overview.isPending) return <div className="page"><Spinner /></div>;
  if (overview.error) return <div className="page"><ErrorState message={(overview.error as AppError).message} onRetry={() => void overview.refetch()} /></div>;
  if (!facility) {
    return (
      <div className="page">
        <BackLink />
        <EmptyState title="Facility not found"><Link to="/book">See all facilities</Link></EmptyState>
      </div>
    );
  }

  const activity = facility.activities.find((a) => a.id === activityId);
  const facilityTitle = facility.code === 'BASKETBALL_FUTSAL' && activity ? `${activity.name} · ${facility.name}` : facility.name;

  // ---------- Result ----------
  if (result) {
    return (
      <div className="page">
        <Card className="result-card" aria-live="polite">
          <div className="result-icon" aria-hidden><CheckCircle2 size={44} /></div>
          <h1 tabIndex={-1} ref={resultRef}>Booking confirmed</h1>
          <dl className="summary-list">
            <div><dt>Facility</dt><dd>{result.facility.code === 'BASKETBALL_FUTSAL' ? `${result.activity.name} · ${result.facility.name}` : result.facility.name}</dd></div>
            <div><dt>Date</dt><dd>{formatDateLong(result.date)}</dd></div>
            <div><dt>Time</dt><dd>{result.start_time}–{result.end_time}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(result.duration_minutes)}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={result.effective_status} /></dd></div>
            <div><dt>Booking code</dt><dd className="mono">{result.booking_code}</dd></div>
          </dl>
          <p className="muted">Please check in at the facility between 15 minutes before and 15 minutes after the start time.</p>
          <div className="actions stack">
            <Button size="lg" block onClick={() => navigate(`/bookings/${result.id}`)}>View my booking</Button>
            <Button size="lg" block variant="secondary" onClick={() => navigate('/')}>Back to home</Button>
          </div>
        </Card>
      </div>
    );
  }

  const ready = !!activityId && !!activeSlot && !!activeDuration && !!selected;

  return (
    <div className="page booking-page">
      <BackLink />
      <header className="booking-head">
        <span className="facility-icon-badge" aria-hidden><FacilityIcon code={facility.code} size={30} /></span>
        <div>
          <h1>{facility.name}</h1>
          <p className="muted">Choose {needsActivity ? 'what to play, ' : ''}a date and a time</p>
        </div>
      </header>

      {shownNotice && <Alert tone="warning" onClose={() => { setNotice(null); setSlot(null); }}>{shownNotice}</Alert>}

      {needsActivity && (
        <fieldset className="step">
          <legend>What would you like to play?</legend>
          <div className="choice-row">
            {facility.activities.map((a) => (
              <button key={a.id} type="button" className="choice" aria-pressed={activityId === a.id}
                onClick={() => setParam('activity', a.id)}>
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {(!needsActivity || activityId) && (
        <>
          <fieldset className="step">
            <legend>Date</legend>
            <div className="date-strip" role="group" aria-label="Choose a date">
              {dates.map((d) => {
                const s = formatDateShort(d);
                return (
                  <button key={d} type="button" className="date-chip" aria-pressed={d === date}
                    aria-label={formatDateLong(d)}
                    onClick={() => { setParam('date', d); setSlot(null); setNotice(null); }}>
                    <span className="dc-wd">{d === today ? 'Today' : s.weekday}</span>
                    <span className="dc-day">{s.day}</span>
                    <span className="dc-mo">{s.month}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="step">
            <legend>Start time <span className="muted small">· {formatDateLong(date)}</span></legend>
            {!online ? <OfflineAvailability /> : availability.isPending ? <Spinner label="Loading live availability…" /> : availability.error ? (
              <ErrorState message={(availability.error as AppError).message} onRetry={() => void availability.refetch()} />
            ) : (
              <SlotGrid slots={slots} selected={activeSlot} onSelect={(s) => {
                setSlot(s.slot_start);
                setNotice(null);
                setDuration(null);
              }} />
            )}
          </fieldset>

          {selected && multiDuration && (
            <fieldset className="step">
              <legend>Duration</legend>
              <div className="choice-row">
                {durations.map((d) => (
                  <button key={d} type="button" className="choice" aria-pressed={activeDuration === d} onClick={() => setDuration(d)}>
                    {formatDuration(d)}
                    <small>{hhmm(selected.slot_start)}–{addMinutesToTime(hhmm(selected.slot_start), d)}</small>
                  </button>
                ))}
              </div>
              {durations.length < facility.allowed_durations.length && (
                <p className="hint">Longer bookings aren't possible at this time because the following slots are taken.</p>
              )}
            </fieldset>
          )}
        </>
      )}

      <div className="sticky-cta">
        <div className="sticky-summary" aria-live="polite">
          {ready ? `${formatDateShort(date).weekday} ${formatDateShort(date).day} ${formatDateShort(date).month} · ${hhmm(slot!)}–${addMinutesToTime(hhmm(slot!), activeDuration!)}` : selected && multiDuration ? 'Choose a duration' : 'Select a time'}
        </div>
        <Button size="lg" disabled={!ready || !online} onClick={() => { book.reset(); setReviewOpen(true); }}>
          Review booking
        </Button>
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review your booking" footer={
        <>
          <Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={book.isPending}>Change</Button>
          <Button onClick={() => book.mutate()} loading={book.isPending} disabled={!online}>Confirm booking</Button>
        </>
      }>
        {slot && activeDuration && (
          <dl className="summary-list">
            <div><dt>Facility</dt><dd>{facilityTitle}</dd></div>
            <div><dt>Date</dt><dd>{formatDateLong(date)}</dd></div>
            <div><dt>Time</dt><dd>{hhmm(slot)}–{addMinutesToTime(hhmm(slot), activeDuration)}</dd></div>
            <div><dt>Duration</dt><dd>{formatDuration(activeDuration)}</dd></div>
          </dl>
        )}
        {book.error && !CONFLICT_CODES.has((book.error as AppError).code) && (
          <Alert tone="danger">
            {(book.error as AppError).message}{' '}
            {['MAX_ACTIVE_BOOKINGS', 'ALREADY_BOOKED_TODAY', 'USER_OVERLAP'].includes((book.error as AppError).code) && (
              <Link to="/bookings">See my bookings</Link>
            )}
          </Alert>
        )}
      </Modal>
    </div>
  );
}

function BackLink() {
  return <Link to="/book" className="back-link"><ArrowLeft size={18} aria-hidden /> All facilities</Link>;
}

function OfflineAvailability() {
  return (
    <div className="offline-box" role="status">
      <WifiOff size={22} aria-hidden />
      <p>Live availability is hidden while you're offline. Connect to the internet to see current times.</p>
    </div>
  );
}

function SlotGrid({ slots, selected, onSelect }: { slots: Slot[]; selected: string | null; onSelect: (s: Slot) => void }) {
  const visible = slots.filter((s) => s.status !== 'PAST');
  if (visible.length === 0) {
    return <EmptyState title="No more times today">Please choose another date.</EmptyState>;
  }
  const anyAvailable = visible.some((s) => s.status === 'AVAILABLE');
  return (
    <>
      {!anyAvailable && <Alert tone="info">No times are available on this date. Please choose another date.</Alert>}
      <ul className="slot-grid" aria-label="Start times">
        {visible.map((s) => {
          const label = slotLabel(s);
          const available = s.status === 'AVAILABLE';
          return (
            <li key={s.slot_start}>
              <button
                type="button"
                className={`slot slot-${s.status.toLowerCase()}`}
                aria-pressed={selected === s.slot_start}
                aria-label={`${hhmm(s.slot_start)}, ${label}`}
                disabled={!available}
                onClick={() => onSelect(s)}
                data-testid={`slot-${hhmm(s.slot_start)}`}
              >
                <span className="slot-time">{hhmm(s.slot_start)}</span>
                <span className="slot-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="legend muted small">Times are shown in Jakarta time (WIB).</p>
    </>
  );
}

```


## FILE: web/src/features/bookings/BookingCard.tsx

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock } from 'lucide-react';
import { cancelBooking, checkIn } from '../../lib/api';
import type { AppError } from '../../lib/errors';
import type { Booking } from '../../lib/types';
import { formatDateLong, formatDuration, relativeDay, timeInJakarta } from '../../lib/time';
import { Button, Card, ConfirmDialog, StatusBadge } from '../../components/ui';
import { FacilityIcon } from '../../components/FacilityIcon';
import { useToast } from '../../components/toast';
import { useAuth } from '../../app/auth';
import { useOnline, useServerNow } from '../../app/hooks';

/** Refresh everything a booking change can affect. Nothing is simulated client-side. */
export function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['myBookings'] });
    void qc.invalidateQueries({ queryKey: ['booking'] });
    void qc.invalidateQueries({ queryKey: ['availability'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
}

export function useBookingActions(booking: Booking) {
  const toast = useToast();
  const invalidate = useInvalidateBookings();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelBooking(booking.id),
    onSuccess: () => {
      setConfirmCancel(false);
      toast('Booking cancelled. The time is now available to others.');
      invalidate();
    },
  });
  const checkin = useMutation({
    mutationFn: () => checkIn(booking.id),
    onSuccess: () => {
      toast("You're checked in. Enjoy your game!");
      invalidate();
    },
    onError: () => invalidate(),
  });
  return { cancel, checkin, confirmCancel, setConfirmCancel };
}

/** Check-in state for display. The check_in RPC is the authority. */
export function useCheckInState(b: Booking) {
  const now = useServerNow(15_000);
  const opens = new Date(b.checkin_opens_at).getTime();
  const closes = new Date(b.checkin_closes_at).getTime();
  if (b.effective_status !== 'CONFIRMED') return { show: false as const };
  if (now < opens) return { show: true as const, enabled: false, hint: `Check-in opens at ${timeInJakarta(b.checkin_opens_at)}` };
  if (now <= closes) return { show: true as const, enabled: true, hint: `Check in before ${timeInJakarta(b.checkin_closes_at)}` };
  return { show: false as const };
}

export function BookingActions({ booking, showView = true }: { booking: Booking; showView?: boolean }) {
  const online = useOnline();
  const { cancel, checkin, confirmCancel, setConfirmCancel } = useBookingActions(booking);
  const ci = useCheckInState(booking);
  const { config } = useAuth();
  const canCancel = booking.status === 'CONFIRMED' && booking.can_cancel && booking.effective_status === 'CONFIRMED';
  return (
    <>
      {ci.show && <p className="hint" aria-live="polite">{ci.hint}</p>}
      {checkin.error && <p className="field-error" role="alert">{(checkin.error as AppError).message}</p>}
      <div className="actions">
        {showView && (
          <Link className="btn btn-secondary btn-md" to={`/bookings/${booking.id}`} aria-label={`View ${booking.facility.name} booking ${relativeDay(booking.date, config?.today ?? booking.date)} ${booking.start_time}`}>
            View
          </Link>
        )}
        {ci.show && (
          <Button onClick={() => checkin.mutate()} disabled={!ci.enabled || !online} loading={checkin.isPending}>
            Check in
          </Button>
        )}
        {canCancel && (
          <Button variant="ghost" className="danger-text" onClick={() => { cancel.reset(); setConfirmCancel(true); }} disabled={!online}>
            Cancel
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel booking"
        danger
        loading={cancel.isPending}
        error={cancel.error ? (cancel.error as AppError).message : null}
        onConfirm={() => cancel.mutate()}
        onClose={() => setConfirmCancel(false)}
      >
        <p>
          <strong>{booking.activity.name}</strong> · {formatDateLong(booking.date)} · {booking.start_time}–{booking.end_time}
        </p>
        <p className="muted">The time will become available to other users.</p>
      </ConfirmDialog>
    </>
  );
}

export function BookingSummary({ booking, today }: { booking: Booking; today: string }) {
  const title = booking.facility.code === 'BASKETBALL_FUTSAL' ? `${booking.activity.name} · ${booking.facility.name}` : booking.facility.name;
  return (
    <div className="booking-summary">
      <div className="facility-icon-badge" aria-hidden><FacilityIcon code={booking.facility.code} /></div>
      <div>
        <h3>{title}</h3>
        <p className="meta"><CalendarDays size={16} aria-hidden /> {relativeDay(booking.date, today)}</p>
        <p className="meta"><Clock size={16} aria-hidden /> {booking.start_time}–{booking.end_time} · {formatDuration(booking.duration_minutes)}</p>
      </div>
      <StatusBadge status={booking.effective_status} />
    </div>
  );
}

export function BookingCard({ booking, today }: { booking: Booking; today: string }) {
  return (
    <Card as="li" className="booking-card" data-testid="booking-card">
      <BookingSummary booking={booking} today={today} />
      {booking.effective_status === 'NO_SHOW' && <p className="hint">Check-in time passed without check-in.</p>}
      {booking.effective_status === 'ADMIN_CANCELLED' && booking.cancellation_reason && (
        <p className="hint">Reason: {booking.cancellation_reason}</p>
      )}
      <BookingActions booking={booking} />
    </Card>
  );
}

```


## FILE: web/src/features/admin/AdminBlocksPage.tsx

```tsx
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { adminCreateBlock, adminFacilities, adminListBlocks, adminRemoveBlock } from '../../lib/api';
import { AppError } from '../../lib/errors';
import type { AdminBlock, BlockReason, Booking } from '../../lib/types';
import { BLOCK_REASON_LABEL } from '../../lib/labels';
import { halfHourOptions } from '../../lib/time';
import { useAuth } from '../../app/auth';
import { useDocumentTitle } from '../../app/hooks';
import { Alert, Badge, Button, ConfirmDialog, ErrorState, Modal, Spinner, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

const TIMES = halfHourOptions('00:00', '23:30');

export function AdminBlocksPage() {
  useDocumentTitle('Facility blocks');
  const qc = useQueryClient();
  const toast = useToast();
  const [includePast, setIncludePast] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AdminBlock | null>(null);
  const blocks = useQuery({ queryKey: ['admin', 'blocks', includePast], queryFn: () => adminListBlocks(includePast) });
  const remove = useMutation({
    mutationFn: (id: string) => adminRemoveBlock(id),
    onSuccess: () => {
      toast('Block removed. The time is bookable again.');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1>Facility blocks</h1>
        <Button onClick={() => setCreating(true)}><Plus size={18} aria-hidden /> New block</Button>
      </header>
      <label className="check"><input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /> Show past and removed blocks</label>

      {blocks.error ? <ErrorState message={(blocks.error as AppError).message} /> : blocks.isPending ? <Spinner /> : blocks.data.length === 0 ? (
        <p className="muted">No {includePast ? '' : 'upcoming '}blocks.</p>
      ) : (
        <table className="data-table always">
          <thead><tr><th scope="col">Facility</th><th scope="col">From</th><th scope="col">Until</th><th scope="col">Reason</th><th scope="col">Created by</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {blocks.data.map((k) => (
              <tr key={k.id}>
                <td>{k.facility.name}<div className="muted small">{k.resource ? k.resource.name : 'All resources'}</div></td>
                <td className="mono">{k.start_local}</td>
                <td className="mono">{k.end_local}</td>
                <td>{BLOCK_REASON_LABEL[k.reason_type]}{k.note && <div className="muted small">{k.note}</div>}</td>
                <td>{k.created_by.full_name}</td>
                <td>{k.removed_at ? <Badge>Removed</Badge> : k.can_remove ? (
                  <Button size="sm" variant="secondary" onClick={() => { remove.reset(); setRemoving(k); }}>Remove</Button>
                ) : <Badge>Ended</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CreateBlockModal open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog open={!!removing} title="Remove this block?" confirmLabel="Remove block" cancelLabel="Keep block"
        loading={remove.isPending} error={remove.error ? (remove.error as AppError).message : null}
        onConfirm={() => removing && remove.mutate(removing.id)} onClose={() => setRemoving(null)}>
        <p>{removing?.facility.name} · {removing?.start_local} – {removing?.end_local}</p>
        <p className="muted">The time becomes bookable again immediately. Bookings cancelled by this block are not restored.</p>
      </ConfirmDialog>
    </div>
  );
}

function CreateBlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const facilities = useQuery({ queryKey: ['admin', 'facilities'], queryFn: adminFacilities, enabled: open, staleTime: 10 * 60_000 });
  const [form, setForm] = useState({
    facilityId: '', resourceId: '', startDate: config!.today, startTime: '09:00', endDate: config!.today, endTime: '12:00',
    reason: 'MAINTENANCE' as BlockReason, note: '',
  });
  const [conflicts, setConflicts] = useState<Booking[] | null>(null);
  const facility = facilities.data?.find((f) => f.id === form.facilityId);

  const create = useMutation({
    mutationFn: (cancelConflicts: boolean) => adminCreateBlock({
      facilityId: form.facilityId, resourceId: form.resourceId || null, startDate: form.startDate, startTime: form.startTime,
      endDate: form.endDate, endTime: form.endTime, reason: form.reason, note: form.note.trim(), cancelConflicts,
    }),
    onSuccess: (r) => {
      const n = r.cancelled_bookings.length;
      toast(n ? `Block created. ${n} booking${n === 1 ? ' was' : 's were'} cancelled.` : 'Block created.');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['availability'] });
      close();
    },
    onError: (e: AppError) => {
      if (e.code === 'BLOCK_CONFLICTS') {
        const d = e.details as { conflicts?: Booking[] } | null;
        setConflicts(d?.conflicts ?? []);
      }
    },
  });

  function close() {
    setConflicts(null);
    create.reset();
    onClose();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(false);
  }

  const err = create.error as AppError | null;
  return (
    <>
      <Modal open={open && !conflicts} onClose={close} title="New facility block" wide footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" form="block-form" loading={create.isPending} disabled={!form.facilityId}>Create block</Button>
        </>
      }>
        <form id="block-form" className="form-grid" onSubmit={submit}>
          <div className="field">
            <label htmlFor="b-fac">Facility</label>
            <select id="b-fac" required value={form.facilityId} onChange={(e) => setForm({ ...form, facilityId: e.target.value, resourceId: '' })}>
              <option value="">Choose a facility</option>
              {facilities.data?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-res">Resource</label>
            <select id="b-res" value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} disabled={!facility}>
              <option value="">All resources</option>
              {facility && facility.resources.length > 1 && facility.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-sd">Start date</label>
            <input id="b-sd" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-st">Start time</label>
            <select id="b-st" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-ed">End date</label>
            <input id="b-ed" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-et">End time</label>
            <select id="b-et" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-reason">Reason</label>
            <select id="b-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as BlockReason })}>
              {(Object.keys(BLOCK_REASON_LABEL) as BlockReason[]).map((r) => <option key={r} value={r}>{BLOCK_REASON_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="b-note">Note (admins only)</label>
            <textarea id="b-note" rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </form>
        <p className="muted small">Users see blocked times as "Unavailable" with the reason category. Notes are never shown to users.</p>
        {err && err.code !== 'BLOCK_CONFLICTS' && <Alert tone="danger">{err.message}</Alert>}
      </Modal>

      <Modal open={open && !!conflicts} onClose={() => setConflicts(null)} title="This block affects existing bookings" wide footer={
        <>
          <Button variant="secondary" onClick={() => setConflicts(null)} disabled={create.isPending}>Go back</Button>
          <Button variant="danger" onClick={() => create.mutate(true)} loading={create.isPending}>
            Cancel {conflicts?.length} booking{conflicts?.length === 1 ? '' : 's'} and create block
          </Button>
        </>
      }>
        <Alert tone="warning">
          These bookings will be cancelled ("Cancelled by admin"). The users will see it in My Bookings. This cannot be undone.
        </Alert>
        <ul className="mini-list" data-testid="block-conflicts">
          {conflicts?.map((b) => (
            <li key={b.id}>
              <span className="mono">{b.date} {b.start_time}–{b.end_time}</span>
              <span>{b.facility.code === 'BASKETBALL_FUTSAL' ? b.activity.name : b.facility.name}</span>
              <span className="truncate">{b.user?.full_name} · {b.user?.email}</span>
              <StatusBadge status={b.effective_status} />
            </li>
          ))}
        </ul>
        {err && err.code !== 'BLOCK_CONFLICTS' && <Alert tone="danger">{err.message}</Alert>}
      </Modal>
    </>
  );
}

```


## FILE: web/scripts/check-bundle-secrets.mjs

```js
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


## FILE: supabase/templates/confirmation.html

```html
<h2>Welcome to DCU Active</h2>
<p>Confirm your email to start booking facilities.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup">Confirm my email</a></p>
<p>Or enter this verification code in DCU Active:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>The link and code expire in 1 hour. If you did not create a DCU Active account, you can ignore this email.</p>

```


## FILE: supabase/templates/recovery.html

```html
<h2>DCU Active password reset</h2>
<p><a href="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery">Choose a new password</a></p>
<p>Or enter this password reset code in DCU Active:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>The link and code expire in 1 hour. If you did not request a password reset, you can ignore this email.</p>

```


## FILE: supabase/config.toml (auth-related lines)

```toml
160:site_url = "http://localhost:4173"
164:additional_redirect_urls = ["http://localhost:4173", "http://localhost:5173", "http://127.0.0.1:4173", "http://127.0.0.1:5173"]
183:minimum_password_length = 8
186:password_requirements = "lower_upper_letters_digits_symbols"
227:enable_confirmations = true
233:otp_length = 6
235:otp_expiry = 3600
248:[auth.email.template.confirmation]
252:[auth.email.template.recovery]
271:enable_confirmations = false
320:otp_length = 6
```


## TEST RESULT SUMMARY (Playwright E2E, 35 tests)

```text
 Test Files  1 passed (1)
      Tests  23 passed (23)
✓ 2025 modules transformed.
✓ built in 907ms
bundle secret check passed (20 files)
  ✓   1 [android-chrome] › tests/e2e/auth.spec.ts:7:3 › Authentication journeys › register → verification email → confirm via link → signed in (any email domain)
  ✓   2 [android-chrome] › tests/e2e/auth.spec.ts:59:3 › Authentication journeys › register → verify with the 6-digit code
  ✓   3 [android-chrome] › tests/e2e/auth.spec.ts:80:3 › Authentication journeys › login errors and forgot/reset password via the emailed link
  ✓   4 [android-chrome] › tests/e2e/auth.spec.ts:107:3 › Authentication journeys › deactivated user is moved to "Account disabled" on the next server call
  ✓   5 [android-chrome] › tests/e2e/booking.spec.ts:28:3 › Booking journeys (Android-size viewport) › home lists the 6 facilities; availability comes from the backend
  ✓   6 [android-chrome] › tests/e2e/booking.spec.ts:43:3 › Booking journeys (Android-size viewport) › Tennis 30 / 60 / 90 minutes, and only durations that fit are offered
  ✓   7 [android-chrome] › tests/e2e/booking.spec.ts:83:3 › Booking journeys (Android-size viewport) › Basketball booking makes the shared court unavailable for Futsal
  ✓   8 [android-chrome] › tests/e2e/booking.spec.ts:106:5 › Booking journeys (Android-size viewport) › Air Hockey: tables are allocated automatically (2 spots, then full)
  ✓   9 [android-chrome] › tests/e2e/booking.spec.ts:106:5 › Booking journeys (Android-size viewport) › Foosball: tables are allocated automatically (2 spots, then full)
  ✓  10 [android-chrome] › tests/e2e/booking.spec.ts:136:3 › Booking journeys (Android-size viewport) › fair-use rules are explained: max upcoming bookings and once per facility per day
  ✓  11 [android-chrome] › tests/e2e/booking.spec.ts:161:3 › Booking journeys (Android-size viewport) › cancel a booking: confirmation, history and the slot is released
  ✓  12 [android-chrome] › tests/e2e/booking.spec.ts:182:3 › Booking journeys (Android-size viewport) › check-in: enabled inside the window, disabled before it, no-show shown in history
  ✓  13 [android-chrome] › tests/e2e/booking.spec.ts:208:3 › Booking journeys (Android-size viewport) › concurrency: slot taken between review and confirm shows the friendly message and refreshes
  ✓  14 [android-chrome] › tests/e2e/booking.spec.ts:225:3 › Booking journeys (Android-size viewport) › realtime: availability updates on screen when someone else books
  ✓  15 [android-chrome] › tests/e2e/booking.spec.ts:237:3 › Booking journeys (Android-size viewport) › offline: no stale availability and no booking actions
  ✓  16 [android-chrome] › tests/e2e/booking.spec.ts:251:3 › Booking journeys (Android-size viewport) › privacy: another user's identity never appears and their rows are not readable
  ✓  17 [desktop-chrome] › tests/e2e/a11y.spec.ts:20:3 › Accessibility baseline › no serious/critical axe violations on key screens (desktop and phone width)
  ✓  18 [desktop-chrome] › tests/e2e/a11y.spec.ts:49:3 › Accessibility baseline › keyboard only: log in, choose a time, review and confirm a booking
  ✓  19 [desktop-chrome] › tests/e2e/a11y.spec.ts:78:3 › Accessibility baseline › dialogs close with Escape and return to the page
  ✓  20 [desktop-chrome] › tests/e2e/admin.spec.ts:5:3 › Admin journeys (desktop Chrome 1440×900) › non-admins cannot reach admin screens; admins see the Admin entry
  ✓  21 [desktop-chrome] › tests/e2e/admin.spec.ts:14:3 › Admin journeys (desktop Chrome 1440×900) › dashboard shows operational metrics and utilization
  ✓  22 [desktop-chrome] › tests/e2e/admin.spec.ts:33:3 › Admin journeys (desktop Chrome 1440×900) › booking management: search, view identity, cancel with reason
  ✓  23 [desktop-chrome] › tests/e2e/admin.spec.ts:61:3 › Admin journeys (desktop Chrome 1440×900) › facility block: conflicts shown first, explicit confirmation, users see Unavailable, block removable
  ✓  24 [desktop-chrome] › tests/e2e/admin.spec.ts:113:3 › Admin journeys (desktop Chrome 1440×900) › user management: deactivate (enforced by the server) and reactivate
  ✓  25 [desktop-chrome] › tests/e2e/pwa.spec.ts:5:3 › PWA › manifest is valid for installation
  ✓  26 [desktop-chrome] › tests/e2e/pwa.spec.ts:19:3 › PWA › service worker registers, Chrome reports the app installable, backend traffic is never cached
  ✓  27 [desktop-chrome] › tests/e2e/pwa.spec.ts:43:3 › PWA › offline reload: app shell opens, shows the offline message, no availability
  ✓  28 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at iphone 390×844
  ✓  29 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at android 412×915
  ✓  30 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at tablet 820×1180
  ✓  31 [responsive] › tests/e2e/responsive.spec.ts:51:3 › user screens at desktop 1440×900
  ✓  32 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at desktop 1440×900
  ✓  33 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at tablet 820×1180
  ✓  34 [responsive] › tests/e2e/responsive.spec.ts:99:3 › admin screens at android 412×915
  ✓  35 [responsive] › tests/e2e/responsive.spec.ts:129:1 › auth screens on iPhone size
  35 passed (1.7m)
```
