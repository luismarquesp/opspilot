import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SqliteConversationStore } from "./conversation-store.js";

test("SqliteConversationStore — create()", async (t) => {
  await t.test("create() returns a string starting with conv-", () => {
    const store = new SqliteConversationStore(":memory:");
    const id = store.create();
    assert.ok(typeof id === "string");
    assert.ok(id.startsWith("conv-"), `Expected id to start with 'conv-', got '${id}'`);
  });

  await t.test("create() generates unique ids", () => {
    const store = new SqliteConversationStore(":memory:");
    const id1 = store.create();
    const id2 = store.create();
    assert.notEqual(id1, id2);
  });
});

test("SqliteConversationStore — append + lastMessages round-trip", async (t) => {
  await t.test("appended messages are retrievable", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    store.append(convId, "user", "Hello");
    store.append(convId, "assistant", "Hi there");

    const messages = store.lastMessages(convId);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[0].content, "Hello");
    assert.equal(messages[0].conversationId, convId);
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].content, "Hi there");
  });

  await t.test("lastMessages returns chronological order (ascending by id)", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    store.append(convId, "user", "First");
    store.append(convId, "assistant", "Second");
    store.append(convId, "user", "Third");

    const messages = store.lastMessages(convId);
    assert.ok(messages[0].id < messages[1].id, "Messages should be in ascending id order");
    assert.ok(messages[1].id < messages[2].id, "Messages should be in ascending id order");
    assert.equal(messages[0].content, "First");
    assert.equal(messages[2].content, "Third");
  });
});

