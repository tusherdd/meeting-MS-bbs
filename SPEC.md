# BBS Meeting Schedule System — Project Specification

> Single source of truth for this project. Read this file before every task.
> Office: Bangladesh Bureau of Statistics (BBS) and Statistics & Informatics Division (SID).
> UI language: Bangla now (English later). Code, comments, API names: English.

---

## 1. Goal

An office-wide web application where every officer can create and manage meetings.
Meetings carry a **priority taken from the chair's designation** (the organizer's when the chair is
a guest officer or there is none, v1.5). A higher-priority meeting is never blocked by a conflict;
instead the organizers and shared officers of the lower-priority meetings that clash are informed
and may cancel or decide otherwise.
Every officer has a personal dashboard with today / weekly / monthly / yearly reports,
downloadable as PDF.

## 2. Repository layout

```
bbs-meeting/
├── SPEC.md            ← this file
├── README.md          ← overview, local setup, production deployment guide
├── CLAUDE.md          ← working rules for the AI assistant
├── docs/              ← API.md + openapi.json (generated), ERD.md, SECURITY.md
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
| Scheduling | `@nestjs/schedule` (outbox worker every minute, daily outbox cleanup, meeting auto-complete every 15 min); off when `SCHEDULER_ENABLED=false`. A job never crashes the app or blocks other jobs; a temporary DB connection error is logged once as a short WARN and retried on the next tick (`common/scheduling/scheduled-job.ts`) |
| Tests | Jest unit tests (mocks) + e2e tests on a separate database `DB_NAME_TEST` (`backend/.env.test`) |
| PDF | Puppeteer (HTML → PDF) — required so Bangla text shapes correctly; fonts embedded from `backend/assets/fonts/`: **NikoshBAN** for Bangla, **Tinos** for English (no internet fonts, §13.10) |
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
- **Priority numbers are never shown (v1.5, owner decision 2026-11-16)** in the UI, mails, bell
  notifications or PDFs — not on the profile, in designation selects (profile change request, admin
  user form, admin change requests), the meeting form / detail, the ডুপ্লিকেট সভা pages and panels or
  the office report. The ONLY place a priority is shown and edited is Admin → "পদবি ও অগ্রাধিকার".
  The API still returns priorities (the logic is unchanged). Test: `e2e/priority-hidden.spec.ts`.

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
  `passwordIsDefault = false`. Mails say "অফিস থেকে জানানো Default Password" — never the password.
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
  organizer (creator), optional chairperson (an officer OR one guest officer, §6.7), participants
  (officers), guest officers (§6.7), notes/minutes, status.
- Status: `SCHEDULED`, `CANCELLED`, `COMPLETED`. Only `SCHEDULED` meetings take part in conflict checks.
- **Meeting priority comes from the chair (v1.5, owner decision 2026-11-16)** — `meeting.priority` is a
  snapshot stored on the meeting (`meeting-rules.ts` `meetingPriority()`):
  - the chair is an internal officer → the chair's designation priority (higher or lower than the organizer's);
  - the chair is a guest officer, or there is no chair → the organizer's designation priority.
  - Taken on create; taken again on edit **only when the internal chair changes** (then the conflict check
    re-runs with the new priority, even if time and people are the same). Otherwise it stays a snapshot
    (later designation changes do not touch it). Meetings created before v1.5 were **not** backfilled.
  - When an internal officer other than the organizer becomes chair (create or edit), that chair gets a
    separate bell + mail notice (`MEETING_CHAIR_ASSIGNED`): "আপনাকে “[শিরোনাম]” সভার সভাপতি করা হয়েছে,
    তাই সভাটি আপনার পদবির অগ্রাধিকার পেয়েছে। ([তারিখ, সময়])" — no number. Audit entry
    `MEETING_CHAIR_PRIORITY_APPLIED` (actor, meeting, before `{priority}`, after `{chairId, priority}`).
- Every officer creates their own meetings. There is **no "on behalf of" option**: nobody can create a meeting
  for someone else. Choosing a chair is how a meeting gets a higher (or lower) priority.
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
| `p < E.priority` (N is higher) | N is saved. A `meeting_conflicts` row is created (status `PENDING`). E's organizer **and** each shared officer get an **informational** bell notification + email (v1.5, not a cancel request; see below). |
| `p >= E.priority` (equal or lower) | N is **blocked**. API returns `409 Conflict` with the list of clashing meetings and officers. Nothing is saved. |

- If any clash is blocking, the whole request is rejected (even if other clashes would be allowed).
- **Conflict notice (v1.5):** the same message to E's organizer and to each newly affected shared officer,
  once per person (someone who is both gets one): title "সময় কনফ্লিক্ট: [E-এর শিরোনাম]", body
  "সময় কনফ্লিক্ট: একই সময়ে [শেয়ার্ড ব্যক্তির নাম]-এর [পদবি] মহোদয়ের সাথে আরেকটি সভা আছে ([তারিখ, সময়])।
  আপনি চাইলে আপনার সভা “[E-এর শিরোনাম]” বাতিল করতে পারেন অথবা অন্য সিদ্ধান্ত নিতে পারেন।"
  [পদবি] = designation of N's internal chair, else N's organizer. A shared officer reads "আপনার" (or
  "আপনার ও [নাম]-এর") and, when not E's organizer, "… সভাটি বাতিলের জন্য আয়োজককে বলতে পারেন …". N's title
  appears as "আরেকটি সভা (“…”)" only for people invited to N. The conflict stays PENDING until it
  resolves by itself; cancel / reschedule stay on the ডুপ্লিকেট সভা page. Guest officers are never part of
  the check and never get this notice.
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
  removed from either meeting, or (v1.5, after a chair change) the higher meeting no longer has a
  strictly higher priority than the lower one.

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
- Guest officers (v1.5): every meeting row of the day/week/month/year/fiscal-year reports (web and PDF) shows
  its chair (`chairNameBn`: the internal chair, else the guest chair's name) and, under the meeting, its
  guests as "অতিথি কর্মকর্তা: নাম — পদবি; …". Guests are never counted in any total or statistic and have
  no dashboard or report of their own.
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

### 6.7 Guest officers — "অতিথি কর্মকর্তা" (v1.5, owner decision 2026-11-16)
People invited to a meeting who are not in the database. They never log in.
- Table `meeting_guests` (§7). Create/update DTOs take an optional `guests` array (on update it replaces
  the whole list, matched by email): `name` and `designation` (required, trimmed, `normalizeBangla`, max
  200), `email` (required, valid, trimmed and lowercased, max 254), optional `isChair`. At most 50 per meeting.
- Rejected with a Bangla message: duplicate email in the meeting (case-insensitive); an email that belongs
  to an existing account (login or notification email) — "select that officer from the list instead";
  more than one chair in total (officer `chairId` + a guest chair, or two guest chairs). When an update
  sends only one side (`chairId` or `guests`) and it sets a chair, the stored chair of the other kind is
  cleared; removing the guest who chairs leaves the meeting without a chair. The database enforces one
  guest chair (partial unique index) and "never both kinds" (deferred constraint triggers).
- A guest chair gives the meeting the organizer's priority (§6.3). Guests are not in the conflict check.
- Mail only (outbox, respects `MAIL_DRY_RUN`, `guestMeetingMail`): invitation (create or added), update
  (title / time / room / online link / agenda / chair changed), cancellation (with reason), removal. Each
  mail carries every detail (title, date and Dhaka time range, room, online link, agenda, organizer name
  and designation, chair) and no link that needs a login; never a password.
- `GET /meetings/:id` returns `guests` (chair first). The phrase for outside guests used before is never
  used; the term is always "অতিথি কর্মকর্তা" (checked by `wording.spec.ts`).

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
  (`PENDING` | `APPROVED` | `REJECTED` | `CANCELLED`), reviewedById, reviewedAt, reviewNote
- **meetings**: title, agenda, startAt, endAt, room, onlineLink, organizerId, chairId, priority,
  status, cancelReason, notes, cancelledAt, completedAt
- **meeting_participants**: meetingId, userId, role (`ORGANIZER` | `CHAIR` | `MEMBER`) — unique (meetingId, userId)
- **meeting_guests** (v1.5): meetingId (→ meetings, CASCADE), name, designation, email (lowercased), isChair —
  unique (meetingId, lower(email)); one guest chair per meeting; never together with `meetings.chairId`
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
| GET | `/users` | 🛡 | Search/filter/paginate (q, wingId, designationId, role, isActive, passwordIsDefault) |
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
| GET | `/meetings/:id` | 👤 | Detail (organizer, participants, admins only); people with designation and wing; guest officers |
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
| GET | `/audit-logs` | 🛡 | Audit trail (filter by actor, action, entity, date) |
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
7. `helmet` (explicit CSP; HSTS in production), strict CORS allowlist from `.env`, `@nestjs/throttler` globally:
   - requests with a valid access token are counted **per user id** (`THROTTLE_USER_LIMIT`, default 300/min), so
     officers behind one office NAT do not share a budget; everything else is counted **per client IP**
     (`THROTTLE_LIMIT`, default 100/min). The token check is signature + expiry only (no DB query).
   - login, forgot/reset/change password keep stricter limits **per IP** (`@ThrottleByIp()`, `auth.constants.ts`);
     mail-sending profile routes and PDF routes have their own lower limits (per user).
   - `TRUST_PROXY` so the real client IP is used behind nginx.
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
# DB_POOL_MAX=10                 # optional: pg pool size (default 5 in development/test, 10 in production)
# DB_CONNECTION_TIMEOUT_MS=10000 # optional: wait for a DB connection at most this long, then fail (cron jobs retry next tick)
# DB_IDLE_TIMEOUT_MS=30000     # optional: close idle pooled connections after this long

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
THROTTLE_LIMIT=100              # per minute per client IP, requests without a valid session (login/password routes stay stricter)
THROTTLE_USER_LIMIT=300         # per minute per logged-in user (counted by user id, not IP: one office NAT is fine)

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

Frontend: F1 scaffold, auth pages, app layout, dashboard → F2 meetings (form with live conflict check, detail,
cancel/complete), calendar, conflicts, notifications → F3 reports + PDF, profile, admin panel, production
readiness (accessibility, error pages, CSP, standalone build, deployment guide).
**Status: F1, F2 and F3 are complete. The whole system is finished (tag `v1.0`).**

Release **v1.5** (2026-11-16, tag `v1.5`): (1) dashboard card for conflicts on my meetings removed;
(2) wording "সময় কনফ্লিক্ট" / "ডুপ্লিকেট সভা" (§13.12); (3) priority numbers hidden (§6.1); (4) priority from
the chair (§6.3); (5) informational conflict notice (§6.4); (6–7) meeting form without the priority box,
the green heading and the duration buttons (§13.6); (8) WebKit Bangla font (§13.10); (9) guest officers (§6.7).

## 13. Frontend (`frontend/`)

### 13.1 Stack
Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, ESLint, npm.
Server data: `@tanstack/react-query`. Forms: `react-hook-form` + `zod` (rules mirror the backend DTOs).
Dates: `date-fns` + `date-fns-tz`, always shown in Asia/Dhaka. Font: **NikoshBAN** for Bangla (`next/font/local`,
self-hosted from `app/fonts/NikoshBAN.ttf`); **Times New Roman** from the user's computer for English (§13.10). No UI kit: small own components in `components/ui`. e2e tests: Playwright.

### 13.2 Folder structure
```
frontend/
├── app/
│   ├── (public)/        login, forgot-password, reset-password, set-password, verify-email
│   ├── (app)/           pages that need a session (layout = AuthGuard + AppShell); admin/ has its own
│   │                    layout (AdminGate: 404 for officers + admin sub-menu)
│   ├── layout.tsx       font, providers (React Query, toasts, offline banner, AuthProvider)
│   └── not-found.tsx, error.tsx, global-error.tsx    404 and 500 pages
├── proxy.ts             Content-Security-Policy with a per-request nonce
├── components/
│   ├── ui/              Button, Input, Select, Textarea, Modal, ConfirmModal, Badge, Card, Table, Tabs,
│   │                    Pagination, Spinner, EmptyState, Toast, Alert
│   ├── layout/          header, sidebar/drawer, notification bell, user menu, guard, offline banner
│   ├── auth/  dashboard/  meetings/  calendar/  conflicts/  notifications/
│   ├── reports/  profile/  change-requests/  admin/
├── lib/                 api.ts (fetch client + file download), endpoints.ts, api-schema.ts (generated),
│                        types.ts, schemas.ts (zod), format.ts (Bangla digits/dates), time.ts (Dhaka ranges),
│                        report-period.ts, phone.ts, user-policy.ts, audit-diff.ts, roles.ts
├── messages/bn.ts       every UI text (one typed object; English can be added later)
├── providers/           AppProviders, AuthProvider
└── e2e/                 Playwright tests + global setup (dedicated test officer)
```

### 13.3 Pages
| Path | Group | Built in |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password?token=`, `/set-password?token=`, `/verify-email?token=` | public | F1 |
| `/change-password` | app (voluntary; forced only for the SUPER_ADMIN while `mustChangePassword`) | F1 |
| `/dashboard` (default after login): today's meetings, week/month tabs, today's summary (total, organized, attended, hours — the conflict card was removed in v1.5), pending-conflict warning | app | F1 |
| `/meetings` (filters, admin "সকল সভা"), `/meetings/new?start=&end=`, `/meetings/:id`, `/meetings/:id/edit` | app | F2 |
| `/calendar` (week 08–18 grid / month / phone day list), `/conflicts` (pending, resolved, admin all), `/notifications` | app | F2 |
| `/reports?period=&date=&page=` | app | F3 |
| `/profile` | app | F3 |
| `/admin`, `/admin/users` (+ `/new`, `/:id`), `/admin/designations`, `/admin/wings`, `/admin/change-requests`, `/admin/meetings`, `/admin/conflicts`, `/admin/reports`, `/admin/email-outbox`, `/admin/audit-logs` | app, ADMIN/SUPER_ADMIN only (others see the 404 page) | F3 |

