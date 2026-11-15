import { exportSafeName, exportStamp, exportJson, exportedAt } from "./exportFile";

import type { MCPResourceContent, MCPToolResult } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for an MCP export. */
export function mcpExportName(
  server: string,
  kind: "tool" | "resource",
  date = new Date(),
): string {
  return `${exportSafeName(server, "mcp")}-${kind}-${exportStamp(date)}.json`;
}

/** Serializes one MCP tool invocation and its result. */
export function serializeMCPTool(input: {
  server: string;
  tool: string;
  args: unknown;
  result: MCPToolResult;
  date?: Date;
}): string {
  return exportJson({
    server: input.server,
    tool: input.tool,
    args: input.args,
    exportedAt: exportedAt(input.date),
    isError: input.result.isError,
    content: input.result.content,
    structuredContent: input.result.structuredContent ?? null,
  });
}

/** Serializes one MCP resource read result. */
export function serializeMCPResource(input: {
  server: string;
  uri: string;
  contents: MCPResourceContent[];
  date?: Date;
}): string {
  return exportJson({
    server: input.server,
    uri: input.uri,
    exportedAt: exportedAt(input.date),
    count: input.contents.length,
    contents: input.contents,
  });
}
