# DCU Active — Phase 2 Report: Backend & Database

Status: **Complete, waiting for approval**. The Flutter app (Phase 3) has not been started.

**Result:** the backend is implemented as 7 migrations. It passes:

- 211/211 pgTAP assertions;
- 6/6 HTTP integration and privacy tests;
- 9/9 HTTP concurrency tests: **1,600 race runs with zero violations**.

All of this ran on the real Supabase stack: Auth, JWT, PostgREST, Postgres 17, pg_cron and Mailpit.

The backend has **not yet been deployed to a hosted Supabase project**. That requires your project and settings (§8).

---

## 1. What was built

| Area | Where |
|---|---|
| Extensions, `private` schema, error helper, server clock, Jakarta time helpers | `supabase/migrations/20261006000100_foundation.sql` |
| Tables, constraints, indexes, status/immutability guards | `supabase/migrations/20261006000200_schema.sql` |
| Facilities, activities, resources, settings (reference data) | `supabase/migrations/20261006000300_reference_data.sql` |
| Auth integration (profile creation, email sync, registration hook), authorization helpers, audit helper | `supabase/migrations/20261006000400_auth_and_access.sql` |
| Booking engine: availability, create, cancel, check-in, my bookings, lifecycle sweep, Realtime pings | `supabase/migrations/20261006000500_booking_engine.sql` |
| Admin: bookings, blocks (conflict flow), users, roles, settings, dashboard, analytics | `supabase/migrations/20261006000600_admin.sql` |
| RLS, privileges, pg_cron job, Realtime channel policy | `supabase/migrations/20261006000700_security_and_jobs.sql` |
| Local stack config: email confirmation ON, 6-digit OTP templates, password ≥ 8 with letters + digits | `supabase/config.toml`, `supabase/templates/*.html` |
| pgTAP suites (6 files) | `supabase/tests/*.test.sql` (+ `_helpers.psql`) |
| HTTP integration, privacy and concurrency tests | `scripts/backend-tests/*.mjs` |
| One-command test runner | `scripts/run-backend-tests.sh` |
| Secure creation of 1 admin + 2 user test accounts | `scripts/create-test-users.mjs` |
| Raw test output (evidence) | `docs/phase-2/test-output/` |

### Data model (as approved in Phase 1)

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user: `full_name`, `email`, `role` (`USER` or `ADMIN`), `is_active`, deactivation audit |
| `facilities` | The 6 bookable facilities. `allowed_durations` is `{30,60,90}` for Tennis and Basketball/Futsal, `{30}` for the rest. |
| `activities` | 7 activities. Basketball and Futsal both belong to `BASKETBALL_FUTSAL`. |
| `resources` | The 8 physical resources: 1 Tennis court, 1 multipurpose court, 1 table-tennis table, 1 football field, 2 air-hockey tables, 2 foosball tables |
| `bookings` | `resource_id` sits directly on the booking. Generated columns: `time_range`, Jakarta `local_date`, `duration_minutes`. |
| `facility_blocks` | `resource_id` NULL means the whole facility. Removal is soft (`removed_at` / `removed_by`). |
| `admin_actions` | Append-only audit log (a trigger forbids UPDATE and DELETE) |
| `app_settings` | Single row: hours 06:00–21:00, 30-min slots, horizon 7, max 2 active, check-in −15/+15 |

### Database-level guarantees on `bookings`

- **`bookings_no_resource_overlap`**: an EXCLUDE (GiST) constraint. Two live bookings (`CONFIRMED` or `CHECKED_IN`) can never overlap on the same physical resource.
- **`bookings_no_user_overlap`**: an EXCLUDE (GiST) constraint. One user can never hold two live bookings that overlap in time, at any facility.
- **`bookings_one_per_facility_day`**: a partial unique index. One booking per user, per facility, per Jakarta date. Cancelled bookings don't count; NO_SHOW does.
- **CHECK constraints**:
  - the duration is 30, 60 or 90 minutes;
  - the start falls on a :00/:30 boundary;
  - cancellation fields are consistent with the status;
  - check-in fields are consistent with the status.
- **Triggers**:
  - only legal status transitions are allowed (`CONFIRMED → CHECKED_IN / CANCELLED / ADMIN_CANCELLED / NO_SHOW`, `CHECKED_IN → COMPLETED / ADMIN_CANCELLED`);
  - booking identity and times are immutable;
  - **bookings can never be deleted**.

