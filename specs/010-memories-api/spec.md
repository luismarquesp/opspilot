# Feature Specification: Dedicated Memories REST API Endpoints

**Feature Branch**: `010-memories-api`  
**Created**: 2026-10-02  
**Status**: In Implementation  
**Input**: User request: "crie os endepoints dedicados /memories"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create User Memory (`POST /memories`) (Priority: P1) 🎯 MVP

As an external system or operator, I want to explicitly record an operational fact or preference for a user via `POST /memories`, so that the knowledge is immediately vectorized and stored in semantic memory.

**Why this priority**: Directly solves the user's immediate need (`Invoke-RestMethod -Uri http://localhost:3000/memories -Method POST`) to persist facts without going through natural language chat.

**Independent Test**:
Send `POST /memories` with `{"userId": "u-42", "fact": "prefere os alertas críticos primeiro"}`. Receive HTTP 201 Created with `{ "id": 1, "userId": "u-42", "fact": "prefere os alertas críticos primeiro", "stored": true }`.

**Acceptance Scenarios**:
1. **Given** valid `userId` and `fact`, **When** `POST /memories` is requested, **Then** return HTTP 201 with the persisted memory record metadata (`id`, `userId`, `fact`, `stored`).
2. **Given** duplicate or near-duplicate fact (>0.92 cosine similarity), **When** `POST /memories` is requested, **Then** return HTTP 200 with `{ "stored": false, "id": <existingId>, "similarity": <score> }`.
3. **Given** missing or empty `userId` or `fact`, **When** `POST /memories` is requested, **Then** return HTTP 400 with validation issues.

---

### User Story 2 - List User Memories (`GET /memories`) (Priority: P1)

As an operator, I want to list all stored memories for a user via `GET /memories?userId=u-42`, so that I can inspect learned preferences and operational facts.

**Why this priority**: Necessary for observability, auditing, and debugging what the copilot knows about an operator.

**Independent Test**:
Seed 2 memories for `u-42`. Send `GET /memories?userId=u-42`. Receive HTTP 200 with JSON array containing the 2 facts and their IDs.

**Acceptance Scenarios**:
1. **Given** an existing user with memories, **When** `GET /memories?userId=u-42` is requested, **Then** return HTTP 200 with array of `{ id, userId, fact, createdAt }`.
2. **Given** a user with no memories, **When** `GET /memories?userId=u-unknown` is requested, **Then** return HTTP 200 with empty array `[]`.
3. **Given** missing `userId` query parameter, **When** `GET /memories` is requested, **Then** return HTTP 400 with validation error.

---

### User Story 3 - Delete User Memory (`DELETE /memories/:id`) (Priority: P2)

As an operator, I want to delete a specific memory by its ID via `DELETE /memories/:id?userId=u-42`, so that I can directly revoke obsolete preferences.

**Why this priority**: Provides full REST lifecycle management alongside the natural language `forget_preference` tool.

**Independent Test**:
Store a memory, obtain its ID. Send `DELETE /memories/:id?userId=u-42`. Receive HTTP 200 with `{ "deleted": true, "id": <id>, "userId": "u-42" }`. A subsequent `GET /memories?userId=u-42` no longer includes that memory.

**Acceptance Scenarios**:
1. **Given** an existing memory ID belonging to `userId`, **When** `DELETE /memories/:id?userId=u-42` is called, **Then** remove memory and return HTTP 200 `{ "deleted": true, "id": <id>, "userId": "u-42" }`.
2. **Given** a non-existent ID or ID belonging to another user, **When** deleted, **Then** return HTTP 404 `{ "error": "memory_not_found" }`.
3. **Given** non-numeric ID parameter, **When** requested, **Then** return HTTP 400 with validation error.

---

### User Story 4 - Semantic Recall Query (`GET /memories/recall`) (Priority: P3)

As an operator or system integration, I want to query semantic memory with natural language via `GET /memories/recall?userId=u-42&q=alertas&limit=3`, so that I can test vector retrieval directly without conversational agent overhead.

**Why this priority**: Greatly simplifies debugging vector embedding relevance and similarity scores.

**Independent Test**:
Store "prefere alertas críticos primeiro". Send `GET /memories/recall?userId=u-42&q=notificações urgentes`. Receive HTTP 200 with top matching memory and similarity score.

**Acceptance Scenarios**:
1. **Given** matching memories above relevance threshold (0.3), **When** `GET /memories/recall` is executed, **Then** return HTTP 200 with array of `{ id, fact, score }`.
2. **Given** missing `userId` or query `q`, **When** requested, **Then** return HTTP 400.

---

## Edge Cases

- **Invalid JSON**: Global body parser handles malformed JSON and returns HTTP 400.
- **Whitespace-only facts**: Zod schema trims facts and rejects empty strings with HTTP 400.
- **User Isolation**: A user cannot read or delete memories belonging to a different `userId`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose `POST /memories` accepting `{ userId: string, fact: string }`.
- **FR-002**: System MUST validate `POST /memories` with Zod schema (`userId` min 1, `fact` min 1 trimmed).
- **FR-003**: System MUST call `memoryStore.remember(userId, fact)` and return HTTP 201 (stored) or HTTP 200 (deduplicated).
- **FR-004**: System MUST expose `GET /memories` requiring `userId` query parameter and returning array of memory summaries.
- **FR-005**: System MUST expose `DELETE /memories/:id` requiring numeric `:id` and `userId` query parameter, returning HTTP 200 if deleted or HTTP 404 if not found.
- **FR-006**: System MUST expose `GET /memories/recall` accepting `userId`, `q` (query), and optional `limit` (default 3), returning matched memories with cosine similarity scores.
- **FR-007**: All endpoints MUST translate domain/store operations into standardized HTTP status codes and JSON responses.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `POST /memories` successfully accepts the user's exact command: `{"userId": "u-42", "fact": "prefere os alertas críticos primeiro"}`.
- **SC-002**: 100% of invalid payloads are rejected with HTTP 400 and structured validation errors.
- **SC-003**: All memories endpoints are backed by unit and integration tests with 0 test failures.
- **SC-004**: `npm run typecheck` and `npm test` remain completely green.
