import { For, Show, createEffect, createSignal } from "solid-js";
import type { JSX } from "solid-js";
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
import { t, useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function PathRow(props: { label: string; value?: string }) {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    if (!props.value) return;
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the path stays selectable.
    }
  };
  return (
    <div class="flex items-start justify-between gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0">
      <span class="shrink-0 text-text-faint">{props.label}</span>
      <span class="min-w-0 flex-1 break-all text-right font-mono text-text-muted select-text">
        {props.value || "—"}
      </span>
      <Show when={props.value}>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={copied() ? t("copiedLabel", { name: props.label }) : t("copyLabel", { name: props.label })}
          title={copied() ? t("copied") : undefined}
          onClick={() => void copy()}
        >
          <Copy />
        </Button>
      </Show>
    </div>
  );
}

function Section(props: {
  icon: JSX.Element;
  title: string;
  detail?: string;
  children: JSX.Element;
}) {
  return (
    <section class="min-w-0 rounded-md border border-border-base">
      <div class="flex items-center gap-2 border-b border-border-base px-3 py-2">
        <span class="text-text-faint">{props.icon}</span>
        <span class="text-body text-text-base">{props.title}</span>
        <Show when={props.detail}>
          <span class="ml-auto text-caption text-text-faint">{props.detail}</span>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

/** Read-only core app/config view plus editable step budget. */
export function CoreDialog(props: Props) {
  const tr = useT();
  const [info, setInfo] = createSignal<AppInfo>();
  const [config, setConfig] = createSignal<CoreConfig>();
  const [agents, setAgents] = createSignal<AgentCatalog>();
  const [commands, setCommands] = createSignal<SlashCommand[]>([]);
  const [health, setHealth] = createSignal<CoreHealth>();
  const [healthError, setHealthError] = createSignal("");
  const [maxSteps, setMaxSteps] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [confirmRestart, setConfirmRestart] = createSignal(false);
  const [restarting, setRestarting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setError("");
    setHealth(undefined);
    setHealthError("");
    api
      .health(workspace)
      .then((value) => setHealth(value))
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
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
  });

  const saveSummary = async () => {
    const workspace = props.workspace;
    if (!workspace || (!info() && !config() && !agents() && !health())) return;
    setExporting(true);
    try {
      const path = await api.saveTextFile(
        coreExportName(workspace),
        serializeCore({
          workspace,
          health: health(),
          healthError: healthError(),
          info: info(),
          config: config(),
          agents: agents(),
          commands: commands(),
        }),
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
    const workspace = props.workspace;
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
    const workspace = props.workspace;
    if (!workspace) return;
    const parsed = Number(maxSteps());
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
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent size="wide" height="body" class="flex flex-col">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <DialogTitle class="flex items-center gap-2">
                <Server class="size-4 text-text-faint" />
                Core
              </DialogTitle>
              <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting() || (!info() && !config() && !agents() && !health())}
                onClick={() => void saveSummary()}
              >
                <Save />
                {exporting() ? tr("saving") : tr("dialogSaveFile")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={restarting()}
                onClick={() => setConfirmRestart(true)}
              >
                <RotateCw class={restarting() ? "motion-safe:animate-spin" : undefined} />
                {restarting() ? tr("restarting") : tr("coreRestartCore")}
              </Button>
              <RefreshButton loading={loading()} onRefresh={() => void load()} />
            </div>
          </div>

          <ErrorBanner error={error()} />
          <NoticeBanner notice={notice()} shrink />

          <div class="mt-4 grid min-h-0 flex-1 gap-3 overflow-auto md:grid-cols-2">
            <div class="flex min-w-0 flex-col gap-3">
              <Section icon={<Server class="size-4" />} title={tr("coreApplication")}>
                <div class="flex items-center justify-between gap-4 border-b border-border-base px-3 py-1.5 text-meta">
                  <span class="shrink-0 text-text-faint">{tr("coreHealth")}</span>
                  <span
                    class={`font-mono text-right ${
                      health()
                        ? "text-state-fg-success"
                        : healthError()
                          ? "text-state-fg-danger"
                          : "text-text-faint"
                    }`}
                    title={healthError() || undefined}
                  >
                    {health()
                      ? `${tr("reachable")} · ${health()!.status}`
                      : healthError()
                        ? tr("unreachable")
                        : tr("checking")}
                  </span>
                </div>
                <DetailRow dense label={tr("version")} value={info()?.version} />
                <DetailRow dense label={tr("built")} value={info()?.built || tr("unknown")} />
                <PathRow label={tr("coreConfig")} value={info()?.configPath} />
                <PathRow label={tr("appDatabase")} value={info()?.databasePath} />
                <PathRow label={tr("dataDirectory")} value={info()?.dataDir} />
                <PathRow label={tr("appData")} value={info()?.appDataDir} />
                <PathRow label={tr("coreLog")} value={info()?.logPath} />
              </Section>

              <Section icon={<Terminal class="size-4" />} title={tr("coreEffectiveCoreConfig")}>
                <PathRow label={tr("configPath")} value={config()?.path} />
                <DetailRow dense label={tr("workdir")} value={config()?.workdir} />
                <DetailRow dense label={tr("providerLabel")} value={config()?.provider} />
                <DetailRow dense label={tr("modelLabel")} value={config()?.model} />
                <DetailRow dense label={tr("defaultAgent")} value={config()?.defaultAgent} />
                <DetailRow dense label={tr("shellLabel")} value={config()?.shell?.join(" ")} />
                <DetailRow
                  dense
                  label={tr("contextWindow")}
                  value={config()?.contextWindow ? String(config()!.contextWindow) : ""}
                />
                <DetailRow
                  dense
                  label={tr("compactKeep")}
                  value={config()?.compactKeep ? String(config()!.compactKeep) : ""}
                />
                <div class="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta">
                  <span class="shrink-0 text-text-faint">{tr("coreMaxSteps")}</span>
                  <Input
                    value={maxSteps()}
                    aria-label={tr("coreMaxSteps")}
                    onInput={(event) => setMaxSteps(event.currentTarget.value)}
                    class="ml-auto h-control-xs w-24 select-text text-right font-mono"
                  />
                  <Button type="button" size="xs" disabled={saving()} onClick={() => void saveSteps()}>
                    {saving() ? tr("saving") : tr("save")}
                  </Button>
                </div>
                <div class="px-3 py-2">
                  <p class="text-caption text-text-faint">{tr("permissions")}</p>
                  <Show
                    when={config()?.permission && config()!.permission!.length > 0}
                    fallback={<p class="mt-1 text-caption text-text-faint">{tr("coreNoExplicitRules")}</p>}
                  >
                    <ul class="mt-1 flex flex-col gap-1">
                      <For each={config()?.permission ?? []}>
                        {(rule) => (
                          <li class="font-mono text-caption text-text-muted">
                            {rule.action} {rule.resource} · {rule.effect}
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              </Section>
            </div>

            <div class="flex min-w-0 flex-col gap-3">
              <Section
                icon={<Bot class="size-4" />}
                title={tr("coreAgents")}
                detail={agents() ? `${agents()!.agents.length} · default ${agents()!.default}` : undefined}
              >
                <Show
                  when={agents() && agents()!.agents.length > 0}
                  fallback={<p class="p-3 text-meta text-text-faint">{loading() ? tr("loading") : tr("noAgents")}</p>}
                >
                  <For each={agents()?.agents ?? []}>
                    {(agent) => (
                      <div class="border-b border-border-base px-3 py-1.5 last:border-b-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-meta text-text-base">{agent.name || agent.id}</span>
                          <span class="font-mono text-caption text-text-faint">{agent.id}</span>
                          <Show when={agent.id === agents()!.default}>
                            <span class="rounded-xs border border-border-base px-1 text-caption text-state-fg-success">
                              default
                            </span>
                          </Show>
                          <span class="ml-auto text-caption text-text-faint">
                            {agent.mode}
                            {agent.model ? ` · ${agent.model}` : ""}
                          </span>
                        </div>
                        <Show when={agent.description}>
                          <p class="mt-0.5 text-caption text-text-faint select-text">{agent.description}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              </Section>

              <Section
                icon={<SlashSquare class="size-4" />}
                title={tr("coreSlashCommands")}
                detail={`${commands().length}`}
              >
                <Show
                  when={commands().length > 0}
                  fallback={<p class="p-3 text-meta text-text-faint">{loading() ? tr("loading") : tr("noCommands")}</p>}
                >
                  <For each={commands()}>
                    {(command) => (
                      <div class="border-b border-border-base px-3 py-1.5 last:border-b-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-mono text-meta text-text-base">/{command.name}</span>
                          <Show when={command.plugin}>
                            <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                              {command.plugin}
                            </span>
                          </Show>
                          <Show when={command.description}>
                            <span class="min-w-0 flex-1 truncate text-caption text-text-faint">
                              {command.description}
                            </span>
                          </Show>
                        </div>
                        <Show when={command.template}>
                          <p class="mt-0.5 truncate font-mono text-caption text-text-faint" title={command.template}>
                            {command.template}
                          </p>
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              </Section>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRestart()}
        title={tr("coreRestartCore")}
        description={`Restart the core for "${props.name || props.workspace}"? Running turns and terminals are interrupted, but session data is kept.`}
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
