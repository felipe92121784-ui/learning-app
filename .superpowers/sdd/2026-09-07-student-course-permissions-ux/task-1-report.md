# Task 1 — Backend course association lifecycle

## Delivered API

All endpoints require the existing web authentication, admin middleware, and CSRF protection for mutations.

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/api/v1/users/:userId/courses` | Lists courses that have at least one direct `COURSE` access rule for the student. Each course includes `permission`: `NONE`, `READ`, or `FULL`. |
| `PUT` | `/api/v1/users/:userId/courses/:courseId` | Accepts `{ "permission": "NONE" | "READ" | "FULL" }` and creates or updates the direct VIEW/DOWNLOAD pair. |
| `DELETE` | `/api/v1/users/:userId/courses/:courseId` | Removes every direct rule for that student on the course, its modules, and their materials. Returns `204`. |

Permission mapping is explicit: `NONE` is VIEW/DOWNLOAD `DENY`; `READ` is VIEW `ALLOW` and DOWNLOAD `DENY`; `FULL` is both `ALLOW`.

## Implementation notes

- Added `StudentCourseAssociationService` to list associations, upsert the paired direct rules, and remove a course subtree's direct rules.
- Mutations lock the course and run inside database transactions. Cleanup is a single scoped SQL delete, restricted by student and course subtree, so a deletion failure rolls back all of its effects.
- The controller validates that the target user exists and is a student and that the target course exists, returning the project-standard validation errors.
- A dedicated transformer returns the normal safe course fields plus the derived association permission. No material/storage fields are exposed.

## Test coverage and TDD evidence

The initial focused integration run failed with the intended `404` responses for all five new endpoint tests before production code was added.

`api/tests/functional/student_course_associations.spec.ts` now verifies:

- direct-course-only listing, scoped to the selected student;
- all three state-to-rule mappings and idempotent updates of the paired rules;
- cleanup of direct course, module, and material rules while preserving another course and another student's rule;
- transaction rollback when a database trigger rejects one deletion; and
- guest/non-admin/CSRF enforcement plus invalid student, course, and permission validation.

## Verification

Executed from `api/`:

```text
npm test -- functional --files student_course_associations.spec.ts
# 5 passed

npm run typecheck
# exit 0

npm run lint
# exit 0

git diff --check
# exit 0
```

The expected rollback test intentionally triggers a database `500`, which is logged by the application and asserted by the test; the focused suite still completes with all five tests passing.