Unknown addresses show the Bangla 404 page; a rendering error shows the 500 page with "আবার চেষ্টা করুন".

### 13.4 Auth handling
- The browser talks only to the Next.js server. `next.config.ts` rewrites `/api/v1/*` and `/uploads/*` to
  `BACKEND_URL` (`frontend/.env.local`), so the backend's httpOnly cookies are same-origin. Tokens are never
  read by JavaScript and never stored in localStorage/sessionStorage.
- `lib/api.ts`: `credentials: "include"`, JSON parsing, errors → `ApiError` (Bangla backend message + `requestId`).
  On 401 it calls `POST /auth/refresh` once (one refresh in flight, shared) and retries the request once.
- `AuthProvider` loads `GET /auth/me`. `(app)` layout guard: no session → `/login?next=<path>` (only same-site
  paths are accepted; a session that ends while the user is working → `/login?next=<path>&reason=expired`
  with the note "সেশনের মেয়াদ শেষ হয়েছে…"; "Logout" goes to plain `/login`); `mustChangePassword` →
  `/change-password` with a reduced layout (since 2026-11-09 only the
  SUPER_ADMIN can have it; officers on the default password see **no banner or reminder**). Logout calls
  `POST /auth/logout` and clears the React Query cache. Role helpers in `lib/roles.ts` (`isAdmin`); the backend
  checks every permission again.
