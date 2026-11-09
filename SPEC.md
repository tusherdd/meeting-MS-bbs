# BBS Meeting Schedule System — Project Specification

> Single source of truth for this project. Read this file before every task.
> Office: Bangladesh Bureau of Statistics (BBS) and Statistics & Informatics Division (SID).
> UI language: Bangla now (English later). Code, comments, API names: English.

---

## 1. Goal

An office-wide web application where every officer can create and manage meetings.
Meetings carry a **priority taken from the organizer's designation**. A higher-priority
meeting is never blocked by a conflict; instead the organizers and officers of the
lower-priority meetings that clash are notified to cancel or reschedule.
Every officer has a personal dashboard with today / weekly / monthly / yearly reports,
downloadable as PDF.

## 2. Repository layout

```
bbs-meeting/
├── SPEC.md            ← this file
├── CLAUDE.md          ← working rules for the AI assistant
├── backend/           ← NestJS API + database (entities, migrations, seeds live here)
└── frontend/          ← Next.js app (built after the backend is finished)
```

There is no separate database project: TypeORM entities, migrations and seeds are inside `backend/`.

## 3. Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 LTS, TypeScript (strict mode) |
| Backend framework | NestJS 11 (modules / controllers / services / DTOs) |
| ORM | TypeORM with migrations (`synchronize: false` always) |
| Database | PostgreSQL 16+ |
| Validation | class-validator + class-transformer (global `ValidationPipe`) |
| Auth | JWT access + refresh tokens, passwords hashed with argon2id |
| API docs | Swagger (OpenAPI) at `/api/docs` |
| Mail | Nodemailer over SMTP (settings in `.env`), sent through a DB outbox |
| Scheduling | `@nestjs/schedule` (outbox worker, cleanup jobs) |
| PDF | Puppeteer (HTML → PDF) — required so Bangla text shapes correctly |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Timezone | Store `timestamptz` (UTC). Display and compute "today/week/month" in `Asia/Dhaka`. |

## 4. Backend folder structure

```
backend/src/
├── main.ts                      bootstrap: helmet, CORS, cookies, ValidationPipe, Swagger, prefix /api/v1
├── app.module.ts
├── config/                      env validation schema + typed config
├── database/
│   ├── data-source.ts           TypeORM DataSource for CLI (migrations)
│   ├── migrations/
│   └── seeds/                   seed scripts (+ seed data files that are git-ignored)
├── common/
│   ├── decorators/              @CurrentUser(), @Roles(), @Public()
│   ├── guards/                  JwtAuthGuard, RolesGuard
│   ├── filters/                 global exception filter (Bangla-friendly messages)
│   ├── interceptors/
│   ├── dto/                     PaginationQueryDto, PaginatedResponseDto
│   └── utils/                   time (Asia/Dhaka ranges), phone normalizer (Bangla digits → ASCII)
└── modules/
    ├── auth/
    ├── users/
    ├── profile/
    ├── designations/
    ├── wings/
    ├── change-requests/
    ├── meetings/                includes conflict engine (conflict.service.ts)
    ├── notifications/
    ├── mail/                    outbox entity, worker, templates
    ├── reports/                 summaries + PDF
    ├── audit/
    └── health/
```

