import { exportJson, exportedAt, exportName } from "./exportFile";

import type { Worktree } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a worktree export. */
export function worktreesExportName(repo: string, count: number, date = new Date()): string {
  return exportName(repo, "worktrees", { count, basename: true, fallback: "workspace", date });
}

/** Serializes a repository's worktree list with detached/bare-style flags. */
export function serializeWorktrees(input: {
  workspace: string;
  repo: string;
  worktrees: Worktree[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    repo: input.repo,
    exportedAt: exportedAt(input.date),
    count: input.worktrees.length,
    worktrees: input.worktrees.map((item) => ({
    path: item.path,
    branch: item.branch ?? "",
    head: item.head ?? "",
    main: item.main,
    detached: !item.branch,
    })),
  });
}
