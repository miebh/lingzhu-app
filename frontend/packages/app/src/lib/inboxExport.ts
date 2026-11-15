import { exportJson, exportedAt, exportName } from "./exportFile";

import type { InboxItem } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for an inbox export. */
export function inboxExportName(sessionID: string, count: number, date = new Date()): string {
  return exportName(sessionID, "inbox", { count, fallback: "session", date });
}

/** Serializes pending inbox items with ids, delivery, timestamps and text. */
export function serializeInbox(input: {
  sessionId: string;
  items: InboxItem[];
  date?: Date;
}): string {
  return exportJson({
    sessionId: input.sessionId,
    exportedAt: exportedAt(input.date),
    count: input.items.length,
    items: input.items.map((item) => ({
    id: item.id,
    sessionId: item.sessionID,
    delivery: item.delivery,
    createdAt: item.time.created,
    text: item.payload.text,
    })),
  });
}
