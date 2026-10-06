# DCU Active — Phase 1: Product & Technical Architecture

> **Amended 2026-10-06:** the primary client is now a responsive Web/PWA (React + TypeScript), not an Android APK.
> See `docs/architecture/WEB-PWA-ARCHITECTURE-AMENDMENT.md` and `docs/architecture/WEB-FRONTEND-DECISION.md`.
> The backend design in this document is unchanged.


Status: **Draft for approval** · Scope: design only (no production code, no APK)
Prototype evidence: [`docs/phase-1/concurrency-prototype.sql`](phase-1/concurrency-prototype.sql)

---

## 0. Decisions needed before Phase 2

These are the items where my default materially changes security, booking logic, or UX. Each has a recommended default; Phase 2 proceeds on the default unless you override it.

| # | Decision | Recommended default | Why it matters |
|---|---|---|---|
| D1 | **Who may register?** | Restrict sign-up server-side to an allow-list of DCU email domains (you supply the domain(s)). | The publishable Supabase key is inside the APK and can be extracted, so anyone could call `signUp` directly and book DCU courts. "Internal" means nothing without a server-side restriction. |
| D2 | **Email verification method** | A 6-digit **code** entered in the app (the email also carries the link). Same for password reset. | Corporate mail scanners often "pre-click" links, which consumes the one-time token. Codes also avoid Android deep-link setup and work when the email is opened on a laptop. This changes the flow you described ("user opens verification link"). |
| D3 | **Email sending (SMTP)** | Use a custom SMTP provider (DCU mail server, Resend, SendGrid, etc.). | Supabase's built-in mailer is for testing only. It is heavily rate-limited and, on current plans, only delivers to the project's team members. Without custom SMTP, real users won't get verification emails. |
| D4 | **"7 days in advance"** | Bookable dates are **today through today + 7** (8 selectable dates), Jakarta calendar. | Your text says "Today through +7 days". Confirm you don't mean 7 dates in total. |
| D5 | **Does a NO_SHOW release the rest of the slot?** | **Yes.** At start + 15 min an unclaimed booking becomes NO_SHOW and the remaining time is released (e.g. a 90-min Tennis no-show at 18:00 frees 18:30–19:30). | This gets real use out of the court. The alternative leaves a court sitting empty but showing as BOOKED. |
| D6 | **Admin block over existing bookings** | Creating the block shows the conflicting bookings. The admin must confirm, and those bookings become `ADMIN_CANCELLED` with type `SYSTEM_BLOCK`. | The alternative is to refuse the block, which makes urgent maintenance impossible. Note that users only see the cancellation in-app, because V1 has no push notifications. |
| D7 | **Basketball and Futsal on the same day** | They count as the **same facility** for the once-per-day rule (one booking per user per day on that court). | They share a facility record. Confirm this is the fairness rule you want. |
| D8 | **Booking a slot already in progress** (e.g. 18:00 slot at 18:10) | **Not allowed.** A slot is bookable only if its start is in the future. | This follows directly from "past slots cannot be booked". |
| D9 | **Supabase plan** | Free tier for Phases 2–4; decide on Pro before go-live. | Free projects pause after about 7 days of no activity, which would take the app down until someone un-pauses it in the dashboard. |

Environment blockers found (details in §I):
- **Android SDK host blocked.** `dl.google.com` is denied by this cloud environment's network policy, so I cannot build the APK here in Phase 5 until it is allow-listed. Flutter SDK, pub.dev, Maven Central and maven.google.com are reachable.
- **No emulator.** The container has no `/dev/kvm`, so Phase 3 "emulator evidence" will be screenshots from widget/golden tests or a Flutter web build, not a real Android emulator.

---

## A. Requirement review

### A.1 Understanding (condensed)
- This is an internal, Android-first Flutter app for booking 6 facilities that sit on 8 physical resources, open 06:00–21:00 Asia/Jakarta in 30-minute slots.
- There are two roles: USER and ADMIN. Participants and trainers are identical for booking purposes.
- The core guarantees are:
  - a resource can never be double-booked, even under simultaneous requests;
  - multi-table facilities are allocated automatically;
  - fair-use rules are enforced on the server;
  - users never see other users' identities.
- Supporting features: check-in, no-show handling, cancellation, history, admin blocks/users/analytics.
- The deliverable is a debug APK plus documentation, built through five gated phases.

### A.2 Ambiguities, contradictions, and resolved assumptions
| Topic | Resolution (assumption) |
|---|---|
| "Active/future booking" (max 2) | A booking counts if it is `CONFIRMED` and its check-in window has not expired, **or** it is `CHECKED_IN` and has not ended. NO_SHOW, COMPLETED, and cancelled bookings never count. |
| Max duration "30 min" vs. slot grid | A standard facility takes exactly 1 slot. Tennis and Basketball/Futsal take 1–3 consecutive slots. Bookings must start on :00 or :30. |
| "No booking beyond 21:00" | `end ≤ 21:00`. On extended facilities the last 90-min start is 19:30 and the last 60-min start is 20:00. |
| "Once per facility per day" | "Day" means the Jakarta calendar date of the booking start. Cancelled bookings do **not** count (the user may rebook). NO_SHOW and COMPLETED **do** count. |
| User overlap across facilities | Enforced with a database constraint, not only application code (§E). |
| Check-in for CHECKED_IN → cancel? | Not allowed. Cancellation requires `CONFIRMED` and `now < start`. |
| COMPLETED transition | `CHECKED_IN` becomes `COMPLETED` when `now ≥ end`. |
| Facility blocks vs. bookings | Blocks get their own table (as you suggested). They are never shown as BOOKED to users; they show as UNAVAILABLE with the reason category (no person data). |
| Admin booking for themselves | Same rules as a USER. V1 has no "admin books on behalf of a user" feature (not requested). |
| Deactivating a user | The user is blocked from every RPC immediately. Their future bookings become `ADMIN_CANCELLED` (type `SYSTEM_DEACTIVATION`) so the resources are freed. |
| Booking ID shown to users | Users see a short human code (e.g. `DCU-7K3P9Q`). The UUID stays internal. |
| Device clock | Never trusted. All rule checks use the database `now()`. The app gets the server time and computes a clock offset to display countdowns and enable/disable buttons. |

