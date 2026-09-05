# Task 1 brief — Persistência e contratos Course → Module

Read `docs/superpowers/specs/2026-09-04-course-catalog-design.md` first. It is binding.

## Ownership

You own only the API persistence and validation layer for Course → Module:

- Create two migrations for `courses` and `modules`.
- Create `api/app/models/course.ts` and `api/app/models/course_module.ts`.
- Create Course and Module transformers.
- Create `api/app/validators/course.ts`.
- Create or extend `api/tests/functional/courses.spec.ts` only for persistence/model/validation contract coverage.

Do not add API routes/controllers, do not modify web files, and do not create materials/storage/access rules. You are not alone in the codebase: preserve unrelated edits and accommodate existing conventions. Do not spawn subagents.

## Exact requirements

- Course fields: `id`, `title`, optional `description`, `status`, timestamps. Status values are exactly `DRAFT`, `PUBLISHED`, `ARCHIVED`.
- Module fields: `id`, `course_id`, `title`, optional `description`, non-negative integer `position`, timestamps.
- FK cascades on course deletion.
- `Course.modules` and `CourseModule.course` Lucid relations exist.
- Validators are named `createCourseValidator`, `updateCourseValidator`, `createModuleValidator`, `updateModuleValidator`, `reorderModulesValidator`.
- Title validation: trimmed string, min 2, max 160. Description: optional trimmed string, max 2000. Reorder payload: `{ moduleIds: number[] }`.
- Transformers serialize in camelCase and no implementation-only fields.
- Use Japa test-first. Observe the new test fail before production implementation, then make it pass.

## Verification

Run focused tests and then relevant API typecheck/lint. Write a detailed report to `.superpowers/sdd/2026-09-04-course-catalog/task-1-report.md` including changed files, commands/results, and any concern. Return only a short completion message.
