# BBS Meeting Schedule — Backend API

NestJS 11 + TypeORM + PostgreSQL. Rules, data model and API list: see [`../SPEC.md`](../SPEC.md).

## Requirements

- Node.js 24 LTS, npm
- PostgreSQL 16+

## 1. Install

```bash
cd backend
npm install
```

## 2. Create the database

Run in `psql` as a PostgreSQL superuser (use your own strong password):

```sql
CREATE ROLE bbs_meeting LOGIN PASSWORD 'your-strong-password';
CREATE DATABASE bbs_meeting OWNER bbs_meeting;
```

## 3. Configure `.env`

```bash
cp .env.example .env
```

Then edit `.env`:

- `DB_PASSWORD`: the password from step 2.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: **two different** random values of at least 32 characters.
  Generate each with:

  ```bash
  openssl rand -base64 48
  ```

The app **refuses to start** if a variable is missing or invalid, for example:
- a JWT secret shorter than 32 characters (the placeholders in `.env.example` are deliberately too short),
- the two JWT secrets are the same,
- a DB setting is missing,
- `CORS_ORIGINS` contains something that is not an exact origin (`https://host[:port]`, no trailing `/`).

`.env` is git-ignored. Never commit it.

## 4. Run

```bash
npm run start:dev        # watch mode → http://localhost:4000/api/v1
```

- Health: <http://localhost:4000/api/v1/health>
- Swagger: <http://localhost:4000/api/docs> (only when `SWAGGER_ENABLED=true`)

## 5. Migrations

Schema changes go **only** through migrations (`synchronize` is always `false`).

```bash
npm run migration:generate -- src/database/migrations/<Name>   # from entity changes
npm run migration:run                                          # apply pending
npm run migration:revert                                       # undo the last one
npm run migration:show                                         # list applied / pending
```

The CLI uses `src/database/data-source.ts`, which reads the same `.env` and runs the same validation as the app.

## 6. Quality checks

```bash
npm run lint
npm run test        # unit tests
npm run test:e2e    # needs .env and a running database
npm run build
```

## Security baseline (already in place)

| What | Where |
|---|---|
| Env validation (Joi), app stops on weak/missing config | `src/config/env.validation.ts` |
| Global prefix `/api/v1`, helmet, cookie-parser, CORS allowlist, ValidationPipe | `src/app.setup.ts` |
| Global rate limit (100 req/min per IP) | `src/app.module.ts` |
| Uniform errors `{ statusCode, message, error }`, no stack/SQL in production | `src/common/filters/all-exceptions.filter.ts` |
| Swagger only when `SWAGGER_ENABLED=true` | `src/app.setup.ts` |

## Folder layout

```
src/
├── main.ts / app.module.ts / app.setup.ts
├── config/          env schema + typed EnvVars
├── database/        data-source.ts (CLI), typeorm-options.ts, migrations/, seeds/
├── common/          decorators/, guards/, filters/, interceptors/, dto/, utils/ (time.ts)
└── modules/         health/ (done) + empty feature folders for later steps
```
