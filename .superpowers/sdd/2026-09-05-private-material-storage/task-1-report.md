# Task 1 report — private material storage foundation

## Status

Complete. The Task 1 API ownership surface is implemented without adding any
controllers, routes, or Web files.

## Delivered

- Installed `@aws-sdk/client-s3@3.1127.0` and `@aws-sdk/lib-storage`, updating
  `api/package-lock.json`.
- Added `StorageService` and an S3-compatible `MinioStorageProvider` that:
  - configures the existing `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
    `S3_BUCKET`, and `S3_REGION` values;
  - forces path-style S3 addressing for MinIO;
  - creates a missing bucket, tolerates concurrent
    `BucketAlreadyOwnedByYou`/`BucketAlreadyExists` responses, removes any
    bucket policy, and applies S3's supported `private` bucket ACL; it never
    creates a public policy or URL;
  - uses AWS's managed uploader for unknown-length `Readable` input, preserving
    the required `StorageService` interface while sending MinIO-supported,
    known-length part bodies;
  - supports private `putObject`, `deleteObject`, and `exists` operations.
- Added material and upload-setting migrations:
  - `materials` is module-owned, cascades on module deletion, restricts type
    and lifecycle values, keeps a globally unique storage key, and enforces a
    unique zero-based `position` inside each module.
  - `upload_settings` has one category-keyed row per `PDF`, `IMAGE`, and `ZIP`,
    seeded at exactly `104857600` bytes.
- Added `Material` and `UploadSetting` models, material type/lifecycle unions,
  `CourseModule.materials` ordered by ascending position, and public
  transformers. `storageKey` is excluded both at model serialization and from
  `MaterialTransformer`.

## TDD evidence

1. Wrote `api/tests/unit/minio_storage_provider.spec.ts` and
   `api/tests/functional/materials.spec.ts` before the Task 1 source files.
2. The initial focused red run, using the runner's required `--files` syntax,
   failed as intended because `#services/minio_storage_provider` did not yet
   exist. (The plan's positional-file command is not valid for this Japa
   configuration; it treats paths as suite names.)
3. Implemented the minimum provider, migrations, models, relation, and
   transformers. The first green run exposed two real contract gaps:
   the relation needed an explicit `moduleId` foreign key, and database
   truncation removes migration-seeded rows. The relation was fixed; each
   isolated persistence test now re-creates the three migration-default rows
   after truncation, while the migration remains responsible for first deploy
   seeding. The test records rows immediately after the migration runner and
   before truncation, then verifies the exact default rows; teardown restores
   those defaults for repeated focused runs.
4. Round 1 strict command tests initially failed against the AWS-only
   `PutPublicAccessBlock` and `PutBucketOwnershipControls` calls. The provider
   now issues exactly `HeadBucket`, optional `CreateBucket`,
   `DeleteBucketPolicy`, and `PutBucketAcl(private)` for provisioning. A live
   MinIO test then exposed the current SDK's unknown-stream direct-put failure;
   the managed uploader fixed it without changing the storage interface.
5. Added a focused existing-bucket regression that proves a successful
   `DeleteBucketPolicy` is issued before `PutBucketAcl(private)`, rather than
   exercising only the no-policy 404 path.

## Final verification

All commands were run from `api/`:

```text
npm test -- --files tests/unit/minio_storage_provider.spec.ts --files tests/functional/minio_storage_provider.spec.ts --files tests/functional/materials.spec.ts
PASS: 10 passed, 0 failed

npm run typecheck
PASS: tsc --noEmit

npm run lint
PASS: eslint .
```

The focused suite verifies exact MinIO-compatible provisioning commands,
concurrent bucket-create recovery, successful policy-removal-before-private-
ACL ordering, object put/head/delete behavior,
missing-object handling, module material ordering, per-module position
uniqueness, private storage-key omission from serialized output, and the exact
three 100 MB upload defaults. The live suite ran successfully against the
healthy local `ideal-learning-minio-1` compose service, proving a private
bucket has no bucket policy and accepts the required stream upload.

## Concern

None. The compose-backed MinIO integration test passed; its generated bucket
and object are deleted in teardown.