### A.3 Important edge cases (all covered by Phase 2 tests)
- Two users take the last slot at the same instant (Tennis): exactly one succeeds.
- Three users, two tables, same instant (Air Hockey/Foosball): exactly two succeed, and each table is used once.
- One user books two different facilities from two devices at the same instant, with overlapping times: one succeeds. The same protection applies to the "max 2" and "once per day" rules (per-user serialization, §E.3).
- A 90-min Tennis booking where the 2nd slot is blocked by an admin: rejected as `SLOT_UNAVAILABLE`, not partially booked.
- A block is created while a booking for the same resource is in flight: they are serialized (§E.4).
- A cancellation at 17:59:59 for an 18:00 booking succeeds; at 18:00:00 it is rejected (server time).
- A booking at 20:30 for 60 min is rejected because it would end after 21:00.
- Date boundaries are computed in Jakarta time, not UTC. 06:00 WIB is 23:00 UTC the previous day, so a naive UTC date would assign the 06:00 slot to the wrong day for the once-per-day rule.
- A user is deactivated while holding a valid JWT: rejected on the next call (§F).
- The app is offline: no booking can be attempted, and there are no queued writes.

---

## B. System architecture

```
┌──────────────────────────── Android device ────────────────────────────┐
│ Flutter app (Dart, Material 3)                                          │
│  presentation ─► state (Riverpod) ─► repositories ─► supabase_flutter   │
│  holds: publishable key ONLY. No business authority.                    │
└─────────────┬──────────────────┬────────────────────┬───────────────────┘
              │ HTTPS (Auth)     │ HTTPS (PostgREST)  │ WSS (Realtime)
┌─────────────▼──────┐ ┌─────────▼──────────────┐ ┌───▼──────────────────┐
│ Supabase Auth      │ │ PostgREST              │ │ Realtime             │
│ sign-up, OTP code, │ │ exposes: SELECT via    │ │ private broadcast    │
│ JWT, reset         │ │ RLS + RPC functions    │ │ "availability        │
│ + sign-up hook     │ │                        │ │  changed" pings      │
└─────────┬──────────┘ └─────────┬──────────────┘ └───▲──────────────────┘
          │                      │                    │ realtime.send()
┌─────────▼──────────────────────▼────────────────────┴───────────────────┐
│ PostgreSQL 15+                                                           │
│  public schema: tables (RLS ON) + RPCs (SECURITY DEFINER, search_path='')│
│  private schema: helpers (is_admin, sweep, settings) — not exposed       │
│  constraints: exclusion (resource & user overlap), unique (1/day), FKs   │
│  pg_cron: lifecycle job every 5 min (NO_SHOW / COMPLETED)                │
└──────────────────────────────────────────────────────────────────────────┘
```

### Responsibilities
| Layer | Owns | Never does |
|---|---|---|
| **Flutter** | UI, navigation, input shaping, showing server-computed availability, Jakarta-time display, mapping error codes to friendly text, offline detection | decide availability, pick resources, enforce rules, send timestamps for rule checks, decide admin access (it only hides UI) |
| **Supabase Auth** | identity, password hashing, email OTP verification, JWT issuance, password reset; **sign-up hook** enforces the domain allow-list (D1) | store app data |
| **PostgreSQL** | source of truth, integrity constraints that make double-booking impossible even if a function has a bug | — |
| **RLS** | read isolation: own bookings/profile only; admins all; reference data readable; **no direct INSERT/UPDATE/DELETE grants** on bookings, blocks, settings, admin_actions | — |
| **RPC functions** | every state change: create/cancel/check-in, admin actions, availability calculation, analytics; all validation; audit logging | trust any client-supplied user id, role, or time |
| **Realtime** | best-effort "something changed for facility X on date Y" ping, so open screens refetch | carry booking data or decide anything. Correctness never depends on it. |
| **pg_cron** | timely NO_SHOW/COMPLETED transitions | — RPCs also sweep lazily, so a late cron run never causes a wrong decision |

### Rules enforced server-side (all of them)
Operating hours, 30-min alignment, allowed durations per facility, consecutive free slots, booking horizon, start must be in the future, max 2 active, once per facility per day, no overlapping bookings for the same user, resource conflict, blocks, verified email, active account, cancellation window, check-in window, no-show transition, and admin authorization.

Flutter repeats a subset of these **for UX only**, e.g. greying out a 90-min chip that the server already marked impossible.

---

## C. Database design

### C.1 Changes from your proposed entity list
I disagree with two of the proposed tables. Here is what I would do instead.

1. **Drop `booking_resources`; put `resource_id` directly on `bookings`.**
   - A V1 booking always occupies exactly one resource. With the resource on the booking row, the whole double-booking guarantee becomes **one exclusion constraint** on one table, filtered by the booking's status.
   - With a separate allocation table, the constraint cannot see the booking's status. You would have to copy the status into the allocation table and keep it in sync with triggers. That sync is exactly where double-booking bugs hide.
   - If you later need multi-resource bookings, add the table then. The migration is mechanical.
2. **Drop `facility_activities`; give `activities` a `facility_id`.**
   - No activity belongs to more than one facility, so a many-to-many table would only add a join and a way to misconfigure data.
   - A composite FK (`bookings(facility_id, activity_id) → activities(facility_id, id)`) makes it impossible to store "Futsal at the Tennis court".

### C.2 Entity relationships
```
auth.users 1─1 profiles 1─* bookings *─1 facilities 1─* activities
                              │  *─1 activities (composite FK with facility)
                              └─ *─1 resources  (composite FK with facility)
facilities 1─* resources
facilities 1─* facility_blocks *─0..1 resources   (NULL resource = whole facility)
profiles 1─* admin_actions (admin_id)
app_settings: single row
```

### C.3 Tables

**`profiles`** — app-side user record (one per auth user)
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK**, FK → auth.users(id) ON DELETE CASCADE | |
| full_name | text NOT NULL | CHECK length 2–100 |
| email | text NOT NULL | Copied from auth.users by trigger, so admins can search it |
| role | text NOT NULL DEFAULT 'USER' | CHECK in ('USER','ADMIN'); **users have no UPDATE grant on this column** |
| is_active | boolean NOT NULL DEFAULT true | |
| created_at, updated_at | timestamptz | |

- Indexes: `lower(email)`, `role`.
- Created by an `AFTER INSERT` trigger on `auth.users`. The trigger takes `full_name` from sign-up metadata and **always sets `role = 'USER'`**.

