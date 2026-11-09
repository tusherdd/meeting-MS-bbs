# BBS Meeting Schedule — Backend API

NestJS 11 · TypeORM · PostgreSQL · Puppeteer (Bangla PDFs). Rules, data model and API: [`../SPEC.md`](../SPEC.md).
Endpoint list: [`../docs/API.md`](../docs/API.md) · Security: [`../docs/SECURITY.md`](../docs/SECURITY.md) ·
ERD: [`../docs/ERD.md`](../docs/ERD.md).

---

## 1. Setup from zero (macOS)

### 1.1 Tools

```bash
brew install node@24 postgresql@17
brew services start postgresql@17
node -v          # v24.x
```

### 1.2 Databases (one time, as the PostgreSQL admin user)

```sql
CREATE ROLE bbs_meeting LOGIN PASSWORD '<a strong password>';
CREATE DATABASE bbs_meeting      OWNER bbs_meeting;   -- development
CREATE DATABASE bbs_meeting_test OWNER bbs_meeting;   -- e2e tests only
```

You can run this in pgAdmin's Query Tool or `psql -U postgres`. No extension is needed: `gen_random_uuid()` is built into PostgreSQL 13+.

### 1.3 Install and configure

```bash
cd backend
npm install                         # also downloads Chrome for Puppeteer (~150 MB, once)
cp .env.example .env
cp .env.test.example .env.test
```

Edit `.env`:

| Variable | Value |
|---|---|
| `DB_PASSWORD` | the password from 1.2 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two **different** values, each from `openssl rand -base64 48` |
| `SEED_SUPER_ADMIN_PASSWORD` | initial super admin password (letters + digits, ≥ 8) |
| `SEED_OFFICER_DEFAULT_PASSWORD` | development only: one known password for all seeded officers (leave empty → random unusable passwords) |

The app **refuses to start** with missing or weak settings. Examples:
- a JWT secret shorter than 32 characters (the `.env.example` placeholders are too short on purpose);
- two equal JWT secrets;
- a missing DB setting.

`.env` and `.env.test` are git-ignored.

If the Chrome download was skipped or interrupted: `npx puppeteer browsers install chrome`.

### 1.4 Migrate, seed, run

```bash
npm run migration:run
# put the officer list at src/database/seeds/data/officers.csv (git-ignored), then:
npm run seed                        # idempotent: safe to run again
npm run start:dev                   # http://localhost:4000/api/v1
```

- Health: <http://localhost:4000/api/v1/health>
- Swagger: <http://localhost:4000/api/docs> (when `SWAGGER_ENABLED=true`)
- With `MAIL_DRY_RUN=true`, mails are not sent. A copy of each mail is written to `tmp/mail-preview/<id>.html` (development only), so one-time links can be tested.

---

## 2. npm scripts

| Script | What it does |
|---|---|
| `start:dev` | API with watch mode |
| `start` / `start:debug` | run once / with debugger |
| `build` | compile to `dist/` |
| `start:prod` | `node dist/main` (after `build`) |
| `lint` | ESLint + Prettier (auto-fix) |
| `format` | Prettier only |
| `test` / `test:watch` / `test:cov` | unit tests (no database) |
| `test:e2e` | end-to-end tests on the **test database** (see §3) |
| `migration:generate -- src/database/migrations/<Name>` | migration from entity changes |
| `migration:create -- src/database/migrations/<Name>` | empty migration (hand-written SQL) |
| `migration:run` / `migration:revert` / `migration:show` | apply / undo last / list (TypeScript sources) |
| `migration:run:prod` / `migration:show:prod` | the same on the compiled `dist/` (production, no ts-node) |
| `seed` | designations, wings, super admin, officers (SPEC §11) |
| `openapi:export` | writes `../docs/openapi.json` from the real controllers (no DB needed) |
| `docs:api` | regenerates `../docs/API.md` from `openapi.json` |

After changing endpoints or DTOs, run `npm run openapi:export && npm run docs:api`.

---

## 3. Tests and the test database

- **Unit tests** (`npm run test`) use mocks only.
- **e2e tests** (`npm run test:e2e`) run the real app against **`DB_NAME_TEST`** from `.env.test`:
  - `test/global-setup.ts` migrates that database and empties it before every run;
  - the run **stops** if `DB_NAME_TEST` is missing, equals the dev `DB_NAME`, or does not end with `_test`, so the development database is never touched;
  - in tests, cron jobs are off (`SCHEDULER_ENABLED=false`), mail is dry-run, and uploads go to `tmp/test-uploads`.
- The one-time SQL for the test database is in §1.2.
- Jest runs with `--experimental-vm-modules`, because Puppeteer is an ES module.

---

## 4. Production deployment (Linux server)

### 4.1 Server

