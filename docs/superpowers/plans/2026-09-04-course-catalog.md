# Catálogo administrativo de cursos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que ADMIN crie e organize cursos e módulos persistidos, sem expor esse catálogo a alunos.

**Architecture:** O API Adonis adiciona modelos Lucid `Course` e `CourseModule`, migrations, transformers, validação Vine e um controller administrativo. O Web adiciona uma feature isolada de courses com TanStack Query e rotas administrativas que usam os componentes shadcn existentes.

**Tech Stack:** AdonisJS, Lucid, VineJS, Japa, PostgreSQL, React, TanStack Router/Query, Tailwind CSS, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-course-catalog-design.md`

## Global Constraints

- Somente sessão ADMIN acessa qualquer endpoint de catálogo; STUDENT recebe 403.
- Curso usa somente `DRAFT`, `PUBLISHED` ou `ARCHIVED`; arquivamento não remove registro.
- A Fase 2 não implementa capa, storage, materiais, permissões ou páginas/endpoints de aluno.
- `position` define ordem de módulos e nunca pode ficar duplicada ou intermediária.
- Web usa componentes shadcn/ui; API é a autoridade de autorização.
- O repositório atual não permite commits locais; valide mudanças com `git diff` sem tentar criar commit.

---

### Task 1: Persistência e contratos do domínio Course → Module

**Files:**
- Create: `api/database/migrations/*_create_courses_table.ts`
- Create: `api/database/migrations/*_create_modules_table.ts`
- Create: `api/app/models/course.ts`
- Create: `api/app/models/course_module.ts`
- Create: `api/app/transformers/course_transformer.ts`
- Create: `api/app/transformers/course_module_transformer.ts`
- Create: `api/app/validators/course.ts`
- Test: `api/tests/functional/courses.spec.ts`

**Interfaces:**
- Produces `Course` with `modules: HasMany<typeof CourseModule>`.
- Produces `CourseModule` with `course: BelongsTo<typeof Course>`.
- Produces payload validators `createCourseValidator`, `updateCourseValidator`, `createModuleValidator`, `updateModuleValidator`, and `reorderModulesValidator`.
- Produces serialized `CourseResponse` and `ModuleResponse` fields in camelCase.

- [ ] **Step 1: Write failing model/persistence tests**

```ts
test('persists modules in their course position order', async ({ assert }) => {
  const course = await Course.create({ title: 'Desenho técnico', status: 'DRAFT' })
  await course.related('modules').createMany([
    { title: 'Segundo', position: 1 },
    { title: 'Primeiro', position: 0 },
  ])

  await course.load('modules', (query) => query.orderBy('position', 'asc'))
  assert.deepEqual(course.modules.map((module) => module.title), ['Primeiro', 'Segundo'])
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd api && npm test tests/functional/courses.spec.ts`

Expected: FAIL because `#models/course` and the tables do not exist.

- [ ] **Step 3: Add migrations, models, transformers and validators**

```ts
// course status and shared title constraint
export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export const createCourseValidator = vine.create({
  title: vine.string().trim().minLength(2).maxLength(160),
  description: vine.string().trim().maxLength(2000).optional(),
})
```

Use `courses.id` as the FK target, `modules.course_id` with `onDelete('CASCADE')`,
and `position` as a non-negative integer. Define timestamps with the same
conventions as the existing User schema.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `cd api && npm test tests/functional/courses.spec.ts`

Expected: PASS for relation ordering and serialization contracts.

- [ ] **Step 5: Inspect the migration and diff**

Run: `git diff -- api/database api/app/models api/app/transformers api/app/validators api/tests/functional/courses.spec.ts`

Expected: only Course/Module persistence and its tests are present.

### Task 2: Endpoints administrativos e ordenação transacional

**Files:**
- Create: `api/app/controllers/courses_controller.ts`
- Modify: `api/start/routes.ts`
- Modify: `api/tests/functional/courses.spec.ts`

**Interfaces:**
- Consumes Task 1 models, transformers and validators.
- Produces the protected HTTP routes defined in the spec.
- `PUT /courses/:courseId/modules/order` accepts `{ moduleIds: number[] }` and returns the course with modules ordered by its new positions.

- [ ] **Step 1: Write failing endpoint tests**

```ts
test('an administrator creates a draft course and a module at the end', async ({ client }) => {
  const session = await login(client, admin)
  const course = await client.post('/api/v1/courses').cookie(session.name, session.value)
    .unsafeJson({ title: 'Metrologia', description: 'Fundamentos' })
  course.assertStatus(201)
  course.assertBodyContains({ data: { status: 'DRAFT', modules: [] } })

  const module = await client.post(`/api/v1/courses/${course.body().data.id}/modules`)
    .cookie(session.name, session.value).unsafeJson({ title: 'Unidade 1' })
  module.assertStatus(201)
  module.assertBodyContains({ data: { position: 0 } })
})
```

Add tests for list/show/update/status, STUDENT 403 on every course route,
module update/delete, valid reordering, missing/duplicate/foreign module IDs
with 422, and compact positions after deletion.

- [ ] **Step 2: Run endpoint tests to verify they fail**

Run: `cd api && npm test tests/functional/courses.spec.ts`

Expected: FAIL with route/controller not found before registration.

- [ ] **Step 3: Implement the controller and routes**

```ts
router.group(() => {
  router.get('courses', [controllers.Courses, 'index'])
  router.post('courses', [controllers.Courses, 'store'])
  router.get('courses/:id', [controllers.Courses, 'show'])
  router.patch('courses/:id', [controllers.Courses, 'update'])
  router.post('courses/:courseId/modules', [controllers.Courses, 'storeModule'])
  router.patch('courses/:courseId/modules/:id', [controllers.Courses, 'updateModule'])
  router.delete('courses/:courseId/modules/:id', [controllers.Courses, 'destroyModule'])
  router.put('courses/:courseId/modules/order', [controllers.Courses, 'reorderModules'])
}).use(middleware.auth({ guards: ['web'] })).use(middleware.admin())
```

Use `db.transaction` when deleting or reordering: query all module IDs for the
course, reject a mismatched ID set, and assign sequential `position` values
from zero before commit.

- [ ] **Step 4: Run API verification**

Run: `cd api && npm test && npm run typecheck && npm run lint`

Expected: all API tests, TypeScript checks and lint pass.

### Task 3: Feature Web de cursos e cache TanStack Query

**Files:**
- Create: `web/src/features/courses/courses-types.ts`
- Create: `web/src/features/courses/courses-api.ts`
- Create: `web/src/features/courses/courses-queries.ts`
- Create: `web/src/features/courses/course-form.tsx`
- Create: `web/src/features/courses/module-form.tsx`
- Create: `web/src/features/courses/modules-list.tsx`
- Create tests alongside each API, query and component file.

**Interfaces:**
- Consumes `/courses` and nested module HTTP contract from Task 2.
- Produces `coursesQueryOptions`, `courseQueryOptions(courseId)`, and mutations for course/module CRUD plus `reorderModules`.
- Produces `CourseForm`, `ModuleForm`, `ModulesList` with controlled callbacks and shadcn inputs/buttons/selects.

- [ ] **Step 1: Write failing feature tests**

```tsx
it('posts a new draft course through the API client', async () => {
  await createCourse({ title: 'Metrologia', description: 'Fundamentos' })
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/courses'),
    expect.objectContaining({ method: 'POST' }),
  )
})

it('moves a module upward only when it is not first', async () => {
  render(<ModulesList modules={[first, second]} onMove={onMove} onEdit={vi.fn()} onDelete={vi.fn()} />)
  expect(screen.getByRole('button', { name: /mover segundo para cima/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /mover primeiro para cima/i })).toBeDisabled()
})
```

- [ ] **Step 2: Run focused Web tests to verify they fail**

Run: `cd web && npm test -- src/features/courses --reporter=dot`

Expected: FAIL because the feature files do not exist.

- [ ] **Step 3: Implement the feature layer**

```ts
export const coursesQueryKeys = {
  all: ['courses'] as const,
  list: () => ['courses', 'list'] as const,
  detail: (courseId: number) => ['courses', 'detail', courseId] as const,
}

export function useReorderModulesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, moduleIds }: ReorderModulesInput) => reorderModules(courseId, moduleIds),
    onSuccess: async (course) => {
      queryClient.setQueryData(coursesQueryKeys.detail(course.id), course)
      await queryClient.invalidateQueries({ queryKey: coursesQueryKeys.all })
    },
  })
}
```

Keep forms responsible only for client validation and submission state; surface
API failures as an shadcn `Alert`. Use full module ID arrays when moving an
item, never calculate a position client-side and send only that position.

- [ ] **Step 4: Run focused feature tests to verify they pass**

Run: `cd web && npm test -- src/features/courses --reporter=dot`

Expected: PASS.

### Task 4: Rotas, menu administrativo e verificação ponta a ponta

**Files:**
- Create: `web/src/routes/_admin/admin/courses/index.tsx`
- Create: `web/src/routes/_admin/admin/courses/new.tsx`
- Create: `web/src/routes/_admin/admin/courses/$courseId.tsx`
- Create: `web/src/routes/_admin/admin/courses/-courses-routes.test.tsx`
- Modify: `web/src/features/layout/admin-navigation.ts`
- Modify: generated route tree only through the existing route generator, if configured by the project.

**Interfaces:**
- Consumes Task 3 queries/components and the inherited `/ _admin` guard.
- Produces `/admin/courses`, `/admin/courses/new`, `/admin/courses/$courseId`.

- [ ] **Step 1: Write failing route and navigation tests**

```tsx
it('preloads a selected course only for an active administrator', async () => {
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/admin/courses/4'] }),
    queryClient,
    isServer: false,
    origin: 'http://localhost',
  })
  await router.load()
  expect(queryClient.getQueryData(coursesQueryKeys.detail(4))).toEqual(course)
})
```

Add a student guard assertion, a course-list preload assertion, and a sidebar
assertion that the "Cursos" link targets `/admin/courses`.

- [ ] **Step 2: Run route tests to verify they fail**

Run: `cd web && npm test -- src/routes/_admin/admin/courses/-courses-routes.test.tsx --reporter=dot`

Expected: FAIL because course routes/navigation are absent.

- [ ] **Step 3: Implement routes and menu entry**

```ts
{
  label: 'Cursos',
  to: '/admin/courses',
  icon: BookOpen,
}
```

The list page shows course status and a "Novo curso" action. The new page
posts through `CourseForm` then navigates to the created course. The detail
page loads the selected course, updates its fields/status, renders `ModulesList`
and connects create/edit/delete/move actions to Task 3 mutations.

- [ ] **Step 4: Regenerate route tree only if required, then verify Web**

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build`

Expected: full Web suite, typing, lint and production build pass.

- [ ] **Step 5: Run final API and workspace checks**

Run: `cd api && npm test && npm run typecheck && npm run lint && cd .. && git diff --check`

Expected: API verification passes and diff has no whitespace errors.

## Self-review

- Course lifecycle, module CRUD and ordering map to Tasks 1–2.
- Web catalog, shadcn usage and cache behavior map to Tasks 3–4.
- Admin-only enforcement is asserted in Task 2 API tests and Task 4 route tests.
- Student catalog, covers/storage, materials and permissions are deliberately excluded.
- The plan contains no unresolved placeholders and keeps `Course`, `CourseModule`, query keys and nested route names consistent.
