import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./server.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";

test("POST /memories Integration Tests (US1)", async (t) => {
  await t.test("creates memory and returns HTTP 201 with stored: true", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });
      const res = await request(app)
        .post("/memories")
        .send({
          userId: "u-42",
          fact: "prefere os alertas críticos primeiro",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.userId, "u-42");
      assert.equal(res.body.fact, "prefere os alertas críticos primeiro");
      assert.equal(res.body.stored, true);
      assert.ok(typeof res.body.id === "number");

      // Verify directly in store
      const list = await memoryStore.list("u-42");
      assert.equal(list.length, 1);
      assert.equal(list[0].fact, "prefere os alertas críticos primeiro");
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 200 with stored: false when duplicating an existing fact", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });
      // First insert
      await request(app)
        .post("/memories")
        .send({
          userId: "u-42",
          fact: "prefere os alertas críticos primeiro",
        });

      // Second identical insert
      const res = await request(app)
        .post("/memories")
        .send({
          userId: "u-42",
          fact: "prefere os alertas críticos primeiro",
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.userId, "u-42");
      assert.equal(res.body.stored, false);
      assert.ok(res.body.similarity > 0.92);

      // Verify no duplicate in store
      const list = await memoryStore.list("u-42");
      assert.equal(list.length, 1);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 400 for missing fact or missing userId", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });

      const res1 = await request(app).post("/memories").send({ userId: "u-42" });
      assert.equal(res1.status, 400);
      assert.equal(res1.body.error, "validation_error");

      const res2 = await request(app).post("/memories").send({ fact: "algo" });
      assert.equal(res2.status, 400);
      assert.equal(res2.body.error, "validation_error");

      const res3 = await request(app).post("/memories").send({ userId: "   ", fact: "algo" });
      assert.equal(res3.status, 400);
      assert.equal(res3.body.error, "validation_error");
    } finally {
      memoryStore.close();
    }
  });
});

test("GET /memories Integration Tests (US2)", async (t) => {
  await t.test("returns array of memories for user", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      await memoryStore.remember("u-42", "Fato 1");
      await memoryStore.remember("u-42", "Fato 2");
      const app = createApp({ memoryStore });

      const res = await request(app).get("/memories?userId=u-42");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 2);
      assert.equal(res.body[0].fact, "Fato 1");
      assert.equal(res.body[1].fact, "Fato 2");
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns empty array for user with no memories", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });
      const res = await request(app).get("/memories?userId=u-unknown");
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 400 when userId query parameter is missing", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });
      const res = await request(app).get("/memories");
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "validation_error");
    } finally {
      memoryStore.close();
    }
  });
});

test("DELETE /memories/:id Integration Tests (US3)", async (t) => {
  await t.test("deletes memory and returns HTTP 200", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const stored = await memoryStore.remember("u-42", "Fato para deletar");
      const app = createApp({ memoryStore });

      const res = await request(app).delete(`/memories/${stored.id}?userId=u-42`);
      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, true);
      assert.equal(res.body.id, stored.id);
      assert.equal(res.body.userId, "u-42");

      const remaining = await memoryStore.list("u-42");
      assert.equal(remaining.length, 0);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 404 when memory does not exist or belongs to another user", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const stored = await memoryStore.remember("u-alice", "Fato da Alice");
      const app = createApp({ memoryStore });

      // u-bob trying to delete Alice's memory
      const res1 = await request(app).delete(`/memories/${stored.id}?userId=u-bob`);
      assert.equal(res1.status, 404);
      assert.equal(res1.body.error, "memory_not_found");

      // Non-existent id
      const res2 = await request(app).delete("/memories/99999?userId=u-alice");
      assert.equal(res2.status, 404);
      assert.equal(res2.body.error, "memory_not_found");
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 400 for invalid id or missing userId", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });

      const res1 = await request(app).delete("/memories/abc?userId=u-42");
      assert.equal(res1.status, 400);

      const res2 = await request(app).delete("/memories/1");
      assert.equal(res2.status, 400);
    } finally {
      memoryStore.close();
    }
  });
});

test("GET /memories/recall Integration Tests (US4)", async (t) => {
  await t.test("returns relevant memories with similarity score", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      await memoryStore.remember("u-42", "Gosto muito de cachorros e filhotes");
      const app = createApp({ memoryStore });

      const res = await request(app).get("/memories/recall?userId=u-42&q=caninos");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.equal(res.body.length, 1);
      assert.equal(res.body[0].fact, "Gosto muito de cachorros e filhotes");
      assert.ok(typeof res.body[0].score === "number");
      assert.ok(res.body[0].score >= 0.3);
    } finally {
      memoryStore.close();
    }
  });

  await t.test("returns HTTP 400 if q or userId is missing", async () => {
    const memoryStore = new SqliteMemoryStore(":memory:");
    try {
      const app = createApp({ memoryStore });

      const res1 = await request(app).get("/memories/recall?userId=u-42");
      assert.equal(res1.status, 400);

      const res2 = await request(app).get("/memories/recall?q=teste");
      assert.equal(res2.status, 400);
    } finally {
      memoryStore.close();
    }
  });
});
