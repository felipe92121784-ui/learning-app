# Administração de Usuários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que ADMIN gerencie alunos e que cada usuário troque sua própria senha.

**Architecture:** Controllers finos delegam validação/modelo; middleware/ability garante ADMIN. O Web usa TanStack Query e componentes shadcn/ui para a tabela, formulários e conta.

**Tech Stack:** AdonisJS, Lucid, Japa, React, TanStack Router/Query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-user-administration-design.md`

## Global Constraints

- Apenas ADMIN gerencia alunos; STUDENT recebe 403.
- Criação sempre produz STUDENT ACTIVE; senha e role nunca são serializadas.
- UI usa shadcn/ui; Web não decide autorização final.

---

### Task 1: API administrativa de usuários

**Files:** Create `api/app/controllers/users_controller.ts`, `api/app/validators/admin_user.ts`, `api/tests/functional/users.spec.ts`; modify `api/start/routes.ts`, auth middleware/policy files as required.

- [ ] Write failing Japa tests for admin list/create/show/update, STUDENT 403, duplicate e-mail 422.
- [ ] Run `cd api && npm test tests/functional/users.spec.ts` and confirm missing routes fail.
- [ ] Implement ADMIN guard and REST endpoints with Vine validation; set create role/status server-side.
- [ ] Re-run focused tests, then `npm test`, typecheck and lint.

### Task 2: Bloqueio e troca de senha

**Files:** Create/modify status and account password controllers/validators; extend `api/tests/functional/users.spec.ts` and `api/tests/functional/account_password.spec.ts`.

- [ ] Write failing tests for status update, blocked existing session 401, wrong current password rejection and successful self password change.
- [ ] Implement revalidation of ACTIVE on authenticated requests, status endpoint and `PATCH /account/password`.
- [ ] Run API suite, typecheck and lint green.

### Task 3: Interface administrativa shadcn/ui

**Files:** Create `web/src/features/users/*`, `web/src/routes/_admin/users/*`; add required shadcn components (`table`, `badge`, `dialog`, `select`, `form`); tests in feature/routes.

- [ ] Write failing Vitest tests for user API calls and status rendering/actions.
- [ ] Implement query hooks, table, create/edit forms and activate/block actions using shadcn components.
- [ ] Verify admin routes use existing guard; run Web test/typecheck/lint/build.

### Task 4: Conta e integração

**Files:** Create `web/src/routes/_app/account.tsx`, password form feature/tests; modify README.

- [ ] Write failing test for current-password/new-password submission and API error.
- [ ] Implement protected password-change form using shadcn components.
- [ ] Document admin workflow; run API/Web complete verification and smoke-test block/login/password flows.

## Self-review

Tasks map one-to-one to the spec: administration, blocking/session safety, shadcn Web UI and self-service password. No domain content, invitation or recovery flows are included.
