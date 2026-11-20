// ---------------------------------------------------------------------------
// Semantic Memory domain types & store interface
// ---------------------------------------------------------------------------

export interface MemoryRecord {
  id: number;
  userId: string;
  fact: string;
  embedding: Float32Array;
  createdAt: Date;
}

export interface RecalledMemory {
  id: number;
  fact: string;
  score: number;
}

export interface RememberResult {
  stored: boolean;
  id: number;
  similarity?: number;
}

export interface IMemoryStore {
  /**
   * Persists a fact for the user.
   * Computes embedding and deduplicates if any existing fact has similarity > 0.92.
   */
  remember(userId: string, fact: string): Promise<RememberResult>;

  /**
   * Recalls the top-K facts for the user matching query similarity >= minScore.
   * @default limit 3
   * @default minScore 0.3
   */
  recall(userId: string, query: string, limit?: number, minScore?: number): Promise<RecalledMemory[]>;

  /**
   * Deletes a memory record for the specified user.
   * @returns true if deleted, false if not found or unauthorized
   */
  forget(userId: string, memoryId: number): Promise<boolean>;

  /**
   * Lists all stored memories for a user (without embedding vector).
   */
  list(userId: string): Promise<Omit<MemoryRecord, "embedding">[]>;

  /**
   * Closes database connection (if applicable).
   */
  close?(): void;
}
