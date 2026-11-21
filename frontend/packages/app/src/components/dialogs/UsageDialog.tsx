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
      { label: "Input", value: current.input },
      { label: "Output", value: current.output },
      { label: "Cache read", value: current.cacheRead },
      { label: "Cache write", value: current.cacheWrite },
    ];
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex w-[min(calc(100vw-48px),512px)] flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>Usage</DialogTitle>
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
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <Show
          when={stats()}
          fallback={<p class="mt-4 text-meta text-text-faint">{loading() ? "Loading…" : "No usage."}</p>}
        >
          {(current) => (
            <>
              <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">Calls</p>
                  <p class="mt-1 flex items-center gap-1.5 font-mono text-reading text-text-base">
                    <Gauge class="size-4 text-text-faint" />
                    {formatNumber(current().calls)}
                  </p>
                </div>
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">Total tokens</p>
                  <p class="mt-1 font-mono text-reading text-text-base">{formatNumber(current().total)}</p>
                </div>
                <div class="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                  <p class="text-caption text-text-faint">Last call</p>
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
                    <p class="text-caption text-text-faint">Latest request</p>
                    <p class="mt-1 font-mono text-meta text-text-muted">
                      input {formatNumber(last().input)} · output {formatNumber(last().output)} ·
                      cache read {formatNumber(last().cacheRead)} · cache write{" "}
                      {formatNumber(last().cacheWrite)}
                    </p>
                  </div>
                )}
              </Show>

              <Show when={current().calls === 0}>
                <p class="mt-3 text-meta text-text-faint">No provider usage recorded yet.</p>
              </Show>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
