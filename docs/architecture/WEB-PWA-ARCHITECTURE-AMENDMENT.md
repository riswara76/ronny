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