test("SqliteConversationStore — lastMessages respects limit", async (t) => {
  await t.test("insert 15 messages, request 12, get exactly 12 (most recent)", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    for (let i = 1; i <= 15; i++) {
      const role = i % 2 === 1 ? "user" : "assistant";
      store.append(convId, role as "user" | "assistant", `Message ${i}`);
    }

    const messages = store.lastMessages(convId, 12);
    assert.equal(messages.length, 12);
    // Should be the 12 most recent (messages 4..15)
    assert.equal(messages[0].content, "Message 4");
    assert.equal(messages[11].content, "Message 15");
  });

  await t.test("requesting fewer than available returns exact count", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    store.append(convId, "user", "One");
    store.append(convId, "assistant", "Two");
    store.append(convId, "user", "Three");

    const messages = store.lastMessages(convId, 2);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].content, "Two");
    assert.equal(messages[1].content, "Three");
  });

  await t.test("default limit is 12", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    for (let i = 1; i <= 20; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Msg ${i}`);
    }

    const messages = store.lastMessages(convId);
    assert.equal(messages.length, 12);
  });
});

test("SqliteConversationStore — conversation isolation", async (t) => {
  await t.test("messages from conv-A do not appear in lastMessages('conv-B')", () => {
    const store = new SqliteConversationStore(":memory:");
    const convA = store.create();
    const convB = store.create();

    store.append(convA, "user", "Hello from A");
    store.append(convA, "assistant", "Response to A");
    store.append(convB, "user", "Hello from B");

    const msgsA = store.lastMessages(convA);
    const msgsB = store.lastMessages(convB);

    assert.equal(msgsA.length, 2);
    assert.equal(msgsB.length, 1);
    assert.ok(msgsA.every((m) => m.conversationId === convA));
    assert.ok(msgsB.every((m) => m.conversationId === convB));
    assert.equal(msgsB[0].content, "Hello from B");
  });
});

test("SqliteConversationStore — edge cases", async (t) => {
  await t.test("lastMessages on unknown conversationId returns empty array", () => {
    const store = new SqliteConversationStore(":memory:");
    const messages = store.lastMessages("conv-does-not-exist");
    assert.equal(messages.length, 0);
    assert.ok(Array.isArray(messages));
  });

  await t.test("createdAt is a valid Date", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();
    store.append(convId, "user", "test");

    const messages = store.lastMessages(convId);
    assert.ok(messages[0].createdAt instanceof Date);
    assert.ok(!isNaN(messages[0].createdAt.getTime()));
  });
});

test("SqliteConversationStore — durability across restarts (US2)", async (t) => {
  await t.test("messages persist across separate store instances on disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opspilot-durability-"));
    const dbPath = path.join(tmpDir, "test.db");

    let storeA: SqliteConversationStore | undefined;
    let storeB: SqliteConversationStore | undefined;
    try {
      // Instance A: create & append
      storeA = new SqliteConversationStore(dbPath);
      const convId = storeA.create();
      storeA.append(convId, "user", "Durable question");
      storeA.append(convId, "assistant", "Durable answer");
      storeA.close();
      storeA = undefined;

      // Instance B: open same DB file
      storeB = new SqliteConversationStore(dbPath);
      const messages = storeB.lastMessages(convId);

      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, "user");
      assert.equal(messages[0].content, "Durable question");
      assert.equal(messages[1].role, "assistant");
      assert.equal(messages[1].content, "Durable answer");
      assert.equal(messages[0].conversationId, convId);
    } finally {
      storeA?.close();
      storeB?.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test("SqliteConversationStore — conversation_summaries CRUD & Boundary Queries", async (t) => {
  await t.test("getSummary returns null when no summary exists", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();
    assert.equal(store.getSummary(convId), null);
  });

  await t.test("setSummary creates and updates summary with lastSummarizedMessageId", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    store.setSummary(convId, "Initial summary", 8);
    const summary1 = store.getSummary(convId);
    assert.ok(summary1);
    assert.equal(summary1.conversationId, convId);
    assert.equal(summary1.summary, "Initial summary");
    assert.equal(summary1.lastSummarizedMessageId, 8);
    assert.ok(summary1.updatedAt instanceof Date);

    // Upsert update
    store.setSummary(convId, "Updated merged summary", 16);
    const summary2 = store.getSummary(convId);
    assert.ok(summary2);
    assert.equal(summary2.summary, "Updated merged summary");
    assert.equal(summary2.lastSummarizedMessageId, 16);
  });

  await t.test("getEvictedUnsummarizedMessages respects 8-message window and lastSummarizedMessageId boundary", () => {
    const store = new SqliteConversationStore(":memory:");
    const convId = store.create();

    // 0 to 8 messages: none evicted from active window of 8
    for (let i = 1; i <= 8; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Message ${i}`);
    }
    assert.equal(store.getEvictedUnsummarizedMessages(convId, 8).length, 0);

    // Add up to 15 messages: active window is 8..15 (8 messages). Evicted are 1..7 (7 messages).
    for (let i = 9; i <= 15; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Message ${i}`);
    }
    const evicted15 = store.getEvictedUnsummarizedMessages(convId, 8);
    assert.equal(evicted15.length, 7);
    assert.equal(evicted15[0].content, "Message 1");
    assert.equal(evicted15[6].content, "Message 7");

    // Add 16th message: evicted are 1..8 (exactly 8 messages)
    store.append(convId, "assistant", "Message 16");
    const evicted16 = store.getEvictedUnsummarizedMessages(convId, 8);
    assert.equal(evicted16.length, 8);
    assert.equal(evicted16[0].content, "Message 1");
    assert.equal(evicted16[7].content, "Message 8");

    // Advance summary past message 8
    const lastId = evicted16[7].id;
    store.setSummary(convId, "Summary of 1..8", lastId);

    // Now evicted unsummarized messages should be 0 (none between id 8 and active window start id 9)
    assert.equal(store.getEvictedUnsummarizedMessages(convId, 8).length, 0);

    // Add 7 more messages (total 23): evicted since last summary are 9..15 (7 messages)
    for (let i = 17; i <= 23; i++) {
      store.append(convId, i % 2 === 1 ? "user" : "assistant", `Message ${i}`);
    }
    assert.equal(store.getEvictedUnsummarizedMessages(convId, 8).length, 7);

    // Add 24th message: evicted since last summary are 9..16 (8 messages)
    store.append(convId, "assistant", "Message 24");
    const evicted24 = store.getEvictedUnsummarizedMessages(convId, 8);
    assert.equal(evicted24.length, 8);
    assert.equal(evicted24[0].content, "Message 9");
    assert.equal(evicted24[7].content, "Message 16");
  });

  await t.test("isolation between different conversations", () => {
    const store = new SqliteConversationStore(":memory:");
    const convA = store.create();
    const convB = store.create();

    store.setSummary(convA, "Summary A", 8);
    assert.equal(store.getSummary(convB), null);
    assert.equal(store.getSummary(convA)?.summary, "Summary A");
  });
});


