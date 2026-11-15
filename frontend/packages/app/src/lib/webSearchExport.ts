import { exportJson, exportedAt, exportName } from "./exportFile";

import type { SearchResult } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a web search export. */
export function webSearchExportName(query: string, count: number, date = new Date()): string {
  return exportName(query, "websearch", { count, slug: true, fallback: "websearch", date });
}

/** Serializes one manual web search with its provider and results. */
export function serializeWebSearch(input: {
  workspace: string;
  provider: string;
  query: string;
  results: SearchResult[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    provider: input.provider,
    exportedAt: exportedAt(input.date),
    query: input.query,
    count: input.results.length,
    results: input.results.map((item) => ({
    title: item.title,
    url: item.url,
    content: item.content ?? null,
    published: item.published ?? null,
    })),
  });
}
