# Student Course Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated student page with a profile card, dated course cards, a course-enrollment modal, and the existing detailed permissions tree.

**Architecture:** An enrollment remains the paired COURSE `VIEW`/`DOWNLOAD` rules. The association service writes one common period to that pair and exposes period/status to the administrator; AccessControlService keeps enforcing the interval. The React route composes focused profile, course-card and enrollment-dialog components around the typed association query.

**Tech Stack:** AdonisJS 6, Lucid/PostgreSQL, Luxon, React 19, TanStack Router/Query, shadcn/Radix, Tailwind, Vitest, Japa.

**Spec:** `docs/superpowers/specs/2026-09-08-student-course-detail-design.md`

## Global Constraints

- Keep COURSE rules as the only enrollment source of truth; do not add a database table.
- Date-only form values map to start-of-day and inclusive end-of-day in `America/Sao_Paulo`, then UTC ISO strings.
- Scheduled and expired associations remain visible to administrators but inaccessible to the student.
- Preserve PDF/image download semantics, ZIP download-only behavior, and the existing concurrency protection.
- Use shadcn components and one-column mobile / two-column desktop course cards.
- Test first and run focused commands only; preserve unrelated dirty files.

## File Structure

- `api/app/services/student_course_association_service.ts`: period persistence and `SCHEDULED | ACTIVE | EXPIRED` derivation.
- `api/app/validators/student_course_association.ts`: permission and UTC-period validation.
- `api/app/transformers/student_course_association_transformer.ts`: enrollment period/status response fields.
- `api/tests/functional/student_course_associations.spec.ts`: association API regressions.
- `web/src/features/access-rules/student-course-associations-{api,queries,types}.ts`: typed period transport and mutations.
- `web/src/features/users/enrollment-period.{ts,test.ts}`: pure date defaults, conversion, formatting and validation.
- `web/src/features/users/student-profile-card.tsx`: profile card.
- `web/src/features/users/student-course-cards.tsx`: responsive course-card grid.
- `web/src/features/users/add-student-course-dialog.tsx`: modal for search, permission and dates.
- `web/src/routes/_admin/admin/users/$userId.tsx`: composed detail page.
- `web/src/features/users/users-table.tsx`: `Ver detalhes` entry action.

### Task 1: Dated association API

**Files:**
- Modify: `api/app/services/student_course_association_service.ts`
- Modify: `api/app/controllers/student_course_associations_controller.ts`
- Modify: `api/app/validators/student_course_association.ts`
- Modify: `api/app/transformers/student_course_association_transformer.ts`
- Test: `api/tests/functional/student_course_associations.spec.ts`

**Interfaces:** Produce `StudentCourseAssociation { course, permission, startsAt, expiresAt, status }`, where status is `SCHEDULED | ACTIVE | EXPIRED`. POST and PUT accept `{ permission, startsAt, expiresAt }`.

- [ ] **Step 1: Add failing API tests**

Add tests creating active, future and ended association pairs. The GET list must return all three, ISO period fields and the correct status. Add an update test that changes permission/window and still finds two COURSE rules.

    assert.deepInclude(list.body().data, {
      id: scheduledCourse.id,
      permission: 'READ',
      startsAt: scheduledStart.toISO(),
      expiresAt: scheduledEnd.toISO(),
      status: 'SCHEDULED',
    })

- [ ] **Step 2: Verify RED**

    node ace test --files tests/functional/student_course_associations.spec.ts

Expected: fields are absent or date payload is rejected.

- [ ] **Step 3: Implement minimal service contract**

Validate two UTC ISO values with `expiresAt > startsAt`. Pass a typed `period` argument from controller through `create`/`update`; write its `starts_at` and `expires_at` into both rule capabilities. In `list`, locate associations regardless of whether the period is active, derive stored permission from the rule pair, and derive status against `DateTime.utc()`. Serialize ISO values/status in the transformer. Keep update's course-row lock and missing-association `409` behavior.

