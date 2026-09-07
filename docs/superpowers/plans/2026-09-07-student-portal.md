# Student Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a secure course catalog and course/material navigation that exposes the full permitted-course structure, clearly locks unavailable content, and integrates the protected viewer.

**Architecture:** `StudentCatalogService` centralizes published-course discovery and per-resource VIEW resolution through `AccessControlService`. Dedicated student endpoints return only safe catalog DTOs. React consumes these endpoints through a student-only feature, clears its user-specific data on identity transitions, renders shadcn catalog screens, and passes authorized material IDs to the Phase 6 viewer.

**Tech Stack:** AdonisJS 7, Lucid/PostgreSQL, Luxon, React 19, TanStack Router/Query, TypeScript, shadcn/ui, Japa, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-07-student-portal-design.md`

## Global Constraints

- Student catalog routes require active `web` authentication and resolve every VIEW decision only with `AccessControlService.resolve`.
- Catalog includes only `PUBLISHED` courses with at least one effectively VIEW-authorized COURSE/MODULE/MATERIAL resource.
- Never serialize storage keys, MinIO URLs, private derivatives, signed downloads, or administrative access metadata.
- A direct request for unpublished or unreachable course responds `404` without revealing why.
- Course detail shows all modules/materials for an available course; inaccessible material is `LOCKED` and receives no interactive viewer target.
- Material is `AVAILABLE` only with effective VIEW and `processingStatus = READY`; authorized non-ready/failed material is `UNAVAILABLE`.
- No catalog request writes `access_logs`; Phase 6 viewer/download remains the audit boundary.
- The web uses shadcn components and never treats cached/UI availability as authorization.
- Student-catalog queries are removed/reset on login, logout, expired session, inactive user, and changed user ID.
- Phase 8 owns tiles, watermark, loupe, fullscreen and advanced touch; do not add them here.

---

### Task 1: Safe student-catalog service and API routes

**Files:**
- Create: `api/app/services/student_catalog_service.ts`
- Create: `api/app/controllers/student_catalog_controller.ts`
- Modify: `api/start/routes.ts`
- Test: `api/tests/unit/student_catalog_service.spec.ts`
- Test: `api/tests/functional/student_catalog.spec.ts`

**Interfaces:**
- Consumes: `Course`, `CourseModule`, `Material`, existing `AccessControlService.resolve`, active web auth, and existing course/material ordering.
- Produces: `StudentCatalogService.listCourses({ userId })`, `StudentCatalogService.getCourse({ userId, courseId })`, `GET /api/v1/student/courses`, and `GET /api/v1/student/courses/:id`.

- [ ] **Step 1: Write failing service/functional tests for discovery, locking and concealment**

```ts
test('lists only published courses with effective VIEW at course, module, or material', async ({ assert }) => {
  const visibleByCourse = await publishedCourse('Course rule')
  const visibleByModule = await publishedCourse('Module rule')
  const visibleByMaterial = await publishedCourse('Material rule')
  const draft = await course({ status: 'DRAFT' })
  await allow(student, visibleByCourse, 'COURSE')
  await allow(student, moduleOf(visibleByModule), 'MODULE')
  await allow(student, materialOf(visibleByMaterial), 'MATERIAL')
  await allow(student, draft, 'COURSE')

  const results = await service.listCourses({ userId: student.id })
  assert.deepEqual(results.map((course) => course.id), [visibleByMaterial.id, visibleByModule.id, visibleByCourse.id])
})

test('returns complete safe hierarchy while locking non-viewable material', async ({ client, assert }) => {
  await allow(student, course, 'COURSE')
  await deny(student, lockedMaterial, 'MATERIAL')
  const session = await login(client, student)
  const response = await client.get(`/api/v1/student/courses/${course.id}`).cookies(session.cookies)
  response.assertStatus(200)
  assert.equal(response.body().data.modules[0].materials[0].availability, 'LOCKED')
  assert.notInclude(JSON.stringify(response.body()), 'originals/')
})
```

Add cases for expired VIEW, specific DENY overriding inherited ALLOW, unpublished/manual 404,
no authorized descendant 404, processing/failed authorized material as `UNAVAILABLE`, ZIP ready
as `AVAILABLE`, guest/blocked session rejection, and no `AccessLog` row after list/detail.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd api && node ace test --files tests/unit/student_catalog_service.spec.ts --files tests/functional/student_catalog.spec.ts`

Expected: FAIL because student catalog service and routes do not exist.

- [ ] **Step 3: Implement DTO service with one request timestamp**

```ts
export type StudentAvailability = 'AVAILABLE' | 'LOCKED' | 'UNAVAILABLE'

export interface StudentCatalogService {
  listCourses(input: { userId: number }): Promise<StudentCourseSummary[]>
  getCourse(input: { userId: number; courseId: number }): Promise<StudentCourseDetail>
}

const now = DateTime.utc()
const decision = await accessControl.resolve({
  userId, resourceType: 'MATERIAL', resourceId: material.id, capability: 'VIEW', now,
})
```

