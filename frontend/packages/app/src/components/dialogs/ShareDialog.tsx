import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, RefreshCw, Share2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { ShareInfo, ShareServiceStatus, ShareState } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Shows share configuration and state, and creates or revokes a link. */
export function ShareDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [config, setConfig] = useState<ShareServiceStatus>();
  const [state, setState] = useState<ShareState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    setError("");
    try {
      const [nextConfig, nextState] = await Promise.all([
        api.shareConfig(workspace),
        api.shareStatus(workspace, sessionID),
      ]);
      setConfig(nextConfig);
      setState(nextState);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setConfig(undefined);
      setState(undefined);
      setError("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const create = async () => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      const info = await api.shareSession(workspace, sessionID);
      setState({ shared: true, share: info });
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!workspace || !sessionID) return;
    setBusy(true);
    try {
      await api.unshareSession(workspace, sessionID);
      setState({ shared: false });
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (info: ShareInfo) => {
    if (!info.url) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const share = state?.share;
  const disabled = config?.mode === "disabled" || config?.enabled === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Share</DialogTitle>
            <DialogDescription className="truncate">{title || sessionID}</DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={busy ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        <ErrorBanner error={error} className="mt-3" />

        {config && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-meta text-text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border-base px-2 py-1">
              <Share2 className="size-3.5" />
              {config.mode}
            </span>
            <span className="text-text-faint">{config.remote ? "remote endpoint" : "local link"}</span>
            {config.endpoint && (
              <span className="min-w-0 truncate font-mono text-caption text-text-faint">
                {config.endpoint}
              </span>
            )}
            {config.expiry && <span className="text-text-faint">expires {config.expiry}</span>}
            {disabled && (
              <span className="text-state-fg-warning">Sharing is disabled in the configuration.</span>
            )}
          </div>
        )}

        <div className="mt-4 rounded-md border border-border-base bg-bg-layer-01 p-3">
          {share ? (
            <>
              <div className="flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-text-faint" />
                <input
                  readOnly
                  value={share.url || share.path}
                  aria-label={tr("shareShareLink")}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xs border border-border-base bg-bg-base px-2 py-1 font-mono text-meta text-text-base outline-none select-text"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!share.url}
                  onClick={() => void copy(share)}
                >
                  <Copy />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!share.url}
                  onClick={() => share.url && window.open(share.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink />
                  Open
                </Button>
              </div>
              <p className="mt-2 text-meta text-text-faint">
                {share.messages} message{share.messages === 1 ? "" : "s"} · created{" "}
                {formatDateTime(share.created)} · token {share.token.slice(0, 8)}…              </p>
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void revoke()}>
                  {tr("dialogStopSharing")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-meta text-text-muted">
                {state ? "This session is not shared." : "Loading share status…"}
              </p>
              <Button type="button" size="sm" disabled={busy || disabled || !state} onClick={() => void create()}>
                <Share2 />
                {tr("dialogCreateShareLink")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
