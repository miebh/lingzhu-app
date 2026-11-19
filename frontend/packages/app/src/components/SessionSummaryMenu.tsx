import { useEffect, useState, type ReactNode } from "react";
import { Boxes, FileText, Gauge, Plug, Plus, Settings2, Sparkles, X } from "@lingzhu/ui/icons";
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
import type { MCPServer, PluginStatus, SkillSummary } from "@lingzhu/ui/types";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { SESSION_SUMMARY_EVENT } from "../lib/keybinds";
import { MCPAuthDialog } from "./MCPAuthDialog";
import { MCPErrorDialog } from "./MCPErrorDialog";
import { ConfigFileDialog } from "./ConfigFileDialog";

interface Props {
  workspace?: string;
  mobile?: boolean;
  onOpenMCP?: (server?: string) => void;
  onOpenExtensions?: () => void;
  onOpenSkill?: (id: string) => void;
  onOpenSkillFile?: (path: string) => void;
  onCreateSkill?: () => void;
  onSetupSkill?: () => void;
  onOpenConfigFile?: () => void;
}

type Summary = {
  servers: MCPServer[];
  plugins: PluginStatus[];
  skills: SkillSummary[];
  skillErrors: boolean;
};

/** Header summary of the session's MCP, plugin and skill services. */
export function SessionSummaryMenu({
  workspace,
  mobile,
  onOpenMCP,
  onOpenExtensions,
  onOpenSkill,
  onOpenSkillFile,
  onCreateSkill,
  onSetupSkill,
  onOpenConfigFile,
}: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyServers, setBusyServers] = useState<Record<string, boolean>>({});
  const [errorServer, setErrorServer] = useState<MCPServer>();
  const [authServer, setAuthServer] = useState<string>();
  const [configOpen, setConfigOpen] = useState(false);

  const load = async () => {
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

  useEffect(() => {
    if (open && workspace) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    window.addEventListener(SESSION_SUMMARY_EVENT, toggle);
    return () => window.removeEventListener(SESSION_SUMMARY_EVENT, toggle);
  }, []);

  const replaceServer = (next: MCPServer) =>
    setSummary((current) =>
      current
        ? {
            ...current,
            servers: current.servers.map((item) => (item.name === next.name ? next : item)),
          }
        : current,
    );

  const toggleServer = async (server: MCPServer, enabled: boolean) => {
    if (!workspace || busyServers[server.name] || server.status === "pending") return;
    setBusyServers((current) => ({ ...current, [server.name]: true }));
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
      setBusyServers((current) => {
        const next = { ...current };
        delete next[server.name];
        return next;
      });
    }
  };

  const count = (value: number | undefined) => (loading || value === undefined ? "…" : String(value));
  const mcpConnected = summary?.servers.filter((server) => server.status === "connected").length;
  const mcpCount = summary && !loading ? `${mcpConnected}/${summary.servers.length}` : "…";
  const mcpTone = summary?.servers.some((server) => server.status === "failed")
    ? "danger"
    : summary?.servers.some((server) => server.status === "needs_auth")
      ? "warning"
      : undefined;
  const pluginTone = summary?.plugins.some((plugin) => plugin.status === "failed") ? "danger" : undefined;

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

  const openConfig = () => {
    setOpen(false);
    if (onOpenConfigFile) onOpenConfigFile();
    else setConfigOpen(true);
  };

  const emptyLabel = (empty: string) =>
    loading && !summary ? "Loading…" : loadError ? loadError : tr(empty as never);

  const dialogs = (
    <>
      <MCPErrorDialog
        open={errorServer !== undefined}
        workspace={workspace}
        server={errorServer}
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
        open={authServer !== undefined}
        workspace={workspace}
        server={authServer}
        onOpenChange={(next) => {
          if (!next) setAuthServer(undefined);
        }}
        onAuthorized={(next) => {
          replaceServer(next);
          setAuthServer(undefined);
          void load();
        }}
      />
      <ConfigFileDialog open={configOpen} onOpenChange={setConfigOpen} />
    </>
  );

  if (mobile) {
    return (
      <>
        <button
          type="button"
          aria-label={tr("sessionSummaryMenu")}
          title={tr("sessionSummaryMenu")}
          onClick={() => setOpen(true)}
          className="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
        >
          <Gauge className="size-4" />
        </button>
        <MobileSummarySheet
          open={open}
          onOpenChange={setOpen}
          summary={summary}
          loading={loading}
          loadError={loadError}
          actionError={actionError}
          busyServers={busyServers}
          onToggleServer={(server, enabled) => void toggleServer(server, enabled)}
          onOpenMCP={onOpenMCP}
          onAuth={(server) => {
            setOpen(false);
            setAuthServer(server);
          }}
          onError={(server) => {
            setOpen(false);
            setErrorServer(server);
          }}
          onOpenExtensions={onOpenExtensions}
          onOpenSkill={onOpenSkill}
          onOpenSkillFile={onOpenSkillFile}
          onCreateSkill={onCreateSkill}
          onSetupSkill={onSetupSkill}
          onOpenConfig={() => {
            setOpen(false);
            if (onOpenConfigFile) onOpenConfigFile();
            else setConfigOpen(true);
          }}
          onRetry={() => void load()}
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
        }}
      >
        <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tr("sessionSummaryMenu")}
          title={tr("sessionSummaryMenu")}
          className="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
        >
          <Gauge className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64 p-1">
        <DropdownMenuLabel>{tr("extensions")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SummarySub icon={<Plug className="size-4" />} label="MCP" value={mcpCount} tone={mcpTone}>
          {summary?.servers.length ? (
            summary.servers.map((server) => {
              const busy = busyServers[server.name] || server.status === "pending";
              const signIn = server.status === "needs_auth";
              return (
                <div
                  key={server.name}
                  className="flex min-h-7 items-center gap-2 rounded-xs px-3 pe-1.5 text-body leading-4"
                >
                  <StatusDot status={server.status} />
                  <button
                    type="button"
                    onClick={() =>
                      closeThen(() => {
                        if (server.status === "failed") setErrorServer(server);
                        else onOpenMCP?.(server.name);
                      })
                    }
                    title={server.error || server.name}
                    className="min-w-0 flex-1 truncate text-left text-text-base hover:text-text-accent"
                  >
                    {server.name}
                  </button>
                  {signIn ? (
                    <button
                      type="button"
                      onClick={() => closeThen(() => setAuthServer(server.name))}
                      className="shrink-0 px-1 text-caption font-[440] text-text-accent hover:text-text-accent/80"
                    >
                      {tr("mcpSignIn")}
                    </button>
                  ) : (
                    <Switch
                      checked={server.status === "connected"}
                      disabled={busy}
                      aria-label={`${server.name}: ${statusLabel(server.status)}`}
                      onCheckedChange={(checked) => void toggleServer(server, checked)}
                    />
                  )}
                  <span className="sr-only">{statusLabel(server.status)}</span>
                </div>
              );
            })
          ) : (
            <EmptyRow label={emptyLabel("emptyMcps")} />
          )}
          {loadError && <RetryRow onRetry={() => void load()} />}
          <SummaryFooter>
            <FooterItem icon={<Settings2 className="size-4" />} onSelect={() => closeThen(() => onOpenMCP?.())}>
              {tr("mcpServers")}
            </FooterItem>
            <FooterItem icon={<FileText className="size-4" />} onSelect={openConfig}>
              {tr("configFileTitle")}
            </FooterItem>
          </SummaryFooter>
        </SummarySub>

        <SummarySub
          icon={<Boxes className="size-4" />}
          label={tr("plugins")}
          value={count(summary?.plugins.length)}
          tone={pluginTone}
        >
          {summary?.plugins.length ? (
            summary.plugins.map((plugin) => (
              <DropdownMenuItem
                key={plugin.name}
                onSelect={() => closeThen(onOpenExtensions)}
                className="gap-2"
                title={plugin.error}
              >
                <Boxes className="size-4 shrink-0 text-text-faint" />
                {plugin.status === "failed" && (
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-state-fg-danger" />
                )}
                <span className="min-w-0 flex-1 truncate">{plugin.name}</span>
                <span className="shrink-0 text-caption text-text-faint">
                  {plugin.status === "failed" ? tr("mcpFailed") : pluginToolSummary(plugin)}
                </span>
              </DropdownMenuItem>
            ))
          ) : (
            <EmptyRow label={emptyLabel("emptyPlugins")} />
          )}
          {loadError && <RetryRow onRetry={() => void load()} />}
          <SummaryFooter>
            <FooterItem icon={<Settings2 className="size-4" />} onSelect={() => closeThen(onOpenExtensions)}>
              {tr("extensions")}
            </FooterItem>
            <FooterItem icon={<FileText className="size-4" />} onSelect={openConfig}>
              {tr("configFileTitle")}
            </FooterItem>
          </SummaryFooter>
        </SummarySub>

        <SummarySub
          icon={<Sparkles className="size-4" />}
          label={tr("skills")}
          value={count(summary?.skills.length)}
          tone={summary?.skillErrors ? "danger" : undefined}
        >
          {summary?.skills.length ? (
            summary.skills.map((skill) => (
              <DropdownMenuItem
                key={skill.id}
                onSelect={() =>
                  closeThen(() => {
                    if (skill.path && onOpenSkillFile) {
                      onOpenSkillFile(skill.path);
                    } else {
                      onOpenSkill?.(skill.id);
                    }
                  })
                }
                className="gap-2"
                title={skill.path}
              >
                <Sparkles className="size-4 shrink-0 text-text-faint" />
                <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                {skill.autoinvoke === false && (
                  <span className="shrink-0 text-caption text-text-faint">{tr("manualInvoke")}</span>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <EmptyRow label={emptyLabel("emptySkills")} />
          )}
          {loadError && <RetryRow onRetry={() => void load()} />}
          <SummaryFooter>
            <FooterItem icon={<Plus className="size-4" />} onSelect={() => closeThen(onCreateSkill)}>
              {tr("newSkill")}
            </FooterItem>
            <FooterItem icon={<Sparkles className="size-4" />} onSelect={() => closeThen(onSetupSkill)}>
              {tr("setupSkills")}
            </FooterItem>
            <FooterItem icon={<Settings2 className="size-4" />} onSelect={() => closeThen(onOpenExtensions)}>
              {tr("extensions")}
            </FooterItem>
            <FooterItem icon={<FileText className="size-4" />} onSelect={openConfig}>
              {tr("configFileTitle")}
            </FooterItem>
          </SummaryFooter>
        </SummarySub>

        {actionError && (
          <>
            <DropdownMenuSeparator />
            <div role="alert" className="px-3 py-1.5 text-caption leading-4 text-state-fg-danger">
              {actionError}
            </div>
          </>
        )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}

function MobileSummarySheet({
  open,
  onOpenChange,
  summary,
  loading,
  loadError,
  actionError,
  busyServers,
  onToggleServer,
  onOpenMCP,
  onAuth,
  onError,
  onOpenExtensions,
  onOpenSkill,
  onOpenSkillFile,
  onCreateSkill,
  onSetupSkill,
  onOpenConfig,
  onRetry,
}: {
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
  onCreateSkill?: () => void;
  onSetupSkill?: () => void;
  onOpenConfig: () => void;
  onRetry: () => void;
}) {
  const tr = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const count = (value: number | undefined) => (loading || value === undefined ? "…" : String(value));
  const connected = summary?.servers.filter((server) => server.status === "connected").length;
  const mcpCount = summary && !loading ? `${connected}/${summary.servers.length}` : "…";
  const mcpTone = summary?.servers.some((server) => server.status === "failed")
    ? "danger"
    : summary?.servers.some((server) => server.status === "needs_auth")
      ? "warning"
      : undefined;
  const pluginTone = summary?.plugins.some((plugin) => plugin.status === "failed") ? "danger" : undefined;
  const closeThen = (action?: () => void) => {
    onOpenChange(false);
    action?.();
  };
  const emptyLabel = (empty: string) =>
    loading && !summary ? "Loading…" : loadError ? loadError : tr(empty as never);
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
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div aria-hidden="true" onClick={() => onOpenChange(false)} className="absolute inset-0 bg-overlay-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("sessionSummaryMenu")}
        className="relative z-10 flex max-h-[min(85dvh,calc(100dvh-16px))] flex-col rounded-t-2xl bg-bg-deep px-3 pb-3 shadow-elevation-overlay"
      >
        <div aria-hidden="true" className="flex h-7 shrink-0 items-center justify-center">
          <span className="h-1 w-8 rounded-full bg-border-strong" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2">
          <Gauge className="size-4 text-text-faint" />
          <span className="min-w-0 flex-1 text-body font-[530] text-text-base">{tr("extensions")}</span>
          <button
            type="button"
            aria-label={tr("closeTab")}
            onClick={() => onOpenChange(false)}
            className="interactive grid size-7 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-2">
          <MobileSection
            icon={<Plug className="size-4" />}
            label="MCP"
            value={mcpCount}
            tone={mcpTone}
          >
            {summary?.servers.length ? (
              summary.servers.map((server) => {
                const busy = busyServers[server.name] || server.status === "pending";
                const signIn = server.status === "needs_auth";
                return (
                  <div key={server.name} className="flex min-h-9 items-center gap-2 px-1">
                    <StatusDot status={server.status} />
                    <button
                      type="button"
                      onClick={() =>
                        closeThen(() => {
                          if (server.status === "failed") onError(server);
                          else onOpenMCP?.(server.name);
                        })
                      }
                      title={server.error || server.name}
                      className="min-w-0 flex-1 truncate text-left text-body text-text-base"
                    >
                      {server.name}
                    </button>
                    {signIn ? (
                      <button
                        type="button"
                        onClick={() => closeThen(() => onAuth(server.name))}
                        className="shrink-0 px-1 text-caption text-text-accent"
                      >
                        {tr("mcpSignIn")}
                      </button>
                    ) : (
                      <Switch
                        checked={server.status === "connected"}
                        disabled={busy}
                        aria-label={`${server.name}: ${statusLabel(server.status)}`}
                        onCheckedChange={(checked) => onToggleServer(server, checked)}
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <MobileEmpty label={emptyLabel("emptyMcps")} />
            )}
            {loadError && <MobileAction icon={<Settings2 className="size-4" />} label={tr("retry")} onClick={onRetry} />}
            <MobileAction
              icon={<Settings2 className="size-4" />}
              label={tr("mcpServers")}
              onClick={() => closeThen(() => onOpenMCP?.())}
            />
            <MobileAction icon={<FileText className="size-4" />} label={tr("configFileTitle")} onClick={onOpenConfig} />
          </MobileSection>

          <MobileSection
            icon={<Boxes className="size-4" />}
            label={tr("plugins")}
            value={count(summary?.plugins.length)}
            tone={pluginTone}
          >
            {summary?.plugins.length ? (
              summary.plugins.map((plugin) => (
                <button
                  key={plugin.name}
                  type="button"
                  onClick={() => closeThen(onOpenExtensions)}
                  title={plugin.error}
                  className="flex min-h-9 items-center gap-2 px-1 text-left"
                >
                  <Boxes className="size-4 shrink-0 text-text-faint" />
                  {plugin.status === "failed" && (
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-state-fg-danger" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-body text-text-base">{plugin.name}</span>
                  <span className="shrink-0 text-caption text-text-faint">
                    {plugin.status === "failed" ? tr("mcpFailed") : pluginToolSummary(plugin)}
                  </span>
                </button>
              ))
            ) : (
              <MobileEmpty label={emptyLabel("emptyPlugins")} />
            )}
            {loadError && <MobileAction icon={<Settings2 className="size-4" />} label={tr("retry")} onClick={onRetry} />}
            <MobileAction
              icon={<Settings2 className="size-4" />}
              label={tr("extensions")}
              onClick={() => closeThen(onOpenExtensions)}
            />
            <MobileAction icon={<FileText className="size-4" />} label={tr("configFileTitle")} onClick={onOpenConfig} />
          </MobileSection>

          <MobileSection
            icon={<Sparkles className="size-4" />}
            label={tr("skills")}
            value={count(summary?.skills.length)}
            tone={summary?.skillErrors ? "danger" : undefined}
          >
            {summary?.skills.length ? (
              summary.skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() =>
                    closeThen(() => {
                      if (skill.path && onOpenSkillFile) onOpenSkillFile(skill.path);
                      else onOpenSkill?.(skill.id);
                    })
                  }
                  title={skill.path}
                  className="flex min-h-9 items-center gap-2 px-1 text-left"
                >
                  <Sparkles className="size-4 shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1 truncate text-body text-text-base">{skill.name}</span>
                  {skill.autoinvoke === false && (
                    <span className="shrink-0 text-caption text-text-faint">{tr("manualInvoke")}</span>
                  )}
                </button>
              ))
            ) : (
              <MobileEmpty label={emptyLabel("emptySkills")} />
            )}
            {loadError && <MobileAction icon={<Settings2 className="size-4" />} label={tr("retry")} onClick={onRetry} />}
            <MobileAction icon={<Plus className="size-4" />} label={tr("newSkill")} onClick={() => closeThen(onCreateSkill)} />
            <MobileAction
              icon={<Sparkles className="size-4" />}
              label={tr("setupSkills")}
              onClick={() => closeThen(onSetupSkill)}
            />
            <MobileAction
              icon={<Settings2 className="size-4" />}
              label={tr("extensions")}
              onClick={() => closeThen(onOpenExtensions)}
            />
            <MobileAction icon={<FileText className="size-4" />} label={tr("configFileTitle")} onClick={onOpenConfig} />
          </MobileSection>

          {actionError && (
            <p role="alert" className="px-1 text-caption leading-4 text-state-fg-danger">
              {actionError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileSection({
  icon,
  label,
  value,
  tone,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-body text-text-muted">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {tone && (
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${
              tone === "danger" ? "bg-state-fg-danger" : "bg-state-fg-warning"
            }`}
          />
        )}
        <span className="text-meta tabular-nums text-text-faint">{value}</span>
      </div>
      <div className="flex flex-col rounded-lg bg-bg-layer-01 p-1">{children}</div>
    </section>
  );
}

function MobileAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="interactive flex h-9 items-center gap-2 rounded-md px-2 text-left text-body text-text-muted hover:text-text-base"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function MobileEmpty({ label }: { label: string }) {
  return <p className="px-2 py-2 text-meta leading-4 text-text-faint">{label}</p>;
}

function SummarySub({
  icon,
  label,
  value,
  tone,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "danger" | "warning";
  children: ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-text-muted">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {tone && (
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${
                tone === "danger" ? "bg-state-fg-danger" : "bg-state-fg-warning"
              }`}
            />
          )}
          <span className="text-meta tabular-nums text-text-faint">{value}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden="true"
      className={`size-1.5 shrink-0 rounded-full ${
        status === "connected"
          ? "bg-state-fg-success"
          : status === "failed"
            ? "bg-state-fg-danger"
            : status === "needs_auth"
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

function SummaryFooter({ children }: { children: ReactNode }) {
  return (
    <>
      <DropdownMenuSeparator />
      <div className="flex flex-col">{children}</div>
    </>
  );
}

function FooterItem({
  icon,
  onSelect,
  children,
}: {
  icon: ReactNode;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-2 text-text-muted">
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenuItem>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-3 py-2 text-meta leading-4 text-text-faint">{label}</div>;
}

function RetryRow({ onRetry }: { onRetry: () => void }) {
  const tr = useT();
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        onRetry();
      }}
      className="gap-2 text-text-accent"
    >
      <Settings2 className="size-4" />
      {tr("retry")}
    </DropdownMenuItem>
  );
}
