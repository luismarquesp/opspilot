import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { IMemoryStore, MemoryRecord, RecalledMemory, RememberResult } from "../models/memory.js";
import { embed, dotProduct } from "./embeddings.js";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// DB Row shape
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: number;
  user_id: string;
  fact: string;
  embedding: Uint8Array;
  created_at: string;
}

// ---------------------------------------------------------------------------
// SqliteMemoryStore
// ---------------------------------------------------------------------------

export class SqliteMemoryStore implements IMemoryStore {
  readonly #db: DatabaseSync;

  readonly #stmtInsert: StatementSync;
  readonly #stmtListByUser: StatementSync;
  readonly #stmtListSummary: StatementSync;
  readonly #stmtDelete: StatementSync;

  constructor(dbPath: string = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db")) {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.#db = new DatabaseSync(dbPath);
    this.#runDDL();

    this.#stmtInsert = this.#db.prepare(
      `INSERT INTO memories (user_id, fact, embedding, created_at)
       VALUES (?, ?, ?, ?)`
    );

    this.#stmtListByUser = this.#db.prepare(
      `SELECT id, user_id, fact, embedding, created_at
       FROM memories
       WHERE user_id = ?
       ORDER BY id ASC`
    );

    this.#stmtListSummary = this.#db.prepare(
      `SELECT id, user_id, fact, created_at
       FROM memories
       WHERE user_id = ?
       ORDER BY id ASC`
    );

    this.#stmtDelete = this.#db.prepare(
      `DELETE FROM memories
       WHERE user_id = ? AND id = ?`
    );
  }

  #runDDL(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT    NOT NULL,
        fact       TEXT    NOT NULL,
        embedding  BLOB    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user
        ON memories (user_id, id);
    `);
  }

  /**
   * Internal helper to fetch all memories and parse Float32Array embeddings for a user.
   */
  _all(userId: string): MemoryRecord[] {
    const rows = this.#stmtListByUser.all(userId) as unknown as MemoryRow[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fact: row.fact,
      embedding: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Stores a fact for userId. Deduplicates if semantic similarity > 0.92 to any existing fact.
   */
  async remember(userId: string, fact: string): Promise<RememberResult> {
    const trimmed = fact.trim();
    if (!trimmed) {
      throw new Error("Fact cannot be empty");
    }

    const embedding = await embed(trimmed);
    const existingMemories = this._all(userId);

    let highestSim = 0;
    let duplicateId = 0;

    for (const m of existingMemories) {
      const sim = dotProduct(embedding, m.embedding);
      if (sim > highestSim) {
        highestSim = sim;
        duplicateId = m.id;
      }
    }

    if (highestSim > 0.92) {
      return {
        stored: false,
        id: duplicateId,
        similarity: highestSim,
      };
    }

    const createdAt = new Date().toISOString();
    const blobBuffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    const result = this.#stmtInsert.run(userId, trimmed, blobBuffer, createdAt);
    const id = Number(result.lastInsertRowid);

    return {
      stored: true,
      id,
      similarity: highestSim > 0 ? highestSim : undefined,
    };
  }

  /**
   * Recalls top-k memories with minimum score filter (default score >= 0.3).
   */
  async recall(userId: string, query: string, limit = 3, minScore = 0.3): Promise<RecalledMemory[]> {
    const q = await embed(query);
    const all = this._all(userId);

    return all
      .map((mappedUser) => ({
        id: mappedUser.id,
        fact: mappedUser.fact,
        score: dotProduct(q, mappedUser.embedding),
      }))
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Deletes a specific memory for userId.
   */
  async forget(userId: string, memoryId: number): Promise<boolean> {
    const res = this.#stmtDelete.run(userId, memoryId);
    return Number(res.changes) > 0;
  }

  /**
   * Lists summary facts for a user.
   */
  async list(userId: string): Promise<Omit<MemoryRecord, "embedding">[]> {
    const rows = this.#stmtListSummary.all(userId) as unknown as Array<{
      id: number;
      user_id: string;
      fact: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      fact: r.fact,
      createdAt: new Date(r.created_at),
    }));
  }

  close(): void {
    this.#db.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton helper
// ---------------------------------------------------------------------------

let defaultMemoryStore: IMemoryStore | undefined;

export function getDefaultMemoryStore(): IMemoryStore {
  if (!defaultMemoryStore) {
    const isTest = process.env.NODE_ENV === "test" || process.execArgv.includes("--test");
    defaultMemoryStore = new SqliteMemoryStore(isTest ? ":memory:" : undefined);
  }
  return defaultMemoryStore;
}
