import { exportJson, exportedAt, exportName } from "./exportFile";

import type {
  AgentCatalog,
  AppInfo,
  CoreConfig,
  CoreHealth,
  SlashCommand,
} from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a core summary export. */
export function coreExportName(workspace: string, date = new Date()): string {
  return exportName(workspace, "core", { basename: true, fallback: "workspace", date });
}

/** Serializes health, app paths, config, agents and commands as one summary. */
export function serializeCore(input: {
  workspace: string;
  health?: CoreHealth;
  healthError: string;
  info?: AppInfo;
  config?: CoreConfig;
  agents?: AgentCatalog;
  commands: SlashCommand[];
  date?: Date;
}): string {
  return exportJson({
    workspace: input.workspace,
    exportedAt: exportedAt(input.date),
    health: input.health ?? null,
    healthError: input.healthError || null,
    app: input.info ?? null,
    config: input.config ?? null,
    agents: input.agents
    ? {
    default: input.agents.default,
    agents: input.agents.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    model: agent.model ?? null,
    hidden: agent.hidden ?? false,
    })),
    }
    : null,
    commands: input.commands.map((command) => ({
    name: command.name,
    description: command.description,
    template: command.template,
    plugin: command.plugin,
    })),
  });
}
