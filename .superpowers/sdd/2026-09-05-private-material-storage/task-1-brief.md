# Task 1 brief — Storage abstraído, migrations e modelos

Read `docs/superpowers/specs/2026-09-05-private-material-storage-design.md` first. It is binding.

## Ownership

You own only Task 1 files from `docs/superpowers/plans/2026-09-05-private-material-storage.md`: API package/env, storage services, migrations, Material/UploadSetting models, CourseModule relation, transformers, and Task 1 tests. Do not add controllers/routes or any web files. You are not alone: preserve unrelated edits, do not revert other work, do not spawn subagents.

## Exact requirements

- Install current AWS S3 client package. `MinioStorageProvider` must use existing `S3_*` config and path-style S3 endpoint.
- Define `StorageService` with `ensurePrivateBucket`, `putObject`, `deleteObject`, `exists`.
- Bucket exists privately with no public policy/URLs. Keys are inputs at this layer but future callers generate `originals/<uuid>`.
- Create materials with PDF/IMAGE/ZIP, PROCESSING lifecycle support, storage key non-serialized, module FK, per-module unique position, and ordered CourseModule.materials relation.
- Create upload settings PDF/IMAGE/ZIP defaults exactly `104857600` bytes.
- Include unit/focused tests for provider behavior and persistence/serialization ordering. Tests first; observe RED then GREEN.

## Verification/report

Run focused tests, API typecheck/lint and write detailed evidence to `.superpowers/sdd/2026-09-05-private-material-storage/task-1-report.md`. Return only status, concise tests and concerns.
