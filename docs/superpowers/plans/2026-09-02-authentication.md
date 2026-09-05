# Autenticação e Administrador Inicial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar login por sessão HTTP-only, administrador inicial idempotente e rotas Web protegidas por autenticação e papel.

**Architecture:** A API AdonisJS mantém o usuário e a sessão como fonte de verdade: login cria a sessão do guard `web`, perfil a restaura e logout a encerra. A SPA consulta perfil com TanStack Query, envia cookies em cada chamada e usa layouts TanStack Router para proteger `/app` e `/admin` apenas como UX.

**Tech Stack:** AdonisJS 7, Lucid/PostgreSQL, Japa, React 19, TanStack Router/Query, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-authentication-design.md`

## Global Constraints

- A sessão usa cookie HTTP-only; o Web não recebe ou persiste tokens.
- Somente `ACTIVE` inicia e mantém sessão; roles são `ADMIN` e `STUDENT`.
- Signup público não existirá; o seed do admin lê apenas `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Guards Web não substituem autorização futura da API.
- Login inválido e bloqueado usam resposta genérica; usuário serializado nunca expõe senha/hash.

---

### Task 1: Evoluir usuário e criar seed idempotente

**Files:**
- Create: `api/database/migrations/*_add_role_and_status_to_users_table.ts`
- Create: `api/database/seeders/admin_seeder.ts`
- Modify: `api/database/schema.ts`
- Modify: `api/app/models/user.ts`
- Modify: `api/app/transformers/user_transformer.ts`
- Modify: `api/start/env.ts`, `api/.env.example`, `api/.env.test`, `api/.env.docker.example`, `.env.example`
- Test: `api/tests/unit/admin_seeder.spec.ts`

**Interfaces:**
- Produces `User.role: 'ADMIN' | 'STUDENT'`, `User.status: 'ACTIVE' | 'BLOCKED'`.
- Produces `AdminSeeder.run(): Promise<void>` and public user payload with role/status.

- [ ] **Step 1: Write a failing seed test**

Test with `ADMIN_*` set that running `AdminSeeder` twice creates exactly one active ADMIN with the configured e-mail, and test missing settings rejects clearly.

- [ ] **Step 2: Run the focused test**

Run: `cd api && npm test tests/unit/admin_seeder.spec.ts`

Expected: FAIL because role/status and seeder do not exist.

- [ ] **Step 3: Add migration, model/transformer fields and environment schemas**

Add non-null role/status columns with defaults `STUDENT`/`ACTIVE`. Define typed constants or unions in the model. Add and document the three `ADMIN_*` variables as secrets/strings; do not put actual credentials in examples.

- [ ] **Step 4: Implement the idempotent seeder**

Use the configured e-mail as lookup, hash password through the Lucid auth model, create only when missing, and set `ADMIN`/`ACTIVE`. Register it by AdonisJS convention so `node ace db:seed --files admin_seeder` runs it.

- [ ] **Step 5: Run migration and seed tests**

Run: `cd api && node ace migration:run && npm test tests/unit/admin_seeder.spec.ts`

Expected: migration succeeds and seed tests pass.

### Task 2: Mudar a API para autenticação por sessão

**Files:**
- Modify: `api/config/auth.ts`, `api/start/routes.ts`
- Modify: `api/app/controllers/access_tokens_controller.ts`, `api/app/controllers/profile_controller.ts`
- Remove: `api/app/controllers/new_account_controller.ts` if unused
- Modify: `api/app/validators/user.ts`, `api/app/middleware/auth_middleware.ts` as needed
- Test: `api/tests/functional/auth.spec.ts`

**Interfaces:**
- Consumes `POST /api/v1/auth/login { email, password }`.
- Produces session cookie plus `{ user }`, `GET /api/v1/account/profile`, and authenticated `POST /api/v1/account/logout`.

- [ ] **Step 1: Write failing functional tests**

Cover active login followed by profile through the session cookie, generic failure for wrong credentials and BLOCKED user, logout then profile 401, and no `signup` route.

- [ ] **Step 2: Run the functional auth test**