Each module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`.
Controllers stay thin; business rules live in services. Every endpoint has Swagger decorators
(`@ApiTags`, `@ApiOperation`, `@ApiResponse`, DTO `@ApiProperty`).

## 5. Roles and permissions

| Role | Who | Can do |
|---|---|---|
| `SUPER_ADMIN` | `admin@bbs.gov.bd` (seeded) | Everything. Cannot be demoted or deactivated by anyone. |
| `ADMIN` | Officers promoted from the admin dashboard | Manage users, designations, wings, approve change requests, see all meetings and admin reports. Cannot change SUPER_ADMIN. |
| `OFFICER` | Every officer | Own profile, create meetings, edit/cancel meetings they organize, see meetings they are part of, own reports. |

- Accounts are created **only by admins**. No self-registration.
- Seeded super admin has `mustChangePassword = true`; until changed, only `/auth/change-password`, `/auth/me` and `/auth/logout` work.
- Admins can promote/demote other officers to/from `ADMIN` from the dashboard.

## 6. Domain rules

### 6.1 Designations and priority
- Priority lives in the `designations` table, never in code. Lower number = higher priority.
- Admin can add designations and change priorities from the dashboard.
- "(ভারপ্রাপ্ত)" / "(চলতি দায়িত্ব)" / "(in charge)" / "(current charge)" are stored as a free-text
  `designationRemark` on the user. They do **not** change priority.
- Roles such as "Focal Point Officer" are additional charges, not designations.

Initial seed (final list approved by the owner; admins can still change it later from the admin panel):

| Priority | Designation (bn) | Designation (en) |
|---|---|---|
| 1 | সচিব | Secretary |
| 2 | মহাপরিচালক | Director General |
| 3 | উপমহাপরিচালক | Deputy Director General |
| 4 | পরিচালক | Director |
| 5 | যুগ্মপরিচালক | Joint Director |
| 5 | সিস্টেম এনালিস্ট | System Analyst |
| 5 | সিনিয়র প্রোগ্রামার | Senior Programmer |
| 6 | উপপরিচালক | Deputy Director |
| 6 | মেইন্টেন্যান্স ইঞ্জিনিয়ার | Maintenance Engineer |
| 6 | প্রোগ্রামার | Programmer |
| 7 | পরিসংখ্যান কর্মকর্তা | Statistical Officer |
| 7 | সহকারী প্রোগ্রামার | Assistant Programmer |
| 7 | কার্টোগ্রাফার | Cartographer |
| 7 | গ্রাফিক রিপ্রোডাকশন অফিসার | Graphic Reproduction Officer |
| 7 | স্টাফ অফিসার | Staff Officer |

On re-run, the seed updates the priority of an existing designation to match this table.

### 6.2 Profiles
- **Login email** = user id. Unique, never edited directly. Change only via a change request approved by an admin.
- **Notification email** = where all mail goes. Officer can change it; the new address becomes active
  only after clicking a verification link sent to it (token hashed, expires in 24 h).
- Officer can edit directly: name (bn/en), photo, mobile, office phone, fax, wing, designation remark,
  additional charges, password, notification email (with verification).
- **Designation change** needs admin approval (it changes priority). Until approved, the old designation applies.
- Change request flow: officer submits → admins get bell notification + email → admin approves or rejects
  (with an optional note) → on approve the change is applied automatically → officer is notified
  (for login email: both old and new addresses are notified).

### 6.3 Meetings
- Fields: title, agenda (text), start, end, room (free text, typed manually), optional online link,
  organizer (creator), optional chairperson, participants (officers), notes/minutes, status.
- Status: `SCHEDULED`, `CANCELLED`, `COMPLETED`. Only `SCHEDULED` meetings take part in conflict checks.
- `meeting.priority` = organizer's designation priority **at the time of creation** (snapshot, stored on the meeting).
- Every officer creates their own meetings. There is **no "on behalf of" option**: nobody can create a meeting
  for someone else or borrow another officer's priority. The chairperson does not affect priority.
- Only the organizer or an admin can edit, cancel or complete a meeting.
- `end` must be after `start`. Meetings cannot be created in the past.
- Room is **not** checked for conflicts.

### 6.4 Conflict engine (the core rule)
A conflict exists when the **same officer** (organizer, chair or participant) is in two `SCHEDULED`
meetings whose time ranges overlap: `A.start < B.end AND B.start < A.end`.

When meeting **N** (priority `p`) is created or its time/people change, for every overlapping
meeting **E** that shares at least one officer:

| Case | Result |
|---|---|
| `p < E.priority` (N is higher) | N is saved. A `meeting_conflicts` row is created (status `PENDING`). E's organizer **and** each shared officer get a bell notification + email asking E to be cancelled or rescheduled. |
| `p >= E.priority` (equal or lower) | N is **blocked**. API returns `409 Conflict` with the list of clashing meetings and officers. Nothing is saved. |

- If any clash is blocking, the whole request is rejected (even if other clashes would be allowed).
- `POST /meetings/check-conflicts` runs the same logic without saving (used by the form to warn live).
- A pending conflict is marked `RESOLVED` automatically when E is cancelled, rescheduled out of the
  overlap, or the shared officer is removed from E.
- Every participant is notified when invited, when time/room changes, and when a meeting is cancelled.
- The conflict check and the insert run inside one DB transaction to avoid race conditions.

### 6.5 Notifications
- Channels: in-app bell (always) and email (to the notification email).
- Email goes through a DB outbox (`email_outbox`). A scheduled worker sends pending mail every minute,
  retries with backoff up to 5 times, and records the last error. Creating a meeting never waits for SMTP.
- Channel code is pluggable (`NotificationChannel` interface) so SMS/WhatsApp can be added later.

### 6.6 Reports
- Periods: `day`, `week` (Sunday–Saturday), `month`, `year` (Jan–Dec), `fiscal-year` (July–June). All in Asia/Dhaka.
- Officer report: meetings I organized / attended, counts by status, total hours, conflicts raised against my meetings.
- Admin report: same, across the office, filterable by wing and designation.
- PDF download for every report, Bangla text, BBS header, generated date.
- The dashboard opens on **today's meetings** by default.

## 7. Data model (TypeORM entities)

All tables have `id` (uuid), `createdAt`, `updatedAt`.

- **designations**: nameBn, nameEn, priority (int), isActive
- **wings**: nameBn, nameEn, isActive
- **users**: loginEmail (unique, citext/lowercased), notificationEmail, pendingNotificationEmail,
  notificationEmailTokenHash, notificationEmailTokenExpiresAt, passwordHash, nameBn, nameEn,
  mobile, mobileAlt, officePhone, fax, photoPath, designationId → designations (nullable only for the
  SUPER_ADMIN system account), designationRemark, wingId → wings (nullable),
  organizationBn, organizationEn (e.g. "বাংলাদেশ পরিসংখ্যান ব্যুরো" / "Bangladesh Bureau of Statistics"),
  bcsBatch, role (enum), isActive, mustChangePassword, failedLoginCount, lockedUntil, lastLoginAt
- **user_additional_charges**: userId, description
- **refresh_tokens**: userId, tokenHash, expiresAt, revokedAt, replacedById, userAgent, ip
- **password_reset_tokens**: userId, tokenHash, expiresAt, usedAt
- **change_requests**: userId, type (`LOGIN_EMAIL` | `DESIGNATION`), newValue (json), status
  (`PENDING` | `APPROVED` | `REJECTED`), reviewedById, reviewedAt, reviewNote
- **meetings**: title, agenda, startAt, endAt, room, onlineLink, organizerId, chairId, priority,
  status, cancelReason, notes, cancelledAt, completedAt
- **meeting_participants**: meetingId, userId, role (`CHAIR` | `MEMBER`) — unique (meetingId, userId)
- **meeting_conflicts**: higherMeetingId, lowerMeetingId, userId (shared officer), status
  (`PENDING` | `RESOLVED`), resolvedAt
- **notifications**: userId, type, title, body, link, readAt
- **email_outbox**: to, subject, html, status (`PENDING` | `SENT` | `FAILED`), attempts, lastError, nextAttemptAt, sentAt
- **audit_logs**: actorId, action, entityType, entityId, before (json), after (json), ip, createdAt

Indexes: meetings(startAt, endAt, status); meeting_participants(userId); notifications(userId, readAt).

## 8. API list (prefix `/api/v1`, Swagger at `/api/docs`)

Legend: 🔓 public · 👤 any logged-in user · 🛡 ADMIN or SUPER_ADMIN

### Health
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | 🔓 | API + DB status |

### Auth
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/auth/login` | 🔓 | Login with loginEmail + password. Sets cookies, also returns accessToken (for Swagger). |
| POST | `/auth/refresh` | 🔓 | Rotate refresh token, new access token |
| POST | `/auth/logout` | 👤 | Revoke refresh token, clear cookies |
| GET | `/auth/me` | 👤 | Current user + role + designation + priority |
| POST | `/auth/change-password` | 👤 | Old + new password (clears mustChangePassword) |
| POST | `/auth/forgot-password` | 🔓 | Sends reset link to notification email (always returns 200) |
| POST | `/auth/reset-password` | 🔓 | Token + new password |

