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
└── frontend/          ← Next.js app (see §13)
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
| Scheduling | `@nestjs/schedule` (outbox worker every minute, daily outbox cleanup, meeting auto-complete every 15 min); off when `SCHEDULER_ENABLED=false` |
| Tests | Jest unit tests (mocks) + e2e tests on a separate database `DB_NAME_TEST` (`backend/.env.test`) |
| PDF | Puppeteer (HTML → PDF) — required so Bangla text shapes correctly; Bangla font bundled from `@fontsource/noto-sans-bengali` (no internet fonts) |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Timezone | Store `timestamptz` (UTC). Display and compute "today/week/month" in `Asia/Dhaka`. |

## 4. Backend folder structure

```
backend/
├── src/
│   ├── main.ts                  bootstrap; app.setup.ts: prefix /api/v1, helmet/CSP, CORS, cookies, request id,
│   │                            ValidationPipe, Swagger (+ basic auth in production), /uploads static files
│   ├── app.module.ts            global guards: Throttler → Origin (CSRF) → JwtAuth → Roles; exception filter
│   ├── config/                  env validation schema + production safety checks
│   ├── database/
│   │   ├── data-source.ts       TypeORM DataSource for CLI (migrations)
│   │   ├── entities.ts          explicit entity list (app + CLI)
│   │   ├── migrations/
│   │   └── seeds/               seed scripts (+ seed data files that are git-ignored)
│   ├── common/
│   │   ├── decorators/          @CurrentUser(), @Roles(), @Public(), @AllowPendingPasswordChange() (SUPER_ADMIN)
│   │   ├── guards/              JwtAuthGuard, RolesGuard, OriginGuard
│   │   ├── filters/             global exception filter (Bangla messages, requestId, no leaks)
│   │   ├── interceptors/        upload error translation
│   │   ├── middleware/          request id + access log
│   │   ├── logging/             TypeORM logger that never logs query parameters
│   │   ├── pipes/               ValidationPipe factory, UUID pipe
│   │   ├── dto/                 PaginationQueryDto, PaginatedResponseDto, transforms
│   │   └── utils/               time (Asia/Dhaka ranges), phone (01XXXXXXXXX), digits, password, token, html, sql
│   └── modules/
│       ├── auth/                login, tokens, password reset / set-password links
│       ├── users/  profile/  designations/  wings/  change-requests/
│       ├── meetings/            includes the conflict engine (conflict-engine.service.ts + meeting-rules.ts)
│       ├── notifications/       NotificationsService.notify + channels (in-app, e-mail)
│       ├── mail/                outbox entity, worker, templates, admin outbox API
│       ├── reports/             summaries + PDF (Puppeteer)
│       ├── admin/               dashboard stats
│       ├── audit/               audit log (write + read API with redaction)
│       └── health/
├── test/                        e2e tests, test-database setup
└── scripts/                     openapi export, docs/API.md generator
```

