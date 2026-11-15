import { exportSafeName, exportStamp, exportJson, exportedAt } from "./exportFile";

import type { SessionEvent } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a session event log export. */
export function logExportName(sessionID: string, count: number, date = new Date()): string {
  const safe = exportSafeName(sessionID, "session");
  return `${safe}-events-${count}-${exportStamp(date)}.json`;
}

export interface LogExport {
  sessionId: string;
  exportedAt: string;
  filter: string;
  count: number;
  events: SessionEvent[];
}

/** Wraps the visible events with enough metadata to identify the export. */
export function serializeLog(input: {
  sessionId: string;
  filter: string;
  events: SessionEvent[];
  date?: Date;
}): string {
  const payload: LogExport = {
    sessionId: input.sessionId,
    exportedAt: exportedAt(input.date),
    filter: input.filter,
    count: input.events.length,
    events: input.events,
  };
  return exportJson(payload);
}
