import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { ConversationMessage, ConversationSummary, IConversationStore } from "../models/conversation.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Row shape returned by DatabaseSync
// ---------------------------------------------------------------------------

interface MessageRow {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface SummaryRow {
  conversation_id: string;
  summary: string;
  last_summarized_message_id: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Mappers: DB rows → domain records
// ---------------------------------------------------------------------------

function toConversationMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as ConversationMessage["role"],
    content: row.content,
    createdAt: new Date(row.created_at),
  };
}

function toConversationSummary(row: SummaryRow): ConversationSummary {
  return {
    conversationId: row.conversation_id,
    summary: row.summary,
    lastSummarizedMessageId: row.last_summarized_message_id,
    updatedAt: new Date(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// SqliteConversationStore
// ---------------------------------------------------------------------------

export class SqliteConversationStore implements IConversationStore {
  readonly #db: DatabaseSync;

  readonly #stmtAppend: StatementSync;
  readonly #stmtLastMessages: StatementSync;
  readonly #stmtGetSummary: StatementSync;
  readonly #stmtSetSummary: StatementSync;
  readonly #stmtEvictedUnsummarized: StatementSync;

  constructor(dbPath: string = process.env.OPSPILOT_DB ?? path.resolve(process.cwd(), "data/opspilot.db")) {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("PRAGMA busy_timeout = 5000;");
    this.#runDDL();

    this.#stmtAppend = this.#db.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?)`
    );

    this.#stmtLastMessages = this.#db.prepare(
      `SELECT * FROM (
         SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY id DESC
         LIMIT ?
       ) sub
       ORDER BY id ASC`
    );

    this.#stmtGetSummary = this.#db.prepare(
      `SELECT conversation_id, summary, last_summarized_message_id, updated_at
       FROM conversation_summaries
       WHERE conversation_id = ?`
    );

    this.#stmtSetSummary = this.#db.prepare(
      `INSERT INTO conversation_summaries (conversation_id, summary, last_summarized_message_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET
         summary = excluded.summary,
         last_summarized_message_id = excluded.last_summarized_message_id,
         updated_at = excluded.updated_at`
    );

    this.#stmtEvictedUnsummarized = this.#db.prepare(
      `WITH active_window AS (
         SELECT id FROM messages
         WHERE conversation_id = ?
         ORDER BY id DESC
         LIMIT ?
       )
       SELECT * FROM messages
       WHERE conversation_id = ?
         AND id > ?
         AND id < (SELECT MIN(id) FROM active_window)
       ORDER BY id ASC`
    );
  }

  // -------------------------------------------------------------------------
  // DDL — idempotent
  // -------------------------------------------------------------------------

  #runDDL(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT    NOT NULL,
        role            TEXT    NOT NULL CHECK(role IN ('user','assistant')),
        content         TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages (conversation_id, id);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id             TEXT    PRIMARY KEY,
        summary                     TEXT    NOT NULL,
        last_summarized_message_id  INTEGER NOT NULL,
        updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  create(): string {
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(2).toString("hex");
    return `conv-${ts}-${rand}`;
  }

  append(conversationId: string, role: "user" | "assistant", content: string): void {
    const createdAt = new Date().toISOString();
    this.#stmtAppend.run(conversationId, role, content, createdAt);
  }

  lastMessages(conversationId: string, limit: number = 12): ConversationMessage[] {
    return (this.#stmtLastMessages.all(conversationId, limit) as unknown as MessageRow[])
      .map(toConversationMessage);
  }

  getSummary(conversationId: string): ConversationSummary | null {
    const row = this.#stmtGetSummary.get(conversationId) as unknown as SummaryRow | undefined;
    if (!row) {
      return null;
    }
    return toConversationSummary(row);
  }

  setSummary(conversationId: string, summary: string, lastSummarizedMessageId: number): void {
    const updatedAt = new Date().toISOString();
    this.#stmtSetSummary.run(conversationId, summary, lastSummarizedMessageId, updatedAt);
  }

  getEvictedUnsummarizedMessages(conversationId: string, windowSize: number = 8): ConversationMessage[] {
    const currentSummary = this.getSummary(conversationId);
    const lastSummarizedId = currentSummary?.lastSummarizedMessageId ?? 0;
    return (
      this.#stmtEvictedUnsummarized.all(
        conversationId,
        windowSize,
        conversationId,
        lastSummarizedId
      ) as unknown as MessageRow[]
    ).map(toConversationMessage);
  }

  close(): void {
    this.#db.close();
  }
}
