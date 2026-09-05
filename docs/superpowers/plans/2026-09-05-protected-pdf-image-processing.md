# Processamento protegido de PDF e imagem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Processar PDFs e imagens privados de modo assíncrono em derivados WebP privados, usando jobs PostgreSQL e um worker Docker recuperável.

**Architecture:** A API cria `Material` e `ProcessingJob` na mesma transação. Um worker Adonis reivindica jobs com lease e `SKIP LOCKED`, baixa originais privados, usa Poppler/Sharp para criar derivados internos e só marca o material `READY` após persistir os metadados. Falhas limpam artefatos parciais e respeitam até três tentativas.

**Tech Stack:** AdonisJS, Lucid/PostgreSQL, AWS SDK S3/MinIO, Sharp, Poppler (`pdfinfo`/`pdftocairo`), Docker Compose, Japa, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-05-protected-pdf-image-processing-design.md`

## Global Constraints

- Não adicionar Redis; jobs são persistidos e bloqueados no PostgreSQL.
- Só PDF e IMAGE geram job; ZIP não gera derivado e mantém o comportamento atual.
- PDF aceita no máximo 300 páginas; o limite excedido termina em `FAILED` com código seguro.
- Derivados são WebP privados; não criar ACL/política pública, URL, URL assinada ou endpoint de bytes.
- O storage key é exclusivamente interno, nunca serializado nem aceito do Web.
- Jobs têm no máximo 3 tentativas; leases vencidos podem ser retomados com segurança.
- Worker usa temporários 0700/0600 e sempre remove temporários e derivados parciais em falhas.
- Nenhuma rota, requisição ou UI de aluno para derivados/viewer/download nesta fase.
- O Git local é inválido; não tentar commits/worktrees. Verificar com testes, typecheck, lint e build.

---

### Task 1: Persistência, contratos de storage e enfileiramento transacional

**Files:**
- Create: `api/database/migrations/*_create_processing_jobs_table.ts`
- Create: `api/database/migrations/*_create_material_derivatives_table.ts`
- Create: `api/database/migrations/*_add_processing_error_code_to_materials_table.ts`
- Create: `api/app/models/processing_job.ts`
- Create: `api/app/models/material_derivative.ts`
- Create: `api/app/services/processing_job_service.ts`
- Modify: `api/app/models/material.ts`, `api/app/models/course_module.ts`
- Modify: `api/app/services/storage_service.ts`, `api/app/services/minio_storage_provider.ts`
- Modify: `api/app/controllers/materials_controller.ts`
- Test: `api/tests/functional/materials.spec.ts`, `api/tests/unit/processing_job_service.spec.ts`, `api/tests/unit/minio_storage_provider.spec.ts`

**Interfaces:**
- Produces `ProcessingJob` (`PENDING | RUNNING | SUCCEEDED | FAILED`) and
  `MaterialDerivative` (`PDF_PAGE | IMAGE_PREVIEW`) models.
- Produces `ProcessingJobService.enqueueForMaterial(trx, material)` and
  `claimNext(now): Promise<ClaimedProcessingJob | null>`.
- Extends `StorageService` with private `getObject(key): Promise<Readable>`,
  `listKeys(prefix): Promise<string[]>`, and existing private put/delete.

- [ ] **Step 1: Write failing persistence and queue tests**

```ts
test('creates exactly one PENDING PDF_RENDER job with its material', async ({ assert }) => {
  const material = await createUploadedMaterial({ type: 'PDF' })
  const jobs = await ProcessingJob.query().where('material_id', material.id)
  assert.lengthOf(jobs, 1)
  assert.equal(jobs[0].kind, 'PDF_RENDER')
  assert.equal(jobs[0].status, 'PENDING')
  assert.equal(jobs[0].maxAttempts, 3)
})

test('does not create a derivative job for ZIP', async ({ assert }) => {
  const material = await createUploadedMaterial({ type: 'ZIP' })
  assert.equal(await ProcessingJob.query().where('material_id', material.id).count('* as total').then(([r]) => r.$extras.total), '0')
})

test('claims one pending job once across concurrent workers', async ({ assert }) => {
  const [left, right] = await Promise.all([service.claimNext(now), service.claimNext(now)])
  const claims = [left, right].filter((job): job is ClaimedProcessingJob => job !== null)
  assert.lengthOf(claims, 1)
  assert.equal(claims[0].id, job.id)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd api && npm test -- tests/unit/processing_job_service.spec.ts tests/functional/materials.spec.ts`

Expected: FAIL because job/derivative schema and queue service do not exist.

- [ ] **Step 3: Add the migrations and models**

```ts
export const PROCESSING_JOB_KINDS = ['PDF_RENDER', 'IMAGE_DERIVATIVE'] as const
export const PROCESSING_JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const
export const DERIVATIVE_KINDS = ['PDF_PAGE', 'IMAGE_PREVIEW'] as const

// processing_jobs: FK material_id ON DELETE CASCADE; attempts/max_attempts;
// locked_at/lease_expires_at nullable; last_error_code nullable;
// unique active job per material is enforced in service transaction.
// material_derivatives: FK material_id ON DELETE CASCADE; storage_key private;
// unique(material_id, kind, page_number) plus a partial unique index for the
// single IMAGE_PREVIEW row where page_number IS NULL.
// materials gets nullable processing_error_code (64 chars); it stores only a
// finite safe error-code enum, never a raw exception message.
```

Add nullable `Material.processingErrorCode`, `Material.jobs` and
`Material.derivatives` relations ordered by derivative position. Set
`storageKey` on `MaterialDerivative` to `serializeAs: null`.

- [ ] **Step 4: Extend private storage and queue service**

```ts
export interface StorageService {
  ensurePrivateBucket(): Promise<void>
  putObject(input: PutObjectInput): Promise<void>
  getObject(key: string): Promise<Readable>
  listKeys(prefix: string): Promise<string[]>
  deleteObject(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export class ProcessingJobService {
  async enqueueForMaterial(trx: TransactionClientContract, material: Material) {
    if (material.type === 'ZIP') return null
    return ProcessingJob.create({ materialId: material.id, kind: material.type === 'PDF' ? 'PDF_RENDER' : 'IMAGE_DERIVATIVE', status: 'PENDING', attempts: 0, maxAttempts: 3 }, { client: trx })
  }
}
```

Use `GetObjectCommand` and paginated `ListObjectsV2Command` in MinIO provider.
Never convert a response object into an external URL. In the material upload
transaction create the material then invoke `enqueueForMaterial(trx, material)`.
Update delete to delete all derivative object keys and queue records before
deleting original/metadata, treating missing S3 objects as recoverable.

- [ ] **Step 5: Run Task 1 verification**

Run: `cd api && npm test -- tests/unit/processing_job_service.spec.ts tests/unit/minio_storage_provider.spec.ts tests/functional/materials.spec.ts && npm run typecheck && npm run lint`

Expected: all new queue/storage/material lifecycle tests pass.

---

### Task 2: Renderer services and private derivative lifecycle

**Files:**
- Create: `api/app/services/private_work_directory.ts`
- Create: `api/app/services/pdf_renderer.ts`
- Create: `api/app/services/image_derivative_renderer.ts`
- Create: `api/app/services/material_processing_service.ts`
- Modify: `api/package.json`, `api/package-lock.json`
- Test: `api/tests/unit/private_work_directory.spec.ts`, `api/tests/unit/pdf_renderer.spec.ts`, `api/tests/unit/image_derivative_renderer.spec.ts`, `api/tests/unit/material_processing_service.spec.ts`

**Interfaces:**
- Consumes `StorageService`, `ProcessingJob`, `Material`, `MaterialDerivative`.
- Produces `MaterialProcessingService.process(jobId, now): Promise<ProcessResult>`.
- `PdfRenderer.render(input)` returns `{ pages: RenderedDerivative[] }` or
  throws `ProcessingFailure('PDF_PAGE_LIMIT_EXCEEDED', false)`.
- `ImageDerivativeRenderer.render(input)` returns one `RenderedDerivative`.

- [ ] **Step 1: Write failing renderer and cleanup tests**

```ts
test('rejects a 301-page PDF before writing a derivative', async ({ assert }) => {
  await assert.rejects(() => pdfRenderer.render({ source, outputDirectory }), /PDF_PAGE_LIMIT_EXCEEDED/)
  assert.deepEqual(await readdir(outputDirectory), [])
})

test('renders pages in ascending order as WebP', async ({ assert }) => {
  const output = await pdfRenderer.render({ source: threePagePdf, outputDirectory })
  assert.deepEqual(output.pages.map((page) => page.pageNumber), [1, 2, 3])
  assert.isTrue(output.pages.every((page) => page.mimeType === 'image/webp'))
})

test('does not enlarge an image preview beyond its original dimensions', async ({ assert }) => {
  const output = await imageRenderer.render({ source: smallPng, outputDirectory })
  assert.equal(output.width, 640)
  assert.equal(output.height, 480)
})
```

- [ ] **Step 2: Run focused renderer tests and verify RED**

Run: `cd api && npm test -- tests/unit/private_work_directory.spec.ts tests/unit/pdf_renderer.spec.ts tests/unit/image_derivative_renderer.spec.ts tests/unit/material_processing_service.spec.ts`

Expected: FAIL because renderers and processing service do not exist.

- [ ] **Step 3: Implement private workspace and deterministic renderers**

```ts
export async function withPrivateWorkDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-worker-'))
  await chmod(directory, 0o700)
  try { return await callback(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

export const PDF_PAGE_LIMIT = 300
export const IMAGE_PREVIEW_MAX_EDGE = 2560
```

Use `pdfinfo` to determine page count before invoking `pdftocairo` per page.
Convert emitted PNGs to WebP with Sharp; do not retain PNG outputs. Use Sharp
for image previews with `resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })` then `webp()`.

- [ ] **Step 4: Implement all-or-clean processing semantics**

```ts
async process(jobId: number, now: DateTime) {
  const job = await ProcessingJob.query().where('id', jobId).where('status', 'RUNNING').preload('material').firstOrFail()
  const runId = randomUUID()
  const uploadedKeys: string[] = []
  try {
    await withPrivateWorkDirectory(async (directory) => {
      const original = join(directory, 'original')
      await downloadPrivateObject(storage, job.material.storageKey, original)
      const outputs = job.kind === 'PDF_RENDER'
        ? await pdfRenderer.render({ source: original, outputDirectory: directory })
        : [await imageRenderer.render({ source: original, outputDirectory: directory })]
      for (const output of outputs) {
        const key = `derivatives/${job.materialId}/${runId}/${output.filename}`
        await storage.putObject({ key, body: createReadStream(output.path), contentType: 'image/webp' })
        uploadedKeys.push(key)
      }
      await replaceDerivativesAndFinish(job, outputs, uploadedKeys, now)
    })
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => storage.deleteObject(key).catch(() => undefined)))
    throw error
  }
}
```

Map the 301-page condition and absent original to finite safe error codes.
Propagate only typed processing failures to the worker; redact S3/process paths
from stored error values and HTTP serialization.

- [ ] **Step 5: Run Task 2 verification**

Run: `cd api && npm test -- tests/unit/private_work_directory.spec.ts tests/unit/pdf_renderer.spec.ts tests/unit/image_derivative_renderer.spec.ts tests/unit/material_processing_service.spec.ts && npm run typecheck && npm run lint`

Expected: WebP output, size/page limits and cleanup tests pass.

---

### Task 3: Adonis worker, retry/lease recovery and Docker development service

**Files:**
- Create: `api/commands/process_material_jobs.ts`
- Create: `api/app/services/processing_worker.ts`
- Modify: `api/app/services/processing_job_service.ts`
- Modify: `api/package.json`, `api/package-lock.json`
- Create: `api/Dockerfile`
- Modify: `docker-compose.yml`, `.env.example`, `api/.env.example`, `api/.env.docker.example`
- Test: `api/tests/unit/processing_worker.spec.ts`, `api/tests/functional/material_processing.spec.ts`

**Interfaces:**
- Consumes Task 1 claim/release operations and Task 2 processing service.
- Produces `ProcessingWorker.runOnce(now): Promise<boolean>` and `ace process:material-jobs`.
- `worker` Compose service runs `node ace process:material-jobs` after PostgreSQL
  and MinIO become healthy.

- [ ] **Step 1: Write failing worker lifecycle tests**

```ts
test('reclaims an expired RUNNING lease and completes it once', async ({ assert }) => {
  await ProcessingJob.query().where('id', job.id).update({ status: 'RUNNING', leaseExpiresAt: now.minus({ minute: 1 }).toSQL() })
  assert.isTrue(await worker.runOnce(now))
  assert.equal((await job.refresh()).status, 'SUCCEEDED')
})

test('returns a transient failure to PENDING until the third attempt', async ({ assert }) => {
  await worker.runOnce(now)
  assert.equal((await job.refresh()).status, 'PENDING')
  assert.equal(job.attempts, 1)
})

test('marks a deterministic processing failure FAILED without retry', async ({ assert }) => {
  processingService.process = async () => { throw new ProcessingFailure('PDF_PAGE_LIMIT_EXCEEDED', false) }
  await worker.runOnce(now)
  assert.equal((await job.refresh()).status, 'FAILED')
})
```

- [ ] **Step 2: Run worker tests and verify RED**

Run: `cd api && npm test -- tests/unit/processing_worker.spec.ts tests/functional/material_processing.spec.ts`

Expected: FAIL because no worker command or lease/retry state transitions exist.

- [ ] **Step 3: Implement lease-safe worker and command**

```ts
export class ProcessingWorker {
  async runOnce(now = DateTime.utc()): Promise<boolean> {
    const job = await this.jobs.claimNext(now)
    if (!job) return false
    try { await this.processor.process(job.id, now); return true }
    catch (error) { await this.jobs.finishFailure(job, toSafeFailure(error), now); return true }
  }
}
```

Use a five-minute lease and a bounded idle delay (for example 1 second). The
Ace command loops until SIGTERM/SIGINT, exits cleanly after current job and
never logs credentials. `finishFailure` increments attempts exactly once,
returns transient failures below three attempts to `PENDING`, and otherwise
marks `FAILED` with safe code only.

- [ ] **Step 4: Add Sharp and worker Docker image/service**

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]
```

```yaml
worker:
  build: ./api
  command: node ace process:material-jobs
  env_file: ./api/.env.docker
  depends_on:
    postgres: { condition: service_healthy }
    minio: { condition: service_healthy }
```

Use the Compose service only for worker; do not convert the existing local API
workflow to Docker. Document necessary
`api/.env.docker` local setup from the existing example without committing
secrets.

- [ ] **Step 5: Run Task 3 verification**

Run: `cd api && npm test -- tests/unit/processing_worker.spec.ts tests/functional/material_processing.spec.ts && npm run typecheck && npm run lint && npm run build`

Expected: retry/lease tests and production build pass; `docker compose config`
validates the new worker service.

---

### Task 4: Administração de estado de processamento e regressão completa

**Files:**
- Modify: `api/app/transformers/material_transformer.ts`
- Modify: `web/src/features/materials/materials-types.ts`
- Modify: `web/src/features/materials/materials-list.tsx`
- Modify: `web/src/features/materials/materials-list.test.tsx`
- Modify: `api/tests/functional/materials.spec.ts`
- Test: `api/tests/functional/material_processing.spec.ts`, `web/src/features/materials/materials-list.test.tsx`

**Interfaces:**
- Consumes safe `processingStatus` and optional finite `processingErrorCode`
  from the transformer.
- Produces admin-only status badges for `PROCESSING`, `READY`, `FAILED`; no
  derivative retrieval or viewer control.

- [ ] **Step 1: Write failing safe-serialization and status UI tests**

```ts
test('serializes READY and a safe FAILED code without derivative storage metadata', async ({ assert }) => {
  const data = await serialize(MaterialTransformer.transform(failedMaterial))
  assert.deepInclude(data, { processingStatus: 'FAILED', processingErrorCode: 'PDF_PAGE_LIMIT_EXCEEDED' })
  assert.notProperty(data, 'storageKey')
  assert.notProperty(data, 'derivatives')
})
```

```tsx
it('shows a failed processing status without any viewer or download action', () => {
  renderList({ processingStatus: 'FAILED', processingErrorCode: 'PDF_PAGE_LIMIT_EXCEEDED' })
  expect(screen.getByText('Falha no processamento')).toBeTruthy()
  expect(screen.queryByRole('link', { name: /baixar|visualizar/i })).toBeNull()
})
```

- [ ] **Step 2: Run status tests and verify RED**

Run: `cd api && npm test -- tests/functional/materials.spec.ts tests/functional/material_processing.spec.ts && cd ../web && npm test -- src/features/materials/materials-list.test.tsx --reporter=dot`

Expected: FAIL because safe failure status is not exposed/rendered.

- [ ] **Step 3: Implement only safe admin status visibility**

Extend `MaterialTransformer` to expose `processingErrorCode` only when its
value is one of the enum of safe codes; never serialize derivative model,
storage key, exception message or URL. Render translated `PROCESSING`, `READY`
and `FAILED` labels in existing shadcn badge/alert controls. Keep material
actions to edit/delete and do not add a link, button or request for derived
content.

- [ ] **Step 4: Run full acceptance verification**

Run: `cd web && npm test && npm run typecheck && npm run lint && npm run build && cd ../api && npm test && npm run typecheck && npm run lint && npm run build && cd .. && docker compose config`

Expected: all Web/API checks pass and Compose accepts postgres, minio and
worker. API runtime logs from intentional failure tests must not contain
serialized secrets in HTTP responses.

## Self-review

- Task 1 implements durable data, private storage reads and transactionally
  enqueued PDF/image jobs; it excludes ZIP processing.
- Task 2 implements WebP renderers, 300-page guard, private temporary work and
  all-or-clean derivative persistence.
- Task 3 implements lease/retry recovery and the approved Docker worker.
- Task 4 exposes only safe administrative status and proves no viewer/download
  surface was introduced.
- The plan deliberately excludes access rules, viewer delivery, download,
  signed URLs, student catalogue, OCR, tiles and watermarking.
