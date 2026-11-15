import { exportJson, exportedAt, exportName } from "./exportFile";

import type { UsageStats } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a usage export. */
export function usageExportName(sessionID: string, date = new Date()): string {
  return exportName(sessionID, "usage", { fallback: "session", date });
}

/** Serializes one session's usage totals with export metadata. */
export function serializeUsage(input: { stats: UsageStats; date?: Date }): string {
  const stats = input.stats;
  return exportJson({
    sessionId: stats.sessionId,
    calls: stats.calls,
    input: stats.input,
    output: stats.output,
    cacheRead: stats.cacheRead,
    cacheWrite: stats.cacheWrite,
    total: stats.total,
    last: stats.last ?? null,
    lastAt: stats.lastAt ?? null,
    exportedAt: exportedAt(input.date),
  });
}
