import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Icon } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { SegmentedControl } from "@lingzhu/ui/segmented-control";
import { Switch } from "@lingzhu/ui/switch";
import { MCPConfigDialog } from "../dialogs/MCPConfigDialog";
import { MCPDialog } from "../dialogs/MCPDialog";
import { MCPAuthDialog } from "../dialogs/MCPAuthDialog";
import { MCPErrorDialog } from "../dialogs/MCPErrorDialog";
import { ConfigFileDialog } from "../dialogs/ConfigFileDialog";
import { SkillsDialog } from "../dialogs/SkillsDialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { t } from "@lingzhu/ui/i18n";
import type { MCPServer, PluginStatus, SkillSummary } from "@lingzhu/ui/types";

const TABS = ["mcps", "plugins", "skills"] as const;
type Tab = (typeof TABS)[number];

const TAB_OPTIONS = [
  { value: "mcps" as const, key: "mcpsTab" },
  { value: "plugins" as const, key: "plugins" },
  { value: "skills" as const, key: "skills" },
];

const EMPTY: Record<Tab, string> = {
  mcps: "emptyMcps",
  plugins: "emptyPlugins",
  skills: "emptySkills",
};

const SKILL_GROUPS = [
  { source: "project", label: "skillsProject" },
  { source: "global", label: "skillsGlobal" },
  { source: "remote", label: "skillsRemote" },
] as const;

interface Props {
  workspace?: string;
  onOpenSkillFile?: (path: string) => void;
  onOpenConfigFile?: () => void;
}

