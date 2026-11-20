import test from "node:test";
import assert from "node:assert/strict";
import { embed, dotProduct } from "./embeddings.js";
import { SqliteMemoryStore } from "./memory-store.js";

test("Embeddings & Vector Math", async (t) => {
  await t.test("embed generates 384-dimensional normalized vector", async () => {
    const vec = await embed("Operações de banco de dados");
    assert.equal(vec.length, 384);

    // Check unit norm: sum(v_i^2) ~= 1.0
    let normSq = 0;
    for (let i = 0; i < vec.length; i++) {
      normSq += vec[i] * vec[i];
    }
    assert.ok(Math.abs(normSq - 1.0) < 1e-4, `Expected unit norm ~1.0, got ${normSq}`);
  });

  await t.test("dotProduct computes exact cosine similarity for identical vectors", async () => {
    const vec = await embed("Sustentação de infraestrutura em nuvem");
    const sim = dotProduct(vec, vec);
    assert.ok(Math.abs(sim - 1.0) < 1e-4, `Expected similarity 1.0, got ${sim}`);
  });
});

test("SqliteMemoryStore — CRUD & Deduplication", async (t) => {
  await t.test("remember stores unique fact and embedding in SQLite (:memory:)", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      const res = await store.remember("user-1", "Responsável pelo serviço de pagamentos");
      assert.equal(res.stored, true);
      assert.ok(res.id > 0);

      const list = await store.list("user-1");
      assert.equal(list.length, 1);
      assert.equal(list[0].fact, "Responsável pelo serviço de pagamentos");
      assert.equal(list[0].userId, "user-1");
    } finally {
      store.close();
    }
  });

  await t.test("remember deduplicates when similarity > 0.92", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      const first = await store.remember("user-1", "I love dogs and puppies");
      assert.equal(first.stored, true);

      // Near identical sentence with minor punctuation/whitespace
      const second = await store.remember("user-1", "I love dogs and puppies!");
      assert.equal(second.stored, false);
      assert.equal(second.id, first.id);
      assert.ok(typeof second.similarity === "number" && second.similarity > 0.92);

      const list = await store.list("user-1");
      assert.equal(list.length, 1, "Should not insert duplicate row");
    } finally {
      store.close();
    }
  });

  await t.test("remember allows distinct facts with similarity <= 0.92", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      const first = await store.remember("user-1", "Atua como engenheiro de confiabilidade de sites (SRE)");
      const second = await store.remember("user-1", "Especialista em frontend React e CSS");

      assert.equal(first.stored, true);
      assert.equal(second.stored, true);
      assert.notEqual(first.id, second.id);

      const list = await store.list("user-1");
      assert.equal(list.length, 2);
    } finally {
      store.close();
    }
  });
});

test("SqliteMemoryStore — Semantic Recall", async (t) => {
  await t.test("recall finds facts with 0 common words (semantic similarity)", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      // Stored fact uses "I love dogs and puppies" and a Kubernetes fact
      await store.remember("user-1", "I love dogs and puppies");
      await store.remember("user-1", "I manage Kubernetes clusters");

      // Query uses "Canines are my favorite pets" - 0 common words, score ~0.80 > 0.3
      const results = await store.recall("user-1", "Canines are my favorite pets", 3, 0.3);

      assert.ok(results.length > 0, "Should recall semantic match without common words");
      assert.equal(results[0].fact, "I love dogs and puppies");
      assert.ok(results[0].score >= 0.3, `Score should be >= 0.3, got ${results[0].score}`);
    } finally {
      store.close();
    }
  });

  await t.test("recall respects top-k limit and filters by minScore", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      await store.remember("user-1", "Banco de dados relacional PostgreSQL");
      await store.remember("user-1", "Banco de dados MySQL clusterizado");
      await store.remember("user-1", "Banco chave-valor Redis em memória");
      await store.remember("user-1", "Cozinhar massas aos finais de semana");

      // Search for database, k = 2
      const top2 = await store.recall("user-1", "Sistemas de gerenciamento de bancos de dados relacionais", 2, 0.3);
      assert.equal(top2.length, 2);
      assert.ok(top2[0].score >= top2[1].score);

      // Search with high minScore (e.g. 0.9) that filters non-exact matches
      const highFilter = await store.recall("user-1", "Astronomia e galáxias distantes", 3, 0.5);
      assert.equal(highFilter.length, 0);
    } finally {
      store.close();
    }
  });
});

test("SqliteMemoryStore — User Isolation & Forget", async (t) => {
  await t.test("User A's memories cannot be recalled by User B", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      await store.remember("user-A", "Segredo operacional confidencial da equipe Alpha");

      const resultsB = await store.recall("user-B", "Segredo confidencial da equipe Alpha");
      assert.equal(resultsB.length, 0);

      const resultsA = await store.recall("user-A", "Segredo confidencial da equipe Alpha");
      assert.equal(resultsA.length, 1);
    } finally {
      store.close();
    }
  });

  await t.test("forget permanently removes memory for user", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      const mem = await store.remember("user-1", "Fato a ser esquecido");
      const listBefore = await store.list("user-1");
      assert.equal(listBefore.length, 1);

      const deleted = await store.forget("user-1", mem.id);
      assert.equal(deleted, true);

      const listAfter = await store.list("user-1");
      assert.equal(listAfter.length, 0);

      const notFound = await store.forget("user-1", mem.id);
      assert.equal(notFound, false);
    } finally {
      store.close();
    }
  });

  await t.test("forget prevents User B from deleting User A's memory", async () => {
    const store = new SqliteMemoryStore(":memory:");
    try {
      const memA = await store.remember("user-A", "Dado intocável do usuário A");

      // User B tries to delete User A's memoryId
      const deleteAttempt = await store.forget("user-B", memA.id);
      assert.equal(deleteAttempt, false);

      // Verify User A still has the memory
      const listA = await store.list("user-A");
      assert.equal(listA.length, 1);
      assert.equal(listA[0].id, memA.id);
    } finally {
      store.close();
    }
  });
});
