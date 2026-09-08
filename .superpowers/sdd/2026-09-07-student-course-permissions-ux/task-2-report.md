# Task 2 — Permission UI primitives and association queries

## Delivered UI primitive

`CoursePermissionToggle` is a controlled, native radio-button group with the three exclusive Portuguese choices:

| Choice | API permission | Direct rules |
| --- | --- | --- |
| Sem acesso | `NONE` | VIEW `DENY`, DOWNLOAD `DENY` |
| Leitura | `READ` | VIEW `ALLOW`, DOWNLOAD `DENY` |
| Total | `FULL` | VIEW `ALLOW`, DOWNLOAD `ALLOW` |

The control has a visible-to-assistive-technology group label, native radio semantics, keyboard behavior supplied by the browser, focus styling, and a disabled state. `coursePermissionRules` remains the single tested mapping for the paired access effects.

## Delivered frontend API and query layer

Added the typed `StudentCourseAssociation` contract and the following helpers for Task 1's admin endpoints:

| Helper | Method and path |
| --- | --- |
| `listStudentCourseAssociations(userId)` | `GET /users/:userId/courses` |
| `updateStudentCourseAssociation(userId, courseId, permission)` | `PUT /users/:userId/courses/:courseId` |
| `deleteStudentCourseAssociation(userId, courseId)` | `DELETE /users/:userId/courses/:courseId` |

The query layer provides a student-scoped association-list key and hooks for listing, updating, and deleting. Each successful mutation invalidates the selected student's association list, all relevant direct/effective access-rule data (including possible child-resource decisions), and the student catalog cache, whose visibility can change after course access changes.

No modal, route, or student-list integration was added.

## TDD evidence

The new focused test files were added before their production modules. The first run failed because the toggle/API/query modules did not yet exist. After the minimal implementation, the focused suite passed.

The tests cover:

- each `NONE`/`READ`/`FULL` rule-pair mapping;
- accessible, exclusive localized radio choices and controlled selection callbacks;
- GET, PUT request payload, and DELETE endpoint contracts; and
- successful mutation invalidation for association, access-rule, and catalog caches.

## Verification

Executed from `web/`:

```text
npm test -- --run src/features/access-rules/course-permission.test.ts src/features/access-rules/student-course-associations-api.test.ts src/features/access-rules/student-course-associations-queries.test.tsx
# 3 files passed, 11 tests passed

npm run typecheck
# exit 0

npm run lint
# exit 0

git diff --check
# exit 0
```
