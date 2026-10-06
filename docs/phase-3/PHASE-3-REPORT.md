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
