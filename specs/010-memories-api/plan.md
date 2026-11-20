# Implementation Plan: Dedicated Memories REST API Endpoints

**Feature**: `010-memories-api` | **Date**: 2026-10-02 | **Spec**: [spec.md](./spec.md)

---

## 1. Architecture & Design

### MVC Layering
- **Model**: `IMemoryStore` (`src/models/memory.ts`), `SqliteMemoryStore` (`src/memory/memory-store.ts`).
- **Validation Schemas (Border)**: `src/http/schemas.ts` using `zod`.
- **Controller**: `src/http/memory.controller.ts` providing an Express `Router` with routes:
  - `POST /` -> Handler for creating memories via `memoryStore.remember(userId, fact)`
  - `GET /` -> Handler for listing memories via `memoryStore.list(userId)`
  - `GET /recall` -> Handler for vector semantic search via `memoryStore.recall(userId, q, limit)`
  - `DELETE /:id` -> Handler for deleting memories via `memoryStore.forget(userId, id)`
- **Server Registration**: `src/http/server.ts` registers `app.use("/memories", createMemoryRouter(memoryStore))`.

---

## 2. API Contracts & Status Codes

### POST /memories
- Request body: `{ "userId": string, "fact": string }`
- Responses:
  - `201 Created`: `{ "id": number, "userId": string, "fact": string, "stored": true }`
  - `200 OK` (when deduplicated, similarity > 0.92): `{ "id": number, "userId": string, "fact": string, "stored": false, "similarity": number }`
  - `400 Bad Request`: `{ "error": "validation_error", "issues": [...] }`

### GET /memories?userId=<id>
- Query parameters: `userId` (string, required)
- Responses:
  - `200 OK`: `Array<{ "id": number, "userId": string, "fact": string, "createdAt": string }>`
  - `400 Bad Request`: `{ "error": "validation_error", "issues": [...] }`

### GET /memories/recall?userId=<id>&q=<query>&limit=3
- Query parameters: `userId` (required), `q` (required), `limit` (optional, default 3)
- Responses:
  - `200 OK`: `Array<{ "id": number, "fact": string, "score": number }>`
  - `400 Bad Request`: `{ "error": "validation_error", "issues": [...] }`

### DELETE /memories/:id?userId=<id>
- Path parameter: `:id` (number, required)
- Query parameter: `userId` (string, required)
- Responses:
  - `200 OK`: `{ "deleted": true, "id": number, "userId": string }`
  - `404 Not Found`: `{ "error": "memory_not_found" }`
  - `400 Bad Request`: `{ "error": "validation_error", "issues": [...] }`

---

## 3. Test Strategy

- Tests in `src/http/memories.test.ts` using `:memory:` SQLite store and `supertest`.
- Test cases covering all status codes: 201, 200, 204/200, 400, 404.
- Zero network calls; local embedding model via lazy singleton in memory store.