**`facilities`** — what users choose
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK** | |
| code | text UNIQUE | `TENNIS`, `BASKETBALL_FUTSAL`, `TABLE_TENNIS`, `FOOTBALL`, `AIR_HOCKEY`, `FOOSBALL` |
| name | text | |
| icon_key | text | Maps to a Material icon in the app |
| allowed_durations | int[] NOT NULL | `{30,60,90}` or `{30}`. CHECK: non-empty, each value ∈ {30,60,90} |
| sort_order | int | |
| is_active | bool | |
| created_at, updated_at | timestamptz | |

**`activities`**
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK** | |
| facility_id | uuid FK → facilities | |
| code | text | |
| name | text | |
| sort_order | int | |
| is_active | bool | |

- Constraints: UNIQUE (facility_id, code); UNIQUE (facility_id, id) as the target of the composite FK.
- Every facility has ≥ 1 activity. The app skips the activity step when there is exactly one.

**`resources`** — physical things
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK** | |
| facility_id | uuid FK | |
| name | text | |
| sort_order | int | Allocation preference |
| is_active | bool | |

- Constraints: UNIQUE (facility_id, name); UNIQUE (facility_id, id).

**`bookings`**
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK** default gen_random_uuid() | |
| booking_code | text UNIQUE NOT NULL | Short human code |
| user_id | uuid NOT NULL FK → profiles ON DELETE RESTRICT | History is never cascaded away |
| facility_id, activity_id | uuid NOT NULL | Composite FK → activities(facility_id, id) |
| resource_id | uuid NOT NULL | Composite FK (facility_id, resource_id) → resources(facility_id, id) |
| start_at, end_at | timestamptz NOT NULL | |
| time_range | tstzrange GENERATED `[start_at, end_at)` STORED | |
| local_date | date GENERATED `(start_at AT TIME ZONE 'Asia/Jakarta')::date` STORED | |
| duration_minutes | int GENERATED | |
| status | text NOT NULL | CHECK in (CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, NO_SHOW, ADMIN_CANCELLED) |
| checked_in_at | timestamptz | |
| check_in_method | text | `'BUTTON'` now; `'QR'` later |
| cancelled_at | timestamptz | |
| cancelled_by | uuid FK → profiles | |
| cancellation_type | text | CHECK in (USER, ADMIN, SYSTEM_BLOCK, SYSTEM_DEACTIVATION) |
| cancellation_reason | text | |
| status_changed_at, created_at, updated_at | timestamptz | |

Constraints on `bookings`:
- `end_at > start_at`
- `duration_minutes IN (30, 60, 90)`
- Start aligned to :00/:30 Jakarta time
- Status/audit consistency, e.g. cancelled statuses ⇔ `cancelled_at` IS NOT NULL; CHECKED_IN ⇒ `checked_in_at` IS NOT NULL
- **`no_resource_overlap`**: `EXCLUDE USING gist (resource_id WITH =, time_range WITH &&) WHERE (status IN ('CONFIRMED','CHECKED_IN'))`
- **`no_user_overlap`**: `EXCLUDE USING gist (user_id WITH =, time_range WITH &&) WHERE (status IN ('CONFIRMED','CHECKED_IN'))`
- **`one_per_facility_day`**: UNIQUE (user_id, facility_id, local_date) WHERE status NOT IN ('CANCELLED','ADMIN_CANCELLED')

Indexes on `bookings`: (user_id, start_at DESC); (start_at); (status, start_at) for the lifecycle sweep; the two GiST indexes come from the constraints.

Hours, horizon, max-2, and past-time rules are **not** table constraints. They depend on `now()` or on settings, which CHECK constraints must not reference. They live in the RPC.

**`facility_blocks`**
| Column | Type | Notes |
|---|---|---|
| id | uuid **PK** | |
| facility_id | uuid FK | |
| resource_id | uuid NULL | NULL = every resource of the facility. Composite FK with facility. |
| start_at, end_at | timestamptz | |
| time_range | tstzrange GENERATED | |
| reason_type | text | CHECK in (MAINTENANCE, DCU_PROGRAM, PRIVATE_EVENT, OTHER) |
| note | text | |
| created_by | uuid FK | |
| created_at | timestamptz | |
| removed_at, removed_by | | Soft-remove for audit |

- Index: GiST (facility_id, time_range) WHERE removed_at IS NULL.
- Blocks may overlap each other; that's harmless.

**`admin_actions`** — append-only audit
| Column | Type |
|---|---|
| id | bigint identity **PK** |
| admin_id | uuid FK |
| action | text |
| target_type | text |
| target_id | uuid |
| details | jsonb |
| created_at | timestamptz |

- Index: (created_at DESC), (target_type, target_id).
- No UPDATE/DELETE grants to anyone except the owner role.

**`app_settings`** — exactly one row (`id boolean PK DEFAULT true CHECK (id)`)
| Column | Default | Editable in app by admin? |
|---|---|---|
| booking_horizon_days | 7 | yes |
| max_active_bookings | 2 | yes |
| checkin_early_minutes | 15 | yes |
| checkin_late_minutes | 15 | yes |
| open_time / close_time | 06:00 / 21:00 | **migration only** |
| slot_minutes | 30 | **migration only** |
| allowed_email_domains | text[] (D1) | migration only |
| updated_at, updated_by | | |

The business timezone is a single SQL constant (`'Asia/Jakarta'`), not a setting. Changing it would silently re-interpret every stored booking.

**Settings balance (Prompt §27).**
- Values that only change *future decisions* (horizon, max-2, check-in window) are admin-editable. They are typed columns with CHECK ranges, not a key/value table.
- Values that change the *meaning of existing data* (hours, slot size, timezone) are migration-only. Changing them needs a deliberate data review.
- Per-facility durations live on `facilities.allowed_durations`.

### C.4 The model with concrete data
| Facility (`code`) | Activities | Resources | allowed_durations |
|---|---|---|---|
| Tennis (`TENNIS`) | Tennis | Tennis Court | {30,60,90} |
| Basketball / Futsal (`BASKETBALL_FUTSAL`) | Basketball, Futsal | Multipurpose Court 1 | {30,60,90} |
| Table Tennis | Table Tennis | Table Tennis Table | {30} |
| Football | Football | Football Field | {30} |
| Air Hockey (`AIR_HOCKEY`) | Air Hockey | Air Hockey Table 1, Air Hockey Table 2 | {30} |
| Foosball (`FOOSBALL`) | Foosball | Foosball Table 1, Foosball Table 2 | {30} |

