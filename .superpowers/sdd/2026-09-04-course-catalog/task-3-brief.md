# Task 3 brief — Feature Web de cursos e cache TanStack Query

Read `docs/superpowers/specs/2026-09-04-course-catalog-design.md` first. It is binding. Task 2 API is complete. Routes and envelope are those specified in the design; API returns `data` and fields are camelCase.

## Ownership

Create only `web/src/features/courses/` and tests alongside it:

- `courses-types.ts`, `courses-api.ts`, `courses-queries.ts`
- `course-form.tsx`, `module-form.tsx`, `modules-list.tsx`
- matching `*.test.ts` / `*.test.tsx`

Do not add route files or modify navigation; Task 4 owns that. You are not alone: preserve unrelated edits. Do not spawn subagents.

## Required interfaces / behavior

- Types represent `Course` (`id,title,description,status,createdAt,updatedAt,modules`) and `CourseModule` (`id,courseId,title,description,position,createdAt,updatedAt`), Course status enum, input types.
- API uses existing `apiClient`; list/get/create/update course; create/update/delete module; reorder modules through `PUT /courses/:courseId/modules/order` body `{ moduleIds }`; every response unwraps `{ data }`.
- Query keys use `coursesQueryKeys.all/list/detail(courseId)`, provide queryOptions/useQuery and mutations. Successful mutations refresh affected list/detail cache safely.
- Course form uses existing shadcn fields/buttons/select/Alert and supports title, optional description and status on edit (create screen can omit status or default DRAFT). Module form supports title and optional description.
- Modules list presents ordered modules with accessible edit/delete/move controls. First Up and last Down are disabled. Movement reports a full re-ordered `moduleIds` array to its callback. Render loading/mutation errors in caller-friendly form.
- Use test-first and cover HTTP methods/paths, cache refresh behavior, forms and movement accessibility.

## Report

Run focused web tests and typecheck/lint as available. Write full evidence to `.superpowers/sdd/2026-09-04-course-catalog/task-3-report.md`; return only status, test summary and concerns.