- [ ] **Step 4: Verify GREEN**

    node ace test --files tests/functional/student_course_associations.spec.ts
    npm run typecheck
    npm run lint

- [ ] **Step 5: Commit**

    git add api/app/services/student_course_association_service.ts api/app/controllers/student_course_associations_controller.ts api/app/validators/student_course_association.ts api/app/transformers/student_course_association_transformer.ts api/tests/functional/student_course_associations.spec.ts
    git commit -m "feat: add dated student course associations"

### Task 2: Typed enrollment client and time helpers

**Files:**
- Create: `web/src/features/users/enrollment-period.ts`
- Create: `web/src/features/users/enrollment-period.test.ts`
- Modify: `web/src/features/access-rules/student-course-associations-types.ts`
- Modify: `web/src/features/access-rules/student-course-associations-api.ts`
- Modify: `web/src/features/access-rules/student-course-associations-queries.ts`
- Test: `web/src/features/access-rules/student-course-associations-api.test.ts`

**Interfaces:** Produce `EnrollmentPeriodInput { startsAt: string; expiresAt: string }`, `EnrollmentStatus`, `defaultEnrollmentDates(now)`, `saoPauloDateRangeToUtc(startDate, endDate)`, and `formatEnrollmentDate(iso)`.

- [ ] **Step 1: Add failing utility/transport tests**

Freeze 8 September 2026 and assert defaults `2026-09-08`/`2027-09-08`; assert conversion returns `2026-09-08T03:00:00.000Z` and `2027-09-09T02:59:59.999Z`; assert invalid ordering throws. Extend transport tests to require dates in POST/PUT body and status/period in response.

- [ ] **Step 2: Verify RED**

    npm test -- --run src/features/users/enrollment-period.test.ts src/features/access-rules/student-course-associations-api.test.ts

- [ ] **Step 3: Implement helpers and typed payloads**

Implement fixed Sao Paulo date boundary conversion using `T00:00:00.000-03:00` and `T23:59:59.999-03:00`, then `toISOString()`. Add `startsAt`, `expiresAt`, and `status` to association type; require `period` in create/update mutation variables and request JSON. Preserve existing Query invalidation.

- [ ] **Step 4: Verify GREEN**

    npm test -- --run src/features/users/enrollment-period.test.ts src/features/access-rules/student-course-associations-api.test.ts
    npm run typecheck
    npm run lint

- [ ] **Step 5: Commit**

    git add web/src/features/users/enrollment-period.ts web/src/features/users/enrollment-period.test.ts web/src/features/access-rules/student-course-associations-types.ts web/src/features/access-rules/student-course-associations-api.ts web/src/features/access-rules/student-course-associations-queries.ts web/src/features/access-rules/student-course-associations-api.test.ts
    git commit -m "feat: expose enrollment periods in web associations"

### Task 3: Student profile, cards, and add-course modal

**Files:**
- Create: `web/src/features/users/student-profile-card.tsx`
- Create: `web/src/features/users/student-course-cards.tsx`
- Create: `web/src/features/users/add-student-course-dialog.tsx`
- Create: `web/src/features/users/student-course-details.test.tsx`
- Modify: `web/src/features/access-rules/student-course-permissions-dialog.tsx`

**Interfaces:** Consume `ManagedUser`, Task 2 association types, course catalog query and mutations. Produce `<StudentProfileCard>`, `<StudentCourseCards>`, and `<AddStudentCourseDialog>`. A selected course opens the existing permission tree for that association.

- [ ] **Step 1: Add failing component tests**

Render a student with two associations. Assert name, email, Brazilian registration date and course count. Assert active/scheduled/expired card labels and periods. Open the modal: date inputs default today/+1 year; submission calls create with `permission`, `startsAt`, and `expiresAt`; card grid uses `grid-cols-1` and `lg:grid-cols-2`.

