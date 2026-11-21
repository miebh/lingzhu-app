import { Show, createEffect, createSignal } from "solid-js";
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
export function ShareDialog(props: Props) {
  const tr = useT();
  const [config, setConfig] = createSignal<ShareServiceStatus>();
  const [state, setState] = createSignal<ShareState>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal(false);

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setConfig(undefined);
      setState(undefined);
      setError("");
      setCopied(false);
    }
  });

  const create = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
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
    const workspace = props.workspace;
    const sessionID = props.sessionID;
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

  const share = () => state()?.share;
  const disabled = () => config()?.mode === "disabled" || config()?.enabled === false;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("shareTitle")}</DialogTitle>
            <DialogDescription class="truncate">{props.title || props.sessionID}</DialogDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy()} onClick={() => void load()}>
            <RefreshCw class={busy() ? "motion-safe:animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        <ErrorBanner error={error()} class="mt-3" />

        <Show when={config()}>
          {(current) => (
            <div class="mt-4 flex flex-wrap items-center gap-2 text-meta text-text-muted">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-border-base px-2 py-1">
                <Share2 class="size-3.5" />
                {current().mode}
              </span>
              <span class="text-text-faint">{current().remote ? tr("remoteEndpoint") : tr("localLink")}</span>
              <Show when={current().endpoint}>
                <span class="min-w-0 truncate font-mono text-caption text-text-faint">
                  {current().endpoint}
                </span>
              </Show>
              <Show when={current().expiry}>
                <span class="text-text-faint">expires {current().expiry}</span>
              </Show>
              <Show when={disabled()}>
                <span class="text-state-fg-warning">{tr("sharingDisabled")}</span>
              </Show>
            </div>
          )}
        </Show>

        <div class="mt-4 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <Show
            when={share()}
            fallback={
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-meta text-text-muted">
                  {state() ? tr("notShared") : tr("loadingShareStatus")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy() || disabled() || !state()}
                  onClick={() => void create()}
                >
                  <Share2 />
                  {tr("dialogCreateShareLink")}
                </Button>
              </div>
            }
          >
            {(info) => (
              <>
                <div class="flex items-center gap-2">
                  <Link2 class="size-4 shrink-0 text-text-faint" />
                  <input
                    readOnly
                    value={info().url || info().path}
                    aria-label={tr("shareShareLink")}
                    onFocus={(event) => event.currentTarget.select()}
                    class="min-w-0 flex-1 rounded-xs border border-border-base bg-bg-base px-2 py-1 font-mono text-meta text-text-base outline-none select-text"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!info().url}
                    onClick={() => void copy(info())}
                  >
                    <Copy />
                    {copied() ? tr("copied") : tr("copy")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!info().url}
                    onClick={() => info().url && window.open(info().url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink />
                    Open
                  </Button>
                </div>
                <p class="mt-2 text-meta text-text-faint">
                  {info().messages} message{info().messages === 1 ? "" : "s"} · created{" "}
                  {formatDateTime(info().created)} · token {info().token.slice(0, 8)}…                 </p>
                <div class="mt-3 flex justify-end">
                  <Button type="button" variant="destructive" size="sm" disabled={busy()} onClick={() => void revoke()}>
                    {tr("dialogStopSharing")}
                  </Button>
                </div>
              </>
            )}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
