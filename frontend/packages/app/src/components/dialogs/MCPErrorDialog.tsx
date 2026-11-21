import { createEffect, createSignal } from "solid-js";
import { CircleAlert, Copy } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { useT } from "@lingzhu/ui/i18n";
import type { MCPServer } from "@lingzhu/ui/types";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";

interface Props {
  open: boolean;
  workspace?: string;
  server?: MCPServer;
  onOpenChange: (open: boolean) => void;
  onChanged?: (server: MCPServer) => void;
}

/** One failed MCP server's error with copy, retry and disable actions. */
export function MCPErrorDialog(props: Props) {
  const tr = useT();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal<"retry" | "disable" | "">("");
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setError("");
      setNotice("");
      setBusy("");
      return;
    }
    setError(props.server?.error ?? "");
  });

  const copy = async () => {
    const server = props.server;
    if (!server || !error()) return;
    try {
      await navigator.clipboard.writeText(`MCP server "${server.name}": ${error()}`);
      setNotice(tr("copiedToClipboard"));
      window.setTimeout(() => setNotice(""), 1600);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  const retry = async () => {
    const workspace = props.workspace;
    const server = props.server;
    if (!workspace || !server) return;
    setBusy("retry");
    try {
      const next = await api.reconnectMCP(workspace, server.name);
      props.onChanged?.(next);
      if (next.status === "failed") {
        setError(next.error ?? tr("mcpFailed"));
      } else {
        props.onOpenChange(false);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  };

  const disable = async () => {
    const workspace = props.workspace;
    const server = props.server;
    if (!workspace || !server) return;
    setBusy("disable");
    try {
      const next = await api.disconnectMCP(workspace, server.name);
      props.onChanged?.(next);
      props.onOpenChange(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex max-h-[70vh] flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <CircleAlert class="size-4 text-state-fg-danger" />
              {props.server?.name ?? tr("mcpServers")}
            </DialogTitle>
            <DialogDescription>{tr("mcpFailed")}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!error()}
            onClick={() => void copy()}
          >
            <Copy />
            {tr("toolExecuteCopyError")}
          </Button>
        </div>

        <pre class="mt-3 min-h-24 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-state-fg-danger select-text">
          {error() || tr("mcpFailed")}
        </pre>

        {notice() && <p class="mt-2 text-caption text-text-muted">{notice()}</p>}

        <div class="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy() !== ""}
            onClick={() => void disable()}
          >
            {busy() === "disable" ? tr("mcpDisconnecting") : tr("mcpDisconnect")}
          </Button>
          <Button type="button" size="sm" disabled={busy() !== ""} onClick={() => void retry()}>
            {busy() === "retry" ? tr("mcpReconnecting") : tr("retry")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
