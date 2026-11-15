import { exportSafeName, exportStamp, exportJson, exportedAt } from "./exportFile";

import type { Reference } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a references export. */
export function referenceExportName(query: string, count: number, date = new Date()): string {
  return `${exportSafeName(query.replace(/\s+/g, "-"), "references")}-references-${count}-${exportStamp(date)}.json`;
}

/** Serializes one literal reference search with its query and matches. */
export function serializeReferences(input: {
  sessionId: string;
  query: string;
  path: string;
  caseSensitive: boolean;
  results: Reference[];
  truncated: boolean;
  date?: Date;
}): string {
  return exportJson({
    sessionId: input.sessionId,
    exportedAt: exportedAt(input.date),
    query: input.query,
    path: input.path,
    caseSensitive: input.caseSensitive,
    count: input.results.length,
    truncated: input.truncated,
    references: input.results.map((item) => ({
    path: item.path,
    line: item.line,
    column: item.column,
    text: item.text,
    })),
  });
}
