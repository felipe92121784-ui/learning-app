# Task 4 brief — Admin route and course integration

## Ownership

Only modify or create the following route/navigation/generated-tree/test files.
Task 3 feature components and hooks are complete; consume them, do not rewrite
or revert their implementation.

- Create `web/src/routes/_admin/admin/settings.tsx`
- Modify `web/src/routes/_admin/admin/courses/$courseId.tsx`
- Modify `web/src/features/layout/admin-navigation.ts`
- Regenerate/modify `web/src/routeTree.gen.ts` only through the repository
  generation command if needed
- Modify `web/src/routes/_admin/admin/courses/-courses-routes.test.tsx`
- Create `web/src/routes/_admin/admin/-settings.test.tsx`

## Contract

Read approved spec/plan Task 4 and inspect the Task 3 exports. Everything is
admin-only through the existing `/_admin` route guard; do not add a student
route, navigation link, request, download link, viewer, URL or binary surface.

1. Add the `Configurações` menu item (`/admin/settings`) with the lucide
   `Settings` icon, after Cursos.
2. The settings route preloads `uploadSettingsQueryOptions()` and renders a
   full-width shadcn Card containing `UploadSettingsForm`. Include loading and
   error UI consistent with existing routes.
3. In the course detail, retain all current course/module operations. Add a
   clear materials section associated with every rendered module (or a
   per-module dialog/sheet launched from each module), using
   `useMaterialsQuery(module.id)`, `MaterialUploadForm`, and `MaterialsList`.
   Upload must be selectable for the particular module. Get settings via
   `useUploadSettingsQuery`; show appropriate loading/error/disabled state if
   unavailable. Do not fetch/render any material from student layouts.
4. Use existing shadcn primitives only. Keep current full-width main layout;
   no arbitrary constraining max-width.
5. Write route tests: settings preloading/navigation/admin guard; course detail
   exposes material upload/list for a selected module; no student exposure.
   Update request mocks to handle settings/material endpoints precisely.
6. Ensure generated route tree is current and run:
   `cd web && npm test && npm run typecheck && npm run lint && npm run build`
   Then API final verification will be performed by the coordinator.

Report exact changes and results in
`.superpowers/sdd/2026-09-05-private-material-storage/task-4-report.md`.
