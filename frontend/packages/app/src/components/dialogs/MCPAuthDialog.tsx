import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { ExternalLink, KeyRound } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";
import type { MCPServer } from "@lingzhu/ui/types";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";

interface Props {
  open: boolean;
  workspace?: string;
  server?: string;
  onOpenChange: (open: boolean) => void;
  onAuthorized?: (server: MCPServer) => void;
}

/** OAuth sign-in for one MCP server, with the browser and a paste form. */
export function MCPAuthDialog(props: Props) {
  const tr = useT();
  const [auth, setAuth] = createSignal<{ state: string; url?: string }>();
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let started = "";
  let done = false;

  const start = async () => {
    const workspace = props.workspace;
    const server = props.server;
    if (!workspace || !server) return;
    done = false;
    setBusy(true);
    setError("");
    setCode("");
    try {
      const next = await api.startMCPAuth(workspace, server);
      setAuth({ state: next.state, url: next.url });
      started = server;
      window.open(next.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setAuth(undefined);
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    if (!props.open) {
      started = "";
      done = false;
      setAuth(undefined);
      setCode("");
      setError("");
      setBusy(false);
      return;
    }
    const server = props.server;
    if (server && started !== server) {
      started = server;
      void start();
    }
  });

  createEffect(() => {
    const workspace = props.workspace;
    const server = props.server;
    const current = auth();
    if (!props.open || !workspace || !server || !current || done) return;
    let live = true;
    const timeout = window.setTimeout(() => {
      if (!live || done) return;
      done = true;
      setError(tr("mcpAuthTimedOut"));
    }, 5 * 60 * 1000);
    const timer = window.setInterval(() => {
      void api
        .mcpStatus(workspace)
        .then((servers) => {
          if (!live || done) return;
          const found = servers.find((item) => item.name === server);
          if (!found) return;
          if (found.status === "connected") {
            done = true;
            props.onAuthorized?.(found);
            props.onOpenChange(false);
            return;
          }
          if (found.status === "failed") setError(found.error || tr("mcpFailed"));
        })
        .catch(() => undefined);
    }, 1500);
    onCleanup(() => {
      live = false;
      window.clearTimeout(timeout);
      window.clearInterval(timer);
    });
  });

  const complete = async () => {
    const workspace = props.workspace;
    const server = props.server;
    const current = auth();
    if (!workspace || !server || !current) return;
    const pasted = code().trim();
    if (!pasted) {
      setError(tr("mcpAuthCode"));
      return;
    }
    let nextCode = pasted;
    let nextState = current.state;
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
      props.onAuthorized?.(next);
      props.onOpenChange(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <KeyRound class="size-4 text-text-faint" />
              {tr("mcpSignIn")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.server ? `${props.server} · ` : ""}
              {tr("mcpAuthDescription")}
            </DialogDescription>
          </div>
          <Show when={auth()?.url}>
            {(url) => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(url(), "_blank", "noopener,noreferrer")}
              >
                <ExternalLink />
                {tr("mcpAuthOpen")}
              </Button>
            )}
          </Show>
        </div>

        <ErrorBanner error={error()} class="mt-3" />

        <Show when={auth() && !error()}>
          <p role="status" class="mt-3 text-body leading-5 text-text-muted">
            {tr("mcpAuthWaiting")}
          </p>
        </Show>

        <div class="mt-4 flex items-center gap-2">
          <Input
            value={code()}
            aria-label={tr("mcpAuthCode")}
            placeholder={tr("mcpAuthCodePlaceholder")}
            onInput={(event) => setCode(event.currentTarget.value)}
            class="min-w-0 flex-1 select-text font-mono"
          />
          <Button type="button" size="sm" disabled={busy() || !auth()} onClick={() => void complete()}>
            {tr("mcpAuthComplete")}
          </Button>
        </div>

        <div class="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy()} onClick={() => void start()}>
            {tr("mcpAuthRetry")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}>
            {tr("cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
