import type { VCSFileDiff } from "./types";

/**
 * Semantic text tone for a changed file's status. The change list and the review
 * rail both label added/deleted/modified rows, so the mapping lives here instead
 * of being copied into each surface.
 */
export function fileStatusTone(status: VCSFileDiff["status"]): string {
  if (status === "added") return "text-state-fg-success";
  if (status === "deleted") return "text-state-fg-danger";
  return "text-state-fg-info";
}

/** One-letter change marker for a file row: A, D or M. */
export function fileStatusLetter(status: VCSFileDiff["status"]): string {
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  return "M";
}
