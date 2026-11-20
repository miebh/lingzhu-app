import { useEffect, useState } from "react";
import { Copy, Cpu, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { environmentExportName, serializeEnvironment } from "../../lib/environmentExport";
import { messageOf } from "../../lib/errors";
import type { SessionEnvironment } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read-only runtime environment of one session. */
export function EnvironmentDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const [env, setEnv] = useState<SessionEnvironment>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      setEnv(await api.environment(workspace, sessionID));
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
      setEnv(undefined);
      setError("");
      setCopied("");
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveEnvironment = async () => {
    if (!env) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        environmentExportName(env.id),
        serializeEnvironment({ environment: env }),
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

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="size-4 text-text-faint" />
              Environment
            </DialogTitle>
            <DialogDescription className="truncate">{title || sessionID}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !env}
              onClick={() => void saveEnvironment()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        {env ? (
          <>
            <div className="mt-4 rounded-md border border-border-base">
              <DetailRow label="Session" value={env.id} />
              <DetailRow label="Workdir" value={env.workdir || "(process directory)"} />
              <DetailRow label="Shell" value={env.shell.join(" ")} />
              <DetailRow label="Running" value={env.running ? "yes" : "no"} />
              <DetailRow label="Provider" value={env.provider} />
              <DetailRow label="Model" value={env.model} />
              <DetailRow label="Agent" value={env.agent || "default"} />
              <DetailRow label="Platform" value={`${env.os}/${env.arch}`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {env.workdir && (
                <Button type="button" variant="outline" size="xs" onClick={() => void copy(env.workdir)}>
                  <Copy />
                  {copied === env.workdir ? "Copied" : "Copy workdir"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void copy(env.shell.join(" "))}
              >
                <Copy />
                {copied === env.shell.join(" ") ? "Copied" : "Copy shell"}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-meta text-text-faint">{loading ? "Loading…" : "No environment data."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
