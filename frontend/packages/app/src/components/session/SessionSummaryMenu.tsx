import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Boxes, Gauge, Plug, Settings2, Sparkles, X } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Switch } from "@lingzhu/ui/switch";
import { useT } from "@lingzhu/ui/i18n";
import { update } from "@lingzhu/ui/solid";
import type { MCPServer, PluginStatus, SkillSummary } from "@lingzhu/ui/types";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { SESSION_SUMMARY_EVENT } from "../../lib/keybinds";
import { MCPAuthDialog } from "../dialogs/MCPAuthDialog";
import { MCPErrorDialog } from "../dialogs/MCPErrorDialog";

interface Props {
  workspace?: string;
  mobile?: boolean;
  onOpenMCP?: (server?: string) => void;
  onOpenExtensions?: () => void;
  onOpenSkill?: (id: string) => void;
  onOpenSkillFile?: (path: string) => void;
}

type Summary = {
  servers: MCPServer[];
  plugins: PluginStatus[];
  skills: SkillSummary[];
  skillErrors: boolean;
};

/** Header summary of the session's MCP, plugin and skill services. */
export function SessionSummaryMenu(props: Props) {
  const tr = useT();
  const [open, setOpen] = createSignal(false);
  const [summary, setSummary] = createSignal<Summary>();
  const [loading, setLoading] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  const [busyServers, setBusyServers] = createSignal<Record<string, boolean>>({});
  const [errorServer, setErrorServer] = createSignal<MCPServer>();
  const [authServer, setAuthServer] = createSignal<string>();

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setLoadError("");
    try {
      const [servers, plugins, skills, errors] = await Promise.all([
        api.mcpStatus(workspace),
        api.plugins(workspace),
        api.skills(workspace),
        api.skillErrors(workspace).catch(() => []),
      ]);
      setSummary({
        servers: [...(servers ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
        plugins: [...(plugins ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
        skills: [...(skills ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
        skillErrors: (errors?.length ?? 0) > 0,
      });
      setActionError("");
    } catch (cause) {
      setSummary(undefined);
      setLoadError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (open() && props.workspace) void load();
  });

  onMount(() => {
    const toggle = () => setOpen(!open());
    window.addEventListener(SESSION_SUMMARY_EVENT, toggle);
    onCleanup(() => window.removeEventListener(SESSION_SUMMARY_EVENT, toggle));
  });

  const replaceServer = (next: MCPServer) =>
    update(setSummary, summary, (current) =>
      current
        ? {
            ...current,
            servers: current.servers.map((item) => (item.name === next.name ? next : item)),
          }
        : current,
    );

  const toggleServer = async (server: MCPServer, enabled: boolean) => {
    const workspace = props.workspace;
    if (!workspace || busyServers()[server.name] || server.status === "pending") return;
    update(setBusyServers, busyServers, (current) => ({ ...current, [server.name]: true }));
    try {
      const next = enabled
        ? await api.reconnectMCP(workspace, server.name)
        : await api.disconnectMCP(workspace, server.name);
      replaceServer(next);
      setActionError("");
      void load();
    } catch (cause) {
      setActionError(messageOf(cause));
    } finally {
      update(setBusyServers, busyServers, (current) => {
        const next = { ...current };
        delete next[server.name];
        return next;
      });
    }
  };

  const count = (value: number | undefined) => (loading() || value === undefined ? "…" : String(value));
  const mcpConnected = () => summary()?.servers.filter((server) => server.status === "connected").length;
  const mcpCount = () =>
    summary() && !loading() ? `${mcpConnected()}/${summary()?.servers.length}` : "…";
  const mcpTone = createMemo(() => {
    if (summary()?.servers.some((server) => server.status === "failed")) return "danger" as const;
    if (summary()?.servers.some((server) => server.status === "needs_auth")) return "warning" as const;
    return undefined;
  });
  const pluginTone = createMemo(() =>
    summary()?.plugins.some((plugin) => plugin.status === "failed") ? ("danger" as const) : undefined,
  );

  const statusLabel = (status: string) =>
    status === "connected"
      ? tr("connected")
      : status === "failed"
        ? tr("mcpFailed")
        : status === "needs_auth"
          ? tr("mcpNeedsAuth")
          : status === "disabled"
            ? tr("mcpDisabled")
            : tr("starting");

  const closeThen = (action?: () => void) => {
    setOpen(false);
    action?.();
  };

  const emptyLabel = (empty: string) =>
    loading() && !summary() ? "Loading…" : loadError() ? loadError() : tr(empty as never);

  return (
    <>
      <Show
        when={props.mobile}
        fallback={
          <>
            <DropdownMenu
              open={open()}
              onOpenChange={(next) => {
                setOpen(next);
              }}
            >
              <DropdownMenuTrigger
                type="button"
                aria-label={tr("sessionSummaryMenu")}
                title={tr("sessionSummaryMenu")}
                class="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
              >
                <Gauge class="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} class="w-64 p-1">
                <DropdownMenuLabel>{tr("extensions")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <SummarySub
                  icon={<Plug class="size-4" />}
                  label="MCP"
                  value={mcpCount()}
                  tone={mcpTone()}
                >
                  <Show
                    when={summary()?.servers.length}
                    fallback={<EmptyRow label={emptyLabel("emptyMcps")} />}
                  >
                    <For each={summary()?.servers ?? []}>
                      {(server) => {
                        const busy = () => busyServers()[server.name] || server.status === "pending";
                        const signIn = () => server.status === "needs_auth";
                        return (
                          <div class="flex min-h-7 items-center gap-2 rounded-xs px-3 pe-1.5 text-body leading-4">
                            <StatusDot status={server.status} />
                            <button
                              type="button"
                              onClick={() =>
                                closeThen(() => {
                                  if (server.status === "failed") setErrorServer(server);
                                  else props.onOpenMCP?.(server.name);
                                })
                              }
                              title={server.error || server.name}
                              class="min-w-0 flex-1 truncate text-left text-text-base hover:text-text-accent"
                            >
                              {server.name}
                            </button>
                            <Show
                              when={signIn()}
                              fallback={
                                <Switch
                                  checked={server.status === "connected"}
                                  disabled={busy()}
                                  aria-label={`${server.name}: ${statusLabel(server.status)}`}
                                  onCheckedChange={(checked) => void toggleServer(server, checked)}
                                />
                              }
                            >
                              <button
                                type="button"
                                onClick={() => closeThen(() => setAuthServer(server.name))}
                                class="shrink-0 px-1 text-caption font-[440] text-text-accent hover:text-text-accent/80"
                              >
                                {tr("mcpSignIn")}
                              </button>
                            </Show>
                            <span class="sr-only">{statusLabel(server.status)}</span>
                          </div>
                        );
                      }}
                    </For>
                  </Show>
                  <Show when={loadError()}>
                    <RetryRow onRetry={() => void load()} />
                  </Show>
                </SummarySub>

                <SummarySub
                  icon={<Boxes class="size-4" />}
                  label={tr("plugins")}
                  value={count(summary()?.plugins.length)}
                  tone={pluginTone()}
                >
                  <Show
                    when={summary()?.plugins.length}
                    fallback={<EmptyRow label={emptyLabel("emptyPlugins")} />}
                  >
                    <For each={summary()?.plugins ?? []}>
                      {(plugin) => (
                        <DropdownMenuItem
                          onSelect={() => closeThen(props.onOpenExtensions)}
                          class="gap-2"
                        >
                          <Boxes class="size-4 shrink-0 text-text-faint" />
                          <Show when={plugin.status === "failed"}>
                            <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-state-fg-danger" />
                          </Show>
                          <span class="min-w-0 flex-1 truncate" title={plugin.error}>
                            {plugin.name}
                          </span>
                          <span class="shrink-0 text-caption text-text-faint">
                            {plugin.status === "failed" ? tr("mcpFailed") : pluginToolSummary(plugin)}
                          </span>
                        </DropdownMenuItem>
                      )}
                    </For>
                  </Show>
                  <Show when={loadError()}>
                    <RetryRow onRetry={() => void load()} />
                  </Show>
                </SummarySub>

                <SummarySub
                  icon={<Sparkles class="size-4" />}
                  label={tr("skills")}
                  value={count(summary()?.skills.length)}
                  tone={summary()?.skillErrors ? "danger" : undefined}
                >
                  <Show
                    when={summary()?.skills.length}
                    fallback={<EmptyRow label={emptyLabel("emptySkills")} />}
                  >
                    <For each={summary()?.skills ?? []}>
                      {(skill) => (
                        <DropdownMenuItem
                          onSelect={() =>
                            closeThen(() => {
                              if (skill.path && props.onOpenSkillFile) {
                                props.onOpenSkillFile(skill.path);
                              } else {
                                props.onOpenSkill?.(skill.id);
                              }
                            })
                          }
                          class="gap-2"
                        >
                          <Sparkles class="size-4 shrink-0 text-text-faint" />
                          <span class="min-w-0 flex-1 truncate" title={skill.path}>
                            {skill.name}
                          </span>
                          <Show when={skill.autoinvoke === false}>
                            <span class="shrink-0 text-caption text-text-faint">{tr("manualInvoke")}</span>
                          </Show>
                        </DropdownMenuItem>
                      )}
                    </For>
                  </Show>
                  <Show when={loadError()}>
                    <RetryRow onRetry={() => void load()} />
                  </Show>
                </SummarySub>

                <Show when={actionError()}>
                  <DropdownMenuSeparator />
                  <div role="alert" class="px-3 py-1.5 text-caption leading-4 text-state-fg-danger">
                    {actionError()}
                  </div>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <button
          type="button"
          aria-label={tr("sessionSummaryMenu")}
          title={tr("sessionSummaryMenu")}
          onClick={() => setOpen(true)}
          class="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
        >
          <Gauge class="size-4" />
        </button>
        <MobileSummarySheet
          open={open()}
          onOpenChange={setOpen}
          summary={summary()}
          loading={loading()}
          loadError={loadError()}
          actionError={actionError()}
          busyServers={busyServers()}
          onToggleServer={(server, enabled) => void toggleServer(server, enabled)}
          onOpenMCP={props.onOpenMCP}
          onAuth={(server) => {
            setOpen(false);
            setAuthServer(server);
          }}
          onError={(server) => {
            setOpen(false);
            setErrorServer(server);
          }}
          onOpenExtensions={props.onOpenExtensions}
          onOpenSkill={props.onOpenSkill}
          onOpenSkillFile={props.onOpenSkillFile}
          onRetry={() => void load()}
        />
      </Show>
      <MCPErrorDialog
        open={errorServer() !== undefined}
        workspace={props.workspace}
        server={errorServer()}
        onOpenChange={(next) => {
          if (!next) setErrorServer(undefined);
        }}
        onChanged={(next) => {
          replaceServer(next);
          if (next.status === "failed") setErrorServer(next);
          void load();
        }}
      />
      <MCPAuthDialog
        open={authServer() !== undefined}
        workspace={props.workspace}
        server={authServer()}
        onOpenChange={(next) => {
          if (!next) setAuthServer(undefined);
        }}
        onAuthorized={(next) => {
          replaceServer(next);
          setAuthServer(undefined);
          void load();
        }}
      />
    </>
  );
}

function MobileSummarySheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary?: Summary;
  loading: boolean;
  loadError: string;
  actionError: string;
  busyServers: Record<string, boolean>;
  onToggleServer: (server: MCPServer, enabled: boolean) => void;
  onOpenMCP?: (server?: string) => void;
  onAuth: (server: string) => void;
  onError: (server: MCPServer) => void;
  onOpenExtensions?: () => void;
  onOpenSkill?: (id: string) => void;
  onOpenSkillFile?: (path: string) => void;
  onRetry: () => void;
}) {
  const tr = useT();

  createEffect(() => {
    if (!props.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  const count = (value: number | undefined) => (props.loading || value === undefined ? "…" : String(value));
  const connected = () => props.summary?.servers.filter((server) => server.status === "connected").length;
  const mcpCount = () =>
    props.summary && !props.loading ? `${connected()}/${props.summary.servers.length}` : "…";
  const mcpTone = createMemo(() => {
    if (props.summary?.servers.some((server) => server.status === "failed")) return "danger" as const;
    if (props.summary?.servers.some((server) => server.status === "needs_auth")) return "warning" as const;
    return undefined;
  });
  const pluginTone = createMemo(() =>
    props.summary?.plugins.some((plugin) => plugin.status === "failed") ? ("danger" as const) : undefined,
  );
  const closeThen = (action?: () => void) => {
    props.onOpenChange(false);
    action?.();
  };
  const emptyLabel = (empty: string) =>
    props.loading && !props.summary ? "Loading…" : props.loadError ? props.loadError : tr(empty as never);
  const statusLabel = (status: string) =>
    status === "connected"
      ? tr("connected")
      : status === "failed"
        ? tr("mcpFailed")
        : status === "needs_auth"
          ? tr("mcpNeedsAuth")
          : status === "disabled"
            ? tr("mcpDisabled")
            : tr("starting");

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[70] flex flex-col justify-end">
        <div aria-hidden="true" onClick={() => props.onOpenChange(false)} class="absolute inset-0 bg-overlay-scrim" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tr("sessionSummaryMenu")}
          class="relative z-10 flex max-h-[min(85dvh,calc(100dvh-16px))] flex-col rounded-t-2xl bg-bg-deep px-3 pb-3 shadow-elevation-overlay"
        >
          <div aria-hidden="true" class="flex h-7 shrink-0 items-center justify-center">
            <span class="h-1 w-8 rounded-full bg-border-strong" />
          </div>
          <div class="flex h-9 shrink-0 items-center gap-2">
            <Gauge class="size-4 text-text-faint" />
            <span class="min-w-0 flex-1 text-body font-[530] text-text-base">{tr("extensions")}</span>
            <button
              type="button"
              aria-label={tr("closeTab")}
              onClick={() => props.onOpenChange(false)}
              class="interactive grid size-7 place-items-center rounded-md text-text-faint hover:text-text-base"
            >
              <X class="size-4" />
            </button>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-2">
            <MobileSection
              icon={<Plug class="size-4" />}
              label="MCP"
              value={mcpCount()}
              tone={mcpTone()}
            >
              <Show
                when={props.summary?.servers.length}
                fallback={<MobileEmpty label={emptyLabel("emptyMcps")} />}
              >
                <For each={props.summary?.servers ?? []}>
                  {(server) => {
                    const busy = () => props.busyServers[server.name] || server.status === "pending";
                    const signIn = () => server.status === "needs_auth";
                    return (
                      <div class="flex min-h-9 items-center gap-2 px-1">
                        <StatusDot status={server.status} />
                        <button
                          type="button"
                          onClick={() =>
                            closeThen(() => {
                              if (server.status === "failed") props.onError(server);
                              else props.onOpenMCP?.(server.name);
                            })
                          }
                          title={server.error || server.name}
                          class="min-w-0 flex-1 truncate text-left text-body text-text-base"
                        >
                          {server.name}
                        </button>
                        <Show
                          when={signIn()}
                          fallback={
                            <Switch
                              checked={server.status === "connected"}
                              disabled={busy()}
                              aria-label={`${server.name}: ${statusLabel(server.status)}`}
                              onCheckedChange={(checked) => props.onToggleServer(server, checked)}
                            />
                          }
                        >
                          <button
                            type="button"
                            onClick={() => closeThen(() => props.onAuth(server.name))}
                            class="shrink-0 px-1 text-caption text-text-accent"
                          >
                            {tr("mcpSignIn")}
                          </button>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
              <Show when={props.loadError}>
                <MobileAction icon={<Settings2 class="size-4" />} label={tr("retry")} onClick={props.onRetry} />
              </Show>
            </MobileSection>

            <MobileSection
              icon={<Boxes class="size-4" />}
              label={tr("plugins")}
              value={count(props.summary?.plugins.length)}
              tone={pluginTone()}
            >
              <Show
                when={props.summary?.plugins.length}
                fallback={<MobileEmpty label={emptyLabel("emptyPlugins")} />}
              >
                <For each={props.summary?.plugins ?? []}>
                  {(plugin) => (
                    <button
                      type="button"
                      onClick={() => closeThen(props.onOpenExtensions)}
                      title={plugin.error}
                      class="flex min-h-9 items-center gap-2 px-1 text-left"
                    >
                      <Boxes class="size-4 shrink-0 text-text-faint" />
                      <Show when={plugin.status === "failed"}>
                        <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-state-fg-danger" />
                      </Show>
                      <span class="min-w-0 flex-1 truncate text-body text-text-base">{plugin.name}</span>
                      <span class="shrink-0 text-caption text-text-faint">
                        {plugin.status === "failed" ? tr("mcpFailed") : pluginToolSummary(plugin)}
                      </span>
                    </button>
                  )}
                </For>
              </Show>
              <Show when={props.loadError}>
                <MobileAction icon={<Settings2 class="size-4" />} label={tr("retry")} onClick={props.onRetry} />
              </Show>
            </MobileSection>

            <MobileSection
              icon={<Sparkles class="size-4" />}
              label={tr("skills")}
              value={count(props.summary?.skills.length)}
              tone={props.summary?.skillErrors ? "danger" : undefined}
            >
              <Show
                when={props.summary?.skills.length}
                fallback={<MobileEmpty label={emptyLabel("emptySkills")} />}
              >
                <For each={props.summary?.skills ?? []}>
                  {(skill) => (
                    <button
                      type="button"
                      onClick={() =>
                        closeThen(() => {
                          if (skill.path && props.onOpenSkillFile) props.onOpenSkillFile(skill.path);
                          else props.onOpenSkill?.(skill.id);
                        })
                      }
                      title={skill.path}
                      class="flex min-h-9 items-center gap-2 px-1 text-left"
                    >
                      <Sparkles class="size-4 shrink-0 text-text-faint" />
                      <span class="min-w-0 flex-1 truncate text-body text-text-base">{skill.name}</span>
                      <Show when={skill.autoinvoke === false}>
                        <span class="shrink-0 text-caption text-text-faint">{tr("manualInvoke")}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
              <Show when={props.loadError}>
                <MobileAction icon={<Settings2 class="size-4" />} label={tr("retry")} onClick={props.onRetry} />
              </Show>
            </MobileSection>

            <Show when={props.actionError}>
              <p role="alert" class="px-1 text-caption leading-4 text-state-fg-danger">
                {props.actionError}
              </p>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

function MobileSection(props: {
  icon: JSX.Element;
  label: string;
  value: string;
  tone?: "danger" | "warning";
  children: JSX.Element;
}) {
  return (
    <section class="flex flex-col">
      <div class="flex items-center gap-2 px-1 py-1">
        <span class="flex min-w-0 flex-1 items-center gap-2 text-body text-text-muted">
          {props.icon}
          <span class="truncate">{props.label}</span>
        </span>
        <Show when={props.tone}>
          <span
            aria-hidden="true"
            class={`size-1.5 rounded-full ${
              props.tone === "danger" ? "bg-state-fg-danger" : "bg-state-fg-warning"
            }`}
          />
        </Show>
        <span class="text-meta tabular-nums text-text-faint">{props.value}</span>
      </div>
      <div class="flex flex-col rounded-lg bg-bg-layer-01 p-1">{props.children}</div>
    </section>
  );
}

function MobileAction(props: { icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="interactive flex h-9 items-center gap-2 rounded-md px-2 text-left text-body text-text-muted hover:text-text-base"
    >
      {props.icon}
      <span class="min-w-0 flex-1 truncate">{props.label}</span>
    </button>
  );
}

function MobileEmpty(props: { label: string }) {
  return <p class="px-2 py-2 text-meta leading-4 text-text-faint">{props.label}</p>;
}

function SummarySub(props: {
  icon: JSX.Element;
  label: string;
  value: string;
  tone?: "danger" | "warning";
  children: JSX.Element;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger class="gap-2">
        <span class="flex min-w-0 flex-1 items-center gap-2 text-text-muted">
          {props.icon}
          <span class="truncate">{props.label}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          <Show when={props.tone}>
            <span
              aria-hidden="true"
              class={`size-1.5 rounded-full ${
                props.tone === "danger" ? "bg-state-fg-danger" : "bg-state-fg-warning"
              }`}
            />
          </Show>
          <span class="text-meta tabular-nums text-text-faint">{props.value}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent class="w-72">{props.children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function StatusDot(props: { status: string }) {
  return (
    <span
      aria-hidden="true"
      class={`size-1.5 shrink-0 rounded-full ${
        props.status === "connected"
          ? "bg-state-fg-success"
          : props.status === "failed"
            ? "bg-state-fg-danger"
            : props.status === "needs_auth"
              ? "bg-state-fg-warning"
              : "bg-text-faint"
      }`}
    />
  );
}

function pluginToolSummary(plugin: PluginStatus) {
  const parts: string[] = [];
  if (plugin.tools.length) parts.push(`${plugin.tools.length} tools`);
  if (plugin.commands.length) parts.push(`${plugin.commands.length} commands`);
  return parts.join(" · ");
}

function EmptyRow(props: { label: string }) {
  return <div class="px-3 py-2 text-meta leading-4 text-text-faint">{props.label}</div>;
}

function RetryRow(props: { onRetry: () => void }) {
  const tr = useT();
  return (
    <DropdownMenuItem
      onSelect={() => {
        props.onRetry();
      }}
      class="gap-2 text-text-accent"
    >
      <Settings2 class="size-4" />
      {tr("retry")}
    </DropdownMenuItem>
  );
}