Each module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/`.
Generated docs: `docs/openapi.json` (`npm run openapi:export`), `docs/API.md` (`npm run docs:api`),
`docs/SECURITY.md` (§9 item by item), `docs/ERD.md`.
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
  Since 2026-11-09 this forced change exists **only for the SUPER_ADMIN**: officers and admins never get it (§6.2).
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
  only after clicking a verification link sent to it (token hashed, expires in 24 h, single use).
  The current address gets a short "change requested" notice.
- **Mobile numbers** are stored as `01XXXXXXXXX` (Bangla/English digits and `+880` accepted on input).
- Officer can edit directly: name (bn/en), photo, mobile, office phone, fax, wing, designation remark,
  additional charges, password, notification email (with verification).
- **Designation change** needs admin approval (it changes priority). Until approved, the old designation applies.
- **Default password (owner decision 2026-11-09):** every officer account (OFFICER and ADMIN, never the
  SUPER_ADMIN) uses one default password, `DEFAULT_OFFICER_PASSWORD` from the environment (never in code,
  docs, logs or mails). Seeded officers, accounts created by an admin (`POST /users`) and admin resets
  (`POST /users/:id/reset-password`, which also ends all sessions) get it with `mustChangePassword = false`
  and `users.passwordIsDefault = true`. There is **no forced change and no reminder** in the UI. Officers may
  still change their password voluntarily (`/change-password`); that, or a forgot-password link, sets
  `passwordIsDefault = false`. Mails say "অফিস থেকে জানানো ডিফল্ট পাসওয়ার্ড" — never the password.
  Admins see `passwordIsDefault` in `GET /users` (filter `?passwordIsDefault=true`) and the user detail.
  Existing data: `npm run users:apply-default-password -- --dry-run | --yes` (OFFICER/ADMIN, not the SUPER_ADMIN,
  not test accounts ending in `@example.com`; revokes their sessions; one audit entry with the count).
- Change request flow: officer submits → admins get bell notification + email → admin approves (optional
  note) or rejects (**note required**, owner decision 2026-11-09) → on approve the change is re-validated and
  applied automatically → officer is notified (for login email: both old and new addresses are notified,
  and all sessions are ended). Only one PENDING request per type per officer; the officer can cancel a
  PENDING request. An admin cannot approve their own request.

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
- People of a meeting = organizer ∪ chair ∪ participants; the organizer always has a `meeting_participants`
  row (role `ORGANIZER`). Duration at most 12 h; start at most 5 minutes in the past. SUPER_ADMIN (no
  designation) cannot organize or be invited. Meetings that already ended cannot be edited, only completed.
- Visibility: only the meeting's people and admins can open a meeting; everyone else gets 404.
- A job every 15 minutes completes SCHEDULED meetings that ended more than 1 hour ago.

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
- The conflict check and the insert run inside one DB transaction to avoid race conditions; the transaction
  takes `pg_advisory_xact_lock` per person (sorted), so two parallel requests for the same officer cannot both pass.
- Touching meetings (10:00–11:00 and 11:00–12:00) do not overlap. The engine re-runs on update only when the
  time or the people change; the meeting never clashes with itself.
- 409 body: `{ message, blocking: [{ meetingId, title, startAt, endAt, priority, organizer, sharedOfficers }] }`.
  Titles of other meetings are shown only to their people and admins ("অন্য একটি সভা" otherwise); the same
  rule applies to the conflict notice (N's title only for N's invitees).
- A PENDING conflict is also RESOLVED when either meeting is completed or moved, or the shared officer is
  removed from either meeting.

### 6.5 Notifications
- Channels: in-app bell (always) and email (to the notification email).
- Email goes through a DB outbox (`email_outbox`). A scheduled worker sends pending mail every minute,
  retries with backoff up to 5 times, and records the last error. Creating a meeting never waits for SMTP.
  - The worker claims up to 20 due rows with `SELECT … FOR UPDATE SKIP LOCKED`, so two workers never send
    the same mail. Retry after 1, 5, 15, 60 minutes; FAILED after the 5th attempt. `lastError` is short and
    never contains SMTP credentials. Admins can retry FAILED mail.
  - After a mail is SENT its body (`html`, `text`) is set to NULL; a daily job deletes SENT rows older than
    30 days.
  - `MAIL_DRY_RUN=true`: no SMTP connection; only the masked recipient and subject are logged and the mail is
    marked SENT (in development a copy is written to the git-ignored `backend/tmp/mail-preview/`).
  - Every user-targeted message goes through `NotificationsService.notify(userIds, message, channels)` and
    e-mail always goes to the user's verified notification email.
- Mail templates: one Bangla HTML layout (BBS header, footer "এটি স্বয়ংক্রিয় বার্তা, উত্তর দেবেন না") with a
  plain-text version; all user-provided text is HTML-escaped. **No mail ever contains a password.**
- Channel code is pluggable (`NotificationChannel` interface) so SMS/WhatsApp can be added later.

### 6.6 Reports
- Periods: `day`, `week` (Sunday–Saturday), `month`, `year` (Jan–Dec), `fiscal-year` (July–June). All in Asia/Dhaka.
- Officer report: meetings I organized / attended, counts by status, total hours, conflicts raised against my meetings.
- Admin report: same, across the office, filterable by wing and designation.
- PDF download for every report, Bangla text, BBS header, generated date.
- The dashboard opens on **today's meetings** by default.
- A meeting belongs to a period when its **start** lies in the Asia/Dhaka range `[start, end)` from
  `common/utils/time`; `?period=day|week|month|year|fiscal-year&date=YYYY-MM-DD` (default: month, today).
- Hours count SCHEDULED and COMPLETED meetings (cancelled meetings take no time).
- Officer report: totalMeetings, organized, attended, byStatus, totalHours, conflictsRaisedAgainstMyMeetings,
  conflictsIRaised, byDay, plus a paginated meeting list with my role.
- Office report: same totals plus byWing, byDesignation (the **organizer's** wing/designation), top 10
  organizers, pending/resolved conflicts and the 5 busiest days; filters `wingId`, `designationId`.
- PDF: A4, header "বাংলাদেশ পরিসংখ্যান ব্যুরো — সভা প্রতিবেদন", officer or filters, period in Bangla, generation
  time (Asia/Dhaka), summary and meeting tables, footer "পৃষ্ঠা X / Y", Bangla digits. One shared browser,
  max 2 renders at once, 30 s timeout, JavaScript off and all network requests blocked; file name like
  `meeting-report-2026-11.pdf`.

## 7. Data model (TypeORM entities)

All tables have `id` (uuid), `createdAt`, `updatedAt`.

- **designations**: nameBn, nameEn, priority (int), isActive
- **wings**: nameBn, nameEn, isActive
- **users**: loginEmail (unique, citext/lowercased), notificationEmail, pendingNotificationEmail,
  notificationEmailTokenHash, notificationEmailTokenExpiresAt, passwordHash, nameBn, nameEn,
  mobile, mobileAlt, officePhone, fax, photoPath, designationId → designations (nullable only for the
  SUPER_ADMIN system account), designationRemark, wingId → wings (nullable),
  organizationBn, organizationEn (e.g. "বাংলাদেশ পরিসংখ্যান ব্যুরো" / "Bangladesh Bureau of Statistics"),
  bcsBatch, role (enum), isActive, mustChangePassword, passwordIsDefault, failedLoginCount, lockedUntil,
  lastLoginAt
- **user_additional_charges**: userId, description
- **refresh_tokens**: userId, tokenHash, expiresAt, revokedAt, replacedById, userAgent, ip
- **password_reset_tokens**: userId, tokenHash, purpose (`RESET` | `SET_INITIAL`), expiresAt, usedAt
- **change_requests**: userId, type (`LOGIN_EMAIL` | `DESIGNATION`), newValue (json), status
  (`PENDING` | `APPROVED` | `REJECTED`), reviewedById, reviewedAt, reviewNote
- **meetings**: title, agenda, startAt, endAt, room, onlineLink, organizerId, chairId, priority,
  status, cancelReason, notes, cancelledAt, completedAt
- **meeting_participants**: meetingId, userId, role (`CHAIR` | `MEMBER`) — unique (meetingId, userId)
- **meeting_conflicts**: higherMeetingId, lowerMeetingId, userId (shared officer), status
  (`PENDING` | `RESOLVED`), resolvedAt
- **notifications**: userId, type, title, body, link, readAt
- **email_outbox**: to, subject, html (nullable, purged after sending), text (plain-text version, purged too),
  status (`PENDING` | `SENT` | `FAILED`), attempts, lastError, nextAttemptAt, sentAt
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
| POST | `/auth/reset-password` | 🔓 | Token + new password (accepts reset links and set-password links) |

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
| DELETE | `/profile/change-requests/:id` | 👤 | Cancel my own PENDING request |

### Users (admin)
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/users/directory` | 👤 | Minimal active officer list (id, names, designation, wing, photo) for the participant picker |
| GET | `/users` | 🛡 | Search/filter/paginate (q, wingId, designationId, role, isActive) |
| GET | `/users/:id` | 🛡 | Full user |
| POST | `/users` | 🛡 | Create officer with the default officer password (no forced change); the welcome mail never contains the password |
| PATCH | `/users/:id` | 🛡 | Edit any field including loginEmail and designation |
| PATCH | `/users/:id/status` | 🛡 | Activate / deactivate |
| PATCH | `/users/:id/role` | 🛡 | Make ADMIN / OFFICER (SUPER_ADMIN untouchable) |
| POST | `/users/:id/reset-password` | 🛡 | Reset to the default officer password, end all sessions, mail a notice (without the password) |

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
| GET | `/meetings/:id` | 👤 | Detail (organizer, participants, admins only); people with designation and wing |
| POST | `/meetings/check-conflicts` | 👤 | Dry run of the conflict engine |
| POST | `/meetings` | 👤 | Create (409 on blocking conflict) |
| PATCH | `/meetings/:id` | 👤 | Update (organizer/admin; re-runs conflict engine) |
| POST | `/meetings/:id/cancel` | 👤 | Cancel with reason (organizer/admin) |
| POST | `/meetings/:id/complete` | 👤 | Mark completed, save notes/minutes |
| DELETE | `/meetings/:id` | 🛡 | Hard delete (admin only) |