- **Tennis 18:00–19:00**
  - Stored row: `resource = Tennis Court`, `time_range = [11:00Z, 12:00Z)`.
  - Any other active booking whose range overlaps on that resource violates `no_resource_overlap`.
- **Basketball 18:00–19:00, then Futsal 18:00–19:00**
  - Both activities belong to `BASKETBALL_FUTSAL`, which has one resource (`Multipurpose Court 1`).
  - The Futsal attempt finds no free resource, so the slot shows BOOKED for both activities.
  - Activity is just a label on the booking; it does not affect availability.
- **Air Hockey 18:00, Table 1 booked**
  - Availability counts 1 of 2 resources free, so the slot shows "AVAILABLE · 1 left".
  - The next booking is allocated Table 2, the first free resource by `sort_order`.
  - A third request finds none free: `SLOT_FULL`, and the slot shows FULL.
- **Foosball**: identical mechanism to Air Hockey, different facility. Its locks never contend with Air Hockey's.

---

## D. Booking engine

All times below are Jakarta local. `S` = app_settings. `now` = database `now()`.

### D.1 `get_availability(facility_id, date)` → per-slot rows + `server_now`
1. **Validate the date.** Reject dates outside `[today_jkt, today_jkt + S.booking_horizon_days]`.
2. **Generate slots.** One slot every 30 minutes from `open_time` to `close_time - 30 min`, giving 30 slots (06:00 … 20:30).
3. **Classify each slot against active resources:**
   - `free_count` = resources with no active booking and no active block overlapping `[slot, slot+30)`.
   - `blocked_count` = resources covered by a block.
4. **Derive the status:**
   - `PAST` if `slot_start ≤ now`.
   - else `MINE` if the caller holds an active booking covering the slot. Only the caller's own rows are checked, so this leaks nothing.
   - else `AVAILABLE` (with `free_count`/`total`) if `free_count > 0`.
   - else `BLOCKED` (shown to users as "Unavailable", with the reason category) if every resource is blocked.
   - else `BOOKED` (single-resource facility) or `FULL` (multi-resource).
5. **Compute `max_duration`.** The largest allowed duration *d* such that **one single resource** is free and unblocked for all of `[slot, slot+d)` and `slot + d ≤ close_time`.
   - This is what lets the UI disable 60/90 chips up front.
   - It is computed per resource, so for multi-resource facilities "consecutive" means consecutive on one table.
