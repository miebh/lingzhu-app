import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AgentProfile, SlashCommand, WorkspaceInfo } from "@lingzhu/ui/types";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Slash commands and agents for the active workspace. The list is static for
 * the life of the core, so it reloads only when the workspace changes or the
 * composer's Reload action asks for it.
 */
export function useWorkspaceAgents(workspace?: WorkspaceInfo) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [defaultAgent, setDefaultAgent] = useState("");
  const [homeAgent, setHomeAgent] = useState("");

  useEffect(() => {
    const path = workspace?.path;
    if (!path || !workspace?.connected) {
      setCommands([]);
      setAgents([]);
      return;
    }
    let cancelled = false;
    api
      .commands(path)
      .then((items) => {
        if (!cancelled) setCommands(items ?? []);
      })
      .catch(() => {
        if (!cancelled) setCommands([]);
      });
    api
      .agents(path)
      .then((catalog) => {
        if (cancelled) return;
        const list = catalog.agents ?? [];
        setAgents(list);
        setDefaultAgent(catalog.default || "");
        setHomeAgent((current) =>
          current && list.some((item) => item.id === current) ? current : catalog.default || list[0]?.id || "",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.path, workspace?.connected]);

  /** Re-reads plugins and agents, then refreshes the workspace session list. */
  const reload = async () => {
    const path = workspace?.path;
    if (!path) return;
    const [commandList, catalog] = await Promise.all([api.commands(path), api.agents(path)]);
    setCommands(commandList ?? []);
    const list = catalog.agents ?? [];
    setAgents(list);
    setDefaultAgent(catalog.default || "");
    await useWorkspaceStore.getState().refresh();
    await useWorkspaceStore.getState().loadSessions(path);
  };

  return { commands, agents, defaultAgent, homeAgent, setHomeAgent, reload };
}
