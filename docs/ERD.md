# Database ERD — BBS Meeting Schedule System

Source of truth: the TypeORM entities in `backend/src/modules/*/entities/` and **all** migrations in
`backend/src/database/migrations/` (list at the end). Business rules: [`SPEC.md`](../SPEC.md) §6–7.
Last checked against the code: 2026-11-16 (v1.5).

Every table also has `id uuid PK DEFAULT gen_random_uuid()`, `createdAt timestamptz` and
`updatedAt timestamptz` (left out of the boxes below to keep the diagram readable).
All date-times are `timestamptz` (stored in UTC). Status / role / type columns are `varchar`
holding TypeScript enum values (no native Postgres enums).

```mermaid
erDiagram
    designations ||--o{ users : "has (RESTRICT)"
    wings ||--o{ users : "has (RESTRICT)"

    users ||--o{ user_additional_charges : "holds (CASCADE)"
    designations |o--o{ user_additional_charges : "charge designation (RESTRICT, v1.16)"
    wings |o--o{ user_additional_charges : "charge wing (RESTRICT, v1.16)"
    users ||--o{ refresh_tokens : "owns (CASCADE)"
    users ||--o{ password_reset_tokens : "owns (CASCADE)"
    refresh_tokens |o--o| refresh_tokens : "replacedBy (SET NULL)"

    users ||--o{ change_requests : "requests (RESTRICT)"
    users |o--o{ change_requests : "reviews (SET NULL)"

    users ||--o{ meetings : "organizes (RESTRICT)"
    users |o--o{ meetings : "chairs (SET NULL)"
    meetings ||--o{ meeting_participants : "has (CASCADE)"
    meetings ||--o{ meeting_guests : "guest officers (CASCADE)"
    meetings ||--o{ meeting_decision_files : "minutes files (CASCADE)"
    meetings ||--o| meeting_notice_files : "notice file, at most one (CASCADE)"
    users ||--o{ meeting_decision_files : "uploads (RESTRICT)"
    users ||--o{ meeting_notice_files : "uploads notice (RESTRICT)"
    users ||--o{ meeting_participants : "attends (RESTRICT)"

    meetings ||--o{ meeting_conflicts : "higher (CASCADE)"
    meetings ||--o{ meeting_conflicts : "lower (CASCADE)"
    users ||--o{ meeting_conflicts : "shared officer (RESTRICT)"

    users ||--o{ notifications : "receives (CASCADE)"
    users |o--o{ audit_logs : "acts (RESTRICT)"

    designations {
        varchar nameBn
        varchar nameEn
        int priority "lower = higher priority"
        boolean isActive
        enum officeReportScope "v1.15: NONE | WING | OFFICE"
    }
    wings {
        varchar nameBn
        varchar nameEn
        boolean isActive
    }
    users {
        varchar loginEmail UK "lowercase CHECK"
        varchar notificationEmail "lowercase CHECK"
        varchar pendingNotificationEmail "nullable"
        varchar notificationEmailTokenHash "select false"
        timestamptz notificationEmailTokenExpiresAt
        varchar passwordHash "argon2id, select false"
        varchar nameBn
        varchar nameEn
        varchar mobile "01XXXXXXXXX"
        varchar mobileAlt
        varchar officePhone
        varchar fax
        varchar photoPath
        uuid designationId FK "NULL only for SUPER_ADMIN (CHECK)"
        varchar designationRemark
        uuid wingId FK "nullable"
        text organizationBn
        text organizationEn
        varchar bcsBatch
        varchar role "SUPER_ADMIN | ADMIN | OFFICER"
        boolean isActive
        boolean mustChangePassword
        boolean passwordIsDefault "still on the default officer password"
        int failedLoginCount
        timestamptz lockedUntil "unused (no account lock)"
        timestamptz lastLoginAt
    }
    user_additional_charges {
        uuid userId FK
        uuid designationId FK "v1.16; null only while needsReview"
        uuid wingId FK "v1.16; optional"
        varchar note "v1.16; old text of migrated rows"
        boolean needsReview "v1.16"
    }
    refresh_tokens {
        uuid userId FK "indexed"
        varchar tokenHash UK "select false"
        timestamptz expiresAt
        timestamptz revokedAt
        uuid replacedById FK "nullable"
        varchar userAgent
        varchar ip
    }
    password_reset_tokens {
        uuid userId FK
        varchar tokenHash UK "select false"
        varchar purpose "RESET | SET_INITIAL"
        timestamptz expiresAt
        timestamptz usedAt
    }
    change_requests {
        uuid userId FK
        varchar type "LOGIN_EMAIL | DESIGNATION"
        jsonb newValue
        varchar status "PENDING | APPROVED | REJECTED | CANCELLED"
        uuid reviewedById FK "nullable"
        timestamptz reviewedAt
        text reviewNote
    }
    meetings {
        varchar title
        text agenda
        timestamptz startAt "CHECK endAt > startAt"
        timestamptz endAt
        varchar room
        varchar onlineLink
        uuid organizerId FK
        uuid chairId FK "nullable"
        int priority "snapshot: internal chair's, else organizer's"
        varchar status "SCHEDULED | CANCELLED | COMPLETED"
        text cancelReason
        text notes
        timestamptz cancelledAt
        timestamptz completedAt
    }
    meeting_participants {
        uuid meetingId FK "UK with userId"
        uuid userId FK "indexed"
        varchar role "ORGANIZER | CHAIR | MEMBER"
    }
    meeting_guests {
        uuid meetingId FK "indexed; UK with lower(email)"
        varchar name
        varchar designation
        varchar email "lowercased; CHECK"
        boolean isChair "at most one per meeting"
    }
    meeting_decision_files {
        uuid meetingId FK "indexed"
        uuid uploadedById FK
        varchar originalName "sanitized, max 200"
        varchar storedName "random uuid + extension"
        varchar mime "PDF | DOCX (v1.13) | JPEG | PNG; max 100"
        int size "bytes"
        char sha256 "hex"
    }
    meeting_notice_files {
        uuid meetingId FK "unique: one notice per meeting (v1.13)"
        uuid uploadedById FK "the organizer"
        varchar originalName "sanitized, max 200"
        varchar storedName "random uuid + extension"
        varchar mime "PDF | DOCX | JPEG | PNG"
        int size "bytes"
        char sha256 "hex"
    }
    meeting_conflicts {
        uuid higherMeetingId FK "indexed"
        uuid lowerMeetingId FK "indexed"
        uuid userId FK "indexed with status"
        varchar status "PENDING | RESOLVED"
        timestamptz resolvedAt
    }
    notifications {
        uuid userId FK
        varchar type
        varchar title
        text body
        varchar link
        timestamptz readAt "null = unread"
    }
    email_outbox {
        varchar to
        varchar subject
        text html "nullable, cleared after sending"
        text text "plain-text version, cleared too"
        varchar status "PENDING | SENT | FAILED"
        int attempts
        text lastError
        timestamptz nextAttemptAt
        timestamptz sentAt
    }
    audit_logs {
        uuid actorId FK "nullable"
        varchar action
        varchar entityType
        varchar entityId
        jsonb before
        jsonb after
        varchar ip
    }
```

