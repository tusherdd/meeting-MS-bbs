# Database ERD — BBS Meeting Schedule System

Source of truth: the TypeORM entities in `backend/src/modules/*/entities/` and the migration
`backend/src/database/migrations/*-InitialSchema.ts`. Business rules: [`SPEC.md`](../SPEC.md) §6–7.

Every table also has `id uuid PK DEFAULT gen_random_uuid()`, `createdAt timestamptz` and
`updatedAt timestamptz` (left out of the boxes below to keep the diagram readable).
All date-times are `timestamptz` (stored in UTC). Status / role / type columns are `varchar`
holding TypeScript enum values (no native Postgres enums).

```mermaid
erDiagram
    designations ||--o{ users : "has (RESTRICT)"
    wings ||--o{ users : "has (RESTRICT)"

    users ||--o{ user_additional_charges : "holds (CASCADE)"
    users ||--o{ refresh_tokens : "owns (CASCADE)"
    users ||--o{ password_reset_tokens : "owns (CASCADE)"
    refresh_tokens |o--o| refresh_tokens : "replacedBy (SET NULL)"

    users ||--o{ change_requests : "requests (RESTRICT)"
    users |o--o{ change_requests : "reviews (SET NULL)"

    users ||--o{ meetings : "organizes (RESTRICT)"
    users |o--o{ meetings : "chairs (SET NULL)"
    meetings ||--o{ meeting_participants : "has (CASCADE)"
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
        varchar mobile
        varchar officePhone
        varchar fax
        varchar photoPath
        uuid designationId FK "nullable"
        varchar designationRemark
        uuid wingId FK "nullable"
        text organization
        varchar bcsBatch
        varchar role "SUPER_ADMIN | ADMIN | OFFICER"
        boolean isActive
        boolean mustChangePassword
        int failedLoginCount
        timestamptz lockedUntil "unused (no account lock)"
        timestamptz lastLoginAt
    }
    user_additional_charges {
        uuid userId FK
        varchar description
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
        timestamptz expiresAt
        timestamptz usedAt
    }
    change_requests {
        uuid userId FK
        varchar type "LOGIN_EMAIL | DESIGNATION"
        jsonb newValue
        varchar status "PENDING | APPROVED | REJECTED"
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
        int priority "snapshot at creation"
        varchar status "SCHEDULED | CANCELLED | COMPLETED"
        text cancelReason
        text notes
        timestamptz cancelledAt
        timestamptz completedAt
    }
    meeting_participants {
        uuid meetingId FK "UK with userId"
        uuid userId FK "indexed"
        varchar role "CHAIR | MEMBER"
    }
    meeting_conflicts {
        uuid higherMeetingId FK
        uuid lowerMeetingId FK
        uuid userId FK
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
        text html
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
| meetings | `IDX_meetings_startAt_endAt_status` | overlap search in the conflict engine, date-range lists |
| meeting_participants | `UQ_meeting_participants_meetingId_userId` (unique) | an officer is in a meeting at most once |
| meeting_participants | `IDX_meeting_participants_userId` | "which meetings is this officer in?" |
| notifications | `IDX_notifications_userId_readAt` | bell list and unread count |
| refresh_tokens | `UQ_refresh_tokens_tokenHash` (unique), `IDX_refresh_tokens_userId` | find token on refresh; revoke all of a user's tokens |
| password_reset_tokens | `UQ_password_reset_tokens_tokenHash` (unique) | find token on reset |
| email_outbox | `IDX_email_outbox_status_nextAttemptAt` | worker picks due PENDING mail |

## Delete rules

- Users are **never hard-deleted** (deactivated instead). References that must keep history use
  `RESTRICT` (organizer, participant, shared officer, change-request owner, audit actor);
  optional references use `SET NULL` (chair, reviewer, replaced token).
- Data owned by a user goes with the user: additional charges, tokens, notifications (`CASCADE`).
- Data owned by a meeting goes with the meeting: participants, conflicts (`CASCADE`).
- A designation or wing cannot be deleted while any user uses it (`RESTRICT`).
