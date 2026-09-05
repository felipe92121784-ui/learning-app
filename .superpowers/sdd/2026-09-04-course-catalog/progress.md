# SDD ledger — plan: docs/superpowers/plans/2026-09-04-course-catalog.md

## Pre-flight review

| Scope | Producer | Consumer | Finding |
| --- | --- | --- | --- |
| Task 1 → Task 2 | Course/Module models, validators and transformers | Controller and protected routes | Compatible: route controller consumes the exact types and validators created in Task 1. |
| Task 2 → Task 3 | Course/module HTTP contracts | Web API client and query hooks | Compatible: endpoint paths and payload names match the specification. |
| Task 3 → Task 4 | Queries, forms and module list | Administrative route components | Compatible: Task 4 consumes the public feature exports named by Task 3. |
| Task 1 | Persistence tests and implementation | — | Compatible: relation ordering directly tests `position ASC`. |
| Task 2 | HTTP tests and controller implementation | — | Compatible: test cases cover every endpoint and mutation condition. |
| Task 3 | Feature tests and React implementation | — | Compatible: API and UI contracts are separately testable. |
| Task 4 | Route tests and route/menu implementation | — | Compatible: routes use the inherited admin guard. |

Ruling: the repository has an invalid empty `.git` directory, so the SDD helper scripts cannot determine a Git root and commits/review ranges cannot be produced. Use this plan-scoped ledger, manually created briefs/reports, `git diff` when available, and fresh test evidence instead. Cost if wrong: review cannot use commit ranges, but source-level review and verification remain possible.

## Task 1 — fix round 1

Reviewer findings: course create validator accepts caller-controlled status; `Course.modules` has no deterministic `position ASC` ordering; persistence tests omit multi-module ordering and invalid-contract coverage.

Ruling: remove `status` from the create validator because the specification requires controller-created courses to be `DRAFT`; retain status only for updates. Enforce ordering in the model relation so every future consumer inherits it. Expand only Task 1 contract tests for these invariants. Cost if wrong: a future controller could publish a course at creation or display modules in arbitrary order.

Task 1: complete — persistence/model/transformer/validator contracts reviewed clean after three scoped fix rounds. Verification note: ESLint passed; functional Japa could not start because `uv_interface_addresses` fails in this sandbox; API typecheck retains pre-existing `users.spec.ts:81` response-union error.

## Task 2 — implementation ruling

Ruling: module reordering must use a two-phase transaction (temporary non-colliding positions, then final sequential positions) because direct reassignment can violate the per-course unique `(course_id, position)` constraint during swaps. Also require JSON number inputs without string coercion for `moduleIds`, matching the `number[]` contract. Cost if wrong: module swaps fail at runtime or malformed client payloads become valid IDs.

## Task 2 — fix round 1

Reviewer findings: deletion compaction needs the same two-phase positions; create/reorder/delete need a parent-course row lock within their transactions; malformed textual route IDs need normal validation rather than database cast errors.

Ruling: serialize all position-changing module mutations with `SELECT ... FOR UPDATE` on the parent course in one transaction. Use a temporary offset before final compact positions for deletion. Add a Vine-compatible integer route-parameter validator or controller parsing that returns an API validation response for malformed IDs. Cost if wrong: concurrent mutations and invalid URLs can produce 500 responses.

Task 2: complete — API routes/controller reviewed clean after one fix round. Evidence: course tests 14/14; full functional API tests 33/33; lint passed. Typecheck remains blocked by pre-existing `api/tests/functional/users.spec.ts:81`.

## Task 3 — fix round 1

Reviewer findings: course PATCH response is partial and overwrites cached modules; blank edit descriptions cannot clear stored values; new courses are appended despite a newest-first list contract.

Ruling: distinguish create/update input semantics so edit sends `description: null` when cleared. Preserve detail modules when merging a partial course update response (or invalidate/refetch); prepend successfully created courses in local list cache. Cost if wrong: the detail UI can break after save, admins cannot erase descriptions, and list order contradicts the API contract.

Task 3: complete — feature Web reviewed clean after two fix rounds. Evidence: 24 focused tests, typecheck and lint pass.

Task 4: complete — routes/navigation reviewed clean after one fix round. Evidence: Web tests 89/89, typecheck, lint and build pass.
