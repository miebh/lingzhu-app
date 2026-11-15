import { exportJson, exportedAt, exportName } from "./exportFile";

import type { SearchHit } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for an event search export. */
export function searchEventsExportName(query: string, count: number, date = new Date()): string {
  return exportName(query, "event-search", { count, slug: true, fallback: "event-search", date });
}

/** Serializes a durable event search with query metadata and every hit. */
export function serializeSearchEvents(input: {
  workspace: string;
  query: string;
  hits: SearchHit[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    query: input.query,
    count: input.hits.length,
    hits: input.hits.map((hit) => ({
    sessionId: hit.sessionId,
    title: hit.title ?? null,
    seq: hit.seq,
    type: hit.type,
    at: hit.at,
    snippet: hit.snippet,
    })),
  });
}
