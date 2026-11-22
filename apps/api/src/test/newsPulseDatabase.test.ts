import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import prisma from "../lib/prisma";

const databaseUrl = process.env.DATABASE_URL;
let isolated = false;
try { const u = new URL(databaseUrl ?? ""); isolated = ["127.0.0.1", "localhost"].includes(u.hostname) && u.port === "5433" && u.pathname === "/finlitter_test"; } catch { /* test must stay disabled without the dedicated database */ }

test("Pulse authenticated APIs persist interests, saves, watchlist and read history per user", { skip: !isolated }, async () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be provided by the isolated API test script");
  const [{ default: authRoutes }, { default: newsRoutes }] = await Promise.all([import("../routes/auth.js"), import("../routes/news.js")]);
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use("/auth", authRoutes as any); app.use("/news", newsRoutes as any);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Could not start isolated Pulse API test server");
  const base = `http://127.0.0.1:${address.port}`; const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emails = [`pulse-a-${suffix}@example.test`, `pulse-b-${suffix}@example.test`];
  let eventId = ""; let revisionId = ""; let entityId = ""; let watchId = "";
  async function req(path: string, token?: string, method = "GET", body?: unknown) {
    return fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function signupAndLogin(email: string) {
    const signup = await req("/auth/signup", undefined, "POST", { email, password: "Password!123", firstName: "Pulse", lastName: "Test", phone: "9876543210" });
    assert.equal(signup.status, 201);
    const login = await req("/auth/login", undefined, "POST", { email, password: "Password!123" });
    assert.equal(login.status, 200); return (await login.json() as { accessToken: string }).accessToken;
  }
  try {
    const userA = await signupAndLogin(emails[0]); const userB = await signupAndLogin(emails[1]);
    const unauthenticated = await req("/news/preferences"); assert.equal(unauthenticated.status, 401); assert.deepEqual(await unauthenticated.json(), { message: "Authentication required" });
    assert.equal((await req("/news/source-status")).status, 401);
    const sourceStatus = await req("/news/source-status", userA); assert.equal(sourceStatus.status, 200);
    assert.ok(["CURRENT", "STALE", "PENDING", "ERROR", "UNSUPPORTED"].includes((await sourceStatus.json() as any).sources[0]?.status));
    const entity = await prisma.newsEntity.create({ data: { canonicalName: `Pulse fixture ${suffix}`, normalizedName: `pulse fixture ${suffix}`, type: "COMPANY", jurisdiction: "IN" } }); entityId = entity.id;
    const event = await prisma.newsEvent.create({ data: {} }); eventId = event.id;
    const revision = await prisma.newsEventRevision.create({ data: { eventId, version: 1, eventType: "EARNINGS", classificationConfidence: 0.82, materiality: "MEDIUM", revisionType: "INITIAL", title: `Synthetic test fixture ${suffix}: quarterly revenue`, summary: "Isolated integration fixture. Revenue and quarterly results are mentioned for API testing only.", eventDate: new Date("2026-01-15T00:00:00.000Z"), facts: [{ type: "EARNINGS", value: "test fixture" }] } }); revisionId = revision.id;
    await prisma.newsEventEntity.create({ data: { eventId, revisionId, entityId } });
    await prisma.newsEvent.update({ where: { id: eventId }, data: { currentRevisionId: revisionId } });

    const clearedFeed = await req("/news/events?page=1&pageSize=20", userA); assert.equal(clearedFeed.status, 200); assert.ok((await clearedFeed.json() as any).items.some((item: any) => item.id === eventId));
    const emptyPersonalized = await req("/news/events?mode=personalized", userA); assert.equal((await emptyPersonalized.json() as any).total, 0);
    const searchFeed = await req(`/news/events?q=${encodeURIComponent(`Synthetic test fixture ${suffix}`)}`, userA); assert.ok((await searchFeed.json() as any).items.some((item: any) => item.id === eventId));
    const categoryFeed = await req("/news/events?category=EARNINGS", userA); assert.ok((await categoryFeed.json() as any).items.some((item: any) => item.id === eventId));
    const companyFeed = await req(`/news/events?company=${encodeURIComponent(`Pulse fixture ${suffix}`)}`, userA); assert.ok((await companyFeed.json() as any).items.some((item: any) => item.id === eventId));
    const regionFeed = await req("/news/events?region=IN", userA); assert.ok((await regionFeed.json() as any).items.some((item: any) => item.id === eventId));
    const noMatchFeed = await req("/news/events?q=definitely-no-such-pulse-event-71628", userA); assert.equal((await noMatchFeed.json() as any).total, 0);

    const update = await req("/news/preferences", userA, "PUT", { categories: ["EARNINGS"], regions: ["in"], companies: [entityId], industries: [], topics: ["inflation"] });
    assert.equal(update.status, 200); const savedPreferences = await update.json() as any; assert.deepEqual(savedPreferences.companies, [entityId]); assert.deepEqual(savedPreferences.topics, ["inflation"]);
    const invalidPreferences = await req("/news/preferences", userA, "PUT", { categories: [], regions: [], companies: ["missing-entity"], industries: [], topics: [] }); assert.equal(invalidPreferences.status, 400);
    const personalized = await req("/news/events?mode=personalized&q=revenue&pageSize=5", userA); assert.equal(personalized.status, 200); assert.ok((await personalized.json() as any).items.some((item: any) => item.id === eventId));
    const invalidFilter = await req("/news/events?page=0", userA); assert.equal(invalidFilter.status, 400);
    const excessiveFilter = await req("/news/events?page=10001", userA); assert.equal(excessiveFilter.status, 400);

    assert.equal((await req(`/news/events/${eventId}/save`, userA, "POST")).status, 204);
    assert.equal((await req(`/news/events/${eventId}/save`, userA, "POST")).status, 204);
    let saved = await req("/news/events?mode=saved", userA); assert.equal((await saved.json() as any).total, 1);
    const otherSaved = await req("/news/events?mode=saved", userB); assert.equal((await otherSaved.json() as any).total, 0);
    assert.equal((await req(`/news/events/${eventId}/save`, userB, "DELETE")).status, 204);
    assert.equal((await (await req("/news/events?mode=saved", userA)).json() as any).total, 1);

    const watch = await req("/news/watchlist", userA, "POST", { kind: "COMPANY", value: entityId }); assert.equal(watch.status, 201); watchId = (await watch.json() as any).id;
    assert.equal((await req(`/news/watchlist/${watchId}`, userB, "DELETE")).status, 204);
    assert.equal((await (await req("/news/watchlist", userA)).json() as any[]).length, 1);
    assert.equal((await req("/news/events?mode=watched", userA)).status, 200);
    const otherWatches = await req("/news/watchlist", userB); assert.deepEqual(await otherWatches.json(), []);

    const detail = await req(`/news/events/${eventId}`, userA); assert.equal(detail.status, 200); const detailJson = await detail.json() as any;
    assert.equal(detailJson.isSaved, true); assert.equal(detailJson.sourceReliability.status, "UNASSESSED"); assert.equal(detailJson.explanation.interpretation, true);
    const history = await req("/news/history", userA); assert.equal((await history.json() as any[]).length, 1);
    assert.deepEqual(await (await req("/news/history", userB)).json(), []);
    const userRow = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] }, select: { id: true } });
    const historyRow = await prisma.newsReadHistory.findUniqueOrThrow({ where: { userId_eventId: { userId: userRow.id, eventId } } }); assert.equal(historyRow.viewCount, 1);
    const reLogin = await req("/auth/login", undefined, "POST", { email: emails[0], password: "Password!123" }); const freshToken = (await reLogin.json() as { accessToken: string }).accessToken;
    assert.equal((await (await req("/news/preferences", freshToken)).json() as any).topics[0], "inflation");
    assert.equal((await (await req("/news/events?mode=saved", freshToken)).json() as any).total, 1);
    assert.equal((await req(`/news/events/${eventId}/save`, freshToken, "DELETE")).status, 204);
    assert.equal((await (await req("/news/events?mode=saved", freshToken)).json() as any).total, 0);
    const userAId = (await prisma.user.findUniqueOrThrow({ where: { email: emails[0] }, select: { id: true } })).id;
    assert.equal(await prisma.newsSavedEvent.count({ where: { userId: userAId } }), 0);
    assert.equal(await prisma.newsWatch.count({ where: { userId: userAId } }), 1);
    assert.equal(await prisma.newsReadHistory.count({ where: { userId: userAId } }), 1);
  } finally {
    try {
      const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
      await prisma.session.deleteMany({ where: { userId: { in: users.map((user) => user.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
      if (eventId) { await prisma.newsEvent.updateMany({ where: { id: eventId }, data: { currentRevisionId: null } }); await prisma.newsEventEntity.deleteMany({ where: { eventId } }); await prisma.newsEventRevision.deleteMany({ where: { eventId } }); await prisma.newsEvent.deleteMany({ where: { id: eventId } }); }
      if (entityId) await prisma.newsEntity.deleteMany({ where: { id: entityId } });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});