- [ ] **Step 2: Verify RED**

    npm test -- --run src/features/users/student-course-details.test.tsx

- [ ] **Step 3: Implement focused shadcn components**

Use `Card`, `Badge`, `Dialog`, `Input`, `Button`, and existing `CoursePermissionToggle`. Profile shows initials/name/email/status/created date/count. Cards show title, inclusive period, status badge, permission and `Gerenciar permissões`. Modal filters out assigned courses, validates end date not before start date, uses the date helper, and stacks dates/actions on mobile. Configure `StudentCoursePermissionsDialog` to render only the selected course when invoked from a card.

- [ ] **Step 4: Verify GREEN**

    npm test -- --run src/features/users/student-course-details.test.tsx src/features/access-rules/student-course-permissions-dialog.test.tsx
    npm run typecheck
    npm run lint

- [ ] **Step 5: Commit**

    git add web/src/features/users/student-profile-card.tsx web/src/features/users/student-course-cards.tsx web/src/features/users/add-student-course-dialog.tsx web/src/features/users/student-course-details.test.tsx web/src/features/access-rules/student-course-permissions-dialog.tsx
    git commit -m "feat: add student profile course management UI"

### Task 4: Compose route and replace list modal entry

**Files:**
- Modify: `web/src/routes/_admin/admin/users/$userId.tsx`
- Modify: `web/src/routes/_admin/admin/users/-users-routes.test.tsx`
- Modify: `web/src/features/users/users-table.tsx`
- Modify: `web/src/features/users/users-table.test.tsx`
- Modify: `web/src/routes/_admin/admin/users/index.tsx`

**Interfaces:** Consume Task 3 UI and association query. Produce the dedicated `/admin/users/:userId` student-detail route and a table `Ver detalhes` navigation action.

- [ ] **Step 1: Add failing route/table tests**

Assert the route renders profile/course section for a student and opens `Adicionar curso`. Assert each student row links `Ver detalhes` to `/admin/users/7`, and no longer renders `Cursos e permissões` in the list. Retain status action coverage.

- [ ] **Step 2: Verify RED**

    npm test -- --run src/routes/_admin/admin/users/-users-routes.test.tsx src/features/users/users-table.test.tsx

- [ ] **Step 3: Compose route and remove duplicate entry state**

Ensure route loader requests `userQueryOptions(userId)` and `studentCourseAssociationsQueryOptions(userId)`. Keep the existing student guard, back navigation and name/e-mail editing as secondary UI. Render profile, cards, add modal, and selected-course permissions. Replace the table callback/modal state in users index with TanStack `Link` action `Ver detalhes`.

- [ ] **Step 4: Verify GREEN and regressions**

    npm test -- --run src/routes/_admin/admin/users/-users-routes.test.tsx src/features/users/users-table.test.tsx src/features/users/student-course-details.test.tsx src/features/access-rules/student-course-permissions-dialog.test.tsx
    npm run typecheck
    npm run lint
    git diff --check

Expected: all focused tests pass; ZIP keeps `Sem acesso`/`Download` only; no old course-page permission manager returns.

- [ ] **Step 5: Commit**

    git add web/src/routes/_admin/admin/users/$userId.tsx web/src/routes/_admin/admin/users/-users-routes.test.tsx web/src/features/users/users-table.tsx web/src/features/users/users-table.test.tsx web/src/routes/_admin/admin/users/index.tsx
    git commit -m "feat: add dedicated student detail page"

## Plan Self-Review

- Spec coverage: Tasks 1–2 implement dated enrollment/API contracts; Task 3 implements approved profile/cards/modal/mobile hierarchy; Task 4 routes users into that experience and removes redundant list-modal entry.
- Placeholder scan: no TODO/TBD items or unspecified tests remain.
- Type consistency: Task 1 produces `startsAt`, `expiresAt`, `status`; Task 2 transports the same names; Tasks 3–4 consume them.