## Indexes

| Table | Index | Why |
|---|---|---|
| users | `UQ_users_loginEmail` (unique) | login lookup, one account per email |
| users | `CHK_users_designation_required` (check) | every account except the SUPER_ADMIN has a designation (= a meeting priority) |
| designations | `UQ_designations_nameEn_lower` (unique on `lower(nameEn)`) | no two designations with the same English name |
| wings | `UQ_wings_nameEn_lower` (unique on `lower(nameEn)`) | no two wings with the same English name |
| change_requests | `UQ_change_requests_one_pending` (unique on `userId, type` where `status = 'PENDING'`) | one pending request per type per officer |
| meetings | `IDX_meetings_startAt_endAt_status` | overlap search in the conflict engine, date-range lists |
| meeting_participants | `UQ_meeting_participants_meetingId_userId` (unique) | an officer is in a meeting at most once |
| meeting_participants | `IDX_meeting_participants_userId` | "which meetings is this officer in?" |
| meeting_guests | `UQ_meeting_guests_meetingId_email` (unique on `meetingId, lower(email)`) | one guest officer per address per meeting |
| meeting_guests | `UQ_meeting_guests_one_chair` (unique on `meetingId` where `isChair`) | at most one guest chair |
| meeting_guests | `IDX_meeting_guests_meetingId`, `CHK_meeting_guests_email_lowercase` (check) | guests of a meeting; emails stored lowercased |
| meetings + meeting_guests | `TRG_meeting_single_chair_meetings` / `_guests` (deferred constraint triggers) | a meeting never has an officer chair (`meetings.chairId`) and a guest chair at once |
| meeting_decision_files | `IDX_meeting_decision_files_meetingId` | minutes files "সভা কার্যবিবরণী" of a meeting; status (v1.11) |
| meeting_notice_files | `UQ_meeting_notice_files_meetingId` (unique) | one uploaded notice "সভার নোটিশ" per meeting (v1.13) |
| meeting_conflicts | `IDX_meeting_conflicts_higherMeetingId`, `IDX_meeting_conflicts_lowerMeetingId` | conflicts of a meeting (detail page, auto-resolve) |
| meeting_conflicts | `IDX_meeting_conflicts_userId_status` | "my pending conflicts" |
| notifications | `IDX_notifications_userId_readAt` | bell list and unread count |
| refresh_tokens | `UQ_refresh_tokens_tokenHash` (unique), `IDX_refresh_tokens_userId` | find token on refresh; revoke all of a user's tokens |
| password_reset_tokens | `UQ_password_reset_tokens_tokenHash` (unique) | find token on reset |
| email_outbox | `IDX_email_outbox_status_nextAttemptAt` | worker picks due PENDING mail |

