# Final fix brief — Course Catalog

Read final findings in `.superpowers/sdd/2026-09-04-course-catalog/final-review-brief.md` and the reviewer result in the conversation is summarized below. This is one final corrective task. Do not spawn agents. You are not alone: preserve unrelated edits.

## Ownership

You may modify only the files needed for the fixes below: `api/config/shield.ts`, API course controller/models/tests, `web/src/lib/api-client.ts` and its tests, `web/src/features/courses/courses-types.ts`, course route component/tests, and exact existing tests affected by CSRF. Do not redesign authentication or add dependencies.

## Required fixes

1. Enable Adonis Shield CSRF with the XSRF cookie. The SPA client must read `XSRF-TOKEN` and send it as `x-xsrf-token` for unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`), while preserving HTTP-only sessions. Ensure login itself works: it needs the XSRF cookie established from the prior GET profile/request, or scope exceptions only if a documented explicit bootstrap endpoint is provided. Prefer standards supported by current Shield code: XSRF encrypted cookie + `x-xsrf-token` header.
2. Add meaningful CSRF tests for protected course mutation (missing token rejected; valid token accepted), without weakening existing auth tests.
3. Route identifiers must cap at PostgreSQL integer max `2_147_483_647`, returning 422 above it.
4. Raw module position update queries must set `updated_at` to the current timestamp for changed records.
5. Split module create/update/delete/reorder errors by action in course detail UI and reset appropriate mutation errors when opening/closing modal state.
6. Web `updatedAt` types must allow null to match API persistence.
7. Course list ordering must have `id DESC` tie breaker after `created_at DESC`.
8. Add focused regression tests for unauthenticated course access, course/module persisted null-description clearing, ID above integer max, and at least one create/delete/reorder structural interleaving or clearly test lock/order invariant at API level.

Use test-first for each behavior. Run focused tests and full relevant API/Web verification. Write detailed report `.superpowers/sdd/2026-09-04-course-catalog/final-fix-report.md`, including any unavoidable CSRF bootstrap decision and exact results. Return only status, one-line tests and concerns.
