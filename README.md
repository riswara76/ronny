# DCU Active

Internal sports-facility booking for DCU participants and trainers. It is a responsive web app (PWA) backed by Supabase.

| Part | Where | Docs |
|---|---|---|
| Backend: PostgreSQL schema, RPC booking engine, RLS, tests | `supabase/` | `docs/phase-2/PHASE-2-REPORT.md` |
| Web / PWA client (React + TypeScript) | `web/` | `web/README.md`, `docs/phase-3/PHASE-3-REPORT.md` |
| Architecture | `docs/` | `docs/PHASE-1-ARCHITECTURE.md`, `docs/architecture/*` |
| Test runners | `scripts/` | `run-backend-tests.sh`, `run-web-tests.sh` |

Quick start (local):

```bash
supabase start                      # Docker required
./scripts/run-backend-tests.sh      # backend: pgTAP + HTTP + concurrency
cd web && npm ci && cp .env.example .env.local   # fill from `supabase status -o env`
npm run dev
```

Never commit secrets. The browser app only uses the Supabase URL and the **publishable** key.