6. **Return.** Times, status, counts, max_duration, and the reason category for blocks. The output contains **no user IDs, names, or booking IDs** (apart from the caller's own).

### D.2 `create_booking(facility_id, activity_id, date, start_time, duration_minutes)`
The client sends local date and time **parts**, never timestamps. Steps 3–6 are the concurrency-critical section.

1. **Identity and status.**
   - `uid := auth.uid()`; reject if NULL.
   - Reject if the email is unverified (`auth.users.email_confirmed_at IS NULL`).
   - Reject if `profiles.is_active = false`.
2. **Input validation.**
   - Facility is active.
   - The activity belongs to the facility.
   - `duration ∈ facility.allowed_durations`.
   - `start_time` is on a :00/:30 boundary.
   - `start ≥ open_time` and `start + duration ≤ close_time`.
   - `date` is within the horizon.
   - Compute `start_at := (date + start_time) AT TIME ZONE 'Asia/Jakarta'`; require `start_at > now`.
3. **Lock the user.** `SELECT … FROM profiles WHERE id = uid FOR UPDATE` serializes this user's own concurrent requests.
4. **Lazy sweep.** Mark this user's expired CONFIRMED bookings as NO_SHOW and this facility's as needed (§D.6), so stale statuses never block a decision.
5. **Per-user rules.**
   - Active count must be `< S.max_active_bookings`, else `MAX_ACTIVE_BOOKINGS`.
   - No non-cancelled booking on (facility, local_date), else `ALREADY_BOOKED_TODAY`.
   - No overlapping active booking of the user's own, else `USER_OVERLAP`.
6. **Lock and allocate the resource.**
   - `SELECT id FROM resources WHERE facility_id = ? AND is_active ORDER BY id FOR UPDATE`. This serializes everyone booking this facility; other facilities are unaffected.
   - Pick the first resource by `sort_order` where no active booking and no active block overlaps the whole `[start_at, end_at)`. This single range test **is** the consecutive-slot check: a 90-min request needs all three 30-min pieces free on one resource, or it fails. Nothing is ever partially booked.
   - None free: `SLOT_UNAVAILABLE` (single resource) or `SLOT_FULL` (multi), or `FACILITY_BLOCKED` if a block caused it.
7. **Insert** the booking with `status = CONFIRMED` and a generated `booking_code`. The constraints are re-checked by PostgreSQL itself at this point.
8. **Commit**, which releases the locks. An AFTER trigger sends a Realtime ping for (facility, date). Return the booking (code, facility, activity, date, start, end, duration, status).

How each duration plays out, given 18:00, 18:30 and 19:00 free:
- **30 min**: the range is `[18:00, 18:30)`.
- **60 min**: `[18:00, 19:00)`, which needs 18:00 and 18:30 free on the same court.
- **90 min**: `[18:00, 19:30)`, which needs all three slots.
- If 18:30 is taken, 60 and 90 both fail at step 6, and `max_duration` already told the UI so.

### D.3 Cancellation — `cancel_booking(booking_id)`
1. Lock the booking row (`FOR UPDATE`).
2. Require `user_id = auth.uid()`, `status = CONFIRMED`, and `now < start_at`.
3. Set `status = CANCELLED`, `cancelled_at = now`, `cancelled_by = uid`, `cancellation_type = USER`.

The row leaves the exclusion-constraint predicate, so the resource is **released at commit**. Then the Realtime ping fires. The row is never deleted.

`admin_cancel_booking(id, reason)` works the same way, with these differences:
- the admin check replaces the owner check;
- any `CONFIRMED`/`CHECKED_IN` booking qualifies, including bookings in progress;
- the result is `ADMIN_CANCELLED` and an `admin_actions` row.

### D.4 Facility blocks — `admin_create_block(facility_id, resource_id?, start, end, reason, note, cancel_conflicts bool)`
1. **Admin check.** Validate that the times are aligned, within hours, and in the future.
2. **Lock** the affected resource rows (`FOR UPDATE`, ordered by id). This is the same lock bookings take, so the two serialize.
3. **Find conflicts.** Look for active bookings overlapping the block.
   - If there are any and `cancel_conflicts = false`: return `BLOCK_CONFLICTS` with the list (admin sees booking codes and names).
   - If there are any and `cancel_conflicts = true`: mark them `ADMIN_CANCELLED / SYSTEM_BLOCK`.
4. **Insert** the block and the audit row.

`admin_remove_block(id)` sets `removed_at`/`removed_by`. It is only allowed on blocks that haven't ended; past blocks stay as history.

### D.5 Check-in — `check_in(booking_id)`
1. Lock the row and require the caller to own it with `status = CONFIRMED`.
2. Compare server time against the window:
   - `now < start − early`: error `CHECKIN_TOO_EARLY`, with `opens_at` returned so the app can say "Check-in available from 17:45".
   - `now > start + late`: error `CHECKIN_EXPIRED`.
3. Otherwise set `CHECKED_IN`, `checked_in_at = now`, `check_in_method = 'BUTTON'`.

**QR later** = a `check_in_qr(booking_id, token)` RPC that validates a rotating token per resource. The method column and per-resource rows mean no schema rework.

### D.6 No-show and completion
`private.sweep_lifecycle()`:
- `CONFIRMED` with `now > start + late` becomes `NO_SHOW`. The row leaves the exclusion predicate, so the remaining time is released (D5).
- `CHECKED_IN` with `now ≥ end` becomes `COMPLETED`.

It runs:
- from **pg_cron every 5 minutes**;
- lazily inside `create_booking` (scoped to the user and the facility);
- and the "my bookings" view computes an `effective_status` with the same rule, so the UI is exact even between cron runs.

### D.7 Error contract
RPCs raise `ERRCODE 'P0001'` with the message set to a stable code. Flutter maps the code to text; it never shows raw PostgreSQL/Supabase text.

| Code | User-facing message |
|---|---|
| `SLOT_UNAVAILABLE` | "Sorry, this time slot was just booked by another user. Please select another time." |
| `SLOT_FULL` | "All tables are taken for this time. Please choose another slot." |
| `FACILITY_BLOCKED` | "This facility is unavailable at that time (maintenance/event)." |
| `MAX_ACTIVE_BOOKINGS` | "You already have 2 upcoming bookings. Cancel one or wait until one finishes." |
| `ALREADY_BOOKED_TODAY` | "You can book this facility once per day." |
| `USER_OVERLAP` | "You already have a booking at that time." |
| `OUTSIDE_HOURS`, `OUTSIDE_HORIZON`, `PAST_SLOT`, `INVALID_DURATION` | specific text each |
| `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`, `NOT_AUTHORIZED` | specific text each |
| `CHECKIN_TOO_EARLY(opens_at)`, `CHECKIN_EXPIRED`, `CANNOT_CANCEL_STARTED` | specific text each |
| *(unknown / network)* | "Something went wrong. Please try again." / "You're offline…" |

PostgreSQL's own constraint violations are caught **inside** the RPC and re-raised as codes: `23P01` (exclusion) → `SLOT_UNAVAILABLE`/`USER_OVERLAP`, `23505` (unique) → `ALREADY_BOOKED_TODAY`.

---

## E. Concurrency design

### E.1 Two layers, by design
1. **Row locks inside the RPC** (`SELECT … FOR UPDATE` on the user's profile row, then on the facility's resource rows, always in that order) serialize every decision that reads and then writes.
   - The locks guarantee that **allocation is correct**: with two tables, the second requester waits, then sees table 1 taken and picks table 2.
   - They also cover rules that no constraint can express (max 2 active, block checks).
2. **Exclusion and unique constraints** are the hard backstop. Even if a future code change removed a lock or added a new write path, PostgreSQL itself refuses to store two active bookings on one resource in overlapping time, or two overlapping bookings for one user.

### E.2 Tennis: User A and User B both request 18:00–19:00
| t | Transaction A | Transaction B |
|---|---|---|
| 0 | `BEGIN` (implicit in RPC); validate inputs | `BEGIN`; validate inputs |
| 1 | lock profile A | lock profile B (different row, no wait) |
| 2 | `SELECT … resources WHERE facility = Tennis FOR UPDATE` → **acquires** the lock on Tennis Court | same statement → **blocks**, waiting on A's lock |
| 3 | finds the court free for [18:00, 19:00); `INSERT` booking | (waiting) |
| 4 | `COMMIT` → lock released, booking visible | lock acquired |
| 5 | | Next statement takes a **fresh snapshot** (READ COMMITTED; each statement in a VOLATILE plpgsql function sees newly committed rows) and sees A's booking, so no free resource remains |
| 6 | | `RAISE 'SLOT_UNAVAILABLE'` → whole transaction rolled back, nothing written |
| 7 | Flutter A: success screen, `DCU-…` | Flutter B: PostgREST 400 `{code:'P0001', message:'SLOT_UNAVAILABLE'}` → "Sorry, this time slot was just booked by another user. Please select another time." and the availability list is refreshed |

**Why B cannot also succeed**
- B cannot reach step 3 until A has committed, and when it does, it sees A's row.
- Suppose the lock were missing. B's `INSERT` would hit the GiST exclusion index, wait for A's in-flight transaction, and then fail with `23P01` once A commits. Two overlapping active rows on one resource are not representable.

Which request wins is decided by **whichever transaction acquires the row lock first**. That is effectively arrival order at the database, not at the phone.

### E.3 Air Hockey: three users, 18:00, two tables
- U1, U2, and U3 all reach `SELECT … resources WHERE facility = Air Hockey ORDER BY id FOR UPDATE`. One acquires both table rows; the others queue.
- **U1** sees Tables 1 and 2 free, takes Table 1 (lowest `sort_order`), and commits.
- **U2** wakes, takes a fresh snapshot, sees Table 1 taken, takes Table 2, and commits.
- **U3** wakes, sees both taken, gets `SLOT_FULL`, and rolls back.
- Result: **exactly two succeed, exactly one fails, and each table is used once.**

Why the lock layer is needed **in addition to** the constraint: with the constraint alone, all three requesters read "Table 1 free" simultaneously and all try Table 1. One wins and two fail, **even though Table 2 was free**. The prototype reproduced exactly this (§E.5). The constraint prevents double-booking but not wrong rejections; the lock prevents both.

**Same-user race.**
- User A taps "Book Tennis 18:00" on a phone and "Book Foosball 18:30" on a tablet at the same instant.
- Both RPCs lock profile A first, so they run one after the other.
- The second one sees the first booking and fails with `USER_OVERLAP`.
- The same serialization protects "max 2 active" and "once per day", which are **count** rules a constraint can't express. `no_user_overlap` and `one_per_facility_day` are still there as constraint backstops.

**Deadlock avoidance.** Lock order is always profile → resources (ordered by id) → booking row.
- Admin blocks take only resource locks, in the same id order.
- Cancel and check-in take only the booking row.
- No path takes those locks in reverse order, so there is no deadlock cycle.
- The per-facility lock is held for a few milliseconds, which is negligible for an internal user base of hundreds.

### E.4 Block vs. booking race
`admin_create_block` locks the same resource rows. A booking and a block for the same court therefore serialize:
- Either the booking commits first, and the block then sees it as a conflict (D6 flow).
- Or the block commits first, and the booking sees the block and fails with `FACILITY_BLOCKED`.

### E.5 Prototype evidence (PostgreSQL 16.14, run in this environment)
I used the [prototype](phase-1/concurrency-prototype.sql) with genuinely parallel `psql` sessions. A `pg_sleep(0.05)` inside the critical section deliberately widens the race window.

| Test | Result |
|---|---|
| Tennis, 2 users, 18:00–19:00, locked RPC | 1 booking (court), 1 × `SLOT_UNAVAILABLE` |
| Air Hockey, 3 users, locked RPC | Table 1 + Table 2 allocated, 1 × `SLOT_UNAVAILABLE` |
| Air Hockey, 3 users, locked RPC, **50 repetitions** | **50/50** runs allocated exactly 2 |
| Tennis, 5 users, **no locks** (constraint only) | 1 booking, 4 × `23P01 no_resource_overlap` — backstop holds |
| Air Hockey, 3 users, **no locks**, 3 repetitions | only **1 of 2** tables allocated every run — shows the locks are required |
| Jakarta conversion | `2026-10-06 18:00 WIB` stored as `11:00Z` and displayed back as `18:00` |

These results come from a simplified schema. Phase 2 repeats them against the real migrations with ≥ 200 iterations per scenario, through PostgREST with real JWTs, not just raw SQL.

---

## F. Security & RLS

### F.1 Principles
- **No client role is ever trusted.**
  - `private.is_admin()` is `SECURITY DEFINER STABLE`. It reads `profiles.role = 'ADMIN' AND is_active` for `auth.uid()` **from the database on every call**.
  - I deliberately do **not** use JWT custom claims for the role. A demoted admin would keep a stale claim until token refresh, up to an hour.
- **Writes only through RPCs.**
  - `authenticated` has no INSERT/UPDATE/DELETE privilege on `bookings`, `facility_blocks`, `app_settings`, or `admin_actions`. RLS is defense in depth, not the only gate.
  - Every RPC is `SECURITY DEFINER SET search_path = ''`, uses fully qualified names, and has `REVOKE EXECUTE … FROM public, anon`.
  - Helpers live in a non-exposed `private` schema.
- **`anon` (logged-out) gets nothing** except the auth endpoints.

### F.2 Policy matrix
| Table | USER can read | USER can write | ADMIN additionally |
|---|---|---|---|
| profiles | own row | `UPDATE (full_name)` only — column-level grant; role / is_active / email not writable | read all; role & active via `admin_set_user_role` / `admin_set_user_active` RPCs |
| facilities, activities, resources | active rows | — | all rows; edits via migration in V1 |
| bookings | **own rows only** (`user_id = auth.uid()`) | none directly; via `create_booking`, `cancel_booking`, `check_in` | read all, via `admin_list_bookings` (joins owner name/email) |
| facility_blocks | active/future rows, via a view exposing only facility, resource, time, reason_type (no `created_by`, no note) | — | full; via RPCs |
| app_settings | read (app needs horizon, check-in window) | — | `admin_update_settings` |
| admin_actions | — | — | read |

### F.3 How a user sees BOOKED without seeing who
- Availability is **only** produced by `get_availability`, a `SECURITY DEFINER` function that reads all bookings internally but returns only aggregates (status, counts, max duration).
- A user querying `bookings` directly gets only their own rows because of RLS. A user calling the REST endpoint with a crafted filter gets exactly the same rows. There is no path to another user's rows.
- Phase 2 includes tests that log in as User B and attempt every read path for User A's data.

### F.4 Realtime privacy
- The availability ping is a **private broadcast channel** (`availability`, authorized via RLS on `realtime.messages` for authenticated users).
- Its payload is `{facility_id, date}` only. No booking rows are streamed.
- Postgres-changes subscriptions on `bookings` are not used, so there is no row data to leak.

### F.5 Admin authorization chain
1. JWT proves identity (Auth).
2. `is_admin()` checks the DB role at call time.
3. Every admin RPC calls `private.require_admin()` first.
4. Every admin write is logged in `admin_actions`.

Guards:
- The last active admin cannot demote or deactivate themselves.
- The first admin is created by an operator running one SQL statement in the Supabase SQL editor (documented). The app has no "make me admin" path.

### F.6 Secrets
- The APK contains only `SUPABASE_URL` and the **publishable** key, passed at build time with `--dart-define-from-file=env/dev.json`. That file is gitignored, and an `env/example.json` is committed.
- The service-role/secret key, DB password, SMTP password, and keystore are never in the repo or the APK.
- Test accounts are created by a local script that reads credentials from environment variables.

---

## G. UX / screen map

### G.1 Screens
**Auth**
- Splash/session check
- Login
- Register
- Verify Email (6-digit code + resend + "change email")
- Forgot Password (enter email)
- Reset Password (code + new password)

**User (bottom nav: Home · Book · My Bookings · Profile)**
- **Home:** greeting, "My next booking" card with Check-in/View, 6 facility cards with "n slots left today"
- **Book:** facility list (the same cards, full screen)
- **Facility Booking:** activity chips (Basketball/Futsal only) · 8-day date strip · slot grid · duration chips appear under the selected slot
- **Review & Confirm:** bottom sheet
- **Booking Success:** code, facility, activity, date, start–end, duration, status
- **My Bookings:** Upcoming / History tabs
- **Booking Detail:** Check-in / Cancel
- **Profile:** name edit, change password, logout, app version

**Admin (5th nav destination "Admin", rendered only when `is_admin`)**
- Admin Dashboard: today's bookings, upcoming, utilization today, no-shows (7 d), active users
- Bookings: filters for date / facility / status / user search → Admin Booking Detail with Cancel + reason
- Blocks: list of future blocks + Remove → Create Block (facility, resource or "all", date, start, end, reason, note; conflict confirmation step)
- Users: search → User Detail (role, active toggle, recent bookings, no-show count)
- Settings: horizon, max active, check-in window
- Analytics: bookings by facility/day, utilization, peak hours, cancellations, no-shows

**Shared states:** offline banner (blocks booking actions), empty states, error snackbar/dialog mapping (§D.7), session-expired redirect.

**Why a separate Admin tab rather than a section inside Profile:**
- Admins use it daily. Hiding it two levels deep costs them on every visit.
- Normal users never see it.
- Hiding the tab is cosmetic; the server enforces access.

### G.2 Journeys
**Registration**
```
Register(name, email, pw, confirm) ──signUp──► [hook: domain allowed?] ─no─► "Use your DCU email"
                                                        │yes
                                              email with 6-digit code (+ link)
Verify Email screen ◄─────────────────────────────────┘
   enter code ──verifyOTP──► session ──► Home
   (closing app & logging in later while unverified → Login returns "email not confirmed" → Verify Email)
```
**Login**
```
Login(email, pw) ─► ok ─► Home
                 ├► email not confirmed ─► Verify Email (resend)
                 ├► wrong credentials ─► inline error
                 └► account disabled ─► "Contact DCU admin"
Forgot ─► email ─► code + new password ─► Login
```
**Booking (Tennis, 4 taps from Home)**
```
Home ─tap Tennis─► Facility Booking (today preselected; live slot grid)
  ─tap 18:00─► duration chips [30][60][90] (disabled where max_duration < d)
  ─tap 60─► Review sheet (Tennis · Tue 6 Oct · 18:00–19:00 · 60 min)
  ─Confirm─► create_booking ─ok─► Success (DCU-7K3P9Q, CONFIRMED)
                             └err─► mapped message + grid refresh, stay on screen
Basketball/Futsal: activity chips must be chosen before Confirm is enabled.
```
**Cancellation**
```
My Bookings ─► Upcoming card ─Cancel─► confirm dialog ─► cancel_booking
   ─ok─► card moves to History "Cancelled", snackbar "Booking cancelled"
   ─CANNOT_CANCEL_STARTED─► "This booking has already started."
```
**Check-in**
```
Home "My next booking" / Booking Detail
  before window: [Check in] disabled, caption "Check-in available from 17:45"
  in window:     [Check in] ─► check_in ─► status CHECKED_IN, snackbar
  after window:  card shows "No-show" (effective_status)
```
**Admin facility block**
```
Admin ─► Blocks ─► + ─► form (Tennis · Court · 12 Oct · 09:00–12:00 · Maintenance)
  ─Save─► admin_create_block(cancel_conflicts=false)
      ├ ok ─► block listed; users see "Unavailable" 09:00–12:00
      └ BLOCK_CONFLICTS(list) ─► "2 bookings will be cancelled: …" ─Confirm─► retry with cancel_conflicts=true
```

---

## H. Project structure

```
/
├── app/                              # Flutter project (package: dcu_active)
│   ├── lib/
│   │   ├── main.dart                 # bootstrap: env, Supabase.initialize, ProviderScope
│   │   ├── app/
│   │   │   ├── app.dart              # MaterialApp.router, theme
│   │   │   ├── router.dart           # go_router + auth/admin redirects
│   │   │   └── theme.dart            # M3 light theme, status colours
│   │   ├── core/
│   │   │   ├── config/env.dart       # --dart-define values, fail-fast if missing
│   │   │   ├── errors/               # AppFailure (sealed), error_mapper.dart (code → message)
│   │   │   ├── time/jakarta_time.dart# fixed UTC+7 conversion, server clock offset
│   │   │   ├── network/              # connectivity status provider
│   │   │   └── widgets/              # StatusChip, AsyncValueView, EmptyState, OfflineBanner
│   │   └── features/
│   │       ├── auth/        {data, domain, presentation}
│   │       ├── facilities/  {data, domain, presentation}
│   │       ├── booking/     {data, domain, presentation}   # availability, create, review, success
│   │       ├── my_bookings/ {data, domain, presentation}   # list, detail, cancel, check-in
│   │       ├── profile/     {data, domain, presentation}
│   │       └── admin/       {data, domain, presentation}   # dashboard, bookings, blocks, users, settings, analytics
│   ├── test/                         # unit + widget tests mirroring lib/
│   ├── integration_test/
│   └── env/example.json
├── supabase/
│   ├── config.toml
│   ├── migrations/                   # ordered SQL: schema, constraints, rls, rpc, cron, realtime
│   ├── seed.sql                      # facilities/activities/resources/settings only (no users)
│   └── tests/                        # pgTAP: rules, RLS, admin
├── scripts/
│   ├── concurrency_test.mjs          # N parallel real-JWT RPC calls, asserts outcomes
│   └── create_test_users.mjs         # reads secrets from env; never committed values
└── docs/                             # this doc, guides (Phase 5)
```

### Decisions
- **Feature-first folders** with a thin `data / domain / presentation` split per feature.
  - `domain` holds plain Dart models and repository interfaces.
  - `data` holds Supabase implementations.
  - `presentation` holds widgets and Riverpod controllers.
  - No separate "use case" classes: the RPCs *are* the use cases, so an extra layer would just forward calls.
- **Riverpod** for state and dependency injection: compile-safe, testable with overrides, no BuildContext plumbing.
- **go_router** for declarative routes with an auth/admin redirect guard.
- **Hand-written `fromJson`** instead of freezed/json_serializable. There are about 8 models, so I'm skipping code generation to keep the build simple. I'll revisit if the model count grows.
- **Dependencies (complete list):** `supabase_flutter`, `flutter_riverpod`, `go_router`, `intl`, `connectivity_plus`; dev: `mocktail`, `flutter_lints`. No Firebase, no analytics SDKs.
- **Timezone:** Asia/Jakarta has been a fixed UTC+7 with no DST since 1964. One `JakartaTime` helper converts every timestamp for display, independent of the phone's timezone. Tests run under `TZ=America/New_York` to prove that.
- **Cross-platform:** nothing Android-specific in Dart. The only Android-specific files are the manifest/gradle config, so iOS is an added target later, not a rewrite.

---

## I. Technical risks

| Risk | Rating | Mitigation |
|---|---|---|
| Double booking / race conditions | **HIGH** → LOW after mitigation | Locks + exclusion constraints (§E); already prototyped; Phase 2 parallel tests ≥ 200 iterations through PostgREST |
| RLS mistakes leaking other users' data | **HIGH** | Writes via RPC only; no table write grants; pgTAP tests impersonating two users + admin for every table/RPC; Supabase security advisor run before each phase gate |
| Open registration via extracted key (D1) | **HIGH** | Server-side domain allow-list in the sign-up hook. Optionally an admin-approval flag later. |
| Verification emails not delivered (D3) | **HIGH** | Custom SMTP configured before Phase 3 testing; SPF/DKIM on the sending domain |
| Link scanners consuming tokens (D2) | MEDIUM | OTP code flow |
| Timezone bugs | MEDIUM | Server builds timestamps from local parts; generated `local_date`; Dart helper; tests at UTC day boundary (06:00 WIB = 23:00Z prior day) and non-Jakarta device TZ |
| pg_cron lag / disabled | LOW | Lazy sweep in RPCs + `effective_status` view; cron only tidies |
| Realtime disconnects | LOW | Realtime is a refresh hint only; refetch on screen resume, pull-to-refresh, and on every booking error |
| Supabase free-tier pause (D9) | MEDIUM | Pro plan for production, or a documented keep-alive with the risk accepted |
| **Android SDK download blocked in this cloud environment** (`dl.google.com` denied) | **HIGH for Phase 5** | Allow-list `dl.google.com` (see "Blocking item" at end), or build the APK on your machine using the Phase 5 guide |
| No emulator (no KVM) | MEDIUM | Widget and golden tests + Flutter web screenshots for evidence; a real-device smoke test on your side before sign-off |
| APK sideloading friction | LOW | Installation guide ("Install unknown apps"); debug APK first, signed release config documented, keystore kept outside git |
| Clock skew on phones | LOW | Server-authoritative; client uses the `server_now` offset for button states |
| Abuse by book/cancel churn | LOW (V1) | Audited; no-show counts visible to admin; penalties are a future feature |

---

## J. Implementation plan

### Phase 2: Backend & database
1. Scaffold `supabase/` with the Supabase CLI. Run a local stack in Docker if the daemon can be started here; otherwise use plain PostgreSQL 16 with Supabase's `auth` schema stubs.
2. Migrations, in order:
   - extensions (`btree_gist`, `pg_cron`)
   - schemas (`private`)
   - tables + constraints + indexes
   - auth triggers (profile creation, email sync, domain allow-list hook)
   - RLS + grants
   - helper functions
   - RPCs: `get_availability`, `create_booking`, `cancel_booking`, `check_in`, `get_server_time`, `admin_*`, analytics
   - lifecycle sweep + cron schedule
   - Realtime broadcast trigger + channel policy
   - `effective_status` view
3. `seed.sql`: 6 facilities, 7 activities, 8 resources, settings row.
4. pgTAP suites, one per rule in Prompt §33 that is backend-testable: RLS and privacy matrix, admin authorization, blocks, cancellation, check-in, no-show.
5. `scripts/concurrency_test.mjs`: Tennis 2-way, Air Hockey 3-way, Foosball 3-way, same-user cross-facility, block-vs-booking. ≥ 200 iterations each, using real JWTs through PostgREST where the local stack allows.
6. Deliverables: migrations, a test report, deviations. **Stop at gate.**

What I need from you for Phase 2:
- D1–D9 answers. Otherwise I'll proceed on the defaults.
- Nothing secret yet: Phase 2 runs entirely locally.

### Phase 3: Flutter application
1. Install the Flutter SDK (stable) in the environment and create `app/`. Android package id e.g. `id.dcu.active` (please confirm the reverse-domain).
2. Build core: env, theme, router, error mapper, JakartaTime, connectivity.
3. Build in this order:
   - auth (register / verify code / login / forgot / reset)
   - facilities + availability + booking flow
   - My Bookings / detail / cancel / check-in
   - Profile
   - Admin: dashboard, bookings, blocks, users, settings
   - analytics (last)
4. Point the app at a hosted Supabase project.
   - **I need:** the project URL and the publishable key, both safe to share.
   - **You do:** apply the migrations with `supabase db push`, or give me a short-lived access token that you revoke afterwards. Also configure SMTP, the email OTP template, and Auth settings (I'll give exact steps).
5. Evidence: widget/golden screenshots + web build screenshots of each journey. **Stop at gate.**

### Phase 4: Testing & hardening
- `flutter analyze` clean; unit tests (error mapper, time helper, repositories with mocks); widget tests (slot grid states, duration chips, check-in button states, offline banner).
- Re-run all backend and concurrency suites against the hosted project.
- Run UAT scenarios 1–10 with test accounts; timezone tests; Supabase security/performance advisors.
- Fix, retest, and write the release-readiness report. **Stop at gate.**

### Phase 5: APK & documentation
- Debug APK built in the cloud environment (requires `dl.google.com` allow-listed) or on your machine.
- `key.properties`-based release signing config, with the keystore and passwords outside git.
- README, Administrator Guide, User Guide, Supabase Setup Guide, APK Installation Guide, Release Signing Guide.
- Definition-of-Done checklist (Prompt §37, 28 items), each with evidence. **Final stop.**

---

### Blocking item for Phase 5 (action for you, not needed yet)
This cloud environment's network policy denies **`dl.google.com`** (Android SDK downloads). To let me build the APK here:
1. Open the environment menu in the session title bar and choose **Edit**.
2. Under **Network access**, either choose a broader level, or choose **Custom**, keep the default package-manager list, and add `dl.google.com` to Allowed domains.

Docs: https://code.claude.com/docs/en/cloud-environments#network-access