Query only `PUBLISHED` courses and preload ordered modules/materials. For each returned course,
resolve VIEW for course, modules and materials using the same `now`. Include a course when any
resource decision is allowed. The detail service first hides non-published/missing course with
one `StudentCatalogNotFoundError`, then hides a course with no authorized resource using the same
error. Map material status exactly as the spec; never load derivatives or instantiate storage.

The controller derives `userId` from `auth.use('web')`, validates numeric IDs using the existing
positive safe-integer convention, serializes safe DTOs and maps the catalog-not-found error to
generic 404. Register routes in a non-admin group protected by `middleware.auth({ guards: ['web'] })`.

- [ ] **Step 4: Run focused and complete API verification**

Run: `cd api && node ace test --files tests/unit/student_catalog_service.spec.ts --files tests/functional/student_catalog.spec.ts && npm run typecheck && npm run lint && node ace test`

Expected: PASS; no existing Phase 1–6 regression.

- [ ] **Step 5: Record task verification**

Append exact results, safe-response audit and changed files to
`.superpowers/sdd/2026-09-07-student-portal/progress.md`.

### Task 2: Typed catalog client, identity-safe query cache and routes

**Files:**
- Create: `web/src/features/student-catalog/student-catalog-types.ts`
- Create: `web/src/features/student-catalog/student-catalog-api.ts`
- Create: `web/src/features/student-catalog/student-catalog-queries.ts`
- Create: `web/src/features/student-catalog/student-catalog-cache.ts`
- Modify: `web/src/features/auth/auth-cache.ts`
- Modify: `web/src/features/auth/auth-api.ts`
- Create: `web/src/routes/_app/app/courses/$courseId.tsx`
- Create: `web/src/routes/_app/app/courses/$courseId/materials/$materialId.tsx`
- Test: `web/src/features/student-catalog/student-catalog-api.test.ts`
- Test: `web/src/features/student-catalog/student-catalog-queries.test.tsx`
- Test: `web/src/features/auth/auth-cache.test.ts`
- Test: `web/src/routes/_app/app/courses/-student-course-routes.test.tsx`

**Interfaces:**
- Consumes: Task 1 safe API envelopes; `apiClient`; existing auth query lifecycle; Phase 6 `ProtectedMaterialViewer`.
- Produces: student catalog types/query options, `clearStudentCatalog`, typed course/material route parameters and safe route guards for Task 3.

- [ ] **Step 1: Write failing client/cache/route tests**

```tsx
it('clears list and detail catalog data before publishing a new identity', async () => {
  queryClient.setQueryData(studentCatalogKeys.detail(14), aCourseWithAllowedMaterial)
  await cacheLoggedInUser(queryClient, userB)
  expect(queryClient.getQueryData(studentCatalogKeys.detail(14))).toBeUndefined()
})

it('does not render the viewer when materialId is absent from the selected course detail', async () => {
  renderRoute('/app/courses/14/materials/99', { course: course14WithoutMaterial99 })
  expect(screen.getByText(/não foi possível encontrar/i)).toBeTruthy()
  expect(screen.queryByLabelText(/material protegido/i)).toBeNull()
})
```

Test API path/envelope errors, stable list/detail keys, safe availability unions and a stale
student A list/detail request that resolves after logout/login B: no course title, material title
or availability from A can become renderable.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd web && npm test -- student-catalog-api.test.ts student-catalog-queries.test.tsx auth-cache.test.ts src/routes/_app/app/courses/-student-course-routes.test.tsx`

Expected: FAIL because the catalog feature/cache and routes do not exist.

- [ ] **Step 3: Implement opaque API/query/cache boundary and route data ownership**

```ts
export const studentCatalogKeys = {
  all: ['student-catalog'] as const,
  courses: () => ['student-catalog', 'courses'] as const,
  detail: (courseId: number) => ['student-catalog', 'courses', courseId] as const,
}

export function clearStudentCatalog(queryClient: QueryClient): void {
  const filters = { queryKey: studentCatalogKeys.all }
  for (const query of queryClient.getQueryCache().findAll(filters)) query.reset()
  queryClient.removeQueries(filters)
}

export function useStudentCoursesQuery() {
  return useQuery(studentCoursesQueryOptions())
}

export function useStudentCourseQuery(courseId: number) {
  return useQuery(studentCourseQueryOptions(courseId))
}
```

Make `listStudentCourses` and `getStudentCourse` consume only `/student/courses` API envelopes.
Reuse `apiClient`, never calculate access in TypeScript and never place viewer/download URLs in
the catalog types. Call `clearStudentCatalog` wherever existing auth cleanup calls
`clearProtectedMaterialViews`: before publishing login/logout profile state and during profile
refresh identity/active-state changes.

The course route validates a positive numeric parameter and loads detail through its query. The
material route loads the parent course detail, verifies that `materialId` exists and has
`availability === 'AVAILABLE'` before mounting `ProtectedMaterialViewer`; otherwise render the
same generic not-found state without viewer query. Keep final server authority with the viewer.

- [ ] **Step 4: Run focused web tests and static verification**

Run: `cd web && npm test -- student-catalog-api.test.ts student-catalog-queries.test.tsx auth-cache.test.ts src/routes/_app/app/courses/-student-course-routes.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 5: Update the phase ledger**

