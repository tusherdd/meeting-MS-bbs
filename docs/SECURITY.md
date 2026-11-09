# Security — SPEC.md §9, item by item

How each security requirement of SPEC.md §9 is implemented and how it is verified.
Paths are relative to `backend/`. Unit tests: `npm run test`. End-to-end tests: `npm run test:e2e`
(run against the separate test database `DB_NAME_TEST`, never the development database).

| # | Requirement | Where implemented | How tested |
|---|---|---|---|
| 1 | Passwords: argon2id; ≥ 8 chars with letters + digits; not equal to the email; never returned; **never mailed** | `src/common/utils/password.ts` (`checkPasswordStrength`, `hashPassword`); DTO mappers with explicit field lists (`users/user-mapper.ts`, `auth.service.ts#getMe`); new accounts / admin resets get the default officer password from `DEFAULT_OFFICER_PASSWORD` (owner decision 2026-11-09, `users/default-password.ts`); their mails only say "অফিস থেকে জানানো ডিফল্ট পাসওয়ার্ড" | `password.spec.ts`; `auth.service.spec.ts`; `mail-templates.spec.ts`; e2e checks that no response contains `passwordHash` and no mail contains the default password (`users.e2e-spec.ts`, `default-password.e2e-spec.ts`) |
| 2 | Login: generic error; **no account lock** (owner decision) but a progressive delay 2 s → 30 s after 5 failures, same for unknown emails; `lastLoginAt` recorded | `auth/auth.service.ts#login`, `auth/login-attempt.service.ts` | `login-attempt.service.spec.ts` (delay table, unknown-email tracker); `auth.e2e-spec.ts` (identical body, measured delays, counter reset) |
| 3 | Access 15 min, refresh 7 days, rotation, reuse detection (revoke all), refresh stored hashed | `auth/token.service.ts` (row lock on rotation, `replacedById`) | `auth.e2e-spec.ts` (reuse revokes every session, only SHA-256 hashes stored) |
| 4 | Cookies: httpOnly, secure in production, sameSite lax/strict, refresh path `/api/v1/auth`; Bearer accepted | `auth/auth-cookies.service.ts`, `common/guards/jwt-auth.guard.ts` | `auth.e2e-spec.ts` (Set-Cookie flags); production startup check requires https URLs (`env.validation.ts#productionProblems`) |
| 5 | CSRF: Origin check for cookie-authenticated unsafe requests | `common/guards/origin.guard.ts` | `auth.e2e-spec.ts` (missing / foreign Origin → 403, Bearer not affected) |
| 6 | Global ValidationPipe (whitelist, forbidNonWhitelisted, transform); a DTO for every input | `common/pipes/validation.pipe.ts` (Bangla messages), DTOs in every module | `validation.pipe.spec.ts`; forbidden-field e2e (`profile.e2e-spec.ts`, `auth.e2e-spec.ts`) |
| 7 | helmet, strict CORS allowlist, global throttling (stricter on auth, mail, PDF routes) | `src/app.setup.ts` (explicit CSP, HSTS in production, CORS), `app.module.ts` (ThrottlerGuard), `auth.constants.ts`, `profile.constants.ts`, `reports.controller.ts`; `TRUST_PROXY` for the real client IP behind nginx | `health.e2e-spec.ts`, `reports-admin.e2e-spec.ts` (CSP, no HSTS outside production); manual check of 429 after 10 logins (documented in step 4) |
| 8 | Env validated at startup; refuses weak/missing secrets; production safety checks | `src/config/env.validation.ts` (Joi + `productionProblems`: Swagger auth, explicit `MAIL_DRY_RUN`, no localhost CORS, https URLs; `DEFAULT_OFFICER_PASSWORD` required and must meet the password rule — allowed in production since 2026-11-09, one warning log line without the value) | `env.validation.spec.ts` |
| 9 | Uploads: size limit, magic-byte check, random names, outside `src/`, served read-only | `profile/avatar-image.ts` (magic bytes + sharp re-encode to 512×512 WebP, EXIF/GPS removed), `avatar-storage.service.ts`, `common/utils/uploads.ts`, `app.setup.ts#serveUploads` (nosniff, Cache-Control, no listing) | `avatar-image.spec.ts`, `uploads.spec.ts`, `profile.e2e-spec.ts` (fake image 400, too large 413, EXIF gone, no directory listing) |
| 10 | Authorization in services (organizer/admin for meetings, SUPER_ADMIN protected) | `users/user-policy.ts`, `meetings/meetings.service.ts#assertCanManage`, `change-requests.service.ts` (no self-approval), `RolesGuard` | `user-policy.spec.ts`; `users.e2e-spec.ts`, `meetings.e2e-spec.ts` (403/404 matrix) |
| 11 | Only parameterised queries | TypeORM repositories / query builder with bound parameters; the few raw SQL statements (`conflict-engine.service.ts`, `meeting-scheduler.service.ts`, health) use `$1…` placeholders; LIKE input escaped (`common/utils/sql.ts`) | Code review (no `${…}` user values inside SQL); `sql.spec.ts` |
| 12 | Link tokens: 32 random bytes, stored hashed, single use, expiring | `common/utils/token.ts`; reset / set-password (`password-tokens.ts`), notification-email verify (`profile.service.ts`) | `token.spec.ts`; e2e: single use, expiry, older links closed (`auth`, `profile`, `users` e2e) |
| 13 | Audit log for login, user changes, change-request decisions, meeting changes, priority changes (+ more) | `audit/audit.service.ts`, called inside the same transactions; read API `GET /audit-logs` with redaction (`audit/redact.ts`) | Audit assertions in every e2e suite; `redact.spec.ts`; `reports-admin.e2e-spec.ts` (secrets / phones redacted) |
| 14 | Swagger only when `SWAGGER_ENABLED=true`; in production only with basic auth | `src/app.setup.ts` (`basicAuth`), `productionProblems` | Manual check in step 1 (404 when disabled); `env.validation.spec.ts` |
| 15 | Errors never leak stacks or SQL in production | `common/filters/all-exceptions.filter.ts` (uniform body + `requestId`), `common/logging/safe-typeorm-logger.ts` (never logs query parameters) | `all-exceptions.filter.spec.ts`, `safe-typeorm-logger.spec.ts` |
| 16 | Personal seed files git-ignored | `.gitignore` (`backend/src/database/seeds/data/`, `officers*.csv`, `.env*`, `backend/tmp/`) | `git check-ignore` (step 3); seed output prints only `source_sl` numbers |

