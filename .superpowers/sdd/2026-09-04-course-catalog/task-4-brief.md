# Task 4 brief — Rotas, menu administrativo e verificação

Read `docs/superpowers/specs/2026-09-04-course-catalog-design.md` first. Task 3 is complete under `web/src/features/courses`; import its public types/hooks/components rather than duplicating it.

## Ownership

- Create `web/src/routes/_admin/admin/courses/index.tsx`
- Create `web/src/routes/_admin/admin/courses/new.tsx`
- Create `web/src/routes/_admin/admin/courses/$courseId.tsx`
- Create `web/src/routes/_admin/admin/courses/-courses-routes.test.tsx`
- Modify `web/src/features/layout/admin-navigation.ts`
- Update generated router tree only via the repository’s existing generation command if required.

Do not change API or `features/courses` except a minimal import/type issue discovered during integration. You are not alone: preserve unrelated edits. Do not spawn agents.

## Required UI

- Add "Cursos" (`BookOpen`) to admin navigation linking `/admin/courses`.
- `/admin/courses`: inherited ADMIN guard; preload list; show title, description summary, status badge and action links; "Novo curso".
- `/admin/courses/new`: use CourseForm; create and navigate to `/admin/courses/$courseId`.
- `/admin/courses/$courseId`: preload detail; update course (including status); show modules with `ModulesList`; create/edit module via forms/dialogs or inline shadcn Card/Dialog; delete modules with explicit confirmation; moves submit the full module ID order using the existing mutation.
- Render pending/error empty states with shadcn Alert/Card/Button. No student route/link.
- Test admin guard/preloading/menu and primary route rendering/actions testably; respect current route naming conventions.

## Verification / report

Run focused and full Web test/typecheck/lint/build. Write exact results to `.superpowers/sdd/2026-09-04-course-catalog/task-4-report.md`; return only short status, one-line test summary, concerns.