## 2. RPC catalogue

Every RPC is `SECURITY DEFINER` with `search_path = ''`. Every RPC starts with `require_active_user()` or `require_admin()`. Those checks re-read the caller's profile from the database on every call, never from the JWT.

| RPC | Who | Purpose |
|---|---|---|
| `get_app_config()` | user | Server time, Jakarta today, last bookable date, hours, limits, check-in window, `is_admin` |
| `get_facilities_overview(date)` | user | Home cards: facilities, activities, slots left and blocked slots for the date |
| `get_availability(facility, date)` | user | 30 slots, each with `status` (PAST / MINE / AVAILABLE / BOOKED / FULL / BLOCKED / UNAVAILABLE), `available_count`/`total_count` ("1 left"), `max_duration_minutes` (lets the UI disable 60/90), `block_reason` |
| `create_booking(facility, activity, date, start_time, duration)` | user | Validate → lock user → lock facility resources → sweep stale no-shows → fair-use rules → allocate the first resource free for the whole range → insert |
| `cancel_booking(id)` | owner | Only `CONFIRMED` bookings, and only before the start time. The resource is released at commit. |
| `check_in(id)` | owner | Window is start −15 to start +15 minutes (inclusive). Errors are `CHECKIN_TOO_EARLY` (includes `opens_at_local`) and `CHECKIN_EXPIRED`. |
| `get_my_bookings(scope, limit, offset)` | user | `UPCOMING` or `HISTORY`, with `effective_status`, `can_cancel` and `can_check_in` computed on the server |
| `get_booking(id)` | owner or admin | Detail view. Admins also get the owner and the physical resource. |
| `admin_list_bookings(from, to, facility, status, search, limit, offset)` | admin | Filter by date, facility, status or user/code search. Includes owner and resource. |
| `admin_cancel_booking(id, reason)` | admin | Sets `ADMIN_CANCELLED` / `ADMIN` and writes to the audit log |
| `admin_create_block(facility, resource?, start date/time, end date/time, reason, note, cancel_conflicts)` | admin | **D6 two-step flow:** a first call raises `BLOCK_CONFLICTS` with the conflict list; a confirmed call cancels those bookings as `SYSTEM_BLOCK` |
| `admin_remove_block(id)`, `admin_list_blocks(include_past)` | admin | Only blocks that haven't ended can be removed |
| `admin_list_users(search, …)`, `admin_set_user_active(id, active, reason)`, `admin_set_user_role(id, role)` | admin | Deactivation frees future bookings (`SYSTEM_DEACTIVATION`). A last-admin guard locks all admin rows, so two admins can't remove each other. |
| `admin_update_settings(horizon, max_active, early, late)` | admin | Values are range-checked. Hours and slot size can only change through a migration. |
| `admin_dashboard(date)`, `admin_stats(from, to)` | admin | Bookings, upcoming, check-ins, no-shows over 7 days, active users, utilization per facility, by-day, by-hour, cancellations |

**Error contract:** every refusal is HTTP 400 `{"code":"P0001","message":"<CODE>","details":"<json or null>"}`. The codes are:

```
NOT_AUTHENTICATED  PROFILE_NOT_FOUND  ACCOUNT_DISABLED  EMAIL_NOT_VERIFIED  NOT_AUTHORIZED  INVALID_INPUT
FACILITY_NOT_FOUND  INVALID_ACTIVITY  INVALID_DURATION  INVALID_START_TIME  OUTSIDE_HOURS  OUTSIDE_HORIZON  PAST_SLOT
MAX_ACTIVE_BOOKINGS  ALREADY_BOOKED_TODAY  USER_OVERLAP  SLOT_UNAVAILABLE  SLOT_FULL  FACILITY_BLOCKED
BOOKING_NOT_FOUND  BOOKING_NOT_CANCELLABLE  CANNOT_CANCEL_STARTED  ALREADY_CHECKED_IN  CHECKIN_NOT_ALLOWED
CHECKIN_TOO_EARLY  CHECKIN_EXPIRED  BLOCK_CONFLICTS  BLOCK_NOT_FOUND  BLOCK_ALREADY_ENDED  BLOCK_IN_PAST
INVALID_BLOCK_TIME  INVALID_REASON  INVALID_RESOURCE  USER_NOT_FOUND  INVALID_ROLE  LAST_ADMIN  INVALID_SETTINGS
INVALID_FULL_NAME (sign-up)
```