- The browser's `Origin` is `FRONTEND_URL`, which must be listed in the backend's `CORS_ORIGINS` (CSRF check).

### 13.5 Design rules
- All UI text from `messages/bn.ts`: Bangla, with common office words in English (word list in §13.12); numbers and dates with Bangla digits via `lib/format.ts`; all
  times in Asia/Dhaka (week Sunday–Saturday, same as the backend).
- Simple and calm; colours from the BBS logo as theme tokens (v1.8, §13.16): primary green `#016b4f`, red `#e8323f`
  only for danger and errors, near-black text.
- Responsive: sidebar on large screens, a menu button with a drawer on phones and tablets.
- Accessible: visible keyboard focus everywhere, labels on every field, native `<dialog>` for modals/drawer.
- Modals are native `<dialog>` elements (focus stays inside, Escape closes, focus returns to the opener);
  every dangerous action asks for confirmation. Toasts, the conflict panel, the report range and the offline
  message are `aria-live`. Text and badge colours keep a contrast of at least 4.5:1.
- **No icons in the UI, except two in the top header: the notification bell and the profile icon** (owner
  decisions 2026-11-09 and 2026-11-14). Everything else stays text-only: no other SVG icons, no icon components or
  libraries, no emoji or symbols used as icons, no other icon-only buttons. Examples: "মেনু", "বন্ধ করুন",
  "আগের" / "পরের", status and conflicts as coloured text badges, the protected SUPER_ADMIN as the text badge
  "সুরক্ষিত". The browser-tab favicon stays; charts are allowed. The BBS logo is not an icon and is allowed only in
  the places listed in §13.16.
  - The two icons are small inline SVG components written in the project (`components/layout/header-icons.tsx`):
    no icon library, no external request, 24 px, coloured with `currentColor`, inside round 40 px buttons with
    the normal visible keyboard focus; they also fit at phone width.
  - **Bell:** unread count as a small red badge (Bangla digits, hidden when 0, "৯+" above 9); `aria-label`
    "Notification, ৩টি Unread" (just "Notification" when 0), tooltip "Notification"; opens the notification dropdown.
  - **Profile:** the user's photo when there is one, otherwise a person icon; `aria-label` and tooltip = the
    user's name; opens the menu with the name and designation on top, then প্রোফাইল, Password পরিবর্তন, লগআউট.
  - The Playwright "no icons" test allows exactly these two (`data-header-icon`, inside their header buttons)
    and fails for any other icon or `<svg>`.
- Every data view has loading, empty and error states; errors show the backend message and the `requestId`.

### 13.6 Meeting form and live conflict check (F2)
- One form for create and edit; Dhaka date + start/end time (both typed; end after start, Asia/Dhaka logic
  unchanged; the quick-duration buttons and the time-zone hint were removed in v1.5), room, https link,
  participants from `GET /users/directory` (search, wing filter, "add the whole wing" with a count).
- v1.5: no priority box. Directly above the chair select, the optional section "অতিথি কর্মকর্তা"
  (`guest-officers.tsx`): নাম, পদবি, Email and "যোগ করুন" (enabled once all three are filled and the email is
  valid and new; Enter adds instead of submitting; fields clear after adding; inline errors for an invalid or
  duplicate email); the list "নাম — পদবি — email" with "বাদ দিন". The chair select lists the organizer, the
  participants and the guests ("নাম (অতিথি কর্মকর্তা)", stored as `guest:<email>` in the form); removing the
  guest who chairs clears the chair. The detail page has an "অতিথি কর্মকর্তা" section; guests are editable.