### Profile (my own)
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/profile` | 👤 | My full profile |
| PATCH | `/profile` | 👤 | Update names, mobile, phone, fax, wing, designation remark, additional charges |
| POST | `/profile/photo` | 👤 | Upload photo (jpeg/png/webp, max 2 MB) |
| DELETE | `/profile/photo` | 👤 | Remove photo |
| POST | `/profile/notification-email` | 👤 | Request change → verification mail to the new address |
| GET | `/profile/notification-email/verify?token=` | 🔓 | Confirm new notification email |
| POST | `/profile/change-requests` | 👤 | Request login-email or designation change |
| GET | `/profile/change-requests` | 👤 | My requests and their status |

### Users (admin)
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/users/directory` | 👤 | Minimal active officer list (id, names, designation, wing, photo) for the participant picker |
| GET | `/users` | 🛡 | Search/filter/paginate (q, wingId, designationId, role, isActive) |
| GET | `/users/:id` | 🛡 | Full user |
| POST | `/users` | 🛡 | Create officer (temp password, mustChangePassword = true, welcome mail) |
| PATCH | `/users/:id` | 🛡 | Edit any field including loginEmail and designation |
| PATCH | `/users/:id/status` | 🛡 | Activate / deactivate |
| PATCH | `/users/:id/role` | 🛡 | Make ADMIN / OFFICER (SUPER_ADMIN untouchable) |
| POST | `/users/:id/reset-password` | 🛡 | Generate temp password, force change |