Append cache-isolation evidence, route guard behavior and command output to
`.superpowers/sdd/2026-09-07-student-portal/progress.md`.

### Task 3: shadcn student catalog screens and viewer integration

**Files:**
- Create: `web/src/components/ui/accordion.tsx` using the repository’s shadcn generator
- Create: `web/src/features/student-catalog/student-course-card.tsx`
- Create: `web/src/features/student-catalog/student-course-detail.tsx`
- Create: `web/src/features/student-catalog/student-catalog-states.tsx`
- Modify: `web/src/routes/_app/app.tsx`
- Modify: `web/src/routes/_app/app/courses/$courseId.tsx`
- Modify: `web/src/routes/_app/app/courses/$courseId/materials/$materialId.tsx`
- Test: `web/src/features/student-catalog/student-course-card.test.tsx`
- Test: `web/src/features/student-catalog/student-course-detail.test.tsx`
- Test: `web/src/routes/_app/app/courses/-student-course-routes.test.tsx`

**Interfaces:**
- Consumes: Task 2 typed `useStudentCoursesQuery`, `useStudentCourseQuery`, safe availability states and route guards; Phase 6 `ProtectedMaterialViewer`.
- Produces: `/app` course home, course detail hierarchy and authorized material viewer route.

- [ ] **Step 1: Add failing visual/interaction tests**

```tsx
it('renders an available course card with its module count and course link', () => {
  render(<StudentCourseCard course={course} />)
  expect(screen.getByRole('link', { name: /abrir curso/i })).toHaveAttribute('href', '/app/courses/14')
  expect(screen.getByText('3 módulos')).toBeTruthy()
})

it('renders locked material as a non-interactive row and available material as a link', () => {
  render(<StudentCourseDetail course={detailWithLockedAndAvailable} />)
  expect(screen.getByText('Conteúdo bloqueado')).toBeTruthy()
  expect(screen.queryByRole('link', { name: /manual bloqueado/i })).toBeNull()
  expect(screen.getByRole('link', { name: /abrir manual liberado/i })).toHaveAttribute('href', '/app/courses/14/materials/42')
})
```

Cover loading Skeletons, list error, no-courses empty state, `UNAVAILABLE` processing/failed text,
module lock icon/context, ordered Accordion modules, Zip available link, breadcrumbs and generic
not-found state. Assert page source never contains an original storage key or a download URL.

- [ ] **Step 2: Run focused component/route tests and verify they fail**

Run: `cd web && npm test -- student-course-card.test.tsx student-course-detail.test.tsx src/routes/_app/app/courses/-student-course-routes.test.tsx`

Expected: FAIL because the catalog presentation components do not exist.

- [ ] **Step 3: Generate accordion and implement accessible screens**

Run: `cd web && npx shadcn@latest add accordion --yes`

Then implement cards with existing shadcn `Card`, `Button`, `Badge`, `Skeleton` and lucide
icons. Replace the `/app` placeholder with loading/error/empty/list states. Course detail uses
shadcn Accordion, `LockKeyhole` for blocked items, safe status copy, and semantic labels.
Only `AVAILABLE` material creates the TanStack Router link. Use `BookOpen`, `FileText`, `Image`,
`Archive`, `LockKeyhole`, `LoaderCircle` and `CircleAlert`: `BookOpen` for a course card,
`FileText` for PDF, `Image` for IMAGE, `Archive` for ZIP, `LockKeyhole` for every LOCKED row,
`LoaderCircle` for PROCESSING and `CircleAlert` for FAILED. Avoid custom controls.

The material route renders breadcrumb and `ProtectedMaterialViewer materialId={materialId}` only
after parent detail confirms matching available material. Never pass access decisions to the
Phase 6 viewer as a substitute for its own API result.

- [ ] **Step 4: Run full web verification**

Run: `cd web && npm test -- student-course-card.test.tsx student-course-detail.test.tsx src/routes/_app/app/courses/-student-course-routes.test.tsx && npm run typecheck && npm run lint && npm run build && npm test -- --maxWorkers=1`

Expected: PASS. Existing admin routes, account page and Phase 6 viewer remain available.

- [ ] **Step 5: Final ledger and manual acceptance record**

Record final API/web counts and these manual paths in
`.superpowers/sdd/2026-09-07-student-portal/progress.md`: published course with course-level
VIEW, material-only VIEW with neighboring locks, direct URL to inaccessible course, direct URL
to locked material, processing material, and A → B session switch.

## Plan self-review

- Coverage: Task 1 owns all secure catalog DTOs/routes and audit non-effects; Task 2 owns typed
  transport, session-cache isolation and route guards; Task 3 owns all shadcn screens and viewer
  integration.
- Consistency: `StudentAvailability`, `StudentCatalogService`, `studentCatalogKeys`,
  `clearStudentCatalog`, `useStudentCoursesQuery` and `useStudentCourseQuery` have a single
  producer before any task consumes them.
- Scope: course administration, search/progress, and Phase 8 viewer advances are not introduced.
