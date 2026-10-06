# DCU Active — Staging Setup (what you need to create)

> Indonesian step-by-step version for the chosen setup (own domain + Resend + Netlify): `PANDUAN-STAGING-ID.md`.

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
- Workflow files are already on the branch (CI runs), so no extra GitHub App permission is needed.

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
