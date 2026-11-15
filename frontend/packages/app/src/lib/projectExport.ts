import { exportJson, exportedAt, exportName } from "./exportFile";

import type { ProjectInfo, SessionLocation } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a project metadata export. */
export function projectExportName(name: string, date = new Date()): string {
  return exportName(name, "project", { basename: true, fallback: "project", date });
}

/** Serializes project metadata plus the active session's location. */
export function serializeProject(input: {
  workspace: string;
  project: ProjectInfo;
  location?: SessionLocation;
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    project: {
    directory: input.project.directory,
    name: input.project.name,
    config: input.project.config ?? null,
    instructions: input.project.instructions ?? null,
    sessions: input.project.sessions,
    vcs: input.project.vcs ?? null,
    },
    location: input.location
    ? {
    sessionId: input.location.sessionId,
    directory: input.location.directory,
    project: input.location.project,
    provider: input.location.provider,
    model: input.location.model,
    agent: input.location.agent,
    permissions: input.location.permissions,
    }
    : null,
  });
}
