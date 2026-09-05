# Review package — Task 2

Review Task 2 against `.superpowers/sdd/2026-09-04-course-catalog/task-2-brief.md` and the binding design `docs/superpowers/specs/2026-09-04-course-catalog-design.md`.

Read implementer evidence at `.superpowers/sdd/2026-09-04-course-catalog/task-2-report.md`.

No usable Git history exists. Inspect only these files (and any exact import they require to resolve a concrete concern):

- `api/app/controllers/courses_controller.ts`
- `api/start/routes.ts`
- `api/tests/functional/courses.spec.ts`
- `api/app/validators/course.ts`

Key Task 2 ruling: reordering must use a two-phase transaction to avoid a per-course unique-position collision; module IDs must be strict JSON numbers, no string coercion. Evaluate admin enforcement, forced DRAFT creation, nested module ownership, 404/422 semantics, atomic order/delete handling and tests. Read-only; do not edit, spawn or run broad tests. Return spec and quality verdicts with severity-ranked file:line findings.
