import type { Request, Response } from "express";
import { NewsEventType } from "@prisma/client";
import { z } from "zod";
import { getNewsEvent, getNewsFilterOptions, getNewsPreferences, listNewsEvents, updateNewsPreferences } from "../services/news/newsApiService";
import { newsFilterSchema } from "../services/news/newsQuery";

export const newsPreferencesSchema = z.object({
  categories: z.array(z.nativeEnum(NewsEventType)).max(6),
  regions: z.array(z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/).transform((region) => region.toUpperCase())).max(10),
}).refine((value) => new Set(value.categories).size === value.categories.length, { message: "Categories must be unique" })
  .refine((value) => new Set(value.regions).size === value.regions.length, { message: "Regions must be unique" });

export async function listNewsEventsController(req: Request, res: Response) {
  const parsed = newsFilterSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid news filters", details: parsed.error.flatten() });
  try { return res.json(await listNewsEvents(parsed.data)); }
  catch (error) {
    console.error("[news api] Could not list events", error);
    return res.status(503).json({ error: "News is temporarily unavailable" });
  }
}

export async function getNewsEventController(req: Request, res: Response) {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const event = await getNewsEvent(id);
    return event ? res.json(event) : res.status(404).json({ error: "News event not found" });
  } catch (error) {
    console.error("[news api] Could not load event", error);
    return res.status(503).json({ error: "News is temporarily unavailable" });
  }
}

export async function getNewsPreferencesController(req: Request, res: Response) {
  try { return res.json(await getNewsPreferences(req.userId)); }
  catch (error) {
    console.error("[news api] Could not load preferences", error);
    return res.status(503).json({ error: "News preferences are temporarily unavailable" });
  }
}

export async function updateNewsPreferencesController(req: Request, res: Response) {
  const parsed = newsPreferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid news preferences", details: parsed.error.flatten() });
  try { return res.json(await updateNewsPreferences(req.userId, parsed.data)); }
  catch (error) {
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
