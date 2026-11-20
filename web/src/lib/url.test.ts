import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_API_URL,
  STORAGE_KEY_API_URL,
  STORAGE_KEY_THEME,
  isValidApiUrl,
  normalizeApiUrl,
  buildApiEndpoint,
  loadWarRoomSettings,
  saveWarRoomSettings,
  type StorageLike,
} from "./url.js";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("War Room API URL & Settings Pure Helpers (018-war-room-web / US3)", async (t) => {
  await t.test("isValidApiUrl accepts http/https URLs and rejects empty or invalid protocols", () => {
    assert.equal(isValidApiUrl("http://localhost:3000"), true);
    assert.equal(isValidApiUrl("https://api.opspilot.internal:8443/v1/"), true);
    assert.equal(isValidApiUrl(""), false);
    assert.equal(isValidApiUrl("   "), false);
    assert.equal(isValidApiUrl("not-a-url"), false);
    assert.equal(isValidApiUrl("ftp://localhost:3000"), false);
    assert.equal(isValidApiUrl("javascript:alert(1)"), false);
  });

  await t.test("normalizeApiUrl trims whitespace, strips trailing slashes, and preserves subpath", () => {
    assert.equal(normalizeApiUrl("http://localhost:3000/"), "http://localhost:3000");
    assert.equal(normalizeApiUrl("  http://localhost:4000///  "), "http://localhost:4000");
    assert.equal(
      normalizeApiUrl("https://ops.example.com/api/v1/"),
      "https://ops.example.com/api/v1"
    );
    assert.throws(() => normalizeApiUrl("invalid-url"));
  });

  await t.test("buildApiEndpoint joins normalized base URL and endpoint path cleanly", () => {
    assert.equal(buildApiEndpoint("http://localhost:3000/", "/chat"), "http://localhost:3000/chat");
    assert.equal(
      buildApiEndpoint("https://ops.example.com/gateway/", "stats?since=24h"),
      "https://ops.example.com/gateway/stats?since=24h"
    );
  });

  await t.test("loadWarRoomSettings and saveWarRoomSettings persist normalized URL and theme", () => {
    const storage = createMemoryStorage();
    const initial = loadWarRoomSettings(storage);
    assert.equal(initial.apiUrl, DEFAULT_API_URL);
    assert.equal(initial.theme, "dark");

    const saved = saveWarRoomSettings(
      { apiUrl: "http://localhost:4500/", theme: "light" },
      storage
    );
    assert.equal(saved.apiUrl, "http://localhost:4500");
    assert.equal(saved.theme, "light");
    assert.equal(storage.getItem(STORAGE_KEY_API_URL), "http://localhost:4500");
    assert.equal(storage.getItem(STORAGE_KEY_THEME), "light");

    const reloaded = loadWarRoomSettings(storage);
    assert.deepEqual(reloaded, {
      apiUrl: "http://localhost:4500",
      theme: "light",
    });
  });

  await t.test("loadWarRoomSettings falls back safely when stored URL is corrupt", () => {
    const storage = createMemoryStorage({
      [STORAGE_KEY_API_URL]: "corrupt:::url",
      [STORAGE_KEY_THEME]: "light",
    });
    const loaded = loadWarRoomSettings(storage, "https://fallback.example.com/");
    assert.deepEqual(loaded, {
      apiUrl: "https://fallback.example.com",
      theme: "light",
    });
  });
});
