import { createHash } from "node:crypto";
import type { EntityMatch, TextSegment } from "./entityResolution";

export type NewsEventType = "COMPANY_DEVELOPMENT" | "EARNINGS" | "REGULATORY_ACTION" | "MARKET_ECONOMIC" | "CORPORATE_ACTION" | "RISK";
export type NewsMateriality = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type NewsRevisionType = "INITIAL" | "AMENDMENT" | "CORRECTION" | "RETRACTION" | "DEVELOPMENT";
export type ExtractedFact = { type: string; value: string; field: TextSegment["field"]; startOffset: number; endOffset: number };
export type EventEvidence = { field: TextSegment["field"]; startOffset: number; endOffset: number; quote: string; factType: string };
export type ClassifiedEvent = { eventType: NewsEventType; classificationConfidence: number; materiality: NewsMateriality };
export type ExtractedEvent = {
  title: string;
  summary: string;
  entities: string[];
  unresolvedEntityMentions: EntityMatch[];
  facts: ExtractedFact[];
  evidence: EventEvidence[];
  revisionType: NewsRevisionType;
  classification: ClassifiedEvent;
  dedupeKey: string | null;
  publishedAt: Date | null;
};

const rules: Array<{ type: NewsEventType; weight: number; terms: RegExp[] }> = [
  { type: "RISK", weight: 7, terms: [/default|insolvenc|bankrupt|fraud|cyber.?attack|downgrad|credit.?watch|litigation|recall|safety incident|fire at/i, /loss of|risk of|investigation into/i] },
  { type: "REGULATORY_ACTION", weight: 6, terms: [/(?:sebi|rbi|sec\b|reserve bank|regulator).{0,50}(?:issued|imposed|ordered|approved|restricted|penalized|banned|investigat|show.?cause)/i, /show.?cause|penalt|fine imposed|sanction|ban on|approval granted|order passed|compliance action|investigation by/i] },
  { type: "EARNINGS", weight: 5, terms: [/quarterly results|financial results|revenue|net profit|profit after tax|\bpat\b|\bebitda\b|earnings|loss for the quarter|unaudited results/i] },
  { type: "CORPORATE_ACTION", weight: 5, terms: [/dividend|buy.?back|stock split|share split|bonus issue|rights issue|merger|amalgamation|acquisition|demerger|delisting|record date/i] },
  { type: "MARKET_ECONOMIC", weight: 5, terms: [/repo rate|interest rate|inflation|gross domestic product|\bgdp\b|\bcpi\b|\bwpi\b|market index|benchmark|currency|forex|monetary policy|fiscal deficit/i] },
  { type: "COMPANY_DEVELOPMENT", weight: 2, terms: [/board meeting|appointed|resigned|new contract|order worth|project award|commenced operations|capacity|expansion|agreement signed|production started/i] },
];

function matchingTerms(rule: (typeof rules)[number], text: string): number {
  return rule.terms.reduce((total, pattern) => {
    const global = new RegExp(pattern.source, `${pattern.flags.replace(/g/g, "")}g`);
    return total + [...text.matchAll(global)].length;
  }, 0);
}

export function classifyEvent(text: string): ClassifiedEvent {
  const candidates = rules.map((rule) => ({ ...rule, matches: matchingTerms(rule, text) })).filter((rule) => rule.matches > 0);
  candidates.sort((a, b) => (b.weight * b.matches) - (a.weight * a.matches));
  if (!candidates.length) throw new Error("No supported financial event category could be identified");
  const winner = candidates[0];
  const runnerUp = candidates[1];
  const confidence = Math.min(0.99, Math.max(0.5, 0.56 + winner.matches * 0.11 + (runnerUp ? Math.min(0.12, (winner.weight - runnerUp.weight) * 0.025) : 0)));
  return { eventType: winner.type, classificationConfidence: Number(confidence.toFixed(2)), materiality: classifyMateriality(text) };
}

export function classifyMateriality(text: string): NewsMateriality {
  if (/material impact|substantial loss|fraud|default|insolvenc|bankrupt|penalty of|fine of|major acquisition|merger|restructur|recall|credit downgrade|winding up/i.test(text)) return "HIGH";
  if (/revenue|profit|loss|dividend|buy.?back|order worth|contract worth|capacity|rate cut|rate hike|regulatory order|show.?cause/i.test(text)) return "MEDIUM";
  if (/meeting|appointed|resigned|filed|disclosure|clarification|intimation/i.test(text)) return "LOW";
  return "UNKNOWN";
}

