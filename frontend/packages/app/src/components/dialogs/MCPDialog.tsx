import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Icon, Plug, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { mcpExportName, serializeMCPResource, serializeMCPTool } from "../../lib/mcpExport";
import type { MCPEventType, MCPResourceContent, MCPServer, MCPToolResult } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  server?: string;
  onOpenChange: (open: boolean) => void;
}

/** Connected MCP servers with their discovered tools and resources. */
export function MCPDialog(props: Props) {
  const tr = useT();
  const [servers, setServers] = createSignal<MCPServer[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [reading, setReading] = createSignal("");
  const [contents, setContents] = createSignal<MCPResourceContent[]>();
  const [contentURI, setContentURI] = createSignal("");
  const [toolName, setToolName] = createSignal("");
  const [toolArgs, setToolArgs] = createSignal("{}");
  const [toolBusy, setToolBusy] = createSignal(false);
  const [toolResult, setToolResult] = createSignal<MCPToolResult>();
  const [toolError, setToolError] = createSignal("");
  const [toolInvocation, setToolInvocation] = createSignal<{ name: string; args: unknown }>();
  const [notice, setNotice] = createSignal("");
  const [reconnecting, setReconnecting] = createSignal("");
  const [disconnecting, setDisconnecting] = createSignal("");
  const [events, setEvents] = createSignal<MCPEventType[]>([]);
  const [eventsLoading, setEventsLoading] = createSignal(false);
  const [eventsError, setEventsError] = createSignal("");
  const [signingIn, setSigningIn] = createSignal("");
  const [auth, setAuth] = createSignal<{ server: string; state: string; code: string; url?: string }>();

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.mcpStatus(workspace);
      setServers(next);
      update(setSelected, selected, (current) => {
        const wanted = props.server;
        if (wanted && next.some((item) => item.name === wanted)) return wanted;
        return current && next.some((item) => item.name === current) ? current : next[0]?.name;
      });
    } catch (err) {
      setServers([]);
      setSelected(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.server;
      void load();
      const workspace = props.workspace;
      const timer = window.setInterval(() => {
        if (!workspace) return;
        void api
          .mcpStatus(workspace)
          .then((next) => setServers(next))
          .catch(() => undefined);
      }, 3000);
      onCleanup(() => window.clearInterval(timer));
    } else {
      setServers([]);
      setSelected(undefined);
      setError("");
      setReading("");
      setContents(undefined);
      setContentURI("");
      setToolName("");
      setToolArgs("{}");
      setToolBusy(false);
      setToolResult(undefined);
      setToolError("");
      setToolInvocation(undefined);
      setNotice("");
      setReconnecting("");
      setDisconnecting("");
      setEvents([]);
      setEventsError("");
    }
  });

  const reconnect = async (server: string) => {
    if (!props.workspace) return;
    setReconnecting(server);
    try {
      await api.reconnectMCP(props.workspace, server);
      setNotice(`Reconnected ${server}`);
      setError("");
      await load();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setReconnecting("");
    }
  };

  const disconnect = async (server: string) => {
    if (!props.workspace) return;
    setDisconnecting(server);
    try {
      await api.disconnectMCP(props.workspace, server);
      setNotice(`Disconnected ${server}`);
      setError("");
      await load();
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setDisconnecting("");
    }
  };

  const signIn = async (server: string) => {
    if (!props.workspace) return;
    setSigningIn(server);
    try {
      const started = await api.startMCPAuth(props.workspace, server);
      setAuth({ server, state: started.state, code: "", url: started.url });
      window.open(started.url, "_blank", "noopener,noreferrer");
      setNotice(`Opened the authorization page for ${server}.`);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSigningIn("");
    }
  };

  const completeAuth = async () => {
    const workspace = props.workspace;
    const current = auth();
    if (!workspace || !current) return;
    const pasted = current.code.trim();
    if (!pasted) {
      setError("Authorization code is required.");
      return;
    }
    // A pasted redirect URL carries the code and state; a bare code keeps the
    // state saved when sign-in started.
    let code = pasted;
    let state = current.state;
    try {
      const parsed = new URL(pasted);
      const nextCode = parsed.searchParams.get("code")?.trim() ?? "";
      const nextState = parsed.searchParams.get("state")?.trim() ?? "";
      if (nextCode) code = nextCode;
      if (nextState) state = nextState;
    } catch {
      // Not a URL; use the raw authorization code.
    }
    setSigningIn(current.server);
    try {
      await api.exchangeMCPAuth(workspace, current.server, code, state);
      setNotice(`Authorized ${current.server}.`);
      setAuth(undefined);
      await load();
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSigningIn("");
    }
  };

  const selectServer = (server: string) => {
    setSelected(server);
    setToolName("");
    setToolArgs("{}");
    setToolResult(undefined);
    setToolError("");
    setToolInvocation(undefined);
    setNotice("");
    setContents(undefined);
    setContentURI("");
    setEvents([]);
    setEventsError("");
  };

  const current = () => servers().find((item) => item.name === selected());

  const callTool = async () => {
    const workspace = props.workspace;
    const target = current();
    if (!workspace || !target) return;
    const name = toolName().trim();
    if (!name) {
      setToolError("Tool name is required.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = toolArgs().trim() ? JSON.parse(toolArgs()) : {};
    } catch {
      setToolError("Arguments must be valid JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setToolError("Arguments must be a JSON object.");
      return;
    }
    setToolBusy(true);
    try {
      setToolResult(await api.callMCPTool(workspace, target.name, name, parsed as Record<string, unknown>));
      setToolInvocation({ name, args: parsed });
      setToolError("");
    } catch (err) {
      setToolResult(undefined);
      setToolError(messageOf(err));
    } finally {
      setToolBusy(false);
    }
  };

  const readResource = async (server: string, uri: string) => {
    if (!props.workspace) return;
    setReading(uri);
    try {
      setContents(await api.readMCPResource(props.workspace, server, uri));
      setContentURI(uri);
      setError("");
    } catch (err) {
      setContents(undefined);
      setContentURI("");
      setError(messageOf(err));
    } finally {
      setReading("");
    }
  };

  const saveToolResult = async () => {
    const target = current();
    const result = toolResult();
    const invocation = toolInvocation();
    if (!target || !result || !invocation) return;
    try {
      const path = await api.saveTextFile(
        mcpExportName(target.name, "tool"),
        serializeMCPTool({
          server: target.name,
          tool: invocation.name,
          args: invocation.args,
          result,
        }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    }
  };

  const saveResource = async () => {
    const target = current();
    const list = contents();
    const uri = contentURI();
    if (!target || !list || !uri) return;
    try {
      const path = await api.saveTextFile(
        mcpExportName(target.name, "resource"),
        serializeMCPResource({ server: target.name, uri, contents: list }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    }
  };

  const connectedCount = () => servers().filter((item) => item.status === "connected").length;
  const toolCount = () => servers().reduce((sum, item) => sum + item.tools.length, 0);
  const currentConnected = () => current()?.status === "connected";

  createEffect(() => {
    const workspace = props.workspace;
    const target = current();
    if (!props.open || !workspace || !target?.name || !target.events) {
      setEvents([]);
      setEventsError("");
      setEventsLoading(false);
      return;
    }
    const serverName = target.name;
    let live = true;
    setEventsLoading(true);
    void api
      .mcpEvents(workspace, serverName)
      .then((next) => {
        if (!live) return;
        setEvents(next ?? []);
        setEventsError("");
      })
      .catch((err) => {
        if (!live) return;
        setEvents([]);
        setEventsError(messageOf(err));
      })
      .finally(() => {
        if (live) setEventsLoading(false);
      });
    onCleanup(() => {
      live = false;
    });
  });

  const statusText = (status: string) =>
    status === "connected"
      ? tr("connected")
      : status === "failed"
        ? tr("mcpFailed")
        : status === "needs_auth"
          ? tr("mcpNeedsAuth")
          : status === "disabled"
            ? tr("mcpDisabled")
            : tr("starting");

  // Mirrors the status dot used by the settings extension rows so a server
  // reads the same in both places.
  const statusDot = (status: string) =>
    status === "connected"
      ? "bg-state-fg-success"
      : status === "failed"
        ? "bg-state-fg-danger"
        : status === "needs_auth"
          ? "bg-state-fg-warning"
          : "bg-text-faint";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="large" height="body" class="flex flex-col">
        {/* Reserve the close-button gutter so the refresh control does not sit
            underneath the dialog's top-right close affordance. */}
        <div class="flex items-start justify-between gap-4 pe-8">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Plug class="size-4 text-text-faint" />
              {tr("mcpServers")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {connectedCount()} connected · {servers().length} configured · {toolCount()} tool
              {toolCount() === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <div class="mt-4 flex min-h-0 flex-1 gap-3">
          <div class="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01">
            <Show
              when={servers().length > 0}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? "Loading…" : "No MCP servers connected."}
                </p>
              }
            >
              <For each={servers()}>
                {(server) => (
                  <button
                    type="button"
                    onClick={() => selectServer(server.name)}
                    class={`interactive flex w-full items-start gap-2 border-b border-border-base px-3 py-2 text-left last:border-b-0 ${
                      selected() === server.name ? "bg-bg-layer-02" : ""
                    }`}
                  >
                    <Icon art="mcp" class="mt-0.5 size-4 shrink-0 text-icon-muted" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-body font-[530] leading-4 text-text-base">
                        {server.name}
                      </span>
                      <span
                        class={`mt-1 flex items-center gap-1.5 text-caption leading-4 ${
                          server.status === "failed"
                            ? "text-state-fg-danger"
                            : server.status === "connected"
                              ? "text-text-faint"
                              : "text-text-muted"
                        }`}
                      >
                        <span
                          class={`size-1.5 shrink-0 rounded-full ${statusDot(server.status)}`}
                          aria-hidden="true"
                        />
                        <span class="truncate">
                          {server.status === "connected"
                            ? `${server.tools.length} tool${server.tools.length === 1 ? "" : "s"} · ${server.resources.length} resource${
                                server.resources.length === 1 ? "" : "s"
                              }`
                            : statusText(server.status)}
                        </span>
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            <Show
              when={current()}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? "Loading…" : "Select a server to see its tools and resources."}
                </p>
              }
            >
              {(server) => (
                <>
                  <div class="flex shrink-0 items-start gap-2 border-b border-border-base px-3 py-2">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-body font-[530] leading-4 text-text-base">{server().name}</p>
                      <Show when={server().title && server().title !== server().name}>
                        <p class="mt-1 truncate text-caption leading-4 text-text-faint">{server().title}</p>
                      </Show>
                      <p
                        class={`mt-1 flex items-center gap-1.5 text-caption leading-4 ${
                          server().status === "failed" ? "text-state-fg-danger" : "text-text-muted"
                        }`}
                      >
                        <span
                          class={`size-1.5 shrink-0 rounded-full ${statusDot(server().status)}`}
                          aria-hidden="true"
                        />
                        <span class="truncate">{statusText(server().status)}</span>
                      </p>
                    </div>
                    <Show when={server().status === "failed" || server().status === "disabled"}>
                      <Button
                        class="shrink-0"
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={reconnecting() === server().name}
                        onClick={() => void reconnect(server().name)}
                      >
                        {reconnecting() === server().name ? tr("mcpReconnecting") : tr("mcpReconnect")}
                      </Button>
                    </Show>
                    <Show when={server().status === "connected"}>
                      <Button
                        class="shrink-0"
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={disconnecting() === server().name}
                        onClick={() => void disconnect(server().name)}
                      >
                        {disconnecting() === server().name ? tr("mcpDisconnecting") : tr("mcpDisconnect")}
                      </Button>
                    </Show>
                    <Show when={server().status === "needs_auth"}>
                      <Button
                        class="shrink-0"
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={signingIn() === server().name}
                        onClick={() => void signIn(server().name)}
                      >
                        {signingIn() === server().name ? tr("mcpSigningIn") : tr("mcpSignIn")}
                      </Button>
                    </Show>
                  </div>
                  <Show when={server().error}>
                    <ErrorBanner
                      error={server().error}
                      class="mx-3 mt-2 max-h-24 shrink-0 overflow-auto"
                    />
                  </Show>
                  <Show when={auth() && auth()!.server === server().name ? auth() : undefined}>
                    {(currentAuth) => (
                      <div class="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-2">
                        <Input
                          value={currentAuth().code}
                          aria-label={tr("mcpAuthCode")}
                          placeholder={tr("mcpAuthCodePlaceholder")}
                          onInput={(event) =>
                            update(setAuth, auth, (value) =>
                              value ? { ...value, code: event.currentTarget.value } : value,
                            )
                          }
                          class="min-w-40 flex-1 select-text font-mono"
                        />
                        <Show when={currentAuth().url}>
                          {(url) => (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => window.open(url(), "_blank", "noopener,noreferrer")}
                            >
                              {tr("mcpAuthOpen")}
                            </Button>
                          )}
                        </Show>
                        <Button
                          type="button"
                          size="xs"
                          disabled={signingIn() === server().name}
                          onClick={() => void completeAuth()}
                        >
                          {tr("mcpAuthComplete")}
                        </Button>
                      </div>
                    )}
                  </Show>
                  <Show when={!currentConnected()}>
                    <p class="px-3 py-3 text-meta text-text-faint">
                      The server is not connected. Reconnect it to browse tools and resources.
                    </p>
                  </Show>
                  <Show when={currentConnected()}>
                    <div class="min-h-0 flex-1 overflow-auto">
                      <div class="border-b border-border-base px-3 py-2">
                        <p class="text-caption font-[530] text-text-faint">Tools</p>
                        <Show
                          when={server().tools.length > 0}
                          fallback={<p class="mt-1 text-meta text-text-faint">No tools.</p>}
                        >
                          <ul class="mt-1 flex flex-col gap-1">
                            <For each={server().tools}>
                              {(tool) => (
                                <li class="flex items-start gap-2">
                                  <div class="min-w-0 flex-1">
                                    <p
                                      class="truncate font-mono text-meta text-text-base"
                                      title={tool.effective}
                                    >
                                      {tool.effective}
                                    </p>
                                    <Show when={tool.name !== tool.effective}>
                                      <p
                                        class="truncate font-mono text-caption text-text-faint"
                                        title={tool.name}
                                      >
                                        raw {tool.name}
                                      </p>
                                    </Show>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    class="shrink-0 px-0 text-text-accent hover:text-text-accent/80"
                                    onClick={() => {
                                      setToolName(tool.name);
                                      setToolArgs("{}");
                                      setToolResult(undefined);
                                      setToolError("");
                                    }}
                                  >
                                    Call
                                  </Button>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </div>
                      <Show when={server().events}>
                        <div class="border-b border-border-base px-3 py-2">
                          <p class="text-caption font-[530] text-text-faint">Events</p>
                          <Show
                            when={!eventsLoading()}
                            fallback={<p class="mt-1 text-meta text-text-faint">Loading…</p>}
                          >
                            <Show
                              when={!eventsError()}
                              fallback={<p class="mt-1 text-caption text-state-fg-danger">{eventsError()}</p>}
                            >
                              <Show
                                when={events().length > 0}
                                fallback={<p class="mt-1 text-meta text-text-faint">No events.</p>}
                              >
                                <ul class="mt-1 flex flex-col gap-1">
                                  <For each={events()}>
                                    {(event) => (
                                      <li>
                                        <p class="font-mono text-meta text-text-base">{event.name}</p>
                                        <p class="text-caption text-text-faint">
                                          {event.description ?? ""}
                                          {event.delivery?.length ? ` [${event.delivery.join(", ")}]` : ""}
                                        </p>
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </Show>
                            </Show>
                          </Show>
                        </div>
                      </Show>
                      <div class="border-b border-border-base px-3 py-2">
                        <p class="text-caption font-[530] text-text-faint">Resources</p>
                        <Show
                          when={server().resources.length > 0}
                          fallback={<p class="mt-1 text-meta text-text-faint">No resources.</p>}
                        >
                          <ul class="mt-1 flex flex-col gap-1">
                            <For each={server().resources}>
                              {(resource) => (
                                <li class="flex items-start gap-2">
                                  <div class="min-w-0 flex-1">
                                    <p
                                      class="truncate font-mono text-meta text-text-base"
                                      title={resource.uri || resource.uriTemplate || resource.name}
                                    >
                                      {resource.uri || resource.uriTemplate || resource.name}
                                    </p>
                                    <p
                                      class="truncate text-caption text-text-faint"
                                      title={[resource.name, resource.mimeType, resource.description]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    >
                                      {[resource.name, resource.mimeType, resource.description]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                  </div>
                                  <Show when={resource.uri}>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      class="shrink-0 px-0 text-text-accent hover:text-text-accent/80"
                                      disabled={reading() === resource.uri}
                                      onClick={() => void readResource(server().name, resource.uri ?? "")}
                                    >
                                      {reading() === resource.uri ? "Reading…" : "Read"}
                                    </Button>
                                  </Show>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </div>
                      <Show when={contents()}>
                        {(parts) => (
                          <div class="border-b border-border-base">
                            <div class="flex items-center gap-2 px-3 py-2 text-caption text-text-faint">
                              <span class="min-w-0 flex-1 truncate font-mono">{contentURI()}</span>
                              <Button type="button" variant="outline" size="xs" onClick={() => void saveResource()}>
                                <Save />
                                {tr("dialogSaveFile")}
                              </Button>
                              <Button type="button" variant="outline" size="xs" onClick={() => setContents(undefined)}>
                                Close
                              </Button>
                            </div>
                            <div class="max-h-48 overflow-auto px-3 pb-2">
                              <Show
                                when={parts().length > 0}
                                fallback={<p class="text-meta text-text-faint">Resource returned no content.</p>}
                              >
                                <For each={parts()}>
                                  {(part) => (
                                    <div class="py-1">
                                      <p class="text-caption text-text-faint">
                                        {part.mimeType || "unknown type"}
                                        {part.blob ? ` · ${Math.round((part.blob.length * 3) / 4)} bytes` : ""}
                                      </p>
                                      <Show
                                        when={part.text}
                                        fallback={
                                          <Show when={part.blob}>
                                            <p class="mt-1 text-meta text-text-faint">
                                              {tr("dialogBinaryNotDisplayed")}
                                            </p>
                                          </Show>
                                        }
                                      >
                                        <pre class="mt-1 max-h-40 overflow-auto rounded-md border border-border-base bg-bg-layer-01 p-2 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                                          {part.text}
                                        </pre>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Show>
                            </div>
                          </div>
                        )}
                      </Show>
                      <div class="px-3 py-2">
                        <p class="text-caption font-[530] text-text-faint">Invoke tool</p>
                        <div class="mt-1 flex items-center gap-2">
                          <Input
                            value={toolName()}
                            aria-label={tr("mCPMCPToolName")}
                            placeholder={tr("dialogToolName")}
                            onInput={(event) => setToolName(event.currentTarget.value)}
                            class="min-w-32 flex-1 select-text font-mono"
                          />
                          <Button type="button" size="xs" disabled={toolBusy()} onClick={() => void callTool()}>
                            {toolBusy() ? "Calling…" : "Call"}
                          </Button>
                        </div>
                        <Textarea
                          value={toolArgs()}
                          aria-label={tr("mCPMCPToolArguments")}
                          placeholder="{}"
                          onInput={(event) => setToolArgs(event.currentTarget.value)}
                          class="mt-1 min-h-16 select-text font-mono text-caption"
                        />
                        <Show when={toolError()}>
                          <p class="mt-1 text-caption text-state-fg-danger select-text">{toolError()}</p>
                        </Show>
                        <Show when={toolResult()}>
                          {(result) => (
                            <div class="mt-2 rounded-md border border-border-base bg-bg-layer-01">
                              <div class="flex items-center gap-2 border-b border-border-base px-2 py-1 text-caption text-text-faint">
                                <span class={result().isError ? "text-state-fg-danger" : "text-state-fg-success"}>
                                  {result().isError ? "error" : "ok"}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  class="ml-auto"
                                  onClick={() => void saveToolResult()}
                                >
                                  <Save />
                                  {tr("dialogSaveFile")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => setToolResult(undefined)}
                                >
                                  Clear
                                </Button>
                              </div>
                              <div class="max-h-48 overflow-auto p-2">
                                <Show when={result().content.length === 0 && result().structuredContent === undefined}>
                                  <p class="text-caption text-text-faint">No content.</p>
                                </Show>
                                <For each={result().content}>
                                  {(part) => (
                                    <div class="py-1">
                                      <p class="text-caption text-text-faint">
                                        {part.type}
                                        {part.mimeType ? ` · ${part.mimeType}` : ""}
                                        {part.uri ? ` · ${part.uri}` : ""}
                                        {part.data ? ` · ${Math.round((part.data.length * 3) / 4)} bytes` : ""}
                                      </p>
                                      <Show when={part.text}>
                                        <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                                          {part.text}
                                        </pre>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                                <Show when={result().structuredContent !== undefined}>
                                  <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                                    {JSON.stringify(result().structuredContent, null, 2)}
                                  </pre>
                                </Show>
                              </div>
                            </div>
                          )}
                        </Show>
                      </div>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>

        <p class="mt-2 shrink-0 text-caption text-text-faint">
          Only connected servers appear here; transport settings and credentials are never returned.
        </p>
      </DialogContent>
    </Dialog>
  );
}
