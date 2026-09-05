# Task 2 brief — API administrativa de configurações e materiais

Read the binding storage design and Task 2 from the plan. Task 1 is complete: use existing `StorageService`, `Material`, `UploadSetting` and transformers.

## Ownership

Own API controllers, validators, routes and `api/tests/functional/materials.spec.ts` only. No Web. Do not alter the storage provider/migrations except to resolve an unavoidable integration defect. Preserve other edits; no subagents.

## Requirements

- Implement admin+CSRF-protected GET/PATCH upload settings and nested module materials list/POST multipart/PATCH/DELETE.
- PDFs, images and ZIP only. Validate magic/MIME and extension combination, configured bytes before storage, title 2–160, optional description max 2000.
- Server generates random `originals/<uuid>`; initial material is PROCESSING, assigned final module position, and never serializes storage key or any URL.
- Ensure bucket before write. Compensate storage object if DB creation fails. Storage failure produces generic failure/no material. Delete object then metadata, proceeding with metadata delete when object missing; compact positions.
- Add test-first full functional coverage: valid file categories, limit/mismatch rejection, admin/student/guest, no sensitive fields, settings validation, module ownership, failure/compensation and CSRF.

## Report

Run focus/full API tests/typecheck/lint/build. Write `.superpowers/sdd/2026-09-05-private-material-storage/task-2-report.md`; return short status/test summary/concerns.