- Ubuntu 24.04 LTS (or similar), with Node.js 24 LTS (NodeSource or nvm), PostgreSQL 16+ and nginx.
- Run the app as a normal user (e.g. `bbs`), **never as root**: the Chrome sandbox used for PDFs needs this.
- Chrome system libraries for Puppeteer (Ubuntu/Debian):

  ```bash
  sudo apt-get install -y ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
    libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 wget xdg-utils
  ```

  The Bangla font is bundled with the app, so no system fonts are needed for reports.

### 4.2 Install and build

```bash
git clone <repo> /opt/bbs-meeting && cd /opt/bbs-meeting/backend
npm ci
npx puppeteer browsers install chrome
cp .env.example .env            # then edit — see 4.3
npm run build
npm run migration:run:prod
npm run seed                    # once, with the officer CSV in src/database/seeds/data/
```

### 4.3 `.env` values that MUST change for production

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL`, `FRONTEND_URL` | `https://…` (secure cookies need HTTPS; the app refuses http) |
| `CORS_ORIGINS` | the real frontend origin(s), **no localhost** |
| `DB_*` | production database and a strong password |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | new random values, different from development |
| `SMTP_*`, `MAIL_FROM` | the office SMTP server |
| `MAIL_DRY_RUN` | `false` (must be set explicitly) |
| `SWAGGER_ENABLED` | `false`, or `true` together with `SWAGGER_USER` + `SWAGGER_PASSWORD` (≥ 12 chars) |
| `TRUST_PROXY` | `1` (one nginx in front), so throttling and audit see the real client IP |
| `SEED_OFFICER_DEFAULT_PASSWORD` | empty (the app refuses to start otherwise) |
| `SEED_SUPER_ADMIN_PASSWORD` | strong initial password; it must be changed at first login |
| `UPLOAD_DIR` | a persistent folder outside the code, e.g. `/var/lib/bbs-meeting/uploads` |

### 4.4 Run with systemd (or pm2)

`/etc/systemd/system/bbs-meeting.service`:

```ini
[Unit]
Description=BBS Meeting Schedule API
After=network.target postgresql.service

[Service]
User=bbs
WorkingDirectory=/opt/bbs-meeting/backend
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
Environment=TZ=Asia/Dhaka
# graceful shutdown: SIGTERM closes the DB pool, the PDF browser and the cron jobs
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now bbs-meeting
journalctl -u bbs-meeting -f            # logs (no passwords, tokens or bodies are ever logged)
```

The pm2 alternative: `pm2 start dist/main.js --name bbs-meeting && pm2 save && pm2 startup`. Run **one** instance: the cron jobs and the unknown-email login tracker live in the process.

### 4.5 nginx reverse proxy with HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name api.meeting.bbs.gov.bd;
    ssl_certificate     /etc/letsencrypt/live/api.meeting.bbs.gov.bd/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.meeting.bbs.gov.bd/privkey.pem;

    client_max_body_size 3m;            # photo uploads (MAX_UPLOAD_MB=2) + multipart overhead

    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Request-Id      $request_id;
        proxy_read_timeout 60s;         # PDF rendering may take up to 30 s
    }
}
server {
    listen 80;
    server_name api.meeting.bbs.gov.bd;
    return 301 https://$host$request_uri;
}
```

Certificates: `sudo certbot --nginx -d api.meeting.bbs.gov.bd`. Keep the API port (4000) closed in the firewall; only nginx talks to it.

### 4.6 Daily backup

`/etc/cron.d/bbs-meeting-backup` (02:30 Dhaka time, keep 30 days):

```cron
30 2 * * * postgres pg_dump -Fc bbs_meeting > /var/backups/bbs-meeting/bbs_meeting_$(date +\%F).dump && find /var/backups/bbs-meeting -name '*.dump' -mtime +30 -delete
```

Also back up `UPLOAD_DIR` (profile photos). Restore: `pg_restore --clean -d bbs_meeting <file>.dump`.

### 4.7 Updating

```bash
git pull && npm ci && npm run build && npm run migration:run:prod && sudo systemctl restart bbs-meeting
```

---

## 5. Folder layout

```
backend/
├── src/
│   ├── main.ts · app.module.ts · app.setup.ts   bootstrap, global guards, security headers
│   ├── config/          env schema (Joi) + production safety checks
│   ├── database/        data-source.ts (CLI), typeorm-options.ts, entities.ts, migrations/, seeds/
│   ├── common/          decorators, guards, filters, pipes, middleware, logging, interceptors, utils (time, password, …)
│   └── modules/         auth, users, profile, designations, wings, change-requests, meetings (conflict engine),
│                        notifications, mail (outbox + worker), reports (PDF), admin, audit, health
├── test/                e2e tests + test-database setup
└── scripts/             openapi export, API.md generator
```