- Whenever the time or the people change, `POST /meetings/check-conflicts` runs 600 ms later (older requests
  aborted): green = only the line "এই সময়ে নির্বাচিত কারও অন্য কোনো সভা নেই।" (no heading, v1.5), amber =
  "নিম্ন অগ্রাধিকারের ডুপ্লিকেট সভা আছে" (their organizers and shared officers will be informed), red = blocked
  (submit disabled, clashing people highlighted). Only an officer chair is sent to the check. A 409 on save shows the same red panel and keeps the form data.
- After create/edit/cancel/complete/delete, every cached "meetings", "conflicts", "notifications" and "reports"
  query is refreshed (`lib/invalidate.ts`).

### 13.7 Reports, profile and admin panel (F3)
- **Reports** (`/reports`): period tabs দিন / সপ্তাহ / মাস / বছর / অর্থবছর, date field, "আগের" / "বর্তমান" / "পরের";
  the range is shown in Bangla (backend label + first and last day). Summary cards, counts by status, a bar
  chart of meetings per day (per month for a year or fiscal year; plain HTML bars with a hidden data table,
  no SVG), paginated meeting list. The filters live in the address. "Download PDF" fetches the PDF as a Blob with
  the same filters, shows "তৈরি হচ্ছে…", saves it under the `Content-Disposition` file name and shows the
  backend's message on failure.
- **Profile** (`/profile`): only the fields `PATCH /profile` accepts; mobiles accept Bangla digits and `+880`
  and are sent as `01XXXXXXXXX`; additional charges as an editable list (max 20). Photo: preview, client-side
  type/size check (JPEG/PNG/WebP, 2 MB; the server decides), remove with confirmation; the photo is shown next
  to the name in the header. Notification email: current address, request form, "যাচাইয়ের অপেক্ষায়: …" while
  pending. Change requests: login email and designation (the select shows names only, v1.5), history with status
  and admin note, cancel a PENDING request. Voluntary password change.
- **Admin panel** (`/admin/*`): the layout shows the normal 404 page to officers; the backend checks every role
  again. User actions mirror `users/user-policy.ts` (`lib/user-policy.ts`): the SUPER_ADMIN row shows the text
  badge "সুরক্ষিত" and has no actions; nobody can deactivate or demote themselves. Creating an officer never
  shows, asks for or sends a password; the success text is "কর্মকর্তা তৈরি হয়েছে। তিনি অফিসের Default Password দিয়ে
  Login করতে পারবেন।". Editing a designation states that only FUTURE meetings get the new priority. Designations
  and wings can be deleted only when no user has them. Change requests: tabs by status, approve with a
  confirmation, reject with a required reason, own requests show "নিজের অনুরোধ অনুমোদন করা যায় না". The audit log
  shows only the fields that changed (before / after).

