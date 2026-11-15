import { useEffect, useState } from "react";
import { Gauge } from "@lingzhu/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
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
export function UsageOverviewDialog({ open, workspace, name, onOpenChange, onOpenSession }: Props) {
  const tr = useT();
  const [usage, setUsage] = useState<WorkspaceUsage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setUsage(await api.workspaceUsage(workspace));
    } catch (err) {
      setUsage(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setUsage(undefined);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-text-faint" />
              {tr("paletteUsageOverview")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {usage ? `${usage.sessions.length} session${usage.sessions.length === 1 ? "" : "s"}` : ""}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />

        {usage && (
          <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["Calls", usage.calls],
                ["Input", usage.input],
                ["Output", usage.output],
                ["Cache read", usage.cacheRead],
                ["Total", usage.total],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="rounded-md border border-border-base bg-bg-layer-01 px-3 py-2">
                <p className="text-caption text-text-faint">{label}</p>
                <p className="mt-0.5 font-mono text-body tabular-nums text-text-base">{count(value)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {!usage || usage.sessions.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No usage recorded yet."}
            </p>
          ) : (
            <table className="w-full text-meta">
              <thead className="sticky top-0 bg-bg-layer-01 text-caption text-text-faint">
                <tr>
                  <th className="px-3 py-1.5 text-left font-normal">Session</th>
                  <th className="px-2 py-1.5 text-right font-normal">Calls</th>
                  <th className="px-2 py-1.5 text-right font-normal">Input</th>
                  <th className="px-2 py-1.5 text-right font-normal">Output</th>
                  <th className="px-2 py-1.5 text-right font-normal">Cache</th>
                  <th className="px-3 py-1.5 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {usage.sessions.map((session) => (
                  <tr
                    key={session.sessionId}
                    onClick={() => onOpenSession?.(session.sessionId)}
                    className="interactive cursor-pointer border-t border-border-base hover:bg-bg-layer-01"
                  >
                    <td className="max-w-72 truncate px-3 py-1.5 text-text-base">
                      {session.title || session.sessionId}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                      {count(session.calls)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                      {count(session.input)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                      {count(session.output)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-muted">
                      {count(session.cacheRead + session.cacheWrite)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-base">
                      {count(session.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Totals aggregate provider usage events from every session; click a row to open that session.
        </p>
      </DialogContent>
    </Dialog>
  );
}
