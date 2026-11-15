import { exportStamp, exportJson } from "./exportFile";

import type { SessionBundle } from "@lingzhu/ui/types";

/** One session row picked for a combined export. */
export interface BatchExportItem {
  path: string;
  id: string;
}

/** Serializes several session bundles as one pretty-printed JSON array. */
export function serializeBundles(bundles: SessionBundle[]): string {
  return exportJson(bundles);
}

/** Builds a timestamped, filesystem-safe name for a combined bundle export. */
export function batchExportName(count: number, date = new Date()): string {
  return `session-bundles-${count}-${exportStamp(date)}.json`;
}

/** Builds a timestamped, filesystem-safe name for a combined Markdown export. */
export function batchMarkdownName(count: number, date = new Date()): string {
  return `session-markdown-${count}-${exportStamp(date)}.md`;
}

export interface MarkdownPart {
  id: string;
  title?: string;
  markdown: string;
}

/** Joins session Markdown exports with one heading per session. */
export function combineMarkdown(parts: MarkdownPart[]): string {
  return parts
    .map((part) => {
      const heading = `# ${part.title?.trim() || part.id}`;
      const body = part.markdown.trim();
      return body ? `${heading}\n\n${body}` : heading;
    })
    .join("\n\n---\n\n");
}