### Conflicts
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/conflicts/mine` | 👤 | Conflicts on meetings I organize or attend (`?status=PENDING` default, `RESOLVED` = history); each meeting carries `organizedByMe` |
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

1. Passwords: argon2id; min 8 chars with letters + digits; not equal to the email; never returned by any API
   and never sent by mail. New accounts and admin resets get the default officer password (§6.2, owner decision
   2026-11-09); the mail only refers to "the default password the office announced".
2. Login: **no account lock** (owner decision, 2026-11-09).
   - One generic error for every failed login, known or unknown email, always suggesting "forgot password".
   - Progressive delay: after 5 consecutive failures for an email, each further attempt is answered only
     after 2 s, 4 s, 8 s, 16 s, then 30 s (cap). The delay runs before the password check (also for a correct
     password) and follows the same pattern for emails without an account, so neither the message nor the
     timing reveals whether an account exists. A correct password resets the counter.
   - Per-IP throttling on login; record lastLoginAt and failedLoginCount (`lockedUntil` stays unused).
3. Tokens: access token 15 min, refresh token 7 days with rotation and reuse detection (reuse → revoke all of that user's tokens). Refresh tokens stored hashed.
4. Cookies: `httpOnly`, `secure` in production, `sameSite=lax` (access) / `strict` (refresh, path `/api/v1/auth`). Bearer header also accepted for Swagger.
5. CSRF: for cookie-authenticated unsafe methods, check `Origin` against the allowed frontend origin.
6. Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`. Every input has a DTO.
7. `helmet` (explicit CSP; HSTS in production), strict CORS allowlist from `.env`, `@nestjs/throttler` globally
   (stricter on auth, mail-sending and PDF routes); `TRUST_PROXY` so the real client IP is used behind nginx.
