# Protected Delivery and Viewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver PDF/image derivatives only through authenticated, permission-checked viewers and issue five-minute original-download URLs only for active `DOWNLOAD` access.

**Architecture:** A focused delivery service will coordinate `AccessControlService`, private storage and append-only audit logs. API routes expose a safe material-view manifest, protected derivative byte streams and an original-download URL. A route-independent React feature consumes that manifest with shadcn-based PDF/image viewers; student catalog integration remains Phase 7.

**Tech Stack:** AdonisJS 7, Lucid/PostgreSQL, AWS S3 SDK + MinIO presigner, React 19, TypeScript, TanStack Query, shadcn/ui, Vitest and Japa.

**Spec:** `docs/superpowers/specs/2026-09-06-protected-delivery-viewers-design.md`

## Global Constraints

- Route authorization must call `AccessControlService.resolve`; do not duplicate hierarchy or validity logic.
- VIEW and DOWNLOAD are independent, default-deny capabilities.
- Never serialize a private storage key or expose the original while handling VIEW.
- Original download uses an S3 GET presigned URL valid for exactly 300 seconds, with attachment disposition and sanitized filename.
- API errors must never reveal S3 keys, signed URLs or internal storage failures.
- All protected routes require the active `web` session and unsafe methods retain CSRF protection.
- Audit events are append-only and include user, material, action, IP, user-agent and timestamp.
- UI must use existing shadcn components; Phase 7 owns student catalog/navigation and Phase 8 owns tiles, watermark, fullscreen, loupe and advanced touch.

---

### Task 1: Private-download signing and append-only access audit

**Files:**
- Modify: `api/package.json`
- Modify: `api/app/services/storage_service.ts`
- Modify: `api/app/services/minio_storage_provider.ts`
- Create: `api/database/migrations/20260906000004_create_access_logs_table.ts`
- Create: `api/app/models/access_log.ts`
- Create: `api/app/services/access_log_service.ts`
- Modify: `api/app/models/material.ts`
- Modify: `api/app/models/user.ts`
- Modify: `api/database/schema.ts`
- Test: `api/tests/unit/minio_storage_provider.spec.ts`
- Test: `api/tests/unit/access_log_service.spec.ts`

**Interfaces:**
- Consumes: the existing `StorageService`, `MinioStorageProvider`, `Material` and `User` models.
- Produces: `StorageService.createTemporaryDownloadUrl({ key, filename, expiresInSeconds: 300 })`, `AccessLog`, and `AccessLogService.record(input)` for Task 2 delivery routes.

- [ ] **Step 1: Add focused failing tests for the two boundaries**

```ts
test('creates a five-minute attachment URL without exposing it in logs', async ({ assert }) => {
  const url = await storage.createTemporaryDownloadUrl({
    key: 'originals/private-id',
    filename: 'manual técnico.pdf',
    expiresInSeconds: 300,
  })
  assert.match(url, /^https?:\/\//)
  assert.deepInclude(capturedCommand.input, {
    Bucket: 'materials',
    Key: 'originals/private-id',
    ResponseContentDisposition: 'attachment; filename="manual-tecnico.pdf"',
  })
  assert.equal(capturedExpiresIn, 300)
})

test('records only the approved access-log fields', async ({ assert }) => {
  const log = await service.record({
    userId: user.id, materialId: material.id, action: 'VIEW_MATERIAL',
    ipAddress: '203.0.113.10', userAgent: 'Ideal Learning test agent',
  })
  assert.equal(log.action, 'VIEW_MATERIAL')
  assert.equal(log.materialId, material.id)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd api && node ace test tests/unit/minio_storage_provider.spec.ts tests/unit/access_log_service.spec.ts`

Expected: FAIL because the presigning method, log model and service do not exist.

- [ ] **Step 3: Implement explicit signing and audit persistence**

```ts
export interface CreateTemporaryDownloadUrlInput {
  key: string
  filename: string
  expiresInSeconds: 300
}

export interface StorageService {
  createTemporaryDownloadUrl(input: CreateTemporaryDownloadUrlInput): Promise<string>
}

export const ACCESS_LOG_ACTIONS = ['VIEW_MATERIAL', 'DOWNLOAD_MATERIAL', 'FAILED_ACCESS'] as const

export default class AccessLogService {
  async record(input: CreateAccessLogInput) {
    return AccessLog.create(input)
  }
}
```