## Additional measures

- **Request ids:** every response carries `X-Request-Id`, which also appears in error bodies and error logs. Access logs show method, path without the query string, status, duration and id. No request body is ever logged.
- **Mail privacy:**
  - mail bodies are deleted once sent, SENT rows are removed after 30 days, and `lastError` never contains SMTP credentials;
  - dry-run logs show only the masked recipient and the subject.
- **Meeting privacy:** someone who is not one of a meeting's people (and not an admin) gets 404 for it, and never sees the titles of other people's meetings.
- **PDF rendering:**
  - JavaScript is disabled and every network request is blocked;
  - the font is embedded, and all values are HTML-escaped (`report-template.spec.ts`);
  - at most 2 renders run at once, with a 30 s timeout.
- **Race safety:** advisory locks per officer in the conflict engine, and row locks on token rotation, change-request decisions and reset tokens. Tested with parallel requests (`meetings.e2e-spec.ts`).

## Known open items

- **Shared default password (owner decision 2026-11-09):** all officer accounts start with, and after an admin reset return to, one
  known password, with no forced change. Anyone who knows it can sign in as any officer who has not changed it. Admins can list
  those accounts with `GET /users?passwordIsDefault=true`.

- `npm audit`: no high or critical issue remains in production dependencies.
  - **Production:** `typeorm` 0.3 has moderate advisories through its CLI dependencies `glob`/`minimatch`. The fix is TypeORM 1.x, a breaking upgrade, so this is planned separately.
  - **Development tools only** (Jest, typescript-eslint, Nest CLI): moderate advisories, not part of the running app.
- The in-memory failed-login tracker for unknown emails is per process. With several app instances it should move to a shared store such as Redis.
- After a password change or reset, an already-issued access token stays valid for at most 15 minutes. Refresh tokens are revoked immediately. Deactivation and role changes take effect on the very next request, because the guard reads them from the database each time.