8. Env validated at startup; app refuses to start with missing/weak secrets. `.env` is git-ignored; `.env.example` is committed.
   In production it also refuses: Swagger without basic auth, `MAIL_DRY_RUN` not set explicitly, localhost in
   `CORS_ORIGINS`, or non-https `APP_URL`/`FRONTEND_URL` (secure cookies). `DEFAULT_OFFICER_PASSWORD` is
   required everywhere and must meet the password rule; it is allowed in production (owner decision
   2026-11-09), where startup logs one warning line "Default officer password is enabled" (never the value).
9. Uploads: size limit, mime + magic-byte check, random file names, stored outside `src/`, served read-only.
10. Authorization checked in services (organizer/admin for meeting edits; SUPER_ADMIN protected).
11. Only parameterized queries (TypeORM query builder / repositories). No string-built SQL.
12. All tokens in links (reset, verify) are random 32 bytes, stored hashed, single-use, expiring.
13. Audit log for: login, user create/update/role/status, change-request decisions, meeting create/update/cancel/delete, designation priority changes.
14. Swagger enabled only when `SWAGGER_ENABLED=true` (off by default); in production only behind HTTP basic auth
    (`SWAGGER_USER`, `SWAGGER_PASSWORD`).
15. Errors never leak stack traces or SQL in production. Every response has an `X-Request-Id` (also in error bodies
    and error logs). Logs never contain query parameters, request bodies, passwords or tokens.
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
SCHEDULER_ENABLED=true          # cron jobs (mail worker, cleanups); false in e2e tests
SWAGGER_USER=                   # production: basic auth for /api/docs (required if SWAGGER_ENABLED=true)
SWAGGER_PASSWORD=               # production: at least 12 characters
TRUST_PROXY=false               # behind nginx: 1 (one proxy hop)
THROTTLE_LIMIT=100              # requests per minute per IP (auth routes stay stricter); frontend e2e: 1000

