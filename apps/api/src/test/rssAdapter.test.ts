import assert from "node:assert/strict";
import { test } from "node:test";
import { createRssAdapter } from "../services/news/rssAdapter";
import type { NewsSource } from "../services/news/types";

const source: NewsSource = { id: "source-test", key: "test-feed", name: "Test feed", organization: "Test", jurisdiction: "IN", category: "GOVERNMENT", accessMethod: "RSS", officialUrl: "https://www.pib.gov.in/", enabled: true, retrievalConfig: { feedUrl: "https://pib.gov.in/test.xml", retainSummary: true } };

test("RSS adapter extracts attributed document fields without inventing source content", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?><rss><channel><item><title>RBI &amp; repo rate</title><link>https://www.pib.gov.in/PressReleasePage.aspx?PRID=1</link><guid>fixture-1</guid><pubDate>Sun, 22 Nov 2026 08:00:00 GMT</pubDate><description><![CDATA[Repo rate remains unchanged.]]></description></item></channel></rss>`, { status: 200 });
  try {
    const documents = await createRssAdapter(source.key).retrieve(source);
    assert.equal(documents.length, 1); assert.equal(documents[0].title, "RBI & repo rate");
    assert.equal(documents[0].summary, "Repo rate remains unchanged."); assert.equal(documents[0].externalId, "fixture-1");
    assert.equal(new Date(documents[0].publishedAt as Date).toISOString(), "2026-11-22T08:00:00.000Z");
  } finally { globalThis.fetch = original; }
});

test("RSS adapter follows bounded HTTPS redirect chains only within the official source domain", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 301, headers: { location: "https://www.pib.gov.in/test.xml" } });
    if (calls === 2) return new Response(null, { status: 302, headers: { location: "/canonical.xml" } });
    assert.equal(new URL(String(input)).hostname, "www.pib.gov.in");
    return new Response(`<rss><channel><item><title>Attributed notice</title><link>https://www.pib.gov.in/notice/2</link><guid>notice-2</guid></item></channel></rss>`, { status: 200 });
  };
  try {
    const documents = await createRssAdapter(source.key).retrieve(source);
    assert.equal(calls, 3);
    assert.equal(documents[0].externalId, "notice-2");
  } finally { globalThis.fetch = original; }
});

test("RSS adapter rejects insecure, off-domain and failed feeds", async () => {
  const original = globalThis.fetch;
  try {
    await assert.rejects(createRssAdapter(source.key).retrieve({ ...source, retrievalConfig: { feedUrl: "http://pib.gov.in/feed" } }), /HTTPS/);
    await assert.rejects(createRssAdapter(source.key).retrieve({ ...source, retrievalConfig: { feedUrl: "https://example.test/feed" } }), /official source domain/);
    let redirectCalls = 0;
    globalThis.fetch = async () => {
      redirectCalls += 1;
      return new Response(null, { status: 302, headers: { location: "https://example.test/feed" } });
    };
    await assert.rejects(createRssAdapter(source.key).retrieve(source), /redirect must stay on the configured official source domain/);
    assert.equal(redirectCalls, 1);
    let chainCalls = 0;
    globalThis.fetch = async () => {
      chainCalls += 1;
      return new Response(null, { status: 302, headers: { location: `https://www.pib.gov.in/redirect-${chainCalls}` } });
    };
    await assert.rejects(createRssAdapter(source.key).retrieve(source), /exceeded the redirect limit/);
    assert.equal(chainCalls, 4);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(createRssAdapter(source.key).retrieve(source), /HTTP 503/);
    globalThis.fetch = async () => new Response(`<rss>${"x".repeat(2_000_001)}</rss>`, { status: 200 });
    await assert.rejects(createRssAdapter(source.key).retrieve(source), /exceeds 2 MB limit/);
  } finally { globalThis.fetch = original; }
});