Install `@aws-sdk/s3-request-presigner`; have `MinioStorageProvider` build a
`GetObjectCommand` using its existing client and bucket, `ExpiresIn: 300`, and
an ASCII-safe attachment filename. Add a migration with FKs to `users` and
`materials`, an action check constraint, nullable bounded IP/user-agent text,
`created_at`, and indexes for `(material_id, created_at)` and `(user_id,
created_at)`. Add the `Material.accessLogs` and `User.accessLogs` relations,
then update `api/database/schema.ts` mechanically so `AccessLog` has exactly
the columns represented by the migration and model.

- [ ] **Step 4: Run the focused tests and static checks**

Run: `cd api && node ace test tests/unit/minio_storage_provider.spec.ts tests/unit/access_log_service.spec.ts && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 5: Record the completed task in the phase ledger**

Update `.superpowers/sdd/2026-09-06-protected-delivery-viewers/progress.md`
with changed files, exact commands, results and the fact that no Git commit is
possible until the repository metadata is repaired.

### Task 2: Permission-checked protected delivery API

**Files:**
- Create: `api/app/services/protected_material_delivery_service.ts`
- Create: `api/app/controllers/protected_materials_controller.ts`
- Modify: `api/start/routes.ts`
- Test: `api/tests/functional/protected_material_delivery.spec.ts`
- Test: `api/tests/unit/protected_material_delivery_service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `StorageService` and `AccessLogService`; existing `AccessControlService`, `Material`, `MaterialDerivative`, auth middleware and private MinIO storage.
- Produces: `GET /api/v1/materials/:id/view`, `GET /api/v1/materials/:materialId/derivatives/:derivativeId`, and `POST /api/v1/materials/:id/download-url`.

- [ ] **Step 1: Write API-first failing tests for authorization and delivery**

```ts
test('serves a PDF manifest and derivative only to a student with VIEW', async ({ client, assert }) => {
  await allow(student, material, 'VIEW')
  const session = await login(client, student)
  const manifest = await client.get(`/api/v1/materials/${material.id}/view`).cookies(session.cookies)
  manifest.assertStatus(200)
  assert.notInclude(JSON.stringify(manifest.body()), material.storageKey)
  const page = await client.get(`/api/v1/materials/${material.id}/derivatives/${pageDerivative.id}`).cookies(session.cookies)
  page.assertStatus(200)
  page.assertHeader('content-type', /image\/webp/)
})

test('does not sign or disclose an original without DOWNLOAD', async ({ client, assert }) => {
  await allow(student, material, 'VIEW')
  const session = await login(client, student)
  const response = await client.post(`/api/v1/materials/${material.id}/download-url`).cookies(session.cookies).header('x-xsrf-token', session.xsrfToken)
  response.assertStatus(403)
  assert.equal(storage.signedInputs.length, 0)
  assert.equal((await AccessLog.query()).find((log) => log.action === 'FAILED_ACCESS')?.materialId, material.id)
})
```

Include cases for IMAGE, ZIP, `READY`/not-ready states, a mismatched
derivative ID, independent capability decisions, stale VIEW removed between
manifest and derivative request, 300-second signing, successful audit rows and
generic storage error responses.

- [ ] **Step 2: Run delivery tests and verify they fail**

Run: `cd api && node ace test tests/functional/protected_material_delivery.spec.ts tests/unit/protected_material_delivery_service.spec.ts`

Expected: FAIL because routes and the delivery service are absent.

- [ ] **Step 3: Implement the delivery service with one authorization path**

```ts
type ProtectedMaterialView = {
  id: number
  title: string
  type: 'PDF' | 'IMAGE' | 'ZIP'
  viewer: { kind: 'PDF_PAGES' | 'IMAGE_PREVIEW'; derivatives: SafeDerivative[] } | null
  download: { allowed: boolean }
}

await accessControl.resolve({
  userId, resourceType: 'MATERIAL', resourceId: materialId,
  capability: 'VIEW', now: DateTime.utc(),
})
```