SEED_SUPER_ADMIN_EMAIL=admin@bbs.gov.bd
SEED_SUPER_ADMIN_PASSWORD=
DEFAULT_OFFICER_PASSWORD=        # required: the one default officer password (letters + digits, ≥ 8); never commit it
```

e2e tests additionally read `backend/.env.test` (copy of the committed `.env.test.example`):
`DB_NAME_TEST=bbs_meeting_test`, `NODE_ENV=test`, `SCHEDULER_ENABLED=false`, `MAIL_DRY_RUN=true`,
`UPLOAD_DIR=./tmp/test-uploads`. One-time SQL: `CREATE DATABASE bbs_meeting_test OWNER bbs_meeting;`

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
   - Password: `DEFAULT_OFFICER_PASSWORD` with `passwordIsDefault = true` and `mustChangePassword = false`
     (owner decision 2026-11-09; before that: forced change).
   - additional_charges → `user_additional_charges` rows.
5. Seeds are idempotent: designations and wings are upserted; users are inserted only if their
   loginEmail does not exist yet (an existing user is never overwritten).
6. `npm run seed` prints a summary: created / skipped / already existing, with reasons.

## 12. Build order

Backend: 1 scaffold & security baseline → 2 entities & migrations → 3 seeds → 4 auth →
5 users/designations/wings → 6 profile & change requests → 7 notifications & mail outbox →
8 meetings & conflict engine → 9 reports & PDF → 10 audit, tests, hardening.
**Status: backend steps 1–10 are complete** (see `docs/API.md`, `docs/SECURITY.md`; tag `backend-v1.0`).

Frontend: F1 scaffold, auth pages, app layout, dashboard → F2 and later: meetings (form with live conflict
check, detail, cancel/complete), calendar, conflicts, reports + PDF, profile, admin pages.
**Status: F1 and F2 (meetings, calendar, conflicts, notifications) are complete.**

## 13. Frontend (`frontend/`)

### 13.1 Stack
Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, ESLint, npm.
Server data: `@tanstack/react-query`. Forms: `react-hook-form` + `zod` (rules mirror the backend DTOs).
Dates: `date-fns` + `date-fns-tz`, always shown in Asia/Dhaka. Font: Hind Siliguri (`next/font/google`,
self-hosted at build time). No UI kit: small own components in `components/ui`. e2e tests: Playwright.

### 13.2 Folder structure
```
frontend/
├── app/
│   ├── (public)/        login, forgot-password, reset-password, set-password, verify-email
│   ├── (app)/           pages that need a session (layout = AuthGuard + AppShell)
│   └── layout.tsx       font, providers (React Query, toasts, AuthProvider)
├── components/
│   ├── ui/              Button, Input, Select, Textarea, Modal, Badge, Card, Table, Spinner, EmptyState, Toast, Alert
│   ├── layout/          header, sidebar/drawer, notification bell, user menu, guard, placeholders
│   ├── auth/  dashboard/
├── lib/                 api.ts (fetch client), endpoints.ts, api-schema.ts (generated), types.ts,
│                        schemas.ts (zod), format.ts (Bangla digits/dates), time.ts (Dhaka ranges), roles.ts
├── messages/bn.ts       every UI text (one typed object; English can be added later)
├── providers/           AppProviders, AuthProvider
└── e2e/                 Playwright tests + global setup (dedicated test officer)
```

### 13.3 Pages
| Path | Group | F1 |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password?token=`, `/set-password?token=`, `/verify-email?token=` | public | built |
| `/change-password` | app (voluntary; forced only for the SUPER_ADMIN while `mustChangePassword`) | built |
| `/dashboard` (default after login): today's meetings, week/month tabs, today's summary, pending-conflict warning | app | built |
| `/meetings` (filters, admin "সকল সভা"), `/meetings/new?start=&end=`, `/meetings/:id`, `/meetings/:id/edit` | app | F2 |
| `/calendar` (week 08–18 grid / month / phone day list), `/conflicts` (pending, resolved, admin all), `/notifications` | app | F2 |
| `/reports`, `/profile` | app | empty page (built in F3) |
| `/admin/*` (users, designations & wings, change requests, audit log) | app, ADMIN/SUPER_ADMIN only | empty page (F3) |

