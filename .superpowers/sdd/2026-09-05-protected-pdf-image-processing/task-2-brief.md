# Task 2 brief — Private renderers and derivative lifecycle

Read this brief first; it is your complete requirements source. Also read the
binding spec at `docs/superpowers/specs/2026-09-05-protected-pdf-image-processing-design.md`
and Task 2 of `docs/superpowers/plans/2026-09-05-protected-pdf-image-processing.md`.

## Ownership

Create only Task 2 renderer/workspace/processing-service files and their tests.
You also own `api/package.json` and `api/package-lock.json` solely to install
the production dependency `sharp`; this is an explicit plan ruling.
Do not add Docker, an Ace worker command, Web UI, endpoints, permissions or
viewer/download functionality. Preserve Task 1 models, storage services and
delete lifecycle code; do not revert others. Do not spawn subagents.

## Binding requirements

- Install `sharp` as an API production dependency before implementing the
  image renderer; do not add any other dependency.
- `withPrivateWorkDirectory` creates directory 0700, uses private 0600 files,
  and removes it in success and error paths.
- PDF: call `pdfinfo` first; fail safely with non-retryable
  `PDF_PAGE_LIMIT_EXCEEDED` before any derived object when pages exceed exactly
  300. Within limit, use `pdftocairo` plus Sharp to emit ordered page WebPs;
  generated PNGs never remain.
- IMAGE: Sharp emits exactly one `image/webp` preview, longest edge max 2560,
  with `withoutEnlargement` and preserved aspect ratio.
- `MaterialProcessingService.process(jobId, now)` runs only a RUNNING job;
  reads original only through StorageService and never produces a URL. It sends
  WebPs to `derivatives/<materialId>/<runId>/...`, then transactionally writes
  derivative metadata, sets material READY with null error code and marks job
  SUCCEEDED.
- On any render/storage/DB failure, delete this run's private keys, leave no
  metadata from the run, redacts low-level errors and throws a typed
  `ProcessingFailure` for Task 3. Missing original is safe deterministic
  failure. The Task 1 deletion transaction holds the Material lifecycle lock:
  acquire the same Material `FOR UPDATE` lock immediately before derivative
  metadata/READY write. If it fails because deletion won, delete every uploaded
  key and do not recreate any metadata.
- Tests need command-runner injection, so they run on host without Poppler;
  cover 301 pages, ordered pages, no enlargement, temporary cleanup, missing
  original, partial upload cleanup, deletion-race metadata rejection and no
  serialized storage keys/URLs.

## Interfaces

```ts
export const PDF_PAGE_LIMIT = 300
export const IMAGE_PREVIEW_MAX_EDGE = 2560
export class ProcessingFailure extends Error {
  constructor(readonly code: 'PDF_PAGE_LIMIT_EXCEEDED' | 'ORIGINAL_NOT_FOUND' | 'PROCESSING_FAILED', readonly retryable: boolean)
}
export class MaterialProcessingService {
  async process(jobId: number, now: DateTime): Promise<void>
}
```

Run the Task 2 focused test command from the plan plus typecheck/lint. Write a
complete report to `.superpowers/sdd/2026-09-05-protected-pdf-image-processing/task-2-report.md`
with changed files, exact verification and any concerns. Return only concise
status/test result/concerns.
