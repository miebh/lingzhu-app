import { useEffect, useState } from "react";
import { Bot, Copy, RotateCw, Save, Server, SlashSquare, Terminal } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { ConfirmDialog } from "./Dialogs";
import { api } from "../../lib/api";
import { coreExportName, serializeCore } from "../../lib/coreExport";
import { messageOf } from "../../lib/errors";
import type { AgentCatalog, AppInfo, CoreConfig, CoreHealth, SlashCommand } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function PathRow({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the path stays selectable.
    }
  };
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0">
      <span className="shrink-0 text-text-faint">{label}</span>
      <span className="min-w-0 flex-1 break-all text-right font-mono text-text-muted select-text">
        {value || "—"}
      </span>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          title={copied ? "Copied" : undefined}
          onClick={() => void copy()}
        >
          <Copy />
        </Button>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  detail,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-md border border-border-base">
      <div className="flex items-center gap-2 border-b border-border-base px-3 py-2">
        <span className="text-text-faint">{icon}</span>
        <span className="text-body text-text-base">{title}</span>
        {detail && <span className="ml-auto text-caption text-text-faint">{detail}</span>}
      </div>
      {children}
    </section>
  );
}

/** Read-only core app/config view plus editable step budget. */
export function CoreDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [info, setInfo] = useState<AppInfo>();
  const [config, setConfig] = useState<CoreConfig>();
  const [agents, setAgents] = useState<AgentCatalog>();
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [health, setHealth] = useState<CoreHealth>();
  const [healthError, setHealthError] = useState("");
  const [maxSteps, setMaxSteps] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    setHealth(undefined);
    setHealthError("");
    api
      .health(workspace)
      .then(setHealth)
      .catch((err) => setHealthError(messageOf(err)));
    try {
      const [appInfo, coreConfig, catalog, commandList] = await Promise.all([
        api.info(),
        api.coreConfig(workspace),
        api.agents(workspace),
        api.commands(workspace),
      ]);
      setInfo(appInfo);
      setConfig(coreConfig);
      setAgents(catalog);
      setCommands(commandList);
      setMaxSteps(String(coreConfig.maxSteps ?? 0));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setInfo(undefined);
      setConfig(undefined);
      setAgents(undefined);
      setCommands([]);
      setHealth(undefined);
      setHealthError("");
      setMaxSteps("");
      setError("");
      setNotice("");
      setSaving(false);
      setExporting(false);
      setConfirmRestart(false);
      setRestarting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const saveSummary = async () => {
    if (!workspace || (!info && !config && !agents && !health)) return;
    setExporting(true);
    try {
      const path = await api.saveTextFile(
        coreExportName(workspace),
        serializeCore({ workspace, health, healthError, info, config, agents, commands }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setExporting(false);
    }
  };

  const restartCore = async () => {
    if (!workspace) return;
    setConfirmRestart(false);
    setRestarting(true);
    setNotice("");
    try {
      await api.restartCore(workspace);
      setNotice("Core restarted");
      setError("");
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setRestarting(false);
    }
  };

  const saveSteps = async () => {
    if (!workspace) return;
    const parsed = Number(maxSteps);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Max steps must be a non-negative number.");
      return;
    }
    setSaving(true);
    try {
      await api.updateCoreConfig(workspace, { max_steps: Math.floor(parsed) });
      setConfig(await api.coreConfig(workspace));
      setNotice("Core config updated");
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Server className="size-4 text-text-faint" />
              Core
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting || (!info && !config && !agents && !health)}
              onClick={() => void saveSummary()}
            >
              <Save />
              {exporting ? "Saving…" : "Save file"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={restarting}
              onClick={() => setConfirmRestart(true)}
            >
              <RotateCw className={restarting ? "motion-safe:animate-spin" : undefined} />
              {restarting ? "Restarting…" : "Restart core"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-auto md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Section icon={<Server className="size-4" />} title={tr("coreApplication")}>
              <div className="flex items-center justify-between gap-4 border-b border-border-base px-3 py-1.5 text-meta">
                <span className="shrink-0 text-text-faint">Health</span>
                <span
                  className={`font-mono text-right ${
                    health
                      ? "text-state-fg-success"
                      : healthError
                        ? "text-state-fg-danger"
                        : "text-text-faint"
                  }`}
                  title={healthError || undefined}
                >
                  {health ? `reachable · ${health.status}` : healthError ? "unreachable" : "checking…"}
                </span>
              </div>
              <DetailRow dense label="Version" value={info?.version} />
              <DetailRow dense label="Built" value={info?.built || "Unknown"} />
              <PathRow label="Core config" value={info?.configPath} />
              <PathRow label="App database" value={info?.databasePath} />
              <PathRow label="Data directory" value={info?.dataDir} />
              <PathRow label="App data" value={info?.appDataDir} />
              <PathRow label="Core log" value={info?.logPath} />
            </Section>

            <Section icon={<Terminal className="size-4" />} title={tr("coreEffectiveCoreConfig")}>
              <PathRow label="Config path" value={config?.path} />
              <DetailRow dense label="Workdir" value={config?.workdir} />
              <DetailRow dense label="Provider" value={config?.provider} />
              <DetailRow dense label="Model" value={config?.model} />
              <DetailRow dense label="Default agent" value={config?.defaultAgent} />
              <DetailRow dense label="Shell" value={config?.shell?.join(" ")} />
              <DetailRow dense label="Context window" value={config?.contextWindow ? String(config.contextWindow) : ""} />
              <DetailRow dense label="Compact keep" value={config?.compactKeep ? String(config.compactKeep) : ""} />
              <div className="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta">
                <span className="shrink-0 text-text-faint">Max steps (0 = no limit)</span>
                <Input
                  value={maxSteps}
                  aria-label={tr("coreMaxSteps")}
                  onChange={(event) => setMaxSteps(event.target.value)}
                  className="ml-auto h-control-xs w-24 select-text text-right font-mono"
                />
                <Button type="button" size="xs" disabled={saving} onClick={() => void saveSteps()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
              <div className="px-3 py-2">
                <p className="text-caption text-text-faint">Permissions</p>
                {config?.permission && config.permission.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {config.permission.map((rule, index) => (
                      <li key={`${rule.action}:${rule.resource}:${index}`} className="font-mono text-caption text-text-muted">
                        {rule.action} {rule.resource} · {rule.effect}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-caption text-text-faint">No explicit rules.</p>
                )}
              </div>
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <Section
              icon={<Bot className="size-4" />}
              title={tr("coreAgents")}
              detail={agents ? `${agents.agents.length} · default ${agents.default}` : undefined}
            >
              {!agents || agents.agents.length === 0 ? (
                <p className="p-3 text-meta text-text-faint">{loading ? "Loading…" : "No agents."}</p>
              ) : (
                agents.agents.map((agent) => (
                  <div key={agent.id} className="border-b border-border-base px-3 py-1.5 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-meta text-text-base">{agent.name || agent.id}</span>
                      <span className="font-mono text-caption text-text-faint">{agent.id}</span>
                      {agent.id === agents.default && (
                        <span className="rounded-xs border border-border-base px-1 text-caption text-state-fg-success">
                          default
                        </span>
                      )}
                      <span className="ml-auto text-caption text-text-faint">
                        {agent.mode}
                        {agent.model ? ` · ${agent.model}` : ""}
                      </span>
                    </div>
                    {agent.description && (
                      <p className="mt-0.5 text-caption text-text-faint select-text">{agent.description}</p>
                    )}
                  </div>
                ))
              )}
            </Section>

            <Section
              icon={<SlashSquare className="size-4" />}
              title={tr("coreSlashCommands")}
              detail={`${commands.length}`}
            >
              {commands.length === 0 ? (
                <p className="p-3 text-meta text-text-faint">{loading ? "Loading…" : "No commands."}</p>
              ) : (
                commands.map((command) => (
                  <div key={`${command.plugin}:${command.name}`} className="border-b border-border-base px-3 py-1.5 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-meta text-text-base">/{command.name}</span>
                      {command.plugin && (
                        <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                          {command.plugin}
                        </span>
                      )}
                      {command.description && (
                        <span className="min-w-0 flex-1 truncate text-caption text-text-faint">
                          {command.description}
                        </span>
                      )}
                    </div>
                    {command.template && (
                      <p className="mt-0.5 truncate font-mono text-caption text-text-faint" title={command.template}>
                        {command.template}
                      </p>
                    )}
                  </div>
                ))
              )}
            </Section>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmRestart}
      title={tr("coreRestartCore")}
      description={`Restart the core for "${name || workspace}"? Running turns and terminals are interrupted, but session data is kept.`}
      confirmLabel="Restart"
      destructive
      onOpenChange={(next) => {
        if (!next) setConfirmRestart(false);
      }}
      onConfirm={() => void restartCore()}
    />
    </>
  );
}