Make the service own all resource lookup, decision resolution, safe manifest
construction, derivative ownership check, private stream lookup, presign call
and audit sequencing. The controller must only derive `userId`, request IP and
user-agent, map domain outcomes to 403/404/409/500 and stream a successful
derivative with `Content-Disposition: inline` plus `Cache-Control: private,
no-store`. Add the three routes under the existing `/api/v1` authenticated
group; do not attach `admin` middleware.

On an authorization deny, call `AccessLogService.record(FAILED_ACCESS)` before
the 403. On allowed manifest/download, log `VIEW_MATERIAL`/`DOWNLOAD_MATERIAL`
before sending the success response. If audit persistence fails, return generic
500 and never deliver bytes or URL. Never serialize `storageKey`, S3 errors or
signed URLs into logging payloads sent to clients.

- [ ] **Step 4: Run focused API tests, then all API checks**

Run: `cd api && node ace test tests/functional/protected_material_delivery.spec.ts tests/unit/protected_material_delivery_service.spec.ts && npm run typecheck && npm run lint && node ace test`

Expected: PASS. The full suite proves existing admin/material behavior remains
intact.

- [ ] **Step 5: Update the phase ledger**

Append routes, security cases and exact test output to
`.superpowers/sdd/2026-09-06-protected-delivery-viewers/progress.md`.

### Task 3: Typed protected-viewer client and data hooks

**Files:**
- Create: `web/src/features/protected-viewer/protected-viewer-types.ts`
- Create: `web/src/features/protected-viewer/protected-viewer-api.ts`
- Create: `web/src/features/protected-viewer/protected-viewer-queries.ts`
- Test: `web/src/features/protected-viewer/protected-viewer-api.test.ts`
- Test: `web/src/features/protected-viewer/protected-viewer-queries.test.tsx`

**Interfaces:**
- Consumes: API contracts from Task 2 and the existing `apiClient`/TanStack Query conventions.
- Produces: `getProtectedMaterialView`, `requestOriginalDownload`, `useProtectedMaterialViewQuery`, `useOriginalDownloadMutation`, and exact client-safe view types for Task 4.

- [ ] **Step 1: Write failing client and hook tests**

```tsx
it('gets a safe manifest and posts with CSRF to request an authorized download', async () => {
  await expect(getProtectedMaterialView(14)).resolves.toEqual(manifest)
  await expect(requestOriginalDownload(14)).resolves.toEqual({
    url: 'https://minio.test/signed', expiresAt: '2026-09-06T12:05:00.000Z',
  })
  expect(fetch).toHaveBeenLastCalledWith(expect.stringMatching(/materials\/14\/download-url$/), expect.objectContaining({ method: 'POST', credentials: 'include' }))
})

it('uses a stable view query key per material', () => {
  expect(protectedMaterialViewQueryOptions(14).queryKey).toEqual(['protected-material-view', 14])
})
```

- [ ] **Step 2: Run the focused web tests and verify they fail**

Run: `cd web && npm test -- protected-viewer-api.test.ts protected-viewer-queries.test.tsx`

Expected: FAIL because the feature module does not exist.

- [ ] **Step 3: Implement the typed API boundary and hooks**

```ts
export type ProtectedViewer =
  | { kind: 'PDF_PAGES'; derivatives: ProtectedDerivative[] }
  | { kind: 'IMAGE_PREVIEW'; derivatives: [ProtectedDerivative] }

export function useOriginalDownloadMutation() {
  return useMutation({ mutationFn: requestOriginalDownload })
}
```

Use the established envelope parser and `apiClient`; do not add a browser
storage URL builder. Keep `contentUrl` opaque and typed as an absolute API URL.
The mutation returns the URL only to the component that opens it and must not
persist it in React Query cache or local storage.

- [ ] **Step 4: Run focused tests and web static checks**