Run: `cd api && DB_PORT=15432 npm test tests/functional/auth.spec.ts`

Expected: FAIL because login returns a token and profile uses token guard.

- [ ] **Step 3: Implement session guard flow**

Set `auth.default` to `web`; in login verify credentials, reject non-active users with the same public error, call `auth.use('web').login(user)` and serialize `{ user }`; logout calls session logout. Protect profile/logout with `middleware.auth({ guards: ['web'] })`; remove signup route/controller exposure.

- [ ] **Step 4: Run focused and full API verification**

Run: `cd api && DB_PORT=15432 npm test && npm run typecheck && npm run lint`

Expected: all tests and checks pass.

### Task 3: Criar estado de autenticação e guards no Web

**Files:**
- Modify: `web/src/lib/api-client.ts`, `web/src/main.tsx`, `web/src/router.tsx`
- Create: `web/src/features/auth/auth-provider.tsx`, `web/src/features/auth/auth-api.ts`, `web/src/features/auth/auth-types.ts`
- Create: `web/src/routes/login.tsx`, `web/src/routes/_app.tsx`, `web/src/routes/_app/index.tsx`, `web/src/routes/_admin.tsx`, `web/src/routes/_admin/index.tsx`
- Modify: `web/src/routes/index.tsx`
- Test: `web/src/features/auth/auth-api.test.ts`, `web/src/routes/login.test.tsx` or focused equivalent

**Interfaces:**
- Consumes API response `{ user: { id, fullName, email, role, status } }` and cookie sessions.
- Produces `useAuth()` with `{ user, isLoading, login, logout }`; `/app` and `/admin` route guards.

- [ ] **Step 1: Write failing Web tests**

Test that API client sends `credentials: 'include'`; login API posts JSON without token persistence; a student attempting `/admin` is redirected/denied and an unauthenticated user is directed to `/login`.

- [ ] **Step 2: Run focused Web tests**

Run: `cd web && npm test`

Expected: FAIL because auth provider, routes and cookie credentials do not exist.

- [ ] **Step 3: Implement API client and AuthProvider**

Set `credentials: 'include'` in central fetch options. Define user/session types, `getProfile`, `login`, `logout`, a profile query and mutations that invalidate profile. Keep only user state/query cache; do not use browser storage.

- [ ] **Step 4: Implement routes and layouts**

Build `/login` form with accessible labels and generic error. Add `_app`/`_admin` layouts with `beforeLoad` guards; wait for session restoration rather than flashing protected content. `/admin` checks `user.role === 'ADMIN'`; `/app` accepts active user. Add logout action and minimal shell pages.

- [ ] **Step 5: Run full Web verification**

Run: `cd web && npm run lint && npm test && npm run typecheck && npm run build`

Expected: all commands exit 0.

### Task 4: Document and smoke-test the complete login flow

**Files:**
- Modify: `README.md`
- Test: manual/API smoke commands documented in README

**Interfaces:**
- Consumes configured `ADMIN_*` and running infrastructure.
- Produces reproducible commands for migrate, seed, run API/Web and login.

- [ ] **Step 1: Document admin settings and seed command**

Add `ADMIN_*` mapping guidance without values, `node ace migration:run`, `node ace db:seed --files admin_seeder`, and explain that first login uses the configured credentials.

- [ ] **Step 2: Execute smoke flow**

Run Compose with the existing smoke override if default ports are unavailable; run migrations, seed twice, login with cookie jar, profile, logout and verify profile returns 401.

- [ ] **Step 3: Final verification**

Run API and Web full validation commands from Tasks 2–3 and `docker compose --env-file .env.example config --quiet`.

## Self-review

- Spec coverage: Task 1 delivers role/status and seed; Task 2 API cookie session; Task 3 Web login/restoration/guards; Task 4 reproducibility and end-to-end proof.
- Placeholder scan: no incomplete requirements or unspecified contracts remain.
- Type consistency: API and Web use `role`, `status`, `fullName`, `email`; all responses wrap the user in `{ user }` except the existing profile endpoint, which Task 2 normalizes to `{ user }` for one client contract.
