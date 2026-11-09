# Working rules for this repository

This is the BBS Meeting Schedule System. **Read `SPEC.md` before every task** — it is the source of truth
for rules, data model, API list and security requirements. If a request conflicts with SPEC.md, say so and ask.

## How we work
- The owner is learning. We build in numbered steps (SPEC.md §12). Do **only** the step asked for.
- Before writing code, give a short plan (files you will create/change and why). Then implement.
- After finishing a step, explain in simple Bangla: what was built, how it works, which commands to run,
  and how to test it in Swagger. Keep explanations short and practical.
- Never invent requirements. If something is unclear, ask one clear question.
- Do not delete or rewrite working code from earlier steps unless the step requires it; explain any such change.

## Code conventions
- TypeScript strict. No `any` unless unavoidable (comment why).
- NestJS: thin controllers, logic in services, one DTO per input, `@ApiProperty` on every DTO field,
  Swagger decorators on every endpoint.
- Database changes only through TypeORM migrations. `synchronize` stays `false`.
- Names: files kebab-case, classes PascalCase, DB columns camelCase in entities.
- Code comments in English. User-facing messages (errors, mail, notifications) in Bangla.
- Time: store UTC `timestamptz`; compute day/week/month/year ranges in `Asia/Dhaka` via `common/utils/time`.

## Security (never skip)
Follow SPEC.md §9 in every step. Never commit `.env` or files under `backend/src/database/seeds/data/`.
Never log passwords, tokens or full request bodies of auth routes.
Never print passwords, secrets, tokens or .env values in chat explanations or reports — refer to the variable name instead.

## Commands (backend)
- `npm run start:dev` — run API with watch mode (http://localhost:4000, Swagger at /api/docs)
- `npm run migration:generate -- src/database/migrations/<Name>` — create migration from entity changes
- `npm run migration:run` — apply migrations
- `npm run seed` — run seeds
- `npm run lint` / `npm run test` / `npm run test:e2e`
