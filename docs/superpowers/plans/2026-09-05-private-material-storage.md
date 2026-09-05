# Storage privado e materiais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que ADMIN configure limites e envie/remova materiais PDF, IMAGE e ZIP privados em módulos, sem expor objetos ou catálogo a alunos.

**Architecture:** Uma interface `StorageService` isola o domínio do SDK S3, enquanto `MinioStorageProvider` implementa bucket privado e operações de objeto. Materiais e limites são persistidos no PostgreSQL; controllers validam multipart/configuração antes de gravar e aplicam compensação quando metadados falham. O Web usa TanStack Query e shadcn para configurar limites e administrar materiais dentro do curso.

**Tech Stack:** AdonisJS, Lucid, VineJS, AWS SDK S3, MinIO, PostgreSQL, Japa, React, TanStack Router/Query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-private-material-storage-design.md`

## Global Constraints

- Aceitar apenas `PDF`, `IMAGE` e `ZIP`; iniciar cada limite em 100 MB e permitir de 1 MB a 1 GB no painel admin.
- Bucket e objetos originais são privados; respostas nunca contêm URL, URL assinada, binário, storage key ou segredo.
- API decide tipo, tamanho, chave, posição e autorização; Web não autoriza uploads.
- Todas as rotas de material/configuração exigem sessão, CSRF e ADMIN; aluno e anônimo não recebem conteúdo nem endpoints.
- Sucesso de upload cria material `PROCESSING`; visualização/derivados são da Fase 4.
- O repositório não possui Git funcional: verificar com testes e `git diff --check` quando disponível, sem commits.

---

### Task 1: Storage abstraído, migrations e modelos de material/configuração

**Files:**
- Modify: `api/package.json`, `api/package-lock.json`, `api/start/env.ts`
- Create: `api/app/services/storage_service.ts`, `api/app/services/minio_storage_provider.ts`
- Create: `api/database/migrations/*_create_upload_settings_table.ts`, `api/database/migrations/*_create_materials_table.ts`
- Create: `api/app/models/material.ts`, `api/app/models/upload_setting.ts`
- Modify: `api/app/models/course_module.ts`
- Create: `api/app/transformers/material_transformer.ts`, `api/app/transformers/upload_setting_transformer.ts`
- Test: `api/tests/unit/minio_storage_provider.spec.ts`, `api/tests/functional/materials.spec.ts`

**Interfaces:**
- Produces `StorageService` with `ensurePrivateBucket`, `putObject`, `deleteObject`, `exists`.
- Produces `Material` fields `moduleId,title,description,type,storageKey,originalFilename,mimeType,size,position,processingStatus`.
- Produces `UploadSetting` fields `type,maxSizeBytes` and seeded `PDF|IMAGE|ZIP = 104857600`.

- [ ] **Step 1: Write failing storage and relation tests**

```ts
test('creates a private bucket and never produces a public URL', async ({ assert }) => {
  await storage.ensurePrivateBucket()
  assert.isTrue(await storage.exists('originals/test.pdf'))
})

test('loads module materials by position', async ({ assert }) => {
  await module.related('materials').createMany([
    { title: 'second', type: 'PDF', storageKey: 'originals/2', originalFilename: '2.pdf', mimeType: 'application/pdf', size: 10, position: 1, processingStatus: 'PROCESSING' },
    { title: 'first', type: 'PDF', storageKey: 'originals/1', originalFilename: '1.pdf', mimeType: 'application/pdf', size: 10, position: 0, processingStatus: 'PROCESSING' },
  ])
  await module.load('materials')
  assert.deepEqual(module.materials.map((material) => material.position), [0, 1])
})
```

- [ ] **Step 2: Run focused tests and observe RED**

Run: `cd api && npm test -- tests/unit/minio_storage_provider.spec.ts tests/functional/materials.spec.ts`

Expected: FAIL because storage/model/migrations do not exist.

- [ ] **Step 3: Implement persistence and S3-compatible provider**

```ts
export interface StorageService {
  ensurePrivateBucket(): Promise<void>
  putObject(input: { key: string; body: Readable; contentType: string }): Promise<void>
  deleteObject(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export const MATERIAL_TYPES = ['PDF', 'IMAGE', 'ZIP'] as const
export const MATERIAL_PROCESSING_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] as const
```

Install `@aws-sdk/client-s3`; use `S3_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, path-style endpoint support, and
bucket ownership/public-access controls. Add the `CourseModule.materials`
relation ordered by `position ASC`. Make `storage_key` non-serialized.

- [ ] **Step 4: Run Task 1 verification**

Run: `cd api && npm test -- tests/unit/minio_storage_provider.spec.ts tests/functional/materials.spec.ts && npm run typecheck && npm run lint`

Expected: focused tests, typing and lint pass.

### Task 2: Configurações, upload privado e API administrativa de materiais

**Files:**
- Create: `api/app/controllers/upload_settings_controller.ts`, `api/app/controllers/materials_controller.ts`
- Create: `api/app/validators/upload_setting.ts`, `api/app/validators/material.ts`
- Modify: `api/start/routes.ts`, `api/tests/functional/materials.spec.ts`

**Interfaces:**
- Consumes Task 1 `StorageService`, Material/UploadSetting models and transformers.
- Produces GET/PATCH `/upload-settings` and nested `/modules/:moduleId/materials` routes.

- [ ] **Step 1: Write failing admin and upload tests**

```ts
test('rejects a PDF over its configured size before storage writes', async ({ client, assert }) => {
  await UploadSetting.updateOrCreate({ type: 'PDF' }, { maxSizeBytes: 1 })
  const response = await client.post(`/api/v1/modules/${module.id}/materials`)
    .cookie(session.name, session.value)
    .field('title', 'Manual')
    .file('file', 'tests/fixtures/manual.pdf')
  response.assertStatus(422)
  assert.equal(await Material.query().count('* as total').then(([row]) => row.$extras.total), '0')
})
```

Cover valid PDF/image/ZIP, MIME/extension mismatch, size limits, admin/guest/student, no URL/storage key in output, material metadata edit/delete, per-module position, storage failure, compensation after DB failure, and settings update validation.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `cd api && npm test -- tests/functional/materials.spec.ts`

Expected: FAIL because routes/controllers are absent.

- [ ] **Step 3: Implement endpoint behavior**

```ts
router.group(() => {
  router.get('upload-settings', [controllers.UploadSettings, 'index'])
  router.patch('upload-settings/:type', [controllers.UploadSettings, 'update'])
  router.get('modules/:moduleId/materials', [controllers.Materials, 'index'])
  router.post('modules/:moduleId/materials', [controllers.Materials, 'store'])
  router.patch('modules/:moduleId/materials/:id', [controllers.Materials, 'update'])
  router.delete('modules/:moduleId/materials/:id', [controllers.Materials, 'destroy'])
}).use(middleware.auth({ guards: ['web'] })).use(middleware.admin())
```

Validate the `MultipartFile`, determine a permitted category server-side,
generate `originals/<uuid>`, write only after all preconditions, save Material
as `PROCESSING`, and delete the object when the DB write fails. On delete,
attempt storage delete then always remove the metadata and compact positions.

- [ ] **Step 4: Run API verification**

Run: `cd api && npm test && npm run typecheck && npm run lint && npm run build`

Expected: all API checks pass.

### Task 3: Feature Web de configurações e materiais

**Files:**
- Create: `web/src/features/materials/materials-types.ts`, `materials-api.ts`, `materials-queries.ts`, `material-upload-form.tsx`, `materials-list.tsx`
- Create: `web/src/features/settings/upload-settings-api.ts`, `upload-settings-queries.ts`, `upload-settings-form.tsx`
- Test: tests alongside each feature file

**Interfaces:**
- Consumes Task 2 envelopes and endpoints.
- Produces query keys/hooks for materials and upload settings; upload form receives `moduleId`, settings and callbacks.

- [ ] **Step 1: Write failing Web tests**

```tsx
it('sends title, optional description, and file as multipart data', async () => {
  render(<MaterialUploadForm moduleId={9} settings={settings} onSuccess={vi.fn()} />)
  await userEvent.upload(screen.getByLabelText(/arquivo/i), new File(['pdf'], 'manual.pdf', { type: 'application/pdf' }))
  await userEvent.click(screen.getByRole('button', { name: /enviar material/i }))
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/modules/9/materials'), expect.objectContaining({ method: 'POST', body: expect.any(FormData) }))
})
```

- [ ] **Step 2: Run focused tests and observe RED**

Run: `cd web && npm test -- src/features/materials src/features/settings --reporter=dot`

Expected: FAIL because feature files do not exist.

- [ ] **Step 3: Implement API clients, cache and components**

Use `apiClient` for JSON and the existing XSRF-aware fetch path for multipart;
do not manually set multipart `Content-Type`. Map API type to PDF/Imagem/ZIP,
format byte sizes, show `PROCESSING` status, and use an explicit shadcn
confirmation dialog for deletion. Upload form validates selected category and
current limit locally but leaves server validation authoritative.

- [ ] **Step 4: Run focused feature verification**

Run: `cd web && npm test -- src/features/materials src/features/settings --reporter=dot && npm run typecheck && npm run lint`

Expected: focused tests, typing and lint pass.

### Task 4: Rotas administrativas e integração com o detalhe do curso

**Files:**
- Create: `web/src/routes/_admin/admin/settings.tsx`
- Modify: `web/src/routes/_admin/admin/courses/$courseId.tsx`, `web/src/features/layout/admin-navigation.ts`, `web/src/routeTree.gen.ts`
- Modify: `web/src/routes/_admin/admin/courses/-courses-routes.test.tsx`
- Create: `web/src/routes/_admin/admin/-settings.test.tsx`

**Interfaces:**
- Consumes Task 3 query hooks/components and inherited `/ _admin` guard.
- Produces `/admin/settings` plus material controls on the existing course detail route.

- [ ] **Step 1: Write failing route tests**

```tsx
it('preloads settings for an administrator and keeps them inaccessible to students', async () => {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: ['/admin/settings'] }), queryClient, isServer: false, origin: 'http://localhost' })
  await router.load()
  expect(router.state.location.pathname).toBe('/admin/settings')
  expect(queryClient.getQueryData(uploadSettingsQueryKeys.list())).toEqual(settings)
})
```

Add tests for the menu link, course detail material list/upload opening, and no student route exposure.

- [ ] **Step 2: Run route tests and observe RED**

Run: `cd web && npm test -- src/routes/_admin/admin/-settings.test.tsx src/routes/_admin/admin/courses/-courses-routes.test.tsx --reporter=dot`

Expected: FAIL because settings route/material controls are absent.

- [ ] **Step 3: Implement admin routes and integration**

Add a `Settings` nav item using `Settings` icon. The settings page renders
the three editable limits. The course detail’s module area lists materials and
opens `MaterialUploadForm` for the selected module; it does not render URLs,
download links or viewer controls.

- [ ] **Step 4: Run final verification**

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build && cd ../api && npm test && npm run typecheck && npm run lint && npm run build`

Expected: both projects pass all tests, type checks, lint and builds.

## Self-review

- Task 1 covers private MinIO abstraction, models, migrations and no public serialization.
- Task 2 covers validation, transactional upload/delete behavior and server-only admin enforcement.
- Task 3 covers Web clients/forms/cache for limits and multipart materials.
- Task 4 covers the administrative route/menu/course integration and confirms no student exposure.
- No cover, public URL, viewer, material processing worker or access-control rules are included; those belong to later phases.
