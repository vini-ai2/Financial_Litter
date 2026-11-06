import type { NewsSourceAdapter } from "./types";

const adapters = new Map<string, NewsSourceAdapter>();

export function registerNewsSourceAdapter(adapter: NewsSourceAdapter): void {
  if (adapters.has(adapter.sourceKey)) throw new Error(`An adapter is already registered for ${adapter.sourceKey}`);
  adapters.set(adapter.sourceKey, adapter);
}

export function getNewsSourceAdapter(sourceKey: string): NewsSourceAdapter {
  const adapter = adapters.get(sourceKey);
  if (!adapter) throw new Error(`No news adapter is registered for ${sourceKey}`);
  return adapter;
}
