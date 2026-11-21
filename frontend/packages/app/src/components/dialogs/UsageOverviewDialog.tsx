import { For, Show, createEffect, createSignal } from "solid-js";
import { Gauge } from "@lingzhu/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { WorkspaceUsage } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
}

function count(value: number): string {
  return value.toLocaleString();
}

/** Aggregated token usage across every session of one workspace. */
export function UsageOverviewDialog(props: Props) {
  const tr = useT();
  const [usage, setUsage] = createSignal<WorkspaceUsage>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setUsage(await api.workspaceUsage(props.workspace));
    } catch (err) {
      setUsage(undefined);
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
      setUsage(undefined);
      setError("");
    }
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Gauge class="size-4 text-text-faint" />
              {tr("paletteUsageOverview")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {usage()
                ? `${usage()!.sessions.length} session${usage()!.sessions.length === 1 ? "" : "s"}`
                : ""}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />

        <Show when={usage()}>
          {(current) => (
            <div class="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5">
              <For
                each={
                  [
                    ["Calls", current().calls],
                    ["Input", current().input],
                    ["Output", current().output],
                    ["Cache read", current().cacheRead],
                    ["Total", current().total],
                  ] as [string, number][]
                }
              >
                {([label, value]) => (
                  <div class="rounded-md border border-border-base bg-bg-layer-01 px-3 py-2">
                    <p class="text-caption text-text-faint">{label}</p>
                    <p class="mt-0.5 font-mono text-body tabular-nums text-text-base">{count(value)}</p>
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={usage() && usage()!.sessions.length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("usageNoRecorded")}
              </p>
            }
          >
            <table class="w-full text-meta">
              <thead class="sticky top-0 bg-bg-layer-01 text-caption text-text-faint">
                <tr>
                  <th class="px-3 py-1.5 text-left font-normal">{tr("usageSession")}</th>
                  <th class="px-2 py-1.5 text-right font-normal">{tr("usageCalls")}</th>
                  <th class="px-2 py-1.5 text-right font-normal">{tr("usageInput")}</th>
                  <th class="px-2 py-1.5 text-right font-normal">{tr("usageOutput")}</th>
                  <th class="px-2 py-1.5 text-right font-normal">{tr("usageCache")}</th>
                  <th class="px-3 py-1.5 text-right font-normal">{tr("usageTotal")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={usage()?.sessions ?? []}>
                  {(session) => (
                    <tr
                      onClick={() => props.onOpenSession?.(session.sessionId)}
                      class="interactive cursor-pointer border-t border-border-base hover:bg-bg-layer-01"
                    >
                      <td class="max-w-72 truncate px-3 py-1.5 text-text-base">
                        {session.title || session.sessionId}
                      </td>
                      <td class="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                        {count(session.calls)}
                      </td>
                      <td class="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                        {count(session.input)}
                      </td>
                      <td class="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                        {count(session.output)}
                      </td>
                      <td class="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                        {count(session.cacheRead + session.cacheWrite)}
                      </td>
                      <td class="px-3 py-1.5 text-right font-mono tabular-nums text-text-base">
                        {count(session.total)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Totals aggregate provider usage events from every session; click a row to open that session.
        </p>
      </DialogContent>
    </Dialog>
  );
}
