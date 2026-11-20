import { useEffect, useState } from "react";
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
export function MCPErrorDialog({ open, workspace, server, onOpenChange, onChanged }: Props) {
  const tr = useT();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"retry" | "disable" | "">("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setError("");
      setNotice("");
      setBusy("");
      return;
    }
    setError(server?.error ?? "");
  }, [open, server?.name, server?.error]);

  const copy = async () => {
    if (!server || !error) return;
    try {
      await navigator.clipboard.writeText(`MCP server "${server.name}": ${error}`);
      setNotice(tr("copiedToClipboard"));
      window.setTimeout(() => setNotice(""), 1600);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  const retry = async () => {
    if (!workspace || !server) return;
    setBusy("retry");
    try {
      const next = await api.reconnectMCP(workspace, server.name);
      onChanged?.(next);
      if (next.status === "failed") {
        setError(next.error ?? tr("mcpFailed"));
      } else {
        onOpenChange(false);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  };

  const disable = async () => {
    if (!workspace || !server) return;
    setBusy("disable");
    try {
      const next = await api.disconnectMCP(workspace, server.name);
      onChanged?.(next);
      onOpenChange(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className="size-4 text-state-fg-danger" />
              {server?.name ?? tr("mcpServers")}
            </DialogTitle>
            <DialogDescription>{tr("mcpFailed")}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!error}
            onClick={() => void copy()}
          >
            <Copy />
            {tr("toolExecuteCopyError")}
          </Button>
        </div>

        <pre className="mt-3 min-h-24 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-state-fg-danger select-text">
          {error || tr("mcpFailed")}
        </pre>

        {notice && <p className="mt-2 text-caption text-text-muted">{notice}</p>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== ""}
            onClick={() => void disable()}
          >
            {busy === "disable" ? tr("mcpDisconnecting") : tr("mcpDisconnect")}
          </Button>
          <Button type="button" size="sm" disabled={busy !== ""} onClick={() => void retry()}>
            {busy === "retry" ? tr("mcpReconnecting") : tr("retry")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
