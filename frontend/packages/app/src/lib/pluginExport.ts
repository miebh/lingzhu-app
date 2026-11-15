import { exportSafeName, exportStamp, exportJson, exportedAt } from "./exportFile";

import type { PluginToolResult } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a plugin tool export. */
export function pluginExportName(plugin: string, tool: string, date = new Date()): string {
  return `${exportSafeName(plugin, "plugin")}-${exportSafeName(tool, "plugin")}-${exportStamp(date)}.json`;
}

/** Serializes one plugin tool invocation and its result. */
export function serializePluginTool(input: {
  plugin: string;
  tool: string;
  args: unknown;
  result: PluginToolResult;
  date?: Date;
}): string {
  return exportJson({
    plugin: input.plugin,
    tool: input.tool,
    args: input.args,
    exportedAt: exportedAt(input.date),
    isError: input.result.isError,
    output: input.result.output,
    content: input.result.content,
  });
}
