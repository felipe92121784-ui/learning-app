# Task 3 brief — Web features for upload settings and materials

## Ownership

Create only these feature files and their adjacent tests. Do not edit routes,
navigation, `routeTree.gen.ts`, or API code; Task 4 composes these exports.

- `web/src/features/materials/materials-types.ts`
- `web/src/features/materials/materials-api.ts`
- `web/src/features/materials/materials-queries.ts`
- `web/src/features/materials/material-upload-form.tsx`
- `web/src/features/materials/materials-list.tsx`
- their `*.test.ts` / `*.test.tsx` files
- `web/src/features/settings/upload-settings-api.ts`
- `web/src/features/settings/upload-settings-queries.ts`
- `web/src/features/settings/upload-settings-form.tsx`
- their `*.test.ts` / `*.test.tsx` files

## Contract

Read the approved design and plan:

- `docs/superpowers/specs/2026-09-05-private-material-storage-design.md`
- `docs/superpowers/plans/2026-09-05-private-material-storage.md` (Task 3)

API endpoints are already implemented:

- `GET /upload-settings`
- `PATCH /upload-settings/:type` JSON `{ maxSizeMb: number }`
- `GET /modules/:moduleId/materials`
- `POST /modules/:moduleId/materials` multipart `title`, optional `description`, `file`
- `PATCH /modules/:moduleId/materials/:id` JSON title/description
- `DELETE /modules/:moduleId/materials/:id`

All endpoint responses are `{ data: ... }`. Material exposes only safe metadata
(id, moduleId, title, optional description, type, originalFilename, mimeType,
size, position, processingStatus, timestamps). Never invent, render, or expect
a storage key, object URL, download link, viewer link, signed URL, binary, or
secret.

## Implementation requirements

1. Follow the established feature patterns in `courses-*` and `users-*`.
   Use TanStack Query query options, stable keys, invalidation after mutations,
   and existing `apiClient`.
2. Send JSON with `Content-Type: application/json`. For FormData call
   `apiClient` with `{ method: 'POST', body: formData }`; it already adds the
   XSRF header for unsafe methods. Never manually set `Content-Type` for
   multipart.
3. Build all UI solely from existing shadcn primitives. Forms need accessible
   labels, inline validation/error states and disabled pending submit controls.
4. Types supported now are exactly PDF, IMAGE and ZIP. Map them for users as
   PDF, Imagem and ZIP. Use API settings (1–1024 MB) for selected-file client
   validation; server validation remains authoritative. The upload form takes
   `moduleId`, settings and a success callback.
5. Show filename, friendly type, formatted size and `PROCESSING` state.
   Provide an explicit shadcn confirmation dialog before delete. Editing title
   and optional description may be implemented through an accessible form/dialog
   contained in the feature, with query mutation support.
6. Write tests first for API serialization, multipart body/no manual header,
   query invalidation, setting form mutation and upload/delete UI behaviour.
   Adapt to the repository's Vitest/Testing Library conventions.
7. Verify with:
   `cd web && npm test -- src/features/materials src/features/settings --reporter=dot && npm run typecheck && npm run lint && npm run build`

Report changed files and exact results in
`.superpowers/sdd/2026-09-05-private-material-storage/task-3-report.md`.
