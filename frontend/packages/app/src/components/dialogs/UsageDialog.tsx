import { For, Show, createEffect, createSignal } from "solid-js";
import { Gauge, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { serializeUsage, usageExportName } from "../../lib/usageExport";
import type { UsageStats } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

/** Read-only provider usage totals for one session. */
export function UsageDialog(props: Props) {
  const tr = useT();
  const [stats, setStats] = createSignal<UsageStats>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      setStats(await api.usage(workspace, sessionID));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setStats(undefined);
      setError("");
      setSaving(false);
      setNotice("");
    }
  });

  const saveUsage = async () => {
    const current = stats();
    if (!current) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        usageExportName(current.sessionId),
        serializeUsage({ stats: current }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const rows = () => {
    const current = stats();
    if (!current) return [];
    return [
      { label: tr("usageInput"), value: current.input },
      { label: tr("usageOutput"), value: current.output },
      { label: tr("usageCacheRead"), value: current.cacheRead },
      { label: tr("usageCacheWrite"), value: current.cacheWrite },
    ];
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex w-[min(calc(100vw-48px),512px)] flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("usage")}</DialogTitle>
            <DialogDescription class="sr-only">{props.title || props.sessionID}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || !stats()}
              onClick={() => void saveUsage()}
            >
              <Save />
              {saving() ? tr("saving") : tr("dialogSaveFile")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <Show
          when={stats()}
          fallback={<p class="mt-4 text-meta text-text-faint">{loading() ? tr("loading") : tr("usageNoData")}</p>}
        >
          {(current) => (
            <>
              <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">{tr("usageCalls")}</p>
                  <p class="mt-1 flex items-center gap-1.5 font-mono text-reading text-text-base">
                    <Gauge class="size-4 text-text-faint" />
                    {formatNumber(current().calls)}
                  </p>
                </div>
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">{tr("usageTotalTokens")}</p>
                  <p class="mt-1 font-mono text-reading text-text-base">{formatNumber(current().total)}</p>
                </div>
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">{tr("usageLastCall")}</p>
                  <p class="mt-1 truncate text-meta text-text-muted">
                    {formatDateTime(current().lastAt) || "—"}
                  </p>
                </div>
              </div>

              <div class="mt-4 rounded-lg border-[0.5px] border-border-base">
                <For each={rows()}>
                  {(row) => (
                    <div class="flex items-center justify-between border-b border-border-base px-4 py-2.5 text-meta last:border-b-0">
                      <span class="text-text-muted">{row.label}</span>
                      <span class="font-mono tabular-nums text-text-base">{formatNumber(row.value)}</span>
                    </div>
                  )}
                </For>
              </div>

              <Show when={current().last}>
                {(last) => (
                  <div class="mt-4 rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                    <p class="text-caption text-text-faint">{tr("usageLatestRequest")}</p>
                    <p class="mt-1 font-mono text-meta text-text-muted">
                      {tr("usageInput")} {formatNumber(last().input)} · {tr("usageOutput")} {formatNumber(last().output)} ·{" "}
                      {tr("usageCacheRead")} {formatNumber(last().cacheRead)} · {tr("usageCacheWrite")}{" "}
                      {formatNumber(last().cacheWrite)}
                    </p>
                  </div>
                )}
              </Show>

              <Show when={current().calls === 0}>
                <p class="mt-3 text-meta text-text-faint">{tr("usageNoUsage")}</p>
              </Show>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
