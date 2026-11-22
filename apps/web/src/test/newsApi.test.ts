import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccessToken, newsApi, setAccessToken } from "../lib/api";

test("Pulse client preserves feed filters and calls authenticated personalization and history APIs", async () => {
  const original = globalThis.fetch; const requests: Array<{ url: string; init: RequestInit }> = []; setAccessToken("pulse-token");
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    requests.push({ url: String(input), init });
    const path = new URL(String(input)).pathname;
    return path.endsWith("/save") || path.endsWith("/watchlist/test-id") ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
  }) as typeof fetch;
  try {
    const emptyFeed = await newsApi.events({ page: 1, pageSize: 20, q: "repo rate", region: "IN", mode: "personalized" });
    assert.deepEqual(emptyFeed, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    await newsApi.save("event-1"); await newsApi.unsave("event-1"); await newsApi.history();
    await newsApi.watchlist(); await newsApi.addWatch("TOPIC", "inflation"); await newsApi.removeWatch("test-id"); await newsApi.sourceStatus();
    assert.ok(requests[0].url.includes("q=repo+rate")); assert.ok(requests[0].url.includes("mode=personalized"));
    assert.deepEqual(requests.map(({ init }) => init.method ?? "GET"), ["GET", "POST", "DELETE", "GET", "GET", "POST", "DELETE", "GET"]);
    assert.ok(requests.every(({ init }) => (init.headers as Record<string, string>).Authorization === "Bearer pulse-token"));
    assert.equal(JSON.parse(String(requests[5].init.body)).value, "inflation");
  } finally { globalThis.fetch = original; setAccessToken(""); }
});

test("Pulse client surfaces backend failures instead of masking them as empty feeds", async () => {
  const original = globalThis.fetch; setAccessToken("pulse-token");
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "Pulse unavailable" }), { status: 503 })) as typeof fetch;
    await assert.rejects(newsApi.events({ page: 1 }), /Pulse unavailable/);
  } finally { globalThis.fetch = original; setAccessToken(""); }
});

test("expired Pulse sessions surface the auth response and clear the stale access token", async () => {
  const original = globalThis.fetch; setAccessToken("expired-access-token");
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => new URL(String(input)).pathname === "/auth/refresh"
      ? new Response(JSON.stringify({ error: "No refresh token provided" }), { status: 401 })
      : new Response(JSON.stringify({ message: "Invalid or expired token" }), { status: 401 })) as typeof fetch;
    await assert.rejects(newsApi.events({ page: 1 }), /Invalid or expired token/);
    assert.equal(getAccessToken(), null);
  } finally { globalThis.fetch = original; setAccessToken(""); }
});

test("a failed Pulse fetch can be retried and then returns the real empty-feed response", async () => {
  const original = globalThis.fetch; setAccessToken("valid-test-token"); let attempts = 0;
  try {
    globalThis.fetch = (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response(JSON.stringify({ error: "News is temporarily unavailable" }), { status: 503 })
        : new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }), { status: 200 });
    }) as typeof fetch;
    await assert.rejects(newsApi.events({ page: 1 }), /News is temporarily unavailable/);
    const result = await newsApi.events({ page: 1 });
    assert.equal(attempts, 2); assert.equal(result.total, 0);
  } finally { globalThis.fetch = original; setAccessToken(""); }
});