### Designations & wings
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/designations` | 👤 | List ordered by priority |
| POST | `/designations` | 🛡 | Create |
| PATCH | `/designations/:id` | 🛡 | Rename / change priority / deactivate |
| DELETE | `/designations/:id` | 🛡 | Delete only if no user uses it |
| GET | `/wings` | 👤 | List |
| POST | `/wings` | 🛡 | Create |
| PATCH | `/wings/:id` | 🛡 | Update |
| DELETE | `/wings/:id` | 🛡 | Delete only if unused |

### Change requests (admin)
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/change-requests` | 🛡 | List (filter by status, type) |
| POST | `/change-requests/:id/approve` | 🛡 | Apply change, notify officer |
| POST | `/change-requests/:id/reject` | 🛡 | Reject with note, notify officer |

### Meetings
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/meetings/today` | 👤 | My meetings today (dashboard default) |
| GET | `/meetings` | 👤 | My meetings by range (`from`, `to`, `status`, `role=organizer|participant`, page). Admin may pass `scope=all`. |
| GET | `/meetings/:id` | 👤 | Detail (organizer, participants, admins only) |
| POST | `/meetings/check-conflicts` | 👤 | Dry run of the conflict engine |
| POST | `/meetings` | 👤 | Create (409 on blocking conflict) |
| PATCH | `/meetings/:id` | 👤 | Update (organizer/admin; re-runs conflict engine) |
| POST | `/meetings/:id/cancel` | 👤 | Cancel with reason (organizer/admin) |
| POST | `/meetings/:id/complete` | 👤 | Mark completed, save notes/minutes |
| DELETE | `/meetings/:id` | 🛡 | Hard delete (admin only) |

### Conflicts
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/conflicts/mine` | 👤 | Pending conflicts on meetings I organize or attend |
| GET | `/conflicts` | 🛡 | All conflicts (filter by status) |

### Notifications
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/notifications` | 👤 | My notifications (paginated, `unread=true` filter) |
| GET | `/notifications/unread-count` | 👤 | Bell badge number |
| PATCH | `/notifications/:id/read` | 👤 | Mark one read |
| PATCH | `/notifications/read-all` | 👤 | Mark all read |

### Reports
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/reports/me?period=&date=` | 👤 | My summary + meeting list |
| GET | `/reports/me/pdf?period=&date=` | 👤 | My report as PDF |
| GET | `/reports/office?period=&date=&wingId=&designationId=` | 🛡 | Office-wide summary |
| GET | `/reports/office/pdf?...` | 🛡 | Office report as PDF |

