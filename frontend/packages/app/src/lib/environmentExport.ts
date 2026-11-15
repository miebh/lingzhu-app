import { exportJson, exportName, exportedAt } from "./exportFile";

import type { SessionEnvironment } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for an environment export. */
export function environmentExportName(sessionID: string, date = new Date()): string {
  return exportName(sessionID, "environment", { fallback: "session", date });
}

/** Serializes one session's runtime environment with export metadata. */
export function serializeEnvironment(input: {
  environment: SessionEnvironment;
  date?: Date;
}): string {
  const env = input.environment;
  return exportJson({
    id: env.id,
    workdir: env.workdir,
    shell: env.shell,
    running: env.running,
    provider: env.provider,
    model: env.model,
    agent: env.agent,
    os: env.os,
    arch: env.arch,
    exportedAt: exportedAt(input.date),
  });
}