## 3. Security / RLS design (as implemented)

- **No client writes to tables.** `anon` has no privileges at all. `authenticated` may `SELECT` (filtered by RLS) and `UPDATE` exactly one column, `profiles.full_name`. Every state change goes through an RPC.
- **RLS is on for every table:**
  - `bookings`: your own rows, or all rows if you are an admin.
  - `profiles`: your own row, or all rows if you are an admin.
  - `facility_blocks` and `admin_actions`: admins only.
  - Reference tables: active rows, readable by any signed-in user.
- **How a user sees "BOOKED" without seeing who booked:** availability comes only from `get_availability`, which returns aggregates and no identity columns. A test checks the exact column list. Embedding `bookings` through `facilities` or `resources` over REST is still filtered by RLS, and the HTTP tests prove it returns nothing for another user.
- **Admin authorization:** `private.is_admin()` reads the role from the database on every call. The tests prove promotion and demotion take effect **immediately with the same JWT**. A sign-up can never create an admin, because the trigger forces role `USER` even when metadata says `ADMIN`.
- **Deactivation:** `require_active_user()` rejects a deactivated account on its very next RPC call, with a JWT that is still valid. `create_booking` also re-checks the flag after taking the profile lock, which closes the race between deactivation and an in-flight booking.
- **Unverified email:**
  - Auth refuses to issue a session ("Confirm email" is ON).
  - As a backstop, every RPC also checks `auth.users.email_confirmed_at`.
- **Realtime:** a private `availability` topic. The payload is only `{facility_id, from_date, to_date}`, and only authenticated users may subscribe.
- **Clock override for tests:** `private.now()` honours `dcu.test_now` **only** when the database session was opened by the `postgres` superuser. Requests from the app arrive as `authenticator` through PostgREST, so a user can never move the clock.

## 4. Test results

Run them with: `./scripts/run-backend-tests.sh`. It resets the local DB, then runs pgTAP, HTTP integration and HTTP concurrency.

### 4.1 pgTAP — 211 / 211 pass

| Suite | Assertions | Covers |
|---|---|---|
| `01_schema` | 27 | Reference data (6/7/8, durations, shared court), defaults, RLS on every table, constraints present, anon has zero privileges, the only writable column, every RPC is SECURITY DEFINER with pinned search_path, cron job, realtime policy, Jakarta conversion |
| `02_auth_profiles` | 14 | Sign-up forces USER; any email domain; missing name rejected; email sync; unverified → `EMAIL_NOT_VERIFIED`; no identity; deactivated → `ACCOUNT_DISABLED`; profile column privileges |
| `03_booking_rules` | 55 | 30/60/90; invalid durations per facility; alignment; hours incl. 20:30+60 and 20:00+90; 30 slots/day; horizon today+7 OK / +8 and yesterday rejected; past slot; max 2; once-per-facility-day (cancellation frees it); same-user overlap; 30/60/90 head, tail and inside overlaps; `max_duration` blocks fragmentation; Basketball vs Futsal; D7; Air Hockey and Foosball allocation (Table 1 → Table 2 → `SLOT_FULL`) |
| `04_lifecycle` | 33 | Cancel releases immediately; cannot cancel others', twice, or after start; check-in at 09:44:59 too early, 09:45 OK, 10:15 OK, 10:15:01 expired; NO_SHOW effective before the job; no-show frees quota; **D5: no-show releases 10:30–11:30 of a 10:00–11:30 booking**; sweep → NO_SHOW / COMPLETED; illegal transitions, edits and deletes blocked |
| `05_admin` | 60 | Every admin RPC denied to users; owner visibility; **D6 conflict flow** (refused, nothing written → confirmed → SYSTEM_BLOCK + audit); BLOCKED status and reason; single-table block → FULL; removal; ended block can't be removed; admin cancel; deactivation cancels future bookings; last-admin guard; promotion and demotion take effect immediately; settings validation; dashboard and stats; audit log immutable |
| `06_rls_privacy` | 22 | User B sees 0 of A's bookings by table, id filter, user filter, `get_booking`, `get_my_bookings`; profiles, blocks and audit hidden; availability has no identity columns; direct INSERT/UPDATE denied; anon denied; admin sees all |

