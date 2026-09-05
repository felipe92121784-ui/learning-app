# SDD ledger — plan: docs/superpowers/plans/2026-09-02-authentication.md

Ruling: Execute in the current workspace without worktree, commits, or diff packages — root `.git` is empty/read-only and Git commands fail. Cost if wrong: changes cannot be isolated or committed until Git metadata is repaired.

## Pre-flight scan

| Tasks/interfaces checked | Finding | Ruling |
| --- | --- | --- |
| Task 1 user fields vs Task 2 login | Task 2 depends on role/status introduced by Task 1. | Execute sequentially; Task 2 consumes exact uppercase values. |
| Task 2 API payload vs Task 3 Web types | Profile currently returns bare user but login wrapper is specified. | Normalize both to `{ user }` in Task 2 for a single Web contract. |
| Task 1 seed vs Task 4 smoke | Seed requires `ADMIN_*` but examples cannot contain credentials. | Task 4 supplies values only through local command environment; no secrets are written. |
| Task 3 guards vs API authorization | Web guards are navigation controls only. | Keep domain authorization out of scope; API session validates identity only. |

Task 1: complete (no commits — invalid Git metadata; review clean)

Task 2: fix round 1/5 (retired token signup controller removed)
Task 2: complete (no commits — invalid Git metadata; review clean after fix)

Task 3: complete (no commits — invalid Git metadata; review clean)
