import { exportSafeName, exportStamp, exportJson, exportedAt } from "./exportFile";

import type { CoreEvent } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a live event export. */
export function liveEventsExportName(
  workspace: string,
  count: number,
  date = new Date(),
): string {
  const base = workspace.split(/[\\/]/).filter(Boolean).pop() ?? "events";
  return `${exportSafeName(base, "events")}-events-${count}-${exportStamp(date)}.json`;
}

/** Serializes the filtered live event buffer with export metadata. */
export function serializeLiveEvents(input: {
  workspace: string;
  filter: string;
  events: CoreEvent[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    filter: input.filter,
    count: input.events.length,
    events: input.events,
  });
}