## Delete rules

- Users are **never hard-deleted** (deactivated instead). References that must keep history use
  `RESTRICT` (organizer, participant, shared officer, change-request owner, audit actor);
  optional references use `SET NULL` (chair, reviewer, replaced token).
- Data owned by a user goes with the user: additional charges, tokens, notifications (`CASCADE`).
- Data owned by a meeting goes with the meeting: participants, guest officers, conflicts, minutes files, the notice file
  (`CASCADE`; v1.11: the files on disk are removed by the API after a hard delete). The uploader of a decision
  file is `RESTRICT` (users are never hard-deleted).
- A designation or wing cannot be deleted while any user uses it (`RESTRICT`).

## Migrations (in order)

| File | What it does |
|---|---|
| `1794196726794-InitialSchema` | all tables, foreign keys and the first indexes |
| `1794198728541-UserOrgAndMobileAlt` | `users.organization` → `organizationBn` / `organizationEn`; adds `mobileAlt`; designation required except for the SUPER_ADMIN |
| `1794202664020-UniqueDesignationWingNames` | case-insensitive unique English names for designations and wings |
| `1794203794672-ChangeRequestPendingUnique` | at most one PENDING change request per officer and type |
| `1794205166989-MailOutboxAndTokenPurpose` | `password_reset_tokens.purpose`; `email_outbox.text`; `html` nullable (bodies are purged after sending) |
| `1794214531030-MeetingConflictIndexes` | indexes on `meeting_conflicts` |
| `1794300000000-UserPasswordIsDefault` | `users.passwordIsDefault` (default officer password, owner decision 2026-11-09) |
| `1794400000000-NormalizeBanglaNukta` | Bangla nukta letters in the stored form in every text column |
| `1794802927549-MeetingGuests` | `meeting_guests` (guest officers, v1.5) with its unique indexes, email check and the one-chair triggers |
| `1794903513329-MeetingDecisionFiles` | `meeting_decision_files` (meeting minutes "সভা কার্যবিবরণী", v1.11) |
| `1795000000000-MeetingNoticeFiles` | `meeting_notice_files` (uploaded meeting notice, one per meeting, v1.13); minutes `mime` widened to 100 |
| `1795100000000-DesignationOfficeReportScope` | `designations.officeReportScope` (enum `office_report_scope_enum`, default `NONE`, v1.15 office report); backfill: সচিব and মহাপরিচালক → `OFFICE`, পরিচালক → `WING` |
| `1795200000000-StructuredAdditionalCharges` | `user_additional_charges.description` → `note`; `designationId`, `wingId` (RESTRICT), `needsReview`, check "designation unless needs review"; old rows matched safely (whole-word names), the rest need review (v1.16) |

Schema changes are made only through migrations (`synchronize` is always `false`):
`npm run migration:generate -- src/database/migrations/<Name>`, then `npm run migration:run`.