### Admin
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/admin/stats` | 🛡 | Counts: users, meetings today/week, pending conflicts, pending change requests, failed mails |
| GET | `/audit-logs` | 🛡 | Audit trail (filter by actor, entity, date) |
| GET | `/admin/email-outbox` | 🛡 | Mail queue status, retry failed |
| POST | `/admin/email-outbox/:id/retry` | 🛡 | Retry one failed mail |

## 9. Security requirements (must all be implemented)

1. Passwords: argon2id; min 8 chars with letters + digits; not equal to the email; never returned by any API.
2. Login: generic error message; lock account for 15 min after 5 failed attempts; record lastLoginAt.
3. Tokens: access token 15 min, refresh token 7 days with rotation and reuse detection (reuse → revoke all of that user's tokens). Refresh tokens stored hashed.
4. Cookies: `httpOnly`, `secure` in production, `sameSite=lax` (access) / `strict` (refresh, path `/api/v1/auth`). Bearer header also accepted for Swagger.
5. CSRF: for cookie-authenticated unsafe methods, check `Origin` against the allowed frontend origin.
6. Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`. Every input has a DTO.
7. `helmet`, strict CORS allowlist from `.env`, `@nestjs/throttler` globally (stricter on auth routes).
8. Env validated at startup; app refuses to start with missing/weak secrets. `.env` is git-ignored; `.env.example` is committed.
9. Uploads: size limit, mime + magic-byte check, random file names, stored outside `src/`, served read-only.
10. Authorization checked in services (organizer/admin for meeting edits; SUPER_ADMIN protected).
11. Only parameterized queries (TypeORM query builder / repositories). No string-built SQL.
12. All tokens in links (reset, verify) are random 32 bytes, stored hashed, single-use, expiring.
13. Audit log for: login, user create/update/role/status, change-request decisions, meeting create/update/cancel/delete, designation priority changes.
14. Swagger enabled only when `SWAGGER_ENABLED=true` (off by default in production).
15. Errors never leak stack traces or SQL in production.
16. Personal data seed files (officer list) are git-ignored.

## 10. Environment variables (`backend/.env.example`)

```
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
TZ=Asia/Dhaka

DB_HOST=localhost
DB_PORT=5432
DB_USER=bbs_meeting
DB_PASSWORD=change_me
DB_NAME=bbs_meeting

JWT_ACCESS_SECRET=at_least_32_random_characters
JWT_REFRESH_SECRET=another_32_random_characters
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="BBS সভা সূচি <no-reply@bbs.gov.bd>"
MAIL_DRY_RUN=true            # true = log mails instead of sending (development)

UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=2
SWAGGER_ENABLED=true

SEED_SUPER_ADMIN_EMAIL=admin@bbs.gov.bd
SEED_SUPER_ADMIN_PASSWORD=
SEED_OFFICER_DEFAULT_PASSWORD=   # development only; leave empty in production
```

## 11. Seed data

1. Designations: the table in 6.1 (upsert by nameEn).
2. Wings: every distinct `wing_bn`/`wing_en` in the CSV, plus these cells (upsert by nameEn):
   ECDS Cell, SDG Cell, Planning and Development Cell, R&D Cell, PLS Cell (Bangla names as in the CSV's
   `additional_charges` column).
3. Super admin `admin@bbs.gov.bd` — a system account, not an officer: no designation, no wing,
   password from `SEED_SUPER_ADMIN_PASSWORD`, mustChangePassword = true. It cannot organize meetings
   (no designation = no priority).
4. Officers from `backend/src/database/seeds/data/officers.csv` (git-ignored, already cleaned; the
   Secretary is the first row). CSV columns:
   `source_sl, name_bn, name_en, designation_bn, designation_en, designation_remark, wing_bn, wing_en,
   organization_bn, organization_en, login_email, mobile, mobile_alt, office_phone, fax,
   additional_charges (" | "-separated), role`.
   - Rows without `login_email` are skipped and listed in the seed report.
   - notificationEmail = loginEmail (already verified).
   - Password: `SEED_OFFICER_DEFAULT_PASSWORD` if set (development only), otherwise a random unusable
     password so officers must use "forgot password". mustChangePassword = true either way.
   - additional_charges → `user_additional_charges` rows.
5. Seeds are idempotent: designations and wings are upserted; users are inserted only if their
   loginEmail does not exist yet (an existing user is never overwritten).
6. `npm run seed` prints a summary: created / skipped / already existing, with reasons.

## 12. Build order

Backend: 1 scaffold & security baseline → 2 entities & migrations → 3 seeds → 4 auth →
5 users/designations/wings → 6 profile & change requests → 7 notifications & mail outbox →
8 meetings & conflict engine → 9 reports & PDF → 10 audit, tests, hardening.
Frontend afterwards.