### 13.8 Production build and browser security
- `next.config.ts`: `output: "standalone"` (run `node .next/standalone/server.js`, see `README.md` §4); headers
  `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `Permissions-Policy` (camera, microphone, geolocation, payment … all off), `Cross-Origin-Opener-Policy`.
- `proxy.ts`: `Content-Security-Policy` per request: `default-src 'self'`; scripts and styles only from this
  origin plus Next.js' own inline ones carrying a fresh nonce; `img-src 'self' blob: data:`;
  `frame-ancestors 'none'`; `object-src 'none'`; `form-action 'self'`. Every page is rendered per request for
  that. Development additionally allows `'unsafe-eval'` (React debugging) and inline styles (dev overlay).
- In production nginx serves one domain: `/api/v1` and `/uploads` go to the backend, everything else to the
  frontend.

### 13.9 End-to-end tests (Playwright)
Real browser against the real backend (`MAIL_DRY_RUN=true`), only with test accounts ending in `@example.com`
(created by the setup through the admin API; one of them, `e2e-admin@example.com`, is an ADMIN). Suites: auth
(incl. session expiry), dashboard, meetings and conflicts, reports + PDF download, profile + photo upload,
admin (create officer → login with the default password, SUPER_ADMIN protection, designation change request
approved, officers get 404), accessibility (labels, modal keyboard handling, offline message, 404), the two header icons (badge, menus) and "no
icons" on every page including the admin panel.
Since v1.5 the suite runs in **Chromium and WebKit** (projects in `playwright.config.ts`) and adds
`guests.spec.ts`, `priority-hidden.spec.ts` and `webkit-font.spec.ts`. `@playwright/test` is pinned to
**1.61.1**: on macOS 14 Playwright only has a frozen WebKit build (2251) and 1.62+ can no longer open pages in
it ("Unknown setting: PushAPIEnabled"). The pin can go after a macOS upgrade (15+). The WebKit screenshot
baseline is per platform (`*-webkit-darwin.png`).

### 13.10 Fonts: Bangla in NikoshBAN, English in Times New Roman (owner decisions 2026-11-14 and 2026-11-15)
NikoshBAN, the Bangladesh government's standard Bangla font, is used for Bangla everywhere (until 2026-11-15:
Nikosh; before that Hind Siliguri on the web and Noto Sans Bengali in PDFs). English text (Latin letters and
ASCII digits) is shown in Times New Roman.

| Font | Used for | Where it comes from | Licence |
|---|---|---|---|
| NikoshBAN | Bangla, everywhere | `frontend/app/fonts/NikoshBAN.ttf` and `backend/assets/fonts/NikoshBAN.ttf` (same file), each with `LICENSE-NikoshBAN.txt` | CC BY-NC-ND 3.0 (Bangladesh Election Commission) |
| Times New Roman | English on web pages and in mails | **the user's computer** (a licensed Microsoft font: never bundled) | — |
| Tinos (Regular, Bold) | English in PDF reports (the server has no Times New Roman); metric-compatible with it | `backend/assets/fonts/Tinos-Regular.ttf`, `Tinos-Bold.ttf`, `LICENSE-Tinos.txt` | SIL OFL 1.1 (version 1.340; older releases were Apache 2.0) |

| Kohinoor Bangla | Bangla in **WebKit** (Safari, every iOS browser), v1.5 | the user's Apple system (`local()`, never bundled) | — |
| Noto Sans Bengali (variable) | Bangla in WebKit when Kohinoor is missing, v1.5 | `frontend/app/fonts/NotoSansBengali.ttf` + `LICENSE-NotoSansBengali.txt` | SIL OFL 1.1 |

The files under `frontend/app/fonts/` and `backend/assets/fonts/` **must be deployed with the app**.

- **WebKit (v1.5, owner decision 2026-11-16).** Diagnosis with screenshots in Chromium and WebKit (CoreText)
  of "সময়", "প্রলয়", "নিয়ম" in both forms: Chromium draws NikoshBAN's precomposed U+09DF with a detached dot
  and YA + NUKTA correctly; WebKit is the exact opposite (YA + NUKTA detached, U+09DF correct). Kohinoor
  Bangla and Noto Sans Bengali draw YA + NUKTA correctly in WebKit. `normalizeBangla()` and the
  unicode-range are correct, so no single stored text form works in both engines: the cause is NikoshBAN's
  shaping in WebKit. The font file is not changed (CC BY-NC-ND). Instead the root layout reads the
  User-Agent on the server (`lib/engine.ts`: Safari and every browser on iPhone/iPad = WebKit; anything with
  `Chrome/`/`Chromium/` and Firefox = other) and renders `<html data-engine="webkit">` (no flash, nothing
  for the CSP). For that attribute `--font-sans` is "Kohinoor Bangla Local" (`local()` faces in
  `globals.css`, regular / semibold / bold), then Noto Sans Bengali (`next/font/local`, `preload: false`), both
  with the NikoshBAN unicode-range, then Times New Roman. PDFs (Chromium) are unchanged.

- **NikoshBAN vs Nikosh (owner decision 2026-11-15):** the Bangla letters, conjuncts, layout tables and
  metrics of the two fonts are identical. The only difference: NikoshBAN draws the ASCII digits 0–9 with
  Bangla-looking shapes. The owner chose NikoshBAN **for Bangla characters only**: because of the
  `unicode-range` below, typed digits 0–9 always come from Times New Roman / Tinos and look like English
  digits, so the digit rule (§13.11) is unchanged. Nothing changes visually compared with Nikosh.
- **NikoshBAN file:** the original 2008 file is rejected by browsers (its `name` table is larger than the
  format allows: "OTS parsing error"). The committed file has **only its `name` table rewritten** by
  `backend/scripts/repair-nikosh-name-table.ts` (works for Nikosh and NikoshBAN); glyphs and layout tables are
  byte-identical. The full licence text moved from the name table to `LICENSE-NikoshBAN.txt`.
- **Web:** `app/layout.tsx` loads NikoshBAN with `next/font/local` (served from this origin, so `font-src 'self'`
  in the CSP is enough; no external font request).
  - `unicode-range: U+0980-09FF, U+0964-0965, U+200C-200D` (the Bengali block incl. ৳, danda / double danda,
    zero-width joiners): Latin letters and digits are **not** taken from NikoshBAN.
  - Font stack (`globals.css`): NikoshBAN, "Times New Roman", Times, "Liberation Serif", Tinos, serif. On a
    computer without Times New Roman the next installed one is used.
  - Sizes (v1.8, §13.16): the base size is 16 px, and the Bangla fonts are enlarged with `size-adjust` so Bangla and
    English words look the same size side by side: NikoshBAN 127%, and in WebKit Kohinoor Bangla 111% and Noto Sans
    Bengali 115% (measured to match NikoshBAN). Body text line height 1.6, headings 1.3.
  - NikoshBAN has one weight (400). Bangla headings use the browser's synthesised bold.
- **PDF reports:** `report-template.ts` embeds NikoshBAN (same `unicode-range`, `size-adjust: 112%`) and Tinos
  regular + bold as base64 `data:` URLs; base size 11 pt; nothing is fetched. `nest build` copies `assets/fonts`
  to `dist/assets/fonts` (`nest-cli.json`); in development the files are read from `backend/assets/fonts`.
- **Mail:** mail clients only use installed fonts and know no `unicode-range`. The template's `font-family` is
  `'Times New Roman',Times,'NikoshBAN','Nikosh','SolaimanLipi','Kalpurush','Noto Sans Bengali','Vrinda',serif`:
  Times comes first because it has no Bangla characters, so English and the digits 0–9 are drawn in Times and
  Bangla falls through to NikoshBAN (with NikoshBAN first, English would use its Latin letters and 0–9 would
  look Bangla).

### 13.11 Digits: Bangla for system numbers, user text as typed (owner decision 2026-11-14)
- **Numbers the system generates** are shown in Bangla digits: dates, times, counts, totals, durations, page
  numbers, priorities, pagination ("পাতা ২ / ৫"), the unread badge.
- **Text entered by users is shown exactly as typed**, digits included: meeting title, room, agenda, notes,
  cancel reason, names, designation remarks, designation and wing names, additional charges, review notes. A
  title "Review v2.1 (Room 501)" stays "Review v2.1 (Room 501)" on every page, in the PDF reports and in mails.
- Stored values are never changed for display purposes. Only input that the backend defines as a number is
  normalised on save (mobile numbers and priorities accept Bangla digits and are stored in ASCII digits, §6.2).
- Where it is implemented:
  - frontend: only `lib/format.ts` produces Bangla digits (`formatNumber`, the date and time helpers); user
    text is rendered without any conversion;
  - PDF: `report-template.ts` cells are typed: a `number` or `sys("…")` (system text such as a date) gets Bangla
    digits, a plain string is user text and is printed unchanged;
  - mail and bell notifications: dates come from `meeting-format.ts` (Bangla locale); titles and other user text
    are inserted unchanged.
- Tests: `report-template.spec.ts`, `mail-templates.spec.ts`, `frontend/e2e/digits.spec.ts`.

### 13.12 Wording: common office words in English (owner decisions 2026-11-15, revised for v1.2 and v1.3)
Some Bangla translations sounded unnatural. Words that office staff normally say in English are written in
English (Latin script); everything else stays Bangla.

- **English:** the words in the list below, as labels, buttons, tabs, menu items, badges and column titles.
- **Bangla:** সভা, সভাপতি, আয়োজক, আলোচ্যসূচি, কক্ষ, কার্যবিবরণী, অগ্রাধিকার, পদবি, উইং, ডুপ্লিকেট সভা, কর্মকর্তা, অতিথি কর্মকর্তা, and all full
  sentences, help texts, confirmations and error messages. Inside such a sentence the listed nouns are still
  written in English ("Password দিন।", "কোনো Notification নেই।"), with the Bangla ending after a hyphen
  ("Email-এর Link", "Session-এর মেয়াদ"). Verbs inside sentences stay Bangla ("সংরক্ষণ করা যাবে না").
- **Buttons are either fully English or fully Bangla** — no half-Bangla verb phrases such as "Admin করুন".
  English buttons: "Save", "Edit", "Delete", "Cancel", "Approve", "Reject", "Activate", "Deactivate", "Make Admin",
  "Remove Admin", "Reset to Default Password", "Send Request", "Cancel Request", "Upload Photo", "Change Password",
  "Send Reset Link", "Send Verification Link", "Request New Link", "Go to Dashboard", "Back to Login".
  Bangla buttons stay Bangla: "সভা বাতিল করুন", "সম্পন্ন করুন", "সভা তৈরি করুন", "ফিরে যান", "আবার চেষ্টা করুন", "বন্ধ করুন".
- **Mixed labels and titles:** only the listed word changes ("Pending ডুপ্লিকেট সভা", "আজকের Summary", "নাম দিয়ে Search করুন",
  "Resolved: <date>"). Page titles of edit forms stay Bangla: "সভা সম্পাদনা", "কর্মকর্তা সম্পাদনা".
- **Capitals:** labels of one or two words in Title Case ("Save", "Email Queue", "Change Request"); longer action
  phrases start with one capital ("Mark all as read").
- **One term per concept** everywhere: web pages, PDF reports, mails, bell notifications and backend messages.
- **Stay Bangla:** the meeting statuses নির্ধারিত / সম্পন্ন / বাতিল (and the meeting action "সভা বাতিল করুন"), লোড হচ্ছে…,
  আবার চেষ্টা করুন, বন্ধ করুন, দেখুন / লুকান, হ্যাঁ / না, সব. The PDF heading keeps "সভা প্রতিবেদন".
- Names stored in the database (for example the seeded account name "সুপার অ্যাডমিন") are data, not labels.
- **Bangla navigation (v1.3): sidebar menu, page headings, profile, login and logout are Bangla; other buttons
  and statuses stay as in v1.2.**
  - Main menu (same order): ড্যাশবোর্ড, সভা, ক্যালেন্ডার, ডুপ্লিকেট সভা, রিপোর্ট, প্রোফাইল, অ্যাডমিন.
  - Admin menu: সারসংক্ষেপ, কর্মকর্তা, পদবি, উইং, পরিবর্তনের অনুরোধ, সকল সভা, সকল ডুপ্লিকেট সভা, অফিস রিপোর্ট, ইমেইল সারি, অডিট লগ.
- **v1.5 (owner decision 2026-11-16):** the old Bangla word for "conflict" is gone everywhere (UI, mails,
  notifications, PDFs, backend messages, Swagger, tests). The time clash is "সময় কনফ্লিক্ট"; everything else
  is "ডুপ্লিকেট সভা" ("Pending ডুপ্লিকেট সভা", "সকল ডুপ্লিকেট সভা", "ডুপ্লিকেট সভা যাচাই"), phrased so "সভা" is
  never doubled. Guests are "অতিথি কর্মকর্তা". Guards: `backend/src/common/utils/wording.spec.ts` scans every
  git-tracked text file; the frontend ESLint config has a `no-restricted-syntax` rule for UI strings.
  - Each page heading (and browser-tab title) uses the same word as its menu item. Menu names for screen readers:
    "প্রধান মেনু", "অ্যাডমিন মেনু"; the phone menu button "মেনু".
  - Header profile menu: "প্রোফাইল" and "লগআউট"; the profile page heading "প্রোফাইল".
  - Login page: heading "লগইন", button "লগইন করুন", link "লগইন পাতায় ফিরে যান".
  - Everywhere else the v1.2 words stay: Save, Edit, Delete, Cancel, Approve / Reject, Activate / Deactivate,
    Send Request, Mark all as read, Download PDF, all statuses, labels, search placeholders, and the English words
    inside sentences ("আবার Login করুন", "Dashboard", "Change Request", "Email Queue" in help texts and messages).

Final word list:

| Before | Now |
|---|---|
| লগইন / লগইন করুন (button) | Login |
| লগআউট | Logout |
| পাসওয়ার্ড | Password |
| ডিফল্ট / ডিফল্ট পাসওয়ার্ড | Default / Default Password |
| ইমেইল | Email |
| প্রোফাইল | Profile |
| ড্যাশবোর্ড | Dashboard |
| নোটিফিকেশন | Notification |
| অ্যাডমিন / সুপার অ্যাডমিন | Admin / Super Admin |
| অপঠিত | Unread |
| সব পড়া হয়েছে | Mark all as read |
| অমীমাংসিত / মীমাংসিত (conflicts) | Pending / Resolved |
| অপেক্ষমাণ / অনুমোদিত / প্রত্যাখ্যাত / বাতিল (change requests) | Pending / Approved / Rejected / Cancelled |
| অপেক্ষমাণ / পাঠানো হয়েছে / ব্যর্থ (email queue) | Pending / Sent / Failed |
| সক্রিয় / নিষ্ক্রিয় (status) | Active / Inactive |
| সক্রিয় করুন / নিষ্ক্রিয় করুন (button) | Activate / Deactivate |
| অ্যাডমিন করুন / অ্যাডমিন থেকে সরান | Make Admin / Remove Admin |
| পাসওয়ার্ড ডিফল্টে ফেরত নিন | Reset to Default Password |
| অনুমোদন করুন / প্রত্যাখ্যান করুন (button) | Approve / Reject |
| বাতিল (dialog button) | Cancel |
| পরিবর্তনের অনুরোধ পাঠান / বাতিল করুন | Send Request / Cancel Request |
| সংরক্ষণ করুন (button) | Save (also "Save Changes", "Save Password", "Saving…") |
| সম্পাদনা (button) | Edit |
| মুছুন / মুছে ফেলুন (button) | Delete ("Delete Permanently") |
| খুঁজুন | Search ("নাম দিয়ে Search করুন", "নাম বা Email দিয়ে Search করুন") |
| আপলোড | Upload ("Upload Photo", "Uploading…") |
| ডাউনলোড / PDF ডাউনলোড | Download / Download PDF |
| ফিল্টার / ফিল্টার মুছুন | Filter / Clear Filter |
| সারসংক্ষেপ | Summary |
| ইমেইল সারি | Email Queue |
| অডিট লগ | Audit Log |
| পরিবর্তনের অনুরোধ (login email / designation, needs admin approval) | Change Request |
| রিপোর্ট / অফিস রিপোর্ট (menu, titles, buttons) | Report / Office Report |
| ব্যবহারকারী | কর্মকর্তা |
| ক্যালেন্ডার, মেনু, লিংক, রিসেট, মোবাইল, ফোন, ফ্যাক্স, অনলাইন, সেশন | Calendar, Menu, Link, Reset, Mobile, Phone, Fax, Online, Session |

The request to change one's own notification email is not a "Change Request" (no admin approval); it stays
"Notification Email পরিবর্তনের অনুরোধ".

### 13.13 Bangla nukta letters: one stored form (owner decision 2026-11-15)
The fonts (NikoshBAN / Nikosh) draw some Unicode forms of য়, ড় and ঢ় with the nukta dot detached.
Checked with fonttools, HarfBuzz and screenshots in Chromium and Firefox (the PDF is printed by Chromium):

| Letter | Stored and shown | Drawn broken (never stored) |
|---|---|---|
| ড় | precomposed U+09DC | U+09A1 + U+09BC |
| ঢ় | precomposed U+09DD | U+09A2 + U+09BC |
| য় | U+09AF + U+09BC (the shaper joins the pair into the font's য় glyph) | precomposed U+09DF |

- **Why not "always precomposed":** for য় the browsers' shaper (HarfBuzz) splits U+09DF again and draws the
  dot detached, while it joins U+09AF + U+09BC into the correct glyph. For ড় / ঢ় it is the other way round.
- **Never NFC:** Unicode NFC turns U+09DC / U+09DD into the broken pairs (they are composition exclusions), so
  no code may call `normalize("NFC")` on Bangla text.
- **One helper, same rule on both sides:** `normalizeBangla()` in `backend/src/common/utils/bangla.ts` and
  `frontend/lib/bangla.ts` (U+09DF → U+09AF U+09BC, U+09A1 U+09BC → U+09DC, U+09A2 U+09BC → U+09DD; idempotent).
  The letters are built from code points in code, never typed literally.
- **Incoming data:** the global `BanglaTextPipe` (before the ValidationPipe) normalises every string in request
  bodies and query strings, so stored text and search text always match. Values under keys containing
  `password`, `token` or `secret` are never changed. The frontend API client applies the same helper.
- **Seed / CSV:** every cell of `officers.csv` is normalised when it is read.
- **Existing data:** migration `NormalizeBanglaNukta1794400000000` converts every `text`, `varchar` and `jsonb`
  column in place (idempotent; only rows with a broken form are updated).
- **Source files:** `bangla-source.spec.ts` (backend unit tests) fails if any source, test or doc file contains
  U+09DF, U+09A1 U+09BC or U+09A2 U+09BC.

### 13.14 UI language: English and Bangla (v1.6)
- **Two UI languages.** English is the default; a text-only button in the header (and on the public pages)
  switches to Bangla and back. It shows the other language in its own script ("বাংলা" / "English"), no icon.
  The choice is kept per browser in the `lang` cookie (`en` | `bn`, one year, `SameSite=Lax`, `Secure` on https);
  unknown values fall back to `en`. The root layout reads the cookie on the server, so the first HTML is
  already in the right language (`<html lang>` follows it). Switching keeps the session and unsaved form input.
- **UI texts** live in `frontend/messages/en.ts` and `frontend/messages/bn.ts` with exactly the same keys
  (unit test). `en.ts` contains no Bangla characters (unit test + `wording.spec.ts`).
- **Numbers and dates** still come only from `lib/format.ts`: Bangla digits and month names in Bangla (§13.11),
  Latin digits and English names in English; always on the Asia/Dhaka clock. User text is shown as typed.
- **API messages.** `lib/api.ts` sends `Accept-Language: en | bn` and `X-Lang: en | bn` from the cookie on every
  call (`X-Lang` wins: WebKit/Safari replaces a script's Accept-Language with the browser language). The backend
  answers error and success `message` texts in that language; without the header (old clients, Swagger) they
  are Bangla. Every message has a stable `code` from `backend/src/common/i18n/message-catalog.ts` (same in both
  languages); validation lists also carry `codes`, one per message; text outside the catalog keeps its wording
  and gets `HTTP_<status>`. Translation happens in one place: `AllExceptionsFilter` (errors) and
  `MessageLanguageInterceptor` (a success body's top-level `message`). Data typed by users is never translated.
  `message-catalog.spec.ts` fails if any Bangla message in the message files, DTO validators or thrown
  exceptions is missing from the catalog.
- **Hidden meeting titles.** Where a title is hidden from the viewer (§6.4), the API also sends
  `titleHidden: true`; the frontend shows its own text ("Another meeting" / "অন্য একটি সভা").
- **Always Bangla:** PDF reports, emails and bell notifications, whatever the request language is
  (`test/language.e2e-spec.ts`).
- **Test-only rate-limit reset.** `POST /api/v1/test-hooks/reset-throttle` (ADMIN, not in Swagger) empties the
  in-memory rate-limit counters so repeated Playwright runs do not wait. The module is loaded only with
  `NODE_ENV=test`, or `E2E_TEST_HOOKS=true` outside production; with `NODE_ENV=production` it is never loaded,
  the app refuses to start with `E2E_TEST_HOOKS=true`, and the controller checks again (`test-hooks.guard.spec.ts`).
- **Tests:** backend `message-catalog.spec.ts`, `localize.spec.ts`, `test/language.e2e-spec.ts`; frontend
  `npm test` (Vitest: `tests/unit/format.test.ts`, `tests/unit/messages.test.ts`) and
  `e2e/language.spec.ts`. The older Playwright specs run with `lang=bn` (set by `global-setup.ts`).

### 13.15 Officer, designation and wing names in the UI language (v1.7)
- **Data:** the existing columns are used; nothing new was added. `users.nameBn` / `users.nameEn`,
  `designations.nameBn` / `designations.nameEn` and `wings.nameBn` / `wings.nameEn` are all `NOT NULL` (users also
  have `organizationBn` / `organizationEn`). On 2026-11-16 every English value in the development database was filled
  (0 empty), so no migration and no "English name missing" admin filter were needed.
- **One approach — the API sends both, the frontend picks.** Every response that names an officer, designation or
  wing carries the Bangla and the English value (`nameBn` + `nameEn`, or `…Bn` + `…En` pairs such as
  `organizerNameBn` / `organizerNameEn`, `designationBn` / `designationEn`, `organizerDesignation` /
  `organizerDesignationEn`). `X-Lang` / `Accept-Language` never change data, only messages (§13.14).
- **Display rule** (`frontend/lib/display-name.ts`, hook `useNames()`): English UI → the English value if it has
  text, else the Bangla one; Bangla UI → the Bangla value. Used for the header (Welcome, user menu), dashboard,
  Admin officers list / detail / form and its filters, designations and wings pages, participant and chair pickers,
  meeting list and detail, duplicate meetings pages, profile, change requests, audit log and the report pages.
  Pages that edit names (designations and wings admin, officer form, profile) still show both values.
- **Search** matches both names: `GET /users` and `GET /users/directory` search `nameBn` and `nameEn` (ILIKE).
- **Always Bangla:** PDF reports, emails, bell notification texts and audit texts use the Bangla values
  (`report-template.spec.ts`, `meeting-notifier.service.spec.ts`, `test/language.e2e-spec.ts`). Guest officers'
  names and designations and meeting titles stay exactly as typed (a guest chair's name is the same in both fields).
- **Editing:** both values are required on create (officer, designation, wing). An English value must be Latin
  text — at least one Latin letter and no Bangla character (`IsEnglishName()` in
  `backend/src/common/validators/english-name.ts`, message code `NAME_EN_LATIN`; the same pattern in
  `frontend/lib/schemas.ts`). Bangla values go through `normalizeBangla()` (§13.13) on both sides.
- **Tests:** frontend `tests/unit/display-name.test.ts` (English present, English fallback, Bangla) and
  `e2e/names.spec.ts` (Chromium + WebKit); backend `english-name.spec.ts` and the e2e checks above.

### 13.16 Visual polish: theme tokens, logo, readability (v1.8)
Simple and calm ("medium CSS"): no gradients, no heavy shadows (only `shadow-md` on floating menus, dialogs and
toasts), no animation beyond short colour transitions on hover / focus, and no icons (§13.5).
- **Theme tokens** (`frontend/app/globals.css`, light theme only):

  | Token | Value | Use |
  |---|---|---|
  | `--color-primary` / `brand-700` | `#016b4f` | primary buttons, active menu, links, focus ring |
  | `--color-primary-hover` / `brand-800` | `#01563f` | hover of the primary colour |
  | `--color-primary-tint` / `brand-50` | `#f4f8f6` | page background, active rows |
  | `--color-danger` / `red-500` | `#e8323f` | accent only: borders and markers of danger / errors |
  | `--color-danger-fill` / `red-600` | `#c8202d` | danger buttons (white text) |
  | `--color-danger-text` / `red-700` | `#b01c28` | error text |
  | `--color-text` / `slate-800`, `slate-900` | `#1f2937` | text |
  | `--color-text-muted` / `slate-500`, `slate-600` | `#4b5563` | muted text — the lightest text colour allowed |
  | `--color-border` / `slate-200` | `#e5e7eb` | card and table lines |
  | `--color-input-border` | `#868d98` | form control borders (3:1) |
  | `--color-placeholder` | `#6b7280` | input placeholders |

  The Tailwind `brand-*`, `slate-*` and `red-*` scales are remapped onto these values, so components keep their
  classes. `#e8323f` reaches only 4.2:1 on white, so it is never used for text or as a button fill behind text: error
  text and danger buttons use the darker reds above. `tests/unit/contrast.test.ts` reads `globals.css` and checks every
  text pair (≥ 4.5:1) and form border / focus ring (≥ 3:1), and that no component uses a lighter text colour.
