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
