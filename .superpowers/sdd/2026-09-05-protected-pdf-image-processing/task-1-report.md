# Task 1 — Persistence, private storage and transactional queue

## Delivered behavior

- Added forward-only migrations for `processing_jobs`, `material_derivatives`, and nullable `materials.processing_error_code`; existing materials migration was not edited.
- Added typed `ProcessingJob` and `MaterialDerivative` models, safe finite error-code types, private derivative storage keys, and ordered material relations.
- Added `ProcessingJobService.enqueueForMaterial(trx, material)` and lease-bearing `claimNext(now)`. Enqueue locks the material row, permits one active job only, skips ZIP, and gives PDF/IMAGE their respective pending job with exactly three maximum attempts. Claims use `FOR UPDATE SKIP LOCKED` and transition one job to `RUNNING` with lock and lease timestamps.
- Extended private MinIO storage with `getObject` and paginated `listKeys`, without public URLs.
- Upload now writes the original then creates the material and (for PDF/IMAGE) its job in the same transaction. Delete removes private derivative objects, original object, jobs and derivative metadata before removing the material metadata, tolerating missing objects and preserving position compaction and response behavior.
- Material and derivative private storage keys remain nonserialized; the safe processing error code is not exposed by the existing material transformer.

## Changed files

- `api/database/migrations/20260905000003_create_processing_jobs_table.ts`
- `api/database/migrations/20260905000004_create_material_derivatives_table.ts`
- `api/database/migrations/20260905000005_add_processing_error_code_to_materials_table.ts`
- `api/app/models/material.ts`
- `api/app/models/processing_job.ts`
- `api/app/models/material_derivative.ts`
- `api/app/services/processing_job_service.ts`
- `api/app/services/storage_service.ts`
- `api/app/services/minio_storage_provider.ts`
- `api/app/controllers/materials_controller.ts`
- `api/tests/unit/processing_job_service.spec.ts`
- `api/tests/unit/minio_storage_provider.spec.ts`
- `api/tests/functional/materials.spec.ts`

## Verification

Passed from `api/`:

```sh
npm test -- --files=tests/unit/processing_job_service.spec.ts --files=tests/unit/minio_storage_provider.spec.ts --files=tests/functional/materials.spec.ts
# 49 passed

npm run typecheck
# passed

npm run lint
# passed
```

## Re-review round 1 fix

- Restored idempotent `204 No Content` behavior for an authenticated DELETE targeting an unknown module (or an absent material) by using a non-locking candidate lookup before entering the lifecycle-lock transaction. Existing candidates still take the module and material `FOR UPDATE` locks before derivative snapshots or cleanup.
- Added the authenticated unknown-module DELETE regression test and verified that it performs no storage operation.

### Re-review verification

```sh
npm test -- --files=tests/functional/materials.spec.ts --tests='returns no content when deleting from an unknown module'
# 1 passed

npm test -- --files=tests/unit/processing_job_service.spec.ts --files=tests/unit/minio_storage_provider.spec.ts --files=tests/functional/materials.spec.ts
# 53 passed

npm run typecheck
# passed

npm run lint
# passed
```

The focused tests cover PDF/IMAGE job creation, ZIP exclusion, concurrent enqueue/claim safety, private MinIO reads and pagination, nonserialization of original/derivative keys, delete cleanup, existing auth/CSRF/multipart behavior, and position compaction.

## Concerns

No blocking concerns. The focused suite intentionally logs fake storage/database failures while asserting their HTTP responses do not disclose them; those expected test logs do not indicate a test failure.

## Review fixes

- Deletion now acquires `FOR UPDATE` on the material before it snapshots derivative keys, removes private objects, or removes metadata, and holds that lifecycle lock until the transaction deletes the material. This is the shared lock Task 2 must acquire before committing derivative metadata and `READY` state.
- Added a controller-level interleaving regression test: a derivative insert started after deletion has acquired the material lock remains blocked and is rejected after deletion commits, so no derivative object can be orphaned by metadata cascade.
- Strengthened PostgreSQL invariants:
  - `processing_jobs.attempts` must be between zero and `max_attempts`, inclusive.
  - `PDF_PAGE` requires a non-null page number of at least one; `IMAGE_PREVIEW` requires a null page number.
  - derivative MIME type is exactly `image/webp`.
- Added database constraint tests for attempt overflow and invalid derivative page/MIME combinations.

### Review-fix verification

The test schema was rebuilt and every migration was applied successfully:

```sh
NODE_ENV=test node ace migration:fresh --force
# all 10 migrations applied

npm test -- --files=tests/unit/processing_job_service.spec.ts --files=tests/unit/minio_storage_provider.spec.ts --files=tests/functional/materials.spec.ts
# 52 passed

npm run typecheck
# passed

npm run lint
# passed
```
