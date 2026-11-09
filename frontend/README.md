# BBS Meeting Schedule — Frontend

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · React Query · react-hook-form + zod.
Rules and page list: [`../SPEC.md` §13](../SPEC.md). Backend: [`../backend/README.md`](../backend/README.md).

## 1. Setup

```bash
# the backend must run first (cd ../backend && npm run start:dev)
cd frontend
npm install
cp .env.example .env.local      # BACKEND_URL=http://localhost:4000
npm run dev                     # http://localhost:3000
```

Open <http://localhost:3000>. Without a session you land on `/login`.

## 2. Environment

| File                            | Committed    | Contents                                                                            |
| ------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `.env.example` → `.env.local`   | example only | `BACKEND_URL` — where the NestJS API runs (read when `dev`/`build` starts)          |
| `.env.e2e.example` → `.env.e2e` | example only | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — an admin account for the Playwright setup |

The frontend has **no secrets**. Nothing from `.env.local` reaches the browser (no `NEXT_PUBLIC_` variables).

## 3. Scripts

| Script                     | What it does                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `dev`                      | development server on port 3000                                                            |
| `build` / `start`          | production build / run it                                                                  |
| `lint`                     | ESLint                                                                                     |
| `typecheck`                | route types + `tsc --noEmit`                                                               |
| `format`                   | Prettier                                                                                   |
| `gen:api`                  | regenerate `lib/api-schema.ts` from `../docs/openapi.json` (run after backend API changes) |
| `test:e2e` / `test:e2e:ui` | Playwright tests (see §5)                                                                  |

## 4. How it talks to the backend

```
Browser ──► http://localhost:3000/api/v1/...  ──(Next.js rewrite)──► BACKEND_URL/api/v1/...
```

- `next.config.ts` forwards `/api/v1/*` and `/uploads/*` to `BACKEND_URL`. For the browser everything is one
  origin, so the backend's **httpOnly cookies** (`access_token`, `refresh_token`) just work. JavaScript never
  sees a token, and nothing is kept in localStorage.
- The backend checks the `Origin` header on POST/PATCH/DELETE (CSRF). The frontend address
  (`http://localhost:3000`) must be in the backend's `CORS_ORIGINS`.
- `lib/api.ts` is the only fetch client:
  - it sends cookies, parses JSON and turns errors into `ApiError` (Bangla `message` + `requestId`);
  - on 401 it calls `POST /auth/refresh` once (shared by parallel requests) and retries once.
- `lib/endpoints.ts` has one typed function per endpoint. The types come from `lib/api-schema.ts`, which is
  generated from `docs/openapi.json`; `lib/types.ts` gives them short names.
- `AuthProvider` loads `GET /auth/me`. The `(app)` layout redirects:
  - without a session → `/login?next=…`;
  - with `mustChangePassword` → `/change-password`.
- Production: put nginx in front of both apps on one domain, or keep this rewrite with
  `BACKEND_URL` set **at build time**. The backend's `FRONTEND_URL`/`CORS_ORIGINS` must name the public
  frontend address.

## 5. End-to-end tests (Playwright)

Requirements:

- the backend runs on `BACKEND_URL` against its normal dev database, with:
  - `MAIL_DRY_RUN=true`, `NODE_ENV=development`, `SCHEDULER_ENABLED=true`;
  - `THROTTLE_LIMIT=1000` (the suite sends more than the default 100 requests per minute from one IP);
- `.env.e2e` holds an ADMIN/SUPER_ADMIN login that has already changed its first password (needed to create the test officers).

```bash
cp .env.e2e.example .env.e2e      # fill in the admin login
npx playwright install chromium   # once
npm run test:e2e                  # starts `npm run dev` if it is not running yet
```

How it works:

- `e2e/global-setup.ts` makes sure the **dedicated test officers** exist, using the admin API only. They are never real officers:

  | Key          | Login                                        | Designation (priority)  |
  | ------------ | -------------------------------------------- | ----------------------- |
  | `officer`    | `e2e-officer@example.com`                    | Statistical Officer (7) |
  | `dd1`, `dd2` | `e2e-dd1@example.com`, `e2e-dd2@example.com` | Deputy Director (6)     |
  | `dg`         | `e2e-dg@example.com`                         | Director General (2)    |
  | `so`         | `e2e-so@example.com`                         | Statistical Officer (7) |
  - Since 2026-11-09 new accounts and admin resets get the **default officer password**, so no mail link is needed.
  - The tests read that password from `E2E_OFFICER_PASSWORD`, or else only the `DEFAULT_OFFICER_PASSWORD` line of `backend/.env`. It is never printed.
  - The setup saves one logged-in session per officer in the git-ignored `e2e/.state/`, so the tests do not log in over and over (the backend allows 10 logins per minute per IP).

- The tests only put test officers into meetings, so they never clash with real officers. Every meeting they create is cancelled again.
- `auth.spec.ts`:
  - login failure and success, the `?next=` redirect, logout;
  - officers on the default password get no redirect and see no banner;
  - the forced `/change-password` (SUPER_ADMIN only, simulated).
- `dashboard.spec.ts`: today's meeting, the week/month tabs, the phone menu.
- `meetings.spec.ts`: the form, the clash panels (red / green / amber), the conflict flow, and the outsider getting "সভাটি পাওয়া যায়নি".
- `no-icons.spec.ts`: no `<svg>`, icon element or icon symbol in the layout, header, sidebar, menus and pages, and every button has visible text.
- Public pages only (no test officers needed): `E2E_SKIP_SETUP=1 npm run test:e2e -- --grep public`.
- Wait a minute before running the whole suite twice in a row (login limit). The saved sessions are valid for 15 minutes.

## 6. Conventions

- UI text only in `messages/bn.ts`; numbers and dates only through `lib/format.ts` (Bangla digits, Asia/Dhaka).
- Backend calls only through `lib/api.ts` / `lib/endpoints.ts`.
- Forms: zod schema in `lib/schemas.ts` with the same rules as the backend DTO.
- Small own components in `components/ui`. Keep keyboard focus visible, and label every field.
