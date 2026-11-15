import { exportJson, exportedAt, exportName } from "./exportFile";

import type { FormatterInfo } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a formatter list export. */
export function formattersExportName(workspace: string, date = new Date()): string {
  return exportName(workspace, "formatters", { basename: true, fallback: "workspace", date });
}

/** Serializes the resolved formatters of one workspace. */
export function serializeFormatters(input: {
  workspace: string;
  formatters: FormatterInfo[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    count: input.formatters.length,
    formatters: input.formatters.map((item) => ({
    name: item.name,
    command: item.command,
    extensions: item.extensions,
    source: item.source,
    })),
  });
}
