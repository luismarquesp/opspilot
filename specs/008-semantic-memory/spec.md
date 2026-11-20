# Feature Specification: Semantic Memory Store & Context Recall

**Feature Branch**: `008-semantic-memory`  
**Created**: 2026-09-30  
**Status**: Draft  
**Input**: User description: "Memória semântica MemoryStore por userId - remember (dedup > 0.92), recall top-3 produto escalar ( min 0.3), forget; tabela memories, embedding all-MinLM-L6-v2 local em BLOB; /chat ganha userId e injeta o recall no prompt; teste: recall acha fato sem palavra em comum user: @huggingface/transformers com pooling: mean + normaliza: true e lazy singleton src/memory/embeddings.ts e src/memory/memory-store.ts as colunas de memorias (id, user_id, fact, embedding, created_at)"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Personalized Assistance via Semantic Recall (Priority: P1) 🎯 MVP

As an on-call engineer interacting with OpsPilot, I want the assistant to automatically recall relevant operational preferences and facts about my services when I provide my user identity, even if my query uses completely different wording than when the memory was stored, so that I receive contextualized answers without repeating operational context.

**Why this priority**: Core value proposition of semantic memory — bridging lexical gaps through dense vector similarity and injecting contextual facts into agent interactions.

**Independent Test**:
Store a fact for a user (e.g., "O engenheiro é responsável pela sustentação de bancos de dados relacionais"). Submit a `/chat` message with that `userId` expressing the query without common words (e.g., "Quais incidentes de PostgreSQL devo priorizar?"). Verify that the recalled fact is retrieved and referenced in the agent's context.

**Acceptance Scenarios**:
1. **Given** a user with stored operational facts, **When** submitting a `/chat` request with `userId` and a semantically relevant message, **Then** the system retrieves up to the top 3 most relevant memories with similarity score ≥ 0.3 and injects them into the prompt.
2. **Given** a user query with zero word overlap with a stored memory but high semantic similarity, **When** recall is executed, **Then** the memory is successfully retrieved above the minimum threshold.
3. **Given** a `/chat` request without `userId`, **When** processed, **Then** memory recall is bypassed and existing multi-turn chat behavior functions normally.

---

### User Story 2 - Deduplicated Memory Acquisition (Priority: P2)

As an on-call engineer, I want OpsPilot to store relevant operational facts while automatically deduplicating redundant or near-identical statements, so that the memory store does not accumulate repeated knowledge.

**Why this priority**: Prevents context bloating and memory degradation by maintaining a clean, high-signal knowledge base per user.

**Independent Test**:
Call `remember()` with an operational fact. Call `remember()` again with a near-identical rephrasing (cosine similarity > 0.92). Verify that no duplicate row is added and the existing fact is preserved.

**Acceptance Scenarios**:
1. **Given** an existing memory in the store, **When** storing a new fact with semantic similarity > 0.92 to an existing fact for the same user, **Then** the system skips inserting a duplicate entry.
2. **Given** a new fact with similarity ≤ 0.92 to all existing facts for that user, **When** `remember()` is invoked, **Then** the fact and its embedding are persisted in the database.
3. **Given** identical facts stored for two different users, **When** stored, **Then** both users maintain their respective memories independently with strict isolation.

---

### User Story 3 - Selective Memory Deletion (Forget) (Priority: P3)

As an on-call engineer, I want to remove outdated or invalid operational facts from my profile, so that the assistant stops using obsolete assumptions in subsequent troubleshooting sessions.

**Why this priority**: Ensures compliance, correctness, and allows operators to invalidate outdated architectural or team preferences.

**Independent Test**:
Store a memory for a user, verify it is recalled, call `forget(userId, memoryId)`, and verify subsequent queries no longer recall that memory.

**Acceptance Scenarios**:
1. **Given** an existing memory belonging to `userId`, **When** `forget(userId, memoryId)` is executed, **Then** the memory record is permanently removed from the store.
2. **Given** a memory belonging to User A, **When** User B attempts to delete that `memoryId`, **Then** the operation leaves User A's memory intact (cross-user isolation).

---

### Edge Cases

