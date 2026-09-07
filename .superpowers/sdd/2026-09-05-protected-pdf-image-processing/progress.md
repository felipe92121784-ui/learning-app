# SDD ledger — plan: docs/superpowers/plans/2026-09-05-protected-pdf-image-processing.md

## Pre-flight review

| Scope | Producer | Consumer | Finding |
| --- | --- | --- | --- |
| Task 1 → Task 2 | `ProcessingJob`, `MaterialDerivative`, private storage reads and queue claims | renderer and processing lifecycle | Compatible: Task 2 consumes named models/storage interfaces and does not alter queue claiming. |
| Task 1 → Task 3 | queue service claim/enqueue model state | worker lease/retry orchestration | Compatible: Task 3 extends task 1 service without changing job kind/status values. |
| Task 2 → Task 3 | `MaterialProcessingService.process(jobId, now)` and typed safe failure | worker error transition | Compatible: success/failure ownership is distinct; worker owns retries. |
| Task 1 → Task 4 | `processingErrorCode` material persistence | transformer/UI safe status | Compatible: column is introduced before serialization. |
| Task 3 → Task 4 | Docker worker changes plus completed job/material state | admin status display and final regression | Compatible: Task 4 consumes no Docker internals. |
| Task 1 | current material upload/delete lifecycle | job insertion and cleanup of job/derivative records | Ruling: add `processing_error_code` through a new migration, not edit the existing migration, because development databases already ran it. Cost if wrong: fresh databases still migrate correctly; deployed local DBs retain compatibility. |
| Task 2 | private derivative storage | 300-page PDF and image rendering | Ruling: implement Poppler subprocess execution behind `PdfRenderer` and Sharp behind `ImageDerivativeRenderer`; tests may inject command runners rather than depend on Poppler in the host. Cost if wrong: real Docker integration remains the authoritative rendering validation. |
| Task 3 | compose worker service | current local API development | Ruling: add only `worker` to Compose; API development remains `npm run dev` outside Docker as specified. Cost if wrong: developers can still run API locally, while worker runs in Compose. |

Ruling: `.git` is an invalid empty directory, so SDD scripts cannot produce a Git review package, worktree or commits. Use this plan-scoped ledger, task briefs/reports, fresh task reviewers and concrete verification instead. Cost if wrong: no commit-range packaging, but all changes remain source-reviewed and test-verified.

Task 1: fix round 1/5 — Ruling: use the `materials` row as the shared lifecycle lock. Deletion acquires and holds that row lock while it snapshots/removes derivative keys and metadata; Task 2 processing must acquire the same row lock before committing derivative metadata/READY. This prevents a renderer from persisting a derivative after deletion begins. Cost if wrong: object-store I/O occurs within a bounded DB transaction, but correctness and private-object cleanup take priority at the current scale.
Task 1: fix round 2/5 — preserve existing idempotent DELETE semantics. Ruling: an unknown module/material delete returns 204 before the lifecycle lock; the lock applies only after a material candidate is found. Cost if wrong: a concurrent delete can win after the first lookup, but the second transaction resolves it as a no-op rather than leaking a 500.

Task 1: complete — durable jobs/derivatives, transactional PDF/IMAGE enqueue, ZIP exclusion, private storage reads/listing, DB invariants and lifecycle-safe deletion reviewed. Evidence: 53 focused tests, typecheck and lint; reviewer Spec PASS and Quality PASS.

Ruling: move the `sharp` package dependency from Task 3 to Task 2 — Task 2 cannot implement or typecheck the required ImageDerivativeRenderer without it; Task 3 remains owner of Poppler Docker installation and worker Compose service. Cost if wrong: Task 2 modifies package manifests one task earlier, but avoids a fake renderer or deferred type failure.

Task 2: fix round 1/5 — Ruling: add nullable `processing_jobs.output_prefix` now and set it before the first derived object upload. It is durable cleanup intent: a failed worker can list/delete that private prefix before retry/final failure, even after a process crash or delete failure. Cost if wrong: one additional forward migration/model field is introduced outside Task 1, but it prevents untracked private object leaks; Task 3 must run durable-prefix cleanup before any retry and retain it until confirmed clean.

Task 2: fix round 2/5 — Ruling: add nullable `processing_jobs.pending_cleanup_keys` (JSON array) and treat it as durable post-commit compensation. Never overwrite an existing `outputPrefix` before its prefix has been listed/deleted and verified clean. On replacement, commit the new derivative metadata and persist the old keys in `pending_cleanup_keys`; worker logic in Task 3 must drain that list before considering the job fully settled, retaining any failed key for retry. Cost if wrong: jobs carry bounded internal cleanup state, but avoids both metadata pointing to deleted objects and untracked private-object leaks.

Task 2: complete — private workspaces, PDF/image WebP renderers, durable prefix recovery and transactional replacement lifecycle reviewed. Evidence: 17 focused tests, typecheck and lint. Ruling carried to Task 3: jobs with `pendingCleanupKeys` remain cleanup candidates even when status is SUCCEEDED; worker must drain/update them idempotently.

Task 3: complete — lease/retry worker, durable pending-cleanup drain, claim fencing, Poppler Docker worker and Compose service reviewed. Evidence: 24 focused tests, typecheck/lint/build and compose config; reviewer Spec PASS and Quality PASS.

Task 4: complete — allowlisted safe processing status/error metadata and ADMIN-only Portuguese UI reviewed. No derivative/viewer/download/storage exposure. Evidence: Web 118 tests, API 123 tests, typecheck/lint/build and compose config; reviewer Spec PASS and Quality PASS.
