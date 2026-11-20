import { useEffect, useState } from "react";
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
export function UsageDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const [stats, setStats] = useState<UsageStats>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
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

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setStats(undefined);
      setError("");
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveUsage = async () => {
    if (!stats) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        usageExportName(stats.sessionId),
        serializeUsage({ stats }),
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

  const rows = stats
    ? [
        { label: "Input", value: stats.input },
        { label: "Output", value: stats.output },
        { label: "Cache read", value: stats.cacheRead },
        { label: "Cache write", value: stats.cacheWrite },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[min(calc(100vw-48px),512px)] flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Usage</DialogTitle>
            <DialogDescription className="sr-only">{title || sessionID}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !stats}
              onClick={() => void saveUsage()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        {stats ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                <p className="text-caption text-text-faint">Calls</p>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-reading text-text-base">
                  <Gauge className="size-4 text-text-faint" />
                  {formatNumber(stats.calls)}
                </p>
              </div>
              <div className="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                <p className="text-caption text-text-faint">Total tokens</p>
                <p className="mt-1 font-mono text-reading text-text-base">{formatNumber(stats.total)}</p>
              </div>
              <div className="rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                <p className="text-caption text-text-faint">Last call</p>
                <p className="mt-1 truncate text-meta text-text-muted">
                  {formatDateTime(stats.lastAt) || "—"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border-[0.5px] border-border-base">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-border-base px-4 py-2.5 text-meta last:border-b-0"
                >
                  <span className="text-text-muted">{row.label}</span>
                  <span className="font-mono tabular-nums text-text-base">{formatNumber(row.value)}</span>
                </div>
              ))}
            </div>

            {stats.last && (
              <div className="mt-4 rounded-lg border-[0.5px] border-border-base bg-bg-base p-4">
                <p className="text-caption text-text-faint">Latest request</p>
                <p className="mt-1 font-mono text-meta text-text-muted">
                  input {formatNumber(stats.last.input)} · output {formatNumber(stats.last.output)} ·
                  cache read {formatNumber(stats.last.cacheRead)} · cache write{" "}
                  {formatNumber(stats.last.cacheWrite)}
                </p>
              </div>
            )}

            {stats.calls === 0 && (
              <p className="mt-3 text-meta text-text-faint">No provider usage recorded yet.</p>
            )}
          </>
        ) : (
          <p className="mt-4 text-meta text-text-faint">{loading ? "Loading…" : "No usage."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
