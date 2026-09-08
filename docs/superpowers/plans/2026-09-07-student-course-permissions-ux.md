# Student Course Permissions UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Move course assignment and hierarchical access configuration to a clear modal launched from the student list.

**Architecture:** A direct course rule establishes the association. Removing a course removes every direct rule for that user inside the course subtree. The Web modal lists assigned courses, supports adding/removing, and configures exclusive None/Read/Full states at course/module/material levels.

**Spec:** Approved in chat on 2026-09-07.

## Task 1: Backend association lifecycle
- Add tests first for listing direct course assignments, creating the initial rule pair, and removal that deletes direct course/module/material rules only within the selected course.
- Add an authenticated admin endpoint/service with atomic deletion.
- Preserve unrelated course rules and existing access-control behavior.

## Task 2: Permission UI primitives and API queries
- Expand the tested CoursePermission mapping into accessible exclusive toggle controls.
- Add typed API/query helpers for assignment lifecycle and invalidation.
- Reuse existing course/access-rule data and never rely on UI for authorization.

## Task 3: Student-list modal
- Add Courses and permissions action to each student.
- Implement assigned-course list, searchable add flow, remove confirmation, expandable tree, inherited state and direct exceptions.
- Test addition, removal, exclusive permission controls and safe loading/error states.

## Task 4: Verification
- Run focused API/Web tests, typecheck and lint; review task diffs.

