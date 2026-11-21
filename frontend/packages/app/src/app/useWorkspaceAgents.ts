import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { api } from "../lib/api";
import type { AgentProfile, SlashCommand, WorkspaceInfo } from "@lingzhu/ui/types";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Slash commands and agents for the active workspace. The list is static for
 * the life of the core, so it reloads only when the workspace changes or the
 * composer's Reload action asks for it.
 */
export function useWorkspaceAgents(workspace: Accessor<WorkspaceInfo | undefined>) {
  const [commands, setCommands] = createSignal<SlashCommand[]>([]);
  const [agents, setAgents] = createSignal<AgentProfile[]>([]);
  const [defaultAgent, setDefaultAgent] = createSignal("");
  const [homeAgent, setHomeAgent] = createSignal("");

  createEffect(() => {
    const current = workspace();
    const path = current?.path;
    if (!path || !current?.connected) {
      setCommands([]);
      setAgents([]);
      return;
    }
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
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
  });

  /** Re-reads plugins and agents, then refreshes the workspace session list. */
  const reload = async () => {
    const path = workspace()?.path;
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
