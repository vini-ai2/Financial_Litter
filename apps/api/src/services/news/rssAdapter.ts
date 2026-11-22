import { createHash } from "node:crypto";
import type { NewsSourceAdapter, NewsSource, RetrievedNewsDocument } from "./types";

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_all, code: string) => String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");
}
function tag(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i"))?.[1] ?? "";
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function itemLink(xml: string): string {
  const attribute = xml.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
  const alternate = xml.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
  return decodeXml(alternate ?? attribute ?? tag(xml, "link"));
}
function parseFeed(xml: string, retainSummary: boolean): RetrievedNewsDocument[] {
  const nodes = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].slice(0, 100);
  return nodes.flatMap(([, , node]) => {
    const title = tag(node, "title"); const url = itemLink(node);
    if (!title || !url) return [];
    const summaryText = tag(node, "description") || tag(node, "summary") || tag(node, "content:encoded");
    const rawDate = tag(node, "pubDate") || tag(node, "published") || tag(node, "updated");
    const date = rawDate && !Number.isNaN(Date.parse(rawDate)) ? new Date(rawDate) : null;
    const id = tag(node, "guid") || tag(node, "id") || url || createHash("sha256").update(title).digest("hex");
    return [{ externalId: id.slice(0, 512), title: title.slice(0, 1000), canonicalUrl: url,
      summary: retainSummary && summaryText ? summaryText.slice(0, 4000) : null,
      publishedAt: date, sourceMetadata: { feedFormat: /<entry\b/i.test(node) ? "ATOM" : "RSS", attribution: true } }];
  });
}

export function createRssAdapter(sourceKey: string): NewsSourceAdapter {
  return {
    sourceKey,
    async retrieve(source: NewsSource, options?: { signal?: AbortSignal }): Promise<RetrievedNewsDocument[]> {
      const config = source.retrievalConfig as { feedUrl?: string; retainSummary?: boolean };
      if (!config?.feedUrl) throw new Error("RSS source has no configured feed URL");
      const feedUrl = new URL(config.feedUrl);
      const officialUrl = new URL(source.officialUrl);
      const officialHost = officialUrl.hostname.replace(/^www\./i, "");
      const isOfficialHttpsUrl = (url: URL) => {
        const host = url.hostname.replace(/^www\./i, "");
        return url.protocol === "https:" && !url.username && !url.password && (host === officialHost || host.endsWith(`.${officialHost}`));
      };
      if (!isOfficialHttpsUrl(feedUrl)) {
        throw new Error("RSS feed must use HTTPS on the configured official source domain");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
      try {
        const headers = { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" };
        let requestUrl = feedUrl;
        let response: Response;
        const visited = new Set([requestUrl.href]);
        for (let redirectCount = 0; ; redirectCount += 1) {
          response = await fetch(requestUrl, { signal, redirect: "manual", headers });
          if (response.status < 300 || response.status >= 400) break;
          if (redirectCount >= 3) throw new Error("RSS source exceeded the redirect limit");
          const location = response.headers.get("location");
          if (!location) throw new Error("RSS source redirect has no location");
          const redirectUrl = new URL(location, requestUrl);
          if (!isOfficialHttpsUrl(redirectUrl)) throw new Error("RSS source redirect must stay on the configured official source domain");
          if (visited.has(redirectUrl.href)) throw new Error("RSS source redirect loop detected");
          await response.body?.cancel();
          visited.add(redirectUrl.href);
          requestUrl = redirectUrl;
        }
        if (!response.ok) throw new Error(`RSS source returned HTTP ${response.status}`);
        const maxBytes = 2_000_000;
        const declaredBytes = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new Error("RSS response exceeds 2 MB limit");
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
              await reader.cancel();
              throw new Error("RSS response exceeds 2 MB limit");
            }
            chunks.push(value);
          }
        }
        const bytes = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const body = new TextDecoder().decode(bytes);
        if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body)) throw new Error("RSS response is not a recognized feed");
        return parseFeed(body, config.retainSummary === true).filter((document) => {
          try { const url = new URL(document.canonicalUrl); return url.protocol === "https:"; } catch { return false; }
        });
      } finally { clearTimeout(timeout); }
    },
  };
}
