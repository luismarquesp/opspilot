# Tasks: Dedicated Memories REST API Endpoints

**Feature**: 010-memories-api | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Schemas & Validation

- [x] T001 [P] Define `CreateMemorySchema`, `ListMemoriesQuerySchema`, `DeleteMemoryParamsSchema`, `DeleteMemoryQuerySchema`, and `RecallMemoriesQuerySchema` in `src/http/schemas.ts`

---

## Phase 2: Controller & Server Wiring

- [x] T002 [US1,US2,US3,US4] Implement `createMemoryRouter` in `src/http/memory.controller.ts` handling `POST /`, `GET /`, `GET /recall`, and `DELETE /:id`
- [x] T003 Wire `app.use("/memories", createMemoryRouter(...))` in `src/http/server.ts`

---

## Phase 3: Tests (Integration & Edge Cases)

- [x] T004 [US1] Write integration tests in `src/http/memories.test.ts` for `POST /memories`:
  - 201 Created for new fact
  - 200 OK with `stored: false` for duplicate fact (>0.92 similarity)
  - 400 Bad Request for empty/missing userId or fact
- [x] T005 [US2] Write integration tests for `GET /memories`:
  - 200 OK returning array of memories
  - 200 OK returning empty array for unknown user
  - 400 Bad Request if `userId` query parameter is missing
- [x] T006 [US3] Write integration tests for `DELETE /memories/:id`:
  - 200 OK when memory is deleted
  - 404 Not Found when memory does not exist or belongs to another user
  - 400 Bad Request for non-numeric `:id` or missing `userId`
- [x] T007 [US4] Write integration tests for `GET /memories/recall`:
  - 200 OK with matching facts and cosine similarity scores
  - 400 Bad Request if `userId` or `q` is missing

---

## Phase 4: Polish & Verification

- [x] T008 Run `npm run typecheck` and `npm test` to verify clean build and all test suites pass