### 4.2 HTTP integration & privacy (real Auth + PostgREST) — 6 / 6 pass

1. **Registration (D1, D2).**
   - A `@gmail.com` sign-up works.
   - Login before verification is refused with `email_not_confirmed`.
   - The 6-digit code is read from the verification email.
   - A wrong code is refused; the right code creates a session.
   - The new account's role is `USER`.
2. **Password reset by emailed code.** Afterwards, the user can log in with the new password.
3. **Privacy.** User B gets nothing of A's through any of these paths:
   - table reads, id and user filters, embedded `facilities→bookings` and `resources→bookings`;
   - `get_booking`, `cancel_booking`, `check_in`;
   - the admin RPCs, `admin_actions`, `facility_blocks`;
   - the availability payload, which contains no trace of A.
4. **Direct writes refused.** Direct INSERT on bookings, role escalation and settings changes are refused (401/403). Renaming yourself is allowed.
5. **Signed-out callers** get 401 on tables and RPCs.
6. **Deactivation with the same live JWT.** The user's future booking is released, and the next `create_booking` and `get_my_bookings` calls return `ACCOUNT_DISABLED`.

### 4.3 Concurrency — 1,600 race runs, 0 violations

Each scenario ran **100 iterations with a lock barrier plus 100 free-running**.

- **Barrier mode:** the harness holds the row lock, fires every request, and waits until PostgreSQL reports all of them blocked on that lock (*min waiting* below). It then releases, so every request hits the critical section at the same instant.
- **After every iteration** the harness checks three storage invariants: no resource overlap, no user overlap, and no live booking under an active block.

| # | Scenario | Runs | Outcome distribution | Min waiting | Result |
|---|---|---|---|---|---|
| 1 | 2 users → 1 Tennis court, 18:00–19:00. Winner cancels, then the loser books immediately. | 200 | A won 133, B won 67. Always exactly 1 OK + 1 `SLOT_UNAVAILABLE`. The rebook after cancel succeeded 200/200. | 2/2 | ✅ |
| 2 | 3 users → 2 Air Hockey tables | 200 | Always 2 OK on **different tables** + 1 `SLOT_FULL`. The loser varied (42/77/81). | 3/3 | ✅ |
| 3 | 3 users → 2 Foosball tables | 200 | Same as #2 (loser 34/91/75) | 3/3 | ✅ |
| 4 | Same user fires Tennis 18:00–19:00, Foosball 18:30, and Table Tennis 19:00 at once. Then the same facility twice on one day. | 200 | Always 2 OK and never the overlapping pair (tennis+TT 123, foosball+TT 77). Same facility twice: 1 OK + `ALREADY_BOOKED_TODAY`. | 3/3 | ✅ |
| 5 | Booking vs admin block (confirm off / on, alternating) | 200 | Booking first, block refused: 71. Booking first, confirmed block cancelled it: 76. Block first, booking refused: 53. Never two live conflicting rows. | 2/2 | ✅ |
| 6 | Cancellation racing a new booking for the same slot | 200 | Rebook succeeded directly 97; saw the slot still held, then the immediate retry succeeded 103. Always exactly 1 live booking. | — | ✅ |
| 7 | 30/60/90 mix on one court (18:00/90, 18:30/60, 19:00/30, 19:30/30) | 200 | Winners never overlap. 19:30 (which overlaps nothing) succeeded 200/200. | 4/4 | ✅ |
| 8 | Basketball vs Futsal, same court and time | 200 | Basketball 118, Futsal 82. Always exactly one. | 2/2 | ✅ |

Raw output: `docs/phase-2/test-output/http-concurrency.txt` and `concurrency-results.json`.

### 4.4 Static checks

- `supabase db lint` (plpgsql_check) finds no errors and no warnings.
- The only remaining "extra" notes are intentional:
  - unused parameters of the V1 registration hook;
  - variables that exist only to run the authorization check.
- The pg_cron job `dcu-booking-lifecycle` was observed executing (`succeeded` in `cron.job_run_details`).

## 5. Deviations from the approved Phase 1 design

