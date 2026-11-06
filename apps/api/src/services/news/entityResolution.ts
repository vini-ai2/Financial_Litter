export type EntityKind = "COMPANY" | "SECURITY" | "REGULATOR" | "SECTOR";
export type EntityCandidate = { id: string; canonicalName: string; type: EntityKind; aliases: string[]; identifiers?: string[] };
export type TextSegment = { field: "title" | "summary" | "content"; text: string };
export type EntityMatch = {
  field: TextSegment["field"];
  mention: string;
  startOffset: number;
  endOffset: number;
  status: "RESOLVED" | "AMBIGUOUS";
  confidence: number;
  entityId: string | null;
  candidates: string[];
};

export function normalizeEntityLabel(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveEntities(segments: TextSegment[], entities: EntityCandidate[]): EntityMatch[] {
  const aliases = new Map<string, EntityCandidate[]>();
  for (const entity of entities) {
    for (const alias of [entity.canonicalName, ...entity.aliases, ...(entity.identifiers ?? [])]) {
      const normalized = normalizeEntityLabel(alias);
      if (!normalized) continue;
      const values = aliases.get(normalized) ?? [];
      if (!values.some((candidate) => candidate.id === entity.id)) values.push(entity);
      aliases.set(normalized, values);
    }
  }

  const patterns = [...aliases.entries()]
    .map(([normalized, candidates]) => ({ normalized, candidates, regex: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(normalized).replace(/ /g, "[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`, "giu") }))
    .sort((a, b) => b.normalized.length - a.normalized.length);
  const matches: EntityMatch[] = [];

  for (const segment of segments) {
    const occupied: Array<{ start: number; end: number }> = [];
    const segmentMatches: EntityMatch[] = [];
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      for (const match of segment.text.matchAll(pattern.regex)) {
        const startOffset = match.index ?? 0;
        const endOffset = startOffset + match[0].length;
        if (occupied.some((range) => startOffset < range.end && endOffset > range.start)) continue;
        occupied.push({ start: startOffset, end: endOffset });
        const uniqueCandidates = [...new Set(pattern.candidates.map((candidate) => candidate.id))];
        const isResolved = uniqueCandidates.length === 1;
        segmentMatches.push({
          field: segment.field,
          mention: match[0],
          startOffset,
          endOffset,
          status: isResolved ? "RESOLVED" : "AMBIGUOUS",
          confidence: isResolved ? 1 : 0,
          entityId: isResolved ? uniqueCandidates[0] : null,
          candidates: uniqueCandidates,
        });
      }
    }
    matches.push(...segmentMatches.sort((a, b) => a.startOffset - b.startOffset));
  }
  return matches;
}
