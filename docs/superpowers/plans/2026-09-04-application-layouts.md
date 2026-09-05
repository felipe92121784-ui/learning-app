# Layouts Administrativo e do Aluno Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar shells responsivos e distintos para ADMIN e STUDENT, inspirados no demo e baseados em shadcn/ui.

**Architecture:** Um conjunto compartilhado concentra a sidebar, cabeçalho, conta e logout; cada área fornece sua própria configuração de navegação. Os guards existentes continuam protegendo as rotas e apenas escolhem o shell correto.

**Tech Stack:** React, TanStack Router, shadcn/ui, Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-application-layouts-design.md`

## Global Constraints

- Usar componentes shadcn/ui; Tailwind somente para composição.
- Não alterar autorização da API ou remover guards existentes.
- ADMIN e STUDENT nunca recebem links da área contrária.
- Desktop: sidebar recolhível; mobile: `Sheet`.

---

### Task 1: Adicionar primitivas shadcn e fundação de navegação

**Files:** Create `web/src/components/layout/*`; add shadcn `sidebar`, `sheet`, `avatar`, `dropdown-menu`, `separator`, `tooltip`; Test `web/src/components/layout/*.test.tsx`.

- [ ] Write a failing test asserting desktop collapsed state and mobile menu trigger render.
- [ ] Run focused Vitest test; expect missing shared layout components.
- [ ] Add official shadcn components and implement a typed `AppSidebar` with `collapsed`, `onCollapsedChange`, navigation items and active link state.
- [ ] Re-run focused tests, typecheck and lint.

### Task 2: Implementar AdminLayout

**Files:** Modify `web/src/routes/_admin.tsx`; create `web/src/features/layout/admin-navigation.ts`; tests for admin layout.

- [ ] Write failing tests asserting ADMIN nav contains overview/users and excludes student-only links.
- [ ] Implement AdminLayout with sidebar, page header, account menu/logout and responsive Sheet.
- [ ] Verify `/admin/users` remains available and inherited guard redirects STUDENT.
- [ ] Run Web test/typecheck/lint/build.

### Task 3: Implementar StudentLayout

**Files:** Modify `web/src/routes/_app.tsx`; create `web/src/features/layout/student-navigation.ts`; tests for student layout.

- [ ] Write failing tests asserting portal/account navigation and no admin items.
- [ ] Implement StudentLayout using shared shell and route-active state.
- [ ] Verify `/app` and `/app/account` remain guarded and mobile navigation is operable.
- [ ] Run complete Web verification.

### Task 4: Polimento e validação responsiva

**Files:** Modify layout components/styles/tests as required.

- [ ] Test keyboard-accessible menu, active links, logout and collapsed persistence for the current session.
- [ ] Check desktop/mobile breakpoints against demo hierarchy; do not copy its profile-toggle controls.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Self-review

All spec requirements map to Tasks 1–4. The plan deliberately excludes course/material navigation until those routes exist.