function splitSentences(segment: TextSegment): Array<{ field: TextSegment["field"]; text: string; startOffset: number; endOffset: number }> {
  const result: Array<{ field: TextSegment["field"]; text: string; startOffset: number; endOffset: number }> = [];
  const pattern = /[^.!?\n]+(?:[.!?]|$)/g;
  for (const match of segment.text.matchAll(pattern)) {
    const raw = match[0];
    const leading = raw.search(/\S/);
    if (leading < 0) continue;
    const text = raw.trim();
    const startOffset = (match.index ?? 0) + leading;
    result.push({ field: segment.field, text, startOffset, endOffset: startOffset + text.length });
  }
  return result;
}

function revisionType(text: string): NewsRevisionType {
  if (/\b(retracted|withdrawn|retraction)\b/i.test(text)) return "RETRACTION";
  if (/\b(corrected|correction|erratum|rectified)\b/i.test(text)) return "CORRECTION";
  if (/\b(amended|amendment|revised filing|revision to)\b/i.test(text)) return "AMENDMENT";
  if (/\b(further update|subsequent development|additional update|follow.?up)\b/i.test(text)) return "DEVELOPMENT";
  return "INITIAL";
}

function stableSubject(title: string): string {
  return title.toLocaleLowerCase("en-US")
    .replace(/\b(amended|amendment|corrected|correction|erratum|retracted|retraction|withdrawn|revised|revision|further update|subsequent development|additional update|follow.?up)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function extractEvent(input: {
  segments: TextSegment[];
  matches: EntityMatch[];
  publishedAt?: Date | null;
}): ExtractedEvent {
  const title = input.segments.find((segment) => segment.field === "title")?.text.trim() ?? "";
  if (!title) throw new Error("Cannot extract an event without a document title");
  const allText = input.segments.map((segment) => segment.text).filter(Boolean).join("\n");
  const classification = classifyEvent(allText);
  const sentences = input.segments.flatMap(splitSentences);
  const relevant = sentences.filter((sentence) => rules.some((rule) => rule.type === classification.eventType && rule.terms.some((term) => term.test(sentence.text))));
  if (!relevant.length) throw new Error("Event classification has no source sentence to support it");
  const evidence: EventEvidence[] = relevant.map((sentence) => ({
    field: sentence.field,
    startOffset: sentence.startOffset,
    endOffset: sentence.endOffset,
    quote: sentence.text,
    factType: classification.eventType,
  }));
  const facts: ExtractedFact[] = evidence.map((item) => ({
    type: item.factType,
    value: item.quote,
    field: item.field,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
  }));
  for (const sentence of relevant) {
    const numericPattern = /(?:₹|INR\s*|Rs\.?\s*)?\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent\b|crore\b|cr\b|lakh\b|lakhs\b|million\b|billion\b|basis points?\b|bps\b|shares?\b|units?\b)/gi;
    for (const match of sentence.text.matchAll(numericPattern)) {
      const start = (match.index ?? 0) + (sentence.startOffset ?? 0);
      facts.push({ type: "NUMERIC_VALUE", value: match[0].trim(), field: sentence.field, startOffset: start, endOffset: start + match[0].length });
    }
  }
  const resolvedEntities = [...new Set(input.matches.filter((match) => match.status === "RESOLVED" && match.entityId).map((match) => match.entityId!))].sort();
  const unresolvedEntityMentions = input.matches.filter((match) => match.status !== "RESOLVED");
  const subject = stableSubject(title);
  const dedupeKey = resolvedEntities.length && subject
    ? createHash("sha256").update(`${classification.eventType}|${resolvedEntities.join(",")}|${subject}`).digest("hex")
    : null;
  const summary = (input.segments.find((segment) => segment.field === "summary")?.text ?? evidence[0].quote).trim();
  const resultText = `${title}\n${allText}`;
  return {
    title,
    summary,
    entities: resolvedEntities,
    unresolvedEntityMentions,
    facts,
    evidence,
    revisionType: revisionType(resultText),
    classification,
    dedupeKey,
    publishedAt: input.publishedAt ?? null,
  };
}
