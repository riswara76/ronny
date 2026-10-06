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
