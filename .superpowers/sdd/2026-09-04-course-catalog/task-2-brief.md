# Task 2 brief — Endpoints administrativos e ordenação transacional

Read `docs/superpowers/specs/2026-09-04-course-catalog-design.md` first. It is binding. Task 1 is complete: `Course`, `CourseModule`, serializers and validators already exist. `createCourseValidator` intentionally excludes status, so this controller must persist `status: 'DRAFT'` on creation.

## Ownership

You own only:

- `api/app/controllers/courses_controller.ts`
- `api/start/routes.ts`
- `api/tests/functional/courses.spec.ts`

Do not edit persistence models/validators/migrations unless a hard integration issue requires a minimal correction; do not touch web. You are not alone in the codebase: preserve unrelated changes and accommodate existing conventions. Do not spawn subagents.

## Required routes, all protected by existing web auth then admin middleware

- `GET /api/v1/courses`
- `POST /api/v1/courses`
- `GET /api/v1/courses/:id`
- `PATCH /api/v1/courses/:id`
- `POST /api/v1/courses/:courseId/modules`
- `PATCH /api/v1/courses/:courseId/modules/:id`
- `DELETE /api/v1/courses/:courseId/modules/:id`
- `PUT /api/v1/courses/:courseId/modules/order`

## Behaviour

- List returns courses (created newest first); show returns a course with modules by position ascending.
- POST course uses `createCourseValidator` and always persists `DRAFT`; response 201 with serialized course and `modules: []`.
- PATCH course uses `updateCourseValidator`, including allowed status changes.
- POST module uses `createModuleValidator` and assigns `position` equal to the next final index within that course.
- Update/delete module must find it within `courseId`; a module from any other course returns 404.
- Deletion and reordering run in a database transaction. Deletion compacts remaining positions to `0..n-1`.
- Reorder validates `{ moduleIds: number[] }` and checks it is exactly the set of IDs in that course: no missing, duplicate or foreign IDs. On valid input, write positions sequentially from 0 and return serialized course with ordered modules.
- Maintain API envelope/serialization patterns from UsersController.

## Tests / TDD

Add endpoint tests first and observe a pre-implementation failure. Cover admin course create/list/show/update, forced DRAFT, module creation at end, module update/delete/position compaction, valid reorder, invalid missing/foreign/duplicate IDs (422), cross-course module 404, and STUDENT 403 for every new route. Do not weaken Task 1 tests.

## Verification / report

Run focused Japa test, then API suite/typecheck/lint as environment allows. Record exact output/status in `.superpowers/sdd/2026-09-04-course-catalog/task-2-report.md`, including TDD evidence, files changed and concerns. Return only short status, one-line test summary and concerns.
