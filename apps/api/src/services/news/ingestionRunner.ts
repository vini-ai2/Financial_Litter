import prisma from "../../lib/prisma";
import { createRssAdapter } from "./rssAdapter";
import { getNewsSourceAdapter, registerNewsSourceAdapter } from "./adapterRegistry";
import { ingestSource } from "./ingestionService";
import { getEnabledNewsSources } from "./sourceRegistry";
import { prismaNewsRepository } from "./prismaNewsRepository";
import { prismaNewsIntelligenceRepository } from "./prismaNewsIntelligenceRepository";
import { processNewsDocument } from "./newsIntelligenceService";
import { classifyEvent } from "./eventIntelligence";
import type { NewsSource } from "./types";

let activeRun: Promise<IngestionRunResult> | null = null;
export type IngestionRunResult = { sources: number; retrieved: number; inserted: number; duplicates: number; retrievalFailures: number; processedEvents: number; unclassifiedDocuments: number; processingFailures: number };

export function runNewsIngestion(sourceOverride?: NewsSource[]): Promise<IngestionRunResult> {
  if (activeRun) return activeRun;
  activeRun = run(sourceOverride).finally(() => { activeRun = null; });
  return activeRun;
}

async function run(sourceOverride?: NewsSource[]): Promise<IngestionRunResult> {
  const sources = (sourceOverride ?? await getEnabledNewsSources()).filter((source) => source.enabled && source.accessMethod === "RSS");
  const result: IngestionRunResult = { sources: sources.length, retrieved: 0, inserted: 0, duplicates: 0, retrievalFailures: 0, processedEvents: 0, unclassifiedDocuments: 0, processingFailures: 0 };
  for (const source of sources) {
    try {
      let adapter;
      try { adapter = getNewsSourceAdapter(source.key); }
      catch { adapter = createRssAdapter(source.key); registerNewsSourceAdapter(adapter); }
      const ingested = await ingestSource(source, adapter, prismaNewsRepository);
      result.retrieved += ingested.retrieved; result.inserted += ingested.inserted; result.duplicates += ingested.duplicates; result.retrievalFailures += ingested.failed;
      const documents = await prisma.newsDocument.findMany({ where: { sourceId: source.id, eventLinks: { none: {} } }, orderBy: { retrievedAt: "asc" }, take: 500 });
      for (const document of documents) {
        try { classifyEvent([document.title, document.summary ?? "", document.content ?? ""].join("\n")); }
        catch { result.unclassifiedDocuments += 1; continue; }
        try {
          await processNewsDocument({ id: document.id, sourceId: document.sourceId, title: document.title, summary: document.summary, content: document.content, publishedAt: document.publishedAt }, prismaNewsIntelligenceRepository);
          result.processedEvents += 1;
        } catch (error) {
          result.processingFailures += 1;
          console.error(`[news ingestion] intelligence processing failed for ${source.key} document ${document.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      result.retrievalFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[news ingestion] source ${source.key} failed; continuing with remaining sources: ${message}`);
      try { await prismaNewsRepository.recordFailure({ sourceId: source.id, externalId: null, stage: "source-cycle", message, attempts: 1 }); }
      catch (recordingError) { console.error(`[news ingestion] could not persist source failure for ${source.key}: ${recordingError instanceof Error ? recordingError.message : String(recordingError)}`); }
    }
  }
  return result;
}

export function scheduleNewsIngestion(intervalMinutes: number): NodeJS.Timeout {
  const interval = setInterval(() => {
    void runNewsIngestion().then((result) => console.info("[news ingestion] cycle completed", result)).catch((error) => console.error("[news ingestion] cycle failed", error));
  }, intervalMinutes * 60_000);
  interval.unref();
  void runNewsIngestion().then((result) => console.info("[news ingestion] initial cycle completed", result)).catch((error) => console.error("[news ingestion] initial cycle failed", error));
  return interval;
}
