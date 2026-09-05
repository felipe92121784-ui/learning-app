# Task 1 brief — Persistence, private storage and transactional queue

Read this brief first; it is the complete requirements source for your task.
Also read the binding spec at
`docs/superpowers/specs/2026-09-05-protected-pdf-image-processing-design.md`
and Task 1 in the plan at
`docs/superpowers/plans/2026-09-05-protected-pdf-image-processing.md`.

## Ownership

Only change files listed in Task 1, plus adjacent tests needed to validate
those files. Do not add rendering, worker command, Docker, Web UI, viewers,
downloads, routes for bytes or anything allocated to later tasks. You are not
alone in the repository: preserve existing changes and do not revert others.

## Binding requirements

- Migrate existing databases safely: create new `processing_jobs`,
  `material_derivatives`, and add `materials.processing_error_code` with a new
  migration; do not edit the already-run materials migration.
- Types: jobs PDF_RENDER/IMAGE_DERIVATIVE and PENDING/RUNNING/SUCCEEDED/FAILED;
  derivatives PDF_PAGE/IMAGE_PREVIEW. Max attempts is exactly 3.
- One active job per material, made safe by transaction/locking. ZIP gets no
  job; PDF and IMAGE are enqueued in the same DB transaction as their material.
- Add private MinIO read/list operations without returning public URLs.
- Private derivative storage keys and all original keys must remain nonserialized.
- Existing material delete must clean job/derivative metadata and their private
  objects before original metadata, tolerate missing objects and preserve
  current position compaction and response behavior.
- Add a nullable, finite safe `processingErrorCode` field to Material. No raw
  errors/secrets/paths are stored or serialized at this task.
- Tests must cover upload creates PDF/IMAGE job, ZIP no job, concurrent claim,
  private storage get/list adapter behavior, safe serialization and delete
  cleanup. Maintain existing auth/CSRF/multipart protections.

## Implementation interfaces

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
  async enqueueForMaterial(trx: TransactionClientContract, material: Material): Promise<ProcessingJob | null>
  async claimNext(now: DateTime): Promise<ClaimedProcessingJob | null>
}
```

Use `FOR UPDATE SKIP LOCKED` / an equivalent atomic PostgreSQL pattern for
claiming, exactly one returned claim across concurrent calls. A claim sets
RUNNING, `lockedAt`, and `leaseExpiresAt`; a lease-expiry recovery will be used
in Task 3, so store all fields now.

Run focused tests plus `npm run typecheck` and `npm run lint`. Write a complete
report with changed files, behavior, commands/results and concerns to
`.superpowers/sdd/2026-09-05-protected-pdf-image-processing/task-1-report.md`.
Do not spawn subagents.