- **Logo** (`frontend/public/brand/bbs-logo.png`, `components/layout/brand.tsx`), only in these places:
  - login, forgot-password and reset-password pages: centred above the form, 96 px, with the office name and the
    app name under it (not on set-password or verify-email);
  - the app header: 36 px, next to the app name, linking to the dashboard (on phones below 420 px only the logo
    shows; the app name stays for screen readers).
  Never in PDF reports, emails or any other page. Rendered with `getImageProps()` from `next/image` (optimised
  `srcset`, width and height set, eager loading, high fetch priority on login) but without next/image's inline
  `style` attribute, which the production CSP (`style-src` with a nonce) would block; `img-src 'self'` covers the
  image. Alt text: "Bangladesh Bureau of Statistics logo" / "বাংলাদেশ পরিসংখ্যান ব্যুরোর লোগো". `e2e/no-icons.spec.ts`
  fails for a logo anywhere else.
- **Readability:** base 16 px, nothing below 14 px (Tailwind `xs` = 14 px, `sm` = 15 px); page title (2xl, 26 px) >
  section / card title (lg, 18 px) > body. Bangla fonts sized to match Times New Roman (§13.10).
  - Forms: labels above inputs, "(required)" marked the same way everywhere, inputs 40 px tall (44 px on phones),
    a visible focus ring in the primary green, error text in red under the field (text, never colour alone).
  - Buttons: primary (filled green), secondary (outlined), danger (filled red), ghost (text only); the same height
    and padding everywhere: 40 px (`sm` 36 px) from 640 px up, at least 44 px on phones.
  - Tables: light header background, comfortable padding, subtle row hover, wrapping text; wide tables keep a
    minimum width of 56 rem and scroll horizontally inside their card on phones (`narrow` for small tables).
  - Cards: white, 1 px light border, 8 px radius, no shadow. Badges: soft background with dark text in every tone.
    The green / amber / red conflict panels keep their meaning with soft backgrounds.
- **Review screenshots:** `npx playwright test -c playwright.screenshots.config.ts` with `SHOTS=<label>` saves the key
  pages (English and Bangla, 1440 px and 390 px, Chromium and WebKit) to `frontend/screenshots/<label>/`
  (git-ignored).