Run: `cd web && npm test -- protected-viewer-api.test.ts protected-viewer-queries.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 5: Update the phase ledger**

Append typed contract and test results to
`.superpowers/sdd/2026-09-06-protected-delivery-viewers/progress.md`.

### Task 4: Reusable shadcn protected PDF and image viewers

**Files:**
- Create: `web/src/features/protected-viewer/protected-material-viewer.tsx`
- Create: `web/src/features/protected-viewer/pdf-pages-viewer.tsx`
- Create: `web/src/features/protected-viewer/image-preview-viewer.tsx`
- Create: `web/src/features/protected-viewer/protected-material-viewer.test.tsx`
- Create: `web/src/features/protected-viewer/image-preview-viewer.test.tsx`

**Interfaces:**
- Consumes: Task 3 `ProtectedMaterialView`, `useOriginalDownloadMutation`, opaque derivative `contentUrl`, existing shadcn `Button` and layout utilities.
- Produces: `ProtectedMaterialViewer` for Phase 7 to mount with a material ID or loaded manifest.

- [ ] **Step 1: Write failing behavior tests for the viewers**

```tsx
it('renders ordered PDF pages and no original download control when download is denied', () => {
  render(<ProtectedMaterialViewer view={pdfViewWithoutDownload} />)
  expect(screen.getAllByRole('img', { name: /página/i })).toHaveLength(2)
  expect(screen.queryByRole('button', { name: /baixar original/i })).toBeNull()
  expect(document.body.textContent).not.toContain('originals/')
})

it('zooms, pans, fits and resets an image preview', async () => {
  render(<ImagePreviewViewer derivative={imageDerivative} />)
  await userEvent.click(screen.getByRole('button', { name: /aumentar zoom/i }))
  expect(screen.getByTestId('protected-image-canvas')).toHaveStyle({ transform: 'scale(1.25)' })
  await userEvent.click(screen.getByRole('button', { name: /ajustar à tela/i }))
  await userEvent.click(screen.getByRole('button', { name: /redefinir visualização/i }))
})
```

Add a test that an allowed download invokes the mutation and opens only its
returned URL, plus loading/error/ZIP-no-viewer states. Mock `window.open` and
never expect a URL containing a storage key.

- [ ] **Step 2: Run focused component tests and verify they fail**

Run: `cd web && npm test -- protected-material-viewer.test.tsx image-preview-viewer.test.tsx`

Expected: FAIL because viewer components are absent.

- [ ] **Step 3: Implement accessible, route-independent viewers**

```tsx
export function ProtectedMaterialViewer({ view }: { view: ProtectedMaterialView }) {
  if (!view.viewer) return <EmptyViewerState materialType={view.type} />
  return view.viewer.kind === 'PDF_PAGES'
    ? <PdfPagesViewer derivatives={view.viewer.derivatives} />
    : <ImagePreviewViewer derivative={view.viewer.derivatives[0]} />
}
```

Build controls with existing shadcn `Button` and lucide icons: PDF displays
ordered WebP `img` elements with descriptive page labels; image holds a
bounded-scale transform state, supports mouse-wheel zoom, pointer drag pan,
zoom in/out, fit and reset. Preserve keyboard focus and names for every
control. The download button appears only for `view.download.allowed`, requests
the URL through the Task 3 mutation, and calls `window.open(url, '_blank',
'noopener,noreferrer')` only after success. No route is added in this task.

- [ ] **Step 4: Run component tests and all web verification**

Run: `cd web && npm test -- protected-material-viewer.test.tsx image-preview-viewer.test.tsx && npm run typecheck && npm run lint && npm run build && npm test`

Expected: PASS. Existing layouts and admin material lists must have no viewer
or original-download surface.

- [ ] **Step 5: Finish documentation and final verification ledger**

Update `.superpowers/sdd/2026-09-06-protected-delivery-viewers/progress.md`
with each task's verification, final API/web suite counts, dependency change
and manual checks: deny VIEW, deny DOWNLOAD, active download and five-minute
URL expiration.

## Plan self-review

- Spec coverage: Tasks 1–2 implement private signing, audit and every API
  contract; Tasks 3–4 implement typed web viewers and download UX. Tests cover
  authorization changes, independent capabilities, ZIP/not-ready behavior,
  safe serialization and viewer interaction.
- Consistency: the plan uses `ProtectedMaterialView` throughout; only Task 1
  creates storage signing and audit interfaces, and Tasks 2–4 consume them.
- Scope: Phase 7 catalog routing and Phase 8 advanced imagery remain excluded.