| # | Change | Why |
|---|---|---|
| 1 | **D1 now allows open registration**, as you decided. `private.assert_registration_allowed()` is the single hook for future domain lists, invitation codes, whitelists or SSO. | Your Phase 2 decision; booking code untouched |
| 2 | "My bookings" is served by the RPCs `get_my_bookings` / `get_booking` instead of a SQL view | One place computes `effective_status`, `can_cancel` and `can_check_in`. Avoids a security-definer view. |
| 3 | Users don't read `facility_blocks` at all. Phase 1 proposed a restricted view. They see blocks only as `BLOCKED` slots with a reason category. | Admin notes and identity can never leak; simpler |
| 4 | The lifecycle job runs **every minute**, not every 5 | Cheap; stored statuses stay closer to real time. Correctness never depended on the job. |
| 5 | Slot statuses are `PAST, MINE, AVAILABLE, BOOKED, FULL, BLOCKED, UNAVAILABLE` | `MINE` marks the caller's own booking. `BLOCKED` is "Admin blocked" (shown as Unavailable). `UNAVAILABLE` = facility has no active resource. |
| 6 | Added `private.now()`, a test-clock override honoured only for `postgres` sessions | Needed for deterministic tests of check-in windows, no-show and past slots |
| 7 | Reference data lives in a migration, not `seed.sql` | `supabase db push` does not run `seed.sql`; production needs the facilities |
| 8 | Blocks take Jakarta date + time parts and may span several days | Multi-day maintenance is realistic; times are still 30-min aligned |
| 9 | Password policy: at least 8 characters, letters + digits (local config) | Supabase's default of 6 is weak. **This needs your OK**; it can be relaxed. |
| 10 | Postgres 17 (current Supabase default) | Phase 1 said "15+" |

No change to the concurrency model, RLS model, schema shape, or timezone strategy.

## 6. Known issues and limitations

1. **Not yet deployed to hosted Supabase.** Everything ran on the local Supabase stack. A hosted project needs the dashboard settings in §8; I can't create it without your account.
2. **D3 (email sending) is still open.** Verification and reset emails work locally (Mailpit). On hosted Supabase the built-in mailer only reaches project team members and is rate-limited. **Custom SMTP is needed before real users register.**
3. **Realtime is configured but not yet exercised end-to-end.** The broadcast trigger and channel policy are in place and the policy is tested. A real WebSocket subscription test belongs to Phase 3, when the client exists. Correctness does not depend on Realtime.
4. **A deactivated user can still sign in to Auth.** They can still read their own past bookings through RLS, but every RPC refuses them. Blocking the sign-in itself needs the Auth admin API (a small Edge Function); that is deferred.
5. **Advisor check on hosted.** Supabase's Security/Performance Advisor runs on hosted projects; I'll run it after deployment.
6. **Test environment note.** This sandbox can't reach AWS ECR, so the CLI was pointed at the identical Supabase images on Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`). This affects only this machine; the default local ports were moved to 553xx.

## 7. How to run

```bash
supabase start                       # local stack (Docker)
./scripts/run-backend-tests.sh       # reset + pgTAP + HTTP integration + concurrency
CONCURRENCY_ITERATIONS=20 ./scripts/run-backend-tests.sh   # quicker run
```

## 8. What you will need to configure on the hosted project (before Phase 3 testing)

| What | Where | Never share / commit |
|---|---|---|
| Create a Supabase project, region near Jakarta (e.g. Singapore) | supabase.com dashboard | DB password |
| Apply migrations: `supabase link --project-ref <ref>` then `supabase db push` | Your machine (or a short-lived access token you give me and revoke afterwards) | Access token |
| Auth → Email: **Confirm email ON**, OTP length 6, minimum password 8, letters + digits | Dashboard → Authentication → Providers / Policies | — |
| Email templates: paste `supabase/templates/confirmation.html` and `recovery.html` (they use `{{ .Token }}`) | Dashboard → Authentication → Email Templates | — |
| Custom SMTP (D3) | Dashboard → Project Settings → Auth → SMTP | SMTP password |
| Test accounts: `node scripts/create-test-users.mjs` with env vars | Your machine | Secret key, passwords |
| For the app: project URL + **publishable** key | Dashboard → Project Settings → API | Secret / service-role key |

PHASE 2 COMPLETE — WAITING FOR APPROVAL.
