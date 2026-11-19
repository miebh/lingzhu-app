import { useEffect, useRef, useState } from "react";
import { ExternalLink, KeyRound } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";
import type { MCPServer } from "@lingzhu/ui/types";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";

interface Props {
  open: boolean;
  workspace?: string;
  server?: string;
  onOpenChange: (open: boolean) => void;
  onAuthorized?: (server: MCPServer) => void;
}

/** OAuth sign-in for one MCP server, with the browser and a paste form. */
export function MCPAuthDialog({ open, workspace, server, onOpenChange, onAuthorized }: Props) {
  const tr = useT();
  const [auth, setAuth] = useState<{ state: string; url?: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const started = useRef<string>("");
  const done = useRef(false);

  const start = async () => {
    if (!workspace || !server) return;
    done.current = false;
    setBusy(true);
    setError("");
    setCode("");
    try {
      const next = await api.startMCPAuth(workspace, server);
      setAuth({ state: next.state, url: next.url });
      started.current = server;
      window.open(next.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setAuth(undefined);
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      started.current = "";
      done.current = false;
      setAuth(undefined);
      setCode("");
      setError("");
      setBusy(false);
      return;
    }
    if (server && started.current !== server) {
      started.current = server;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, server]);

  useEffect(() => {
    if (!open || !workspace || !server || !auth || done.current) return;
    let live = true;
    const timeout = window.setTimeout(() => {
      if (!live || done.current) return;
      done.current = true;
      setError(tr("mcpAuthTimedOut"));
    }, 5 * 60 * 1000);
    const timer = window.setInterval(() => {
      void api
        .mcpStatus(workspace)
        .then((servers) => {
          if (!live || done.current) return;
          const current = servers.find((item) => item.name === server);
          if (!current) return;
          if (current.status === "connected") {
            done.current = true;
            onAuthorized?.(current);
            onOpenChange(false);
            return;
          }
          if (current.status === "failed") setError(current.error || tr("mcpFailed"));
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      live = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, server, auth?.url]);

  const complete = async () => {
    if (!workspace || !server || !auth) return;
    const pasted = code.trim();
    if (!pasted) {
      setError(tr("mcpAuthCode"));
      return;
    }
    let nextCode = pasted;
    let nextState = auth.state;
    try {
      const parsed = new URL(pasted);
      const parsedCode = parsed.searchParams.get("code")?.trim() ?? "";
      const parsedState = parsed.searchParams.get("state")?.trim() ?? "";
      if (parsedCode) nextCode = parsedCode;
      if (parsedState) nextState = parsedState;
    } catch {
      // A bare authorization code keeps the state from the start request.
    }
    setBusy(true);
    try {
      const next = await api.exchangeMCPAuth(workspace, server, nextCode, nextState);
      onAuthorized?.(next);
      onOpenChange(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-text-faint" />
              {tr("mcpSignIn")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {server ? `${server} · ` : ""}
              {tr("mcpAuthDescription")}
            </DialogDescription>
          </div>
          {auth?.url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(auth.url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink />
              {tr("mcpAuthOpen")}
            </Button>
          )}
        </div>

        <ErrorBanner error={error} className="mt-3" />

        {auth && !error && (
          <p role="status" className="mt-3 text-body leading-5 text-text-muted">
            {tr("mcpAuthWaiting")}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Input
            value={code}
            aria-label={tr("mcpAuthCode")}
            placeholder={tr("mcpAuthCodePlaceholder")}
            onChange={(event) => setCode(event.target.value)}
            className="min-w-0 flex-1 select-text font-mono"
          />
          <Button type="button" size="sm" disabled={busy || !auth} onClick={() => void complete()}>
            {tr("mcpAuthComplete")}
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void start()}>
            {tr("mcpAuthRetry")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tr("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
