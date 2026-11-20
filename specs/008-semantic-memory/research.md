# Research: Semantic Memory Store & Context Recall

**Feature**: `008-semantic-memory` | **Date**: 2026-09-30

---

## 1. Local Embedding Model & Execution

### Decision
Use `@huggingface/transformers` (v3+) with pipeline `"feature-extraction"` and model `"Xenova/all-MiniLM-L6-v2"`. Configure inference options with `{ pooling: "mean", normalize: true }`.

### Rationale
- **Zero API Cost & Offline Resilience**: `all-MiniLM-L6-v2` executes entirely on the local CPU via ONNX Runtime embedded in `@huggingface/transformers`. It requires no external network or API keys once cached.
- **Unit Normalization**: By setting `normalize: true`, output vectors have Euclidean norm $\|v\|_2 = 1.0$. Consequently, cosine similarity simplifies to the standard dot product ($\mathbf{a} \cdot \mathbf{b} = \cos \theta$), which runs in $O(d)$ with zero square-root or division operations during similarity ranking.
- **Dimensionality**: 384 dimensions provide an ideal tradeoff between semantic representation quality and query speed (each vector is only $384 \times 4 = 1536$ bytes).
- **Tested & Verified**: Successfully verified in the Node 22 ESM runtime with shape `[1, 384]`.

### Alternatives Considered
- **OpenAI `text-embedding-3-small`**: Required external API keys, internet connectivity during tests, and incurred per-token cost, violating offline/fast test constraints.
- **Fast-Embed / TensorFlow.js**: Higher install footprint and binary compilation overhead compared to `@huggingface/transformers`.

---

## 2. Singleton Architecture & Lazy Initialization

### Decision
Implement `getEmbeddingPipeline()` as a lazy singleton in `src/memory/embeddings.ts`. Expose a pure helper `embed(text: string): Promise<Float32Array>`.

### Rationale
- Model weights (~80MB) should only be loaded into memory once and only when a memory operation is first performed.
- Subsequent calls to `embed()` reuse the cached pipeline instance, reducing latency to < 20ms per sentence.
- Pure interface: `embed(text)` accepts a string and returns `Float32Array` of length 384.

### Alternatives Considered
- **Instantiating pipeline on module load**: Would slow down CLI commands (like `npm test` or `--help`) that do not use semantic memory.
- **Creating pipeline per request**: Would reload model weights on every request, adding hundreds of milliseconds of overhead.

---

## 3. SQLite Storage & BLOB Serialization

### Decision
Store embeddings in SQLite as a binary `BLOB` column in table `memories`.
- Table DDL:
  ```sql
  CREATE TABLE IF NOT EXISTS memories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,
    fact       TEXT    NOT NULL,
    embedding  BLOB    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_memories_user ON memories (user_id);
  ```
- Serialization: `Buffer.from(floatArray.buffer)` (1536 bytes per row).
- Deserialization: `new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)`.

### Rationale
- `node:sqlite` natively accepts and returns `Uint8Array` / `Buffer` for `BLOB` columns.
- Binary storage is 4x more compact than storing vector numbers as JSON strings and avoids JSON parsing overhead during similarity scans.
- `idx_memories_user` provides fast index-seek for all memories belonging to `user_id`, followed by in-memory dot product ranking.

### Alternatives Considered
- **SQLite vector extensions (`sqlite-vss`, `sqlite-vec`)**: Require external native C/C++ compiled binaries, which break zero-dependency Node.js and cross-platform simplicity.
- **JSON array in TEXT column**: 4x larger database size and severe JSON deserialization penalty during ranking.

---

## 4. Deduplication & Recall Thresholds

### Decision
1. **Deduplication (`remember`)**:
   - Before inserting, retrieve all existing memories for `userId`.
   - Calculate dot product similarity between the new fact's embedding and existing embeddings.
   - If maximum similarity $> 0.92$, skip insertion (or return existing memory ID), preventing redundant facts.
2. **Recall (`recall`)**:
   - Compute embedding of the incoming query / message.
   - For all user memories, compute dot product.
   - Filter candidate memories with score $\ge 0.3$.
   - Sort descending by score and slice top $K$ (default $K = 3$).
3. **Forget (`forget`)**:
   - `DELETE FROM memories WHERE user_id = ? AND id = ?`.

### Rationale
- A threshold of $0.92$ on `all-MiniLM-L6-v2` captures near-verbatim rephrasings and identical facts without false positives.
- A threshold of $0.3$ filters out semantically unrelated facts while retaining relevant facts even when there is zero lexical overlap (synonyms, implied roles).

---

## 5. Integration with `/chat` and Agent Context

### Decision
- Extend `ChatRequestSchema` in `src/http/schemas.ts` with optional `userId: z.string().optional()`.
- In `createChatHandler()`:
  - If `userId` is present, call `memoryStore.recall(userId, message, 3, 0.3)`.
  - If recalled memories $> 0$, format memories as a context block:
    ```text
    [Contexto de Memória do Usuário]
    - <fact 1>
    - <fact 2>
    ```
  - Pass recalled context into the agent's run options or prepend to user input, enabling both `react` and `plan-and-execute` strategies to ground their responses on remembered facts.
  - Return `userId` in response schema if provided.

### Rationale
- Clean separation: HTTP controller dispatches recall, formatting facts into context.
- Backward compatibility: If `userId` is omitted, `/chat` behaves exactly as before with 0 overhead.
