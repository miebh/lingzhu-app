import { exportJson, exportedAt, exportName } from "./exportFile";

import type { MediaItem } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a media index export. */
export function mediaExportName(sessionID: string, count: number, date = new Date()): string {
  return exportName(sessionID, "media", { count, fallback: "session", date });
}

/**
 * Serializes media metadata only. The base64 payload is omitted on purpose:
 * the index identifies each attachment without writing megabytes of data.
 */
export function serializeMedia(input: {
  sessionId: string;
  items: MediaItem[];
  truncated: boolean;
  date?: Date;
}): string {
  return exportJson({
    sessionId: input.sessionId,
    exportedAt: exportedAt(input.date),
    count: input.items.length,
    truncated: input.truncated,
    media: input.items.map((item) => ({
    id: item.id,
    tool: item.tool,
    mime: item.mime,
    name: item.name ?? "",
    size: item.size,
    seq: item.seq,
    at: item.at,
    hasData: item.data.length > 0,
    })),
  });
}
