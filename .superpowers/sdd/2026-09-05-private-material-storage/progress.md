# SDD ledger — plan: docs/superpowers/plans/2026-09-05-private-material-storage.md

## Pre-flight review

| Scope | Producer | Consumer | Finding |
| --- | --- | --- | --- |
| Task 1 → Task 2 | StorageService, models, settings and transformers | Material/configuration controllers | Compatible: Task 2 consumes named storage methods and domain models. |
| Task 2 → Task 3 | Admin JSON/multipart endpoints | Web clients, query hooks and upload forms | Compatible: endpoint paths and multipart contract align with the design. |
| Task 3 → Task 4 | Material/settings feature exports | Admin settings/course routes | Compatible: routes only compose feature interfaces. |
| Task 1 | S3 SDK, migrations, models and tests | — | Compatible: schema, relation and storage API are scoped to private originals. |
| Task 2 | Controllers/routes and functional tests | — | Compatible: server validates all client-controlled upload values. |
| Task 3 | Feature components and tests | — | Compatible: no route ownership overlap. |
| Task 4 | Routes/navigation and tests | — | Compatible: inherited admin guard applies to settings/material UI. |

Ruling: `.git` remains an invalid empty directory, so SDD scripts cannot create worktrees, ranges or commits. Use this plan-scoped ledger, task briefs and source-level reviews; do not attempt commits. Cost if wrong: review lacks Git diff packaging but uses isolated ownership and fresh verification.

Task 1: complete — MinIO-compatible private bucket provisioning, persistence and settings reviewed after a compatibility fix. Evidence: 10 focused tests including live MinIO, API typecheck and lint.

Task 2: complete — administrative settings/material endpoints, private upload lifecycle and multipart security reviewed. Auto-processing is disabled globally; authorized material uploads are processed only after CSRF, authentication and ADMIN authorization. Evidence: 36 focused tests, 85 full functional tests, API typecheck/lint/build.

Task 3: complete — Web API clients, TanStack Query cache, configurable limits, multipart upload and material edit/delete interfaces reviewed. Evidence: 16 focused feature tests, Web typecheck/lint/build; no object URL, key or download surface introduced.

Task 4: complete — ADMIN settings route, navigation and per-module material integration reviewed. Settings outages do not block course/module administration; uploads surface their own disabled error state. Final evidence: Web 117 tests, API 85 tests, typecheck/lint/build pass in both projects.