- **Cold Start / No Relevant Memories**: When a user has memories stored but the query has no semantic match above 0.3, `recall()` returns an empty list and no memories are injected into the prompt.
- **Empty / Blank Facts**: Attempting to store an empty or whitespace-only fact is rejected with a validation error.
- **Large Knowledge Bases**: When a user has dozens of memories, `recall` ranks all memories by similarity and returns strictly the top 3 with scores above 0.3.
- **Multiple Users Isolation**: Memories stored by User A are never retrievable or visible to User B, even for identical semantic queries.
- **Local Embedding Computation Failure**: If embedding generation encounters an internal runtime error, it raises a domain error without corrupting database integrity.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist user memories in a `memories` table with columns: `id`, `user_id`, `fact`, `embedding`, and `created_at`.
- **FR-002**: System MUST store embeddings as compact binary data (BLOB) representing normalized 384-dimensional float vectors generated by `all-MiniLM-L6-v2`.
- **FR-003**: System MUST provide a `remember(userId, fact)` operation that generates the embedding, checks for duplicate facts for the same user with similarity > 0.92, and persists new unique facts.
- **FR-004**: System MUST provide a `recall(userId, query, limit, minScore)` operation that computes the query embedding, calculates dot product similarity against all memories of `userId`, filters by `minScore` (default 0.3), and returns up to `limit` (default 3) top matches ordered by descending similarity score.
- **FR-005**: System MUST provide a `forget(userId, memoryId)` operation that deletes the specified memory for that user.
- **FR-006**: System MUST generate embeddings locally using `@huggingface/transformers` with mean pooling (`pooling: "mean"`) and normalization enabled (`normalize: true`).
- **FR-007**: Embedding pipeline MUST be instantiated as a lazy singleton, loading model weights on first use and reusing the pipeline instance for subsequent operations.
- **FR-008**: HTTP endpoint `POST /chat` MUST accept an optional `userId` string field in `ChatRequestSchema`.
- **FR-009**: When `userId` is present in a `/chat` request, the chat controller MUST invoke `recall(userId, message)` and inject the recalled facts into the agent's context.
- **FR-010**: All user memories MUST be strictly partitioned by `userId`, preventing cross-tenant memory leakage in both `recall` and `forget`.

---

### Key Entities *(include if feature involves data)*

- **Memory**:
  - `id`: Unique integer or string identifier for the memory record.
  - `userId`: Identifier of the user or operator who owns the memory.
  - `fact`: The textual description of the learned preference, rule, or operational fact.
  - `embedding`: 384-dimensional vector stored as binary BLOB (Float32Array).
  - `createdAt`: Timestamp when the memory was recorded.

- **RecalledMemory**:
  - `id`: Memory identifier.
  - `fact`: Textual statement.
  - `score`: Similarity score (dot product between query and fact embeddings, range 0.0 to 1.0).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Semantic recall retrieves relevant memories across vocabulary shifts with 0 common keywords (e.g. synonym or conceptual match) with similarity score above 0.3.
- **SC-002**: Near-duplicate facts with semantic similarity > 0.92 are suppressed, maintaining 100% deduplication of equivalent statements.
- **SC-003**: Local embedding generation and memory scoring for up to 100 user memories executes in under 150ms on standard developer hardware.
- **SC-004**: 100% of memory records maintain strict `userId` isolation with zero cross-user memory leakage.
- **SC-005**: All existing `/chat` multi-turn and operational test suites remain 100% green without regression when `userId` is omitted.

---

## Assumptions

- Embedding model `all-MiniLM-L6-v2` runs locally in the Node.js runtime without external API keys or remote network calls once weights are downloaded/cached.
- Dot product on unit-normalized vectors (`normalize: true`) is mathematically equivalent to cosine similarity, enabling efficient dot product scoring.
- In-memory/SQLite dot-product ranking is performant for operational user profile sizes (typically 10 to 500 facts per operator).
- Initial memory population (`remember`) can be invoked programmatically via `MemoryStore` API and integration test fixtures, with future capabilities for agent self-learning tools.
- When `userId` is omitted in `/chat`, the conversation behaves as anonymous/ephemeral without semantic memory injection.