/** Extensions page with the reference's pill tabs and catalog rows. */
export function ExtensionsSection(props: Props) {
  const [tab, setTab] = createSignal<Tab>("mcps");
  const [mcps, setMcps] = createSignal<MCPServer[]>([]);
  const [plugins, setPlugins] = createSignal<PluginStatus[]>([]);
  const [skills, setSkills] = createSignal<SkillSummary[]>([]);
  const [skillErrors, setSkillErrors] = createSignal<{ url: string; error: string }[]>([]);
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshingSource, setRefreshingSource] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [mcpConfigOpen, setMcpConfigOpen] = createSignal(false);
  const [configFileOpen, setConfigFileOpen] = createSignal(false);
  const [selectedMCP, setSelectedMCP] = createSignal<string>();
  const [authServer, setAuthServer] = createSignal<string>();
  const [errorServer, setErrorServer] = createSignal<MCPServer>();
  const [skillDialog, setSkillDialog] = createSignal<{ id?: string; create?: boolean }>();
  const [acting, setActing] = createSignal("");

  const replaceMCP = (next: MCPServer) =>
    update(setMcps, mcps, (current) => current.map((item) => (item.name === next.name ? next : item)));

  const act = async (name: string, action: "reconnect" | "disconnect") => {
    const workspace = props.workspace;
    if (!workspace) return;
    setActing(name);
    try {
      const next =
        action === "reconnect"
          ? await api.reconnectMCP(workspace, name)
          : await api.disconnectMCP(workspace, name);
      replaceMCP(next);
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setActing("");
    }
  };

  const refreshSkills = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setRefreshing(true);
    try {
      await api.refreshSkills(workspace);
      const [next, errors] = await Promise.all([api.skills(workspace), api.skillErrors(workspace)]);
      setSkills(next ?? []);
      setSkillErrors(errors ?? []);
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshSource = async (sourceURL: string) => {
    const workspace = props.workspace;
    if (!workspace || !sourceURL) return;
    setRefreshingSource(sourceURL);
    try {
      await api.refreshSkillSource(workspace, sourceURL);
      const [next, errors] = await Promise.all([api.skills(workspace), api.skillErrors(workspace)]);
      setSkills(next ?? []);
      setSkillErrors(errors ?? []);
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setRefreshingSource("");
    }
  };

  createEffect(() => {
    const workspace = props.workspace;
    if (!workspace) return;
    let live = true;
    void Promise.all([
      api.mcpStatus(workspace),
      api.plugins(workspace),
      api.skills(workspace),
      api.skillErrors(workspace).catch(() => []),
    ])
      .then(([nextMcps, nextPlugins, nextSkills, nextSkillErrors]) => {
        if (!live) return;
        setMcps(nextMcps ?? []);
        setPlugins(nextPlugins ?? []);
        setSkills(nextSkills ?? []);
        setSkillErrors(nextSkillErrors ?? []);
        setError("");
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      });
    onCleanup(() => {
      live = false;
    });
  });

  createEffect(() => {
    const workspace = props.workspace;
    if (!workspace) return;
    const timer = window.setInterval(() => {
      void api
        .skills(workspace)
        .then(setSkills)
        .catch(() => undefined);
      void api
        .mcpStatus(workspace)
        .then(setMcps)
        .catch(() => undefined);
    }, 3000);
    onCleanup(() => window.clearInterval(timer));
  });

  const openConfigPath = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    try {
      const config = await api.coreConfig(workspace);
      if (!config.path) {
        setNotice(t("configPathUnavailable"));
        window.setTimeout(() => setNotice(""), 1600);
        return;
      }
      try {
        await api.revealPath(config.path);
        setNotice(t("openInFileManager"));
      } catch {
        await navigator.clipboard.writeText(config.path);
        setNotice(t("configPathCopied"));
      }
      window.setTimeout(() => setNotice(""), 1600);
    } catch {
      setNotice(t("configPathUnavailable"));
      window.setTimeout(() => setNotice(""), 1600);
    }
  };

  const skillGroups = createMemo(() =>
    SKILL_GROUPS.map((group) => ({
      ...group,
      items: skills().filter((skill) => (skill.source || "global") === group.source),
    })).filter((group) => group.items.length > 0),
  );

  return (
    <div class="flex flex-col gap-6">
      <SegmentedControl
        label={t("extensions")}
        value={tab()}
        options={TAB_OPTIONS.map((item) => ({ value: item.value, label: t(item.key as never) }))}
        onChange={(value) => setTab(value)}
        class="w-fit"
      />

      <section class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
            {t("availableAll")}
          </span>
          <Show
            when={tab() === "skills"}
            fallback={
              <div class="flex items-center gap-3">
                <Show when={tab() === "mcps"}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={!props.workspace}
                    onClick={() => setMcpConfigOpen(true)}
                    class="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
                  >
                    {t("mcpEditServers")}
                  </Button>
                </Show>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={!props.workspace}
                  onClick={() => (props.onOpenConfigFile ? props.onOpenConfigFile() : void openConfigPath())}
                  class="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
                >
                  {t("manageConfig")}
                </Button>
              </div>
            }
          >
            <div class="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!props.workspace || refreshing()}
                onClick={() => void refreshSkills()}
                class="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
              >
                {refreshing() ? "…" : t("refresh")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={!props.workspace}
                onClick={() => setSkillDialog({ create: true })}
                class="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
              >
                {t("newSkill")}
              </Button>
              <span class="text-body font-[440] leading-4 text-text-muted">{t("howToAddSkills")}</span>
            </div>
          </Show>
        </div>

        <Show when={error()}>
          <p role="alert" class="text-meta leading-5 text-state-fg-danger">
            {error()}
          </p>
        </Show>

        <Show when={tab() === "skills" && skillErrors().length > 0}>
          <div
            role="alert"
            class="flex flex-col gap-1 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-caption leading-5 text-state-fg-danger"
          >
            <For each={skillErrors()}>
              {(item) => (
                <div class="flex items-start gap-2">
                  <p class="min-w-0 flex-1 break-all">
                    {item.url ? `${item.url}: ` : ""}
                    {item.error}
                  </p>
                  <Show when={item.url}>
                    <button
                      type="button"
                      disabled={refreshingSource() === item.url}
                      onClick={() => void refreshSource(item.url)}
                      class="interactive shrink-0 text-text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refreshingSource() === item.url ? "…" : t("retry")}
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
          <Show when={tab() === "mcps"}>
            <For each={mcps()}>
              {(server) => {
                const enabled = () => server.status !== "disabled";
                const busy = () => acting() === server.name || server.status === "pending";
                return (
                  <div class="flex min-h-14 items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 last:border-0">
                    <button
                      type="button"
                      onClick={() =>
                        server.status === "failed" ? setErrorServer(server) : setSelectedMCP(server.name)
                      }
                      class="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Icon art="mcp" class="size-4 shrink-0 text-icon-muted" />
                      <div class="flex min-w-0 flex-col">
                        <span class="min-w-0 truncate text-body font-[530] leading-4 text-text-base">
                          {server.name}
                        </span>
                        <span
                          class={`min-w-0 truncate text-caption leading-4 ${
                            server.status === "failed" ? "text-state-fg-danger" : "text-text-muted"
                          }`}
                        >
                          {server.error ||
                            (server.status === "connected"
                              ? t("connected")
                              : server.status === "failed"
                                ? t("mcpFailed")
                                : server.status === "needs_auth"
                                  ? t("mcpNeedsAuth")
                                  : server.status === "disabled"
                                    ? t("mcpDisabled")
                                    : t("starting"))}
                        </span>
                      </div>
                    </button>
                    <div class="flex shrink-0 items-center gap-2">
                      <span
                        class={`size-1.5 rounded-full ${
                          server.status === "connected"
                            ? "bg-state-fg-success"
                            : server.status === "failed"
                              ? "bg-state-fg-danger"
                              : server.status === "needs_auth"
                                ? "bg-state-fg-warning"
                                : "bg-text-faint"
                        }`}
                        aria-hidden="true"
                      />
                      <Show
                        when={server.status === "needs_auth"}
                        fallback={
                          <Switch
                            checked={enabled()}
                            disabled={busy()}
                            aria-label={`${server.name}: ${
                              server.status === "connected" ? t("connected") : t("mcpDisabled")
                            }`}
                            onCheckedChange={(checked) =>
                              void act(server.name, checked ? "reconnect" : "disconnect")
                            }
                          />
                        }
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setAuthServer(server.name)}
                          class="px-0 text-body font-[440] text-text-accent hover:text-text-accent/80"
                        >
                          {t("mcpSignIn")}
                        </Button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>

          <Show when={tab() === "plugins"}>
            <For each={plugins()}>
              {(plugin) => (
                <div class="flex min-h-14 items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 last:border-0">
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <Icon art="cube" class="size-4 shrink-0 text-icon-muted" />
                    <Show when={plugin.status === "failed"}>
                      <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-state-fg-danger" />
                    </Show>
                    <div class="flex min-w-0 flex-col">
                      <span class="min-w-0 truncate text-body font-[530] leading-4 text-text-base">
                        {plugin.name}
                      </span>
                      <Show when={plugin.error}>
                        <span class="min-w-0 truncate text-caption leading-4 text-state-fg-danger">
                          {plugin.error}
                        </span>
                      </Show>
                    </div>
                  </div>
                  <span class="shrink-0 text-caption text-text-faint">
                    {[
                      plugin.tools.length ? `${plugin.tools.length} tools` : "",
                      plugin.commands.length ? `${plugin.commands.length} commands` : "",
                      plugin.panels.length ? `${plugin.panels.length} panels` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={!props.workspace}
                    onClick={() => (props.onOpenConfigFile ? props.onOpenConfigFile() : setConfigFileOpen(true))}
                    class="shrink-0 px-0 text-caption text-text-accent hover:text-text-accent/80"
                  >
                    {t("manageConfig")}
                  </Button>
                </div>
              )}
            </For>
          </Show>

          <Show when={tab() === "skills"}>
            <For each={skillGroups()}>
              {(group) => (
                <div class="border-b-[0.5px] border-border-base last:border-0">
                  <div class="flex items-center justify-between gap-2 py-2">
                    <span class="text-caption font-[530] text-text-faint">{t(group.label)}</span>
                    <button
                      type="button"
                      disabled={refreshing() || !props.workspace}
                      onClick={() => void refreshSkills()}
                      class="interactive px-0 text-caption text-text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refreshing() ? "…" : t("refresh")}
                    </button>
                  </div>
                  <For each={group.items}>
                    {(skill) => (
                      <SkillRow
                        skill={skill}
                        onSelect={() => {
                          if (skill.path && props.onOpenSkillFile) props.onOpenSkillFile(skill.path);
                          else setSkillDialog({ id: skill.id });
                        }}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
          </Show>

          <Show
            when={
              (tab() === "mcps" && mcps().length === 0) ||
              (tab() === "plugins" && plugins().length === 0) ||
              (tab() === "skills" && skills().length === 0)
            }
          >
            <p class="py-4 text-body font-[440] leading-4 text-text-muted">{t(EMPTY[tab()] as never)}</p>
          </Show>
        </div>

        <Show when={notice()}>
          <p class="text-caption text-text-muted">{notice()}</p>
        </Show>
      </section>
      <MCPConfigDialog
        open={mcpConfigOpen()}
        onOpenChange={setMcpConfigOpen}
        onSaved={() => {
          const workspace = props.workspace;
          if (!workspace) return;
          void api
            .mcpStatus(workspace)
            .then(setMcps)
            .catch(() => undefined);
        }}
      />
      <MCPDialog
        open={selectedMCP() !== undefined}
        workspace={props.workspace}
        server={selectedMCP()}
        onOpenChange={(open) => {
          if (!open) setSelectedMCP(undefined);
        }}
      />
      <SkillsDialog
        open={skillDialog() !== undefined}
        workspace={props.workspace}
        skillID={skillDialog()?.id}
        create={skillDialog()?.create}
        onOpenChange={(open) => {
          if (!open) setSkillDialog(undefined);
        }}
      />
      <MCPAuthDialog
        open={authServer() !== undefined}
        workspace={props.workspace}
        server={authServer()}
        onOpenChange={(open) => {
          if (!open) setAuthServer(undefined);
        }}
        onAuthorized={(next) => {
          replaceMCP(next);
          setAuthServer(undefined);
        }}
      />
      <MCPErrorDialog
        open={errorServer() !== undefined}
        workspace={props.workspace}
        server={errorServer()}
        onOpenChange={(open) => {
          if (!open) setErrorServer(undefined);
        }}
        onChanged={(next) => {
          replaceMCP(next);
          if (next.status === "failed") setErrorServer(next);
        }}
      />
      <ConfigFileDialog open={configFileOpen()} onOpenChange={setConfigFileOpen} />
    </div>
  );
}

function SkillRow(props: { skill: SkillSummary; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect()}
      title={props.skill.path}
      class="interactive flex min-h-14 w-full items-center justify-between gap-3 border-b-[0.5px] border-border-base py-4 text-left last:border-0"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <Icon art="post-skill" class="size-4 shrink-0 text-icon-muted" />
        <div class="flex min-w-0 flex-col">
          <span class="flex items-center gap-2">
            <span class="min-w-0 truncate text-body font-[530] leading-4 text-text-base">{props.skill.name}</span>
            <Show when={props.skill.autoinvoke === false}>
              <span class="shrink-0 text-caption text-text-faint">{t("manualInvoke")}</span>
            </Show>
          </span>
          <Show when={props.skill.description}>
            <span class="min-w-0 truncate text-caption leading-4 text-text-muted">{props.skill.description}</span>
          </Show>
          <Show when={props.skill.path}>
            <span class="min-w-0 truncate font-mono text-caption leading-4 text-text-faint">{props.skill.path}</span>
          </Show>
        </div>
      </div>
    </button>
  );
}
