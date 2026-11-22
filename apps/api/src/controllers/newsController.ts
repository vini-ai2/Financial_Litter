import type { Request, Response } from "express";
import { NewsEventType } from "@prisma/client";
import { z } from "zod";
import { addNewsWatch, getNewsEvent, getNewsFilterOptions, getNewsSourceStatus, getPulsePreferences, listNewsEvents, listNewsHistory, listNewsWatches, removeNewsWatch, saveNewsEvent, unsaveNewsEvent, updateNewsPreferences } from "../services/news/newsApiService";
import { newsFilterSchema } from "../services/news/newsQuery";

export const newsPreferencesSchema = z.object({
  categories: z.array(z.nativeEnum(NewsEventType)).max(6),
  regions: z.array(z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).transform((region) => region.toUpperCase())).max(10),
  companies: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  industries: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  topics: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
}).refine((value) => new Set(value.categories).size === value.categories.length, { message: "Categories must be unique" })
  .refine((value) => new Set(value.regions).size === value.regions.length, { message: "Regions must be unique" })
  .refine((value) => new Set(value.topics.map((t) => t.toLowerCase())).size === value.topics.length, { message: "Topics must be unique" });

export async function listNewsEventsController(req: Request, res: Response) {
  const parsed = newsFilterSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid news filters", details: parsed.error.flatten() });
  const mode = req.query.mode === "personalized" || req.query.mode === "saved" || req.query.mode === "watched" ? req.query.mode : "all";
  if (req.query.mode && !["all", "personalized", "saved", "watched"].includes(String(req.query.mode))) return res.status(400).json({ error: "Invalid news feed mode" });
  try { return res.json(await listNewsEvents(parsed.data, req.userId, mode)); }
  catch (error) {
    console.error("[news api] Could not list events", error);
    return res.status(503).json({ error: "News is temporarily unavailable" });
  }
}

export async function getNewsEventController(req: Request, res: Response) {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const event = await getNewsEvent(id, req.userId);
    return event ? res.json(event) : res.status(404).json({ error: "News event not found" });
  } catch (error) {
    console.error("[news api] Could not load event", error);
    return res.status(503).json({ error: "News is temporarily unavailable" });
  }
}

export async function getNewsPreferencesController(req: Request, res: Response) {
  try { return res.json(await getPulsePreferences(req.userId)); }
  catch (error) {
    console.error("[news api] Could not load preferences", error);
    return res.status(503).json({ error: "News preferences are temporarily unavailable" });
  }
}

export async function saveNewsEventController(req: Request, res: Response) {
  try { return await saveNewsEvent(req.userId, String(req.params.id)) ? res.status(204).end() : res.status(404).json({ error: "News event not found" }); }
  catch (error) { console.error("[news api] Could not save event", error); return res.status(503).json({ error: "Event could not be saved" }); }
}
export async function unsaveNewsEventController(req: Request, res: Response) {
  try { await unsaveNewsEvent(req.userId, String(req.params.id)); return res.status(204).end(); }
  catch (error) { console.error("[news api] Could not unsave event", error); return res.status(503).json({ error: "Event could not be removed" }); }
}
export async function listNewsWatchesController(req: Request, res: Response) {
  try { return res.json(await listNewsWatches(req.userId)); }
  catch (error) { console.error("[news api] Could not load watchlist", error); return res.status(503).json({ error: "Watchlist is temporarily unavailable" }); }
}
export async function addNewsWatchController(req: Request, res: Response) {
  const parsed = z.object({ kind: z.enum(["COMPANY", "INDUSTRY", "TOPIC"]), value: z.string().trim().min(1).max(240) }).refine((value) => value.kind !== "TOPIC" || value.value.length >= 2, { message: "Topics must be at least two characters", path: ["value"] }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid watchlist item", details: parsed.error.flatten() });
  try { const result = await addNewsWatch(req.userId, parsed.data); return result ? res.status(201).json(result) : res.status(404).json({ error: "Entity not found or incompatible with watch type" }); }
  catch (error) { console.error("[news api] Could not add watch", error); return res.status(503).json({ error: "Watchlist item could not be added" }); }
}
export async function removeNewsWatchController(req: Request, res: Response) {
  try { await removeNewsWatch(req.userId, String(req.params.id)); return res.status(204).end(); }
  catch (error) { console.error("[news api] Could not remove watch", error); return res.status(503).json({ error: "Watchlist item could not be removed" }); }
}
export async function listNewsHistoryController(req: Request, res: Response) {
  try { return res.json(await listNewsHistory(req.userId)); }
  catch (error) { console.error("[news api] Could not load reading history", error); return res.status(503).json({ error: "Reading history is temporarily unavailable" }); }
}

export async function updateNewsPreferencesController(req: Request, res: Response) {
  const parsed = newsPreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid news preferences", details: parsed.error.flatten() });
  try { return res.json(await updateNewsPreferences(req.userId, parsed.data)); }
  catch (error) {
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 400) return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid interests" });
    console.error("[news api] Could not save preferences", error);
    return res.status(503).json({ error: "News preferences could not be saved" });
  }
}

export async function getNewsFilterOptionsController(_req: Request, res: Response) {
  try { return res.json(await getNewsFilterOptions()); }
  catch (error) {
    console.error("[news api] Could not load filter options", error);
    return res.status(503).json({ error: "News filters are temporarily unavailable" });
  }
}

export async function getNewsSourceStatusController(_req: Request, res: Response) {
  try { return res.json({ sources: await getNewsSourceStatus() }); }
  catch (error) { console.error("[news api] Could not load source status", error); return res.status(503).json({ error: "Source status is temporarily unavailable" }); }
}
