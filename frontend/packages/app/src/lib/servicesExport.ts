import { exportStamp, exportJson, exportedAt } from "./exportFile";

import type { ImageStatus, WebSearchStatus } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a services status export. */
export function servicesExportName(date = new Date()): string {
  return `services-${exportStamp(date)}.json`;
}

/** Serializes the read-only web search and image generation statuses. */
export function serializeServices(input: {
  workspace: string;
  webSearch?: WebSearchStatus;
  image?: ImageStatus;
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    webSearch: input.webSearch ?? null,
    image: input.image ?? null,
  });
}
