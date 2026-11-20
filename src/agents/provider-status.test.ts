import test from "node:test";
import assert from "node:assert/strict";
import { checkProviderStatus, type Fetcher } from "./provider-status.js";

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

function makeOkFetch(body: unknown, status = 200): Fetcher {
  return async (_url, _init) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function makeErrorFetch(error: Error): Fetcher {
  return async () => {
    throw error;
  };
}

function makeSequenceFetch(responses: Array<() => Promise<Response>>): Fetcher {
  let call = 0;
  return async () => {
    const fn = responses[call++];
    if (!fn) throw new Error("Unexpected extra call to fetch");
    return fn();
  };
}

// Valid statuspage.io body
const OPERATIONAL_BODY = {
  status: { indicator: "none", description: "All Systems Operational" },
};

const MAJOR_BODY = {
  status: { indicator: "major", description: "Major Service Outage" },
};

// ---------------------------------------------------------------------------
// US1 — Happy Path
// ---------------------------------------------------------------------------

test("checkProviderStatus — Happy Path (US1)", async (t) => {
  await t.test("github: operational → compact string", async () => {
    const result = await checkProviderStatus("github", makeOkFetch(OPERATIONAL_BODY));
    assert.equal(result, "github está none — All Systems Operational");
  });

  await t.test("cloudflare: major outage → compact string", async () => {
    const result = await checkProviderStatus("cloudflare", makeOkFetch(MAJOR_BODY));
    assert.equal(result, "cloudflare está major — Major Service Outage");
  });

  await t.test("github: minor degradation → compact string", async () => {
    const body = { status: { indicator: "minor", description: "Minor Service Degradation" } };
    const result = await checkProviderStatus("github", makeOkFetch(body));
    assert.equal(result, "github está minor — Minor Service Degradation");
  });
});

// ---------------------------------------------------------------------------
// US2 — Retry Behaviour
// ---------------------------------------------------------------------------

test("checkProviderStatus — Retry Behaviour (US2)", async (t) => {
  await t.test("timeout on attempt 1, success on attempt 2 → compact result", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const fetcher = makeSequenceFetch([
      async () => { throw abortError; },
      async () => new Response(JSON.stringify(OPERATIONAL_BODY), { status: 200 }),
    ]);

    const result = await checkProviderStatus("github", fetcher);
    assert.equal(result, "github está none — All Systems Operational");
  });

  await t.test("double timeout → readable error string, does not throw", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    const result = await checkProviderStatus("github", makeErrorFetch(abortError));
    assert.ok(typeof result === "string");
    assert.match(result, /github/i);
    assert.match(result, /alertas internos|plantonista/i);
  });

  await t.test("HTTP 503 on attempt 1, success on attempt 2 → compact result", async () => {
    const fetcher = makeSequenceFetch([
      async () => new Response("Service Unavailable", { status: 503 }),
      async () => new Response(JSON.stringify(OPERATIONAL_BODY), { status: 200 }),
    ]);

    const result = await checkProviderStatus("github", fetcher);
    assert.equal(result, "github está none — All Systems Operational");
  });

  await t.test("double HTTP 503 → readable error string", async () => {
    const fetcher = makeSequenceFetch([
      async () => new Response("", { status: 503 }),
      async () => new Response("", { status: 503 }),
    ]);

    const result = await checkProviderStatus("cloudflare", fetcher);
    assert.ok(typeof result === "string");
    assert.match(result, /cloudflare/i);
    assert.match(result, /alertas internos|plantonista/i);
  });

  await t.test("fetch called exactly twice on double failure", async () => {
    let callCount = 0;
    const fetcher: Fetcher = async () => {
      callCount++;
      throw new Error("network error");
    };

    await checkProviderStatus("github", fetcher);
    assert.equal(callCount, 2);
  });

  await t.test("fetch called exactly once on 404 (non-retriable)", async () => {
    let callCount = 0;
    const fetcher: Fetcher = async () => {
      callCount++;
      return new Response("Not Found", { status: 404 });
    };

    await checkProviderStatus("github", fetcher);
    assert.equal(callCount, 1);
  });
});

// ---------------------------------------------------------------------------
// US3 — Error Containment & Validation
// ---------------------------------------------------------------------------

test("checkProviderStatus — Error Containment & Validation (US3)", async (t) => {
  await t.test("Zod validation failure (empty object) → readable error, does not throw", async () => {
    const result = await checkProviderStatus("github", makeOkFetch({}));
    assert.ok(typeof result === "string");
    assert.match(result, /github/i);
    assert.match(result, /alertas internos|plantonista|interpretar/i);
  });

  await t.test("Zod validation failure (missing description) → readable error", async () => {
    const body = { status: { indicator: "none" } }; // missing description
    const result = await checkProviderStatus("github", makeOkFetch(body));
    assert.ok(typeof result === "string");
    assert.match(result, /alertas internos|plantonista|interpretar/i);
  });

  await t.test("HTTP 404 (non-retriable) → readable error string", async () => {
    const result = await checkProviderStatus("github", makeOkFetch({}, 404));
    assert.ok(typeof result === "string");
    assert.match(result, /HTTP 404/i);
  });

  await t.test("HTTP 429 (non-retriable) → readable error string", async () => {
    const result = await checkProviderStatus("cloudflare", makeOkFetch({}, 429));
    assert.ok(typeof result === "string");
    assert.match(result, /HTTP 429/i);
  });

  await t.test("network TypeError → readable error after 2 attempts, does not throw", async () => {
    const networkError = new TypeError("ECONNREFUSED");
    const result = await checkProviderStatus("github", makeErrorFetch(networkError));
    assert.ok(typeof result === "string");
    assert.match(result, /ECONNREFUSED/i);
  });

  await t.test("never throws under any condition — all failure scenarios", async () => {
    const scenarios: Array<[string, Fetcher]> = [
      ["AbortError", makeErrorFetch(Object.assign(new Error("timeout"), { name: "AbortError" }))],
      ["TypeError", makeErrorFetch(new TypeError("ECONNREFUSED"))],
      ["503 twice", makeSequenceFetch([
        async () => new Response("", { status: 503 }),
        async () => new Response("", { status: 503 }),
      ])],
      ["invalid JSON shape", makeOkFetch({ unexpected: true })],
      ["404", makeOkFetch({}, 404)],
    ];

    for (const [label, fetcher] of scenarios) {
      let threw = false;
      try {
        await checkProviderStatus("github", fetcher);
      } catch {
        threw = true;
      }
      assert.equal(threw, false, `Scenario "${label}" must not throw`);
    }
  });
});