Pages not built yet stay **empty**: layout, header and sidebar only, nothing in the main area (owner decision
2026-11-09; no "coming soon" text).

### 13.4 Auth handling
- The browser talks only to the Next.js server. `next.config.ts` rewrites `/api/v1/*` and `/uploads/*` to
  `BACKEND_URL` (`frontend/.env.local`), so the backend's httpOnly cookies are same-origin. Tokens are never
  read by JavaScript and never stored in localStorage/sessionStorage.
- `lib/api.ts`: `credentials: "include"`, JSON parsing, errors → `ApiError` (Bangla backend message + `requestId`).
  On 401 it calls `POST /auth/refresh` once (one refresh in flight, shared) and retries the request once.
- `AuthProvider` loads `GET /auth/me`. `(app)` layout guard: no session → `/login?next=<path>` (only same-site
  paths are accepted); `mustChangePassword` → `/change-password` with a reduced layout (since 2026-11-09 only the
  SUPER_ADMIN can have it; officers on the default password see **no banner or reminder**). Logout calls
  `POST /auth/logout` and clears the React Query cache. Role helpers in `lib/roles.ts` (`isAdmin`); the backend
  checks every permission again.
- The browser's `Origin` is `FRONTEND_URL`, which must be listed in the backend's `CORS_ORIGINS` (CSRF check).

### 13.5 Design rules
- All UI text in Bangla from `messages/bn.ts`; numbers and dates with Bangla digits via `lib/format.ts`; all
  times in Asia/Dhaka (week Sunday–Saturday, same as the backend).
- Simple and clean; BBS green (`#006a4e`, `brand-*` colours) as the accent, slate neutrals.
- Responsive: sidebar on large screens, a menu button with a drawer on phones and tablets.
- Accessible: visible keyboard focus everywhere, labels on every field, native `<dialog>` for modals/drawer.
- **No icons in the UI; use short Bangla text labels instead** (owner decision 2026-11-09): no SVG icons, icon
  components or libraries, no emoji or symbols used as icons, no icon-only buttons. Examples: "নোটিফিকেশন (৩)",
  "মেনু", "বন্ধ করুন", "আগের" / "পরের", the user's name as the user-menu button, status and conflicts as coloured
  text badges, the protected SUPER_ADMIN as the text badge "সুরক্ষিত". The browser-tab favicon stays; charts are
  allowed.
- Every data view has loading, empty and error states; errors show the backend message and the `requestId`.

### 13.6 Meeting form and live conflict check (F2)
- One form for create and edit; Dhaka date + start/end time (quick 30 min / 1 h / 2 h), room, https link,
  participants from `GET /users/directory` (search, wing filter, "add the whole wing" with a count), chair
  chosen from the meeting's people. The priority is shown before saving (my designation now; on edit the
  stored snapshot).
- Whenever the time or the people change, `POST /meetings/check-conflicts` runs 600 ms later (older requests
  aborted): green = no clash, amber = lower meetings will be asked to move, red = blocked (submit disabled,
  clashing people highlighted). A 409 on save shows the same red panel and keeps the form data.
- After create/edit/cancel/complete/delete, every cached "meetings", "conflicts", "notifications" and "reports"
  query is refreshed (`lib/invalidate.ts`).
