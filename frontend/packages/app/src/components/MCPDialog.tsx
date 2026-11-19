import { useEffect, useState } from "react";
import { Plug, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { mcpExportName, serializeMCPResource, serializeMCPTool } from "../lib/mcpExport";
import type { MCPEventType, MCPResourceContent, MCPServer, MCPToolResult } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Connected MCP servers with their discovered tools and resources. */
export function MCPDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState("");
  const [contents, setContents] = useState<MCPResourceContent[]>();
  const [contentURI, setContentURI] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState<MCPToolResult>();
  const [toolError, setToolError] = useState("");
  const [toolInvocation, setToolInvocation] = useState<{ name: string; args: unknown }>();
  const [notice, setNotice] = useState("");
  const [reconnecting, setReconnecting] = useState("");
  const [disconnecting, setDisconnecting] = useState("");
  const [events, setEvents] = useState<MCPEventType[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [signingIn, setSigningIn] = useState("");
  const [auth, setAuth] = useState<{ server: string; state: string; code: string }>();

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const next = await api.mcpStatus(workspace);
      setServers(next);
      setSelected((current) =>
        current && next.some((item) => item.name === current) ? current : next[0]?.name,
      );
    } catch (err) {
      setServers([]);
      setSelected(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
      const timer = window.setInterval(() => {
        if (!workspace) return;
        void api
          .mcpStatus(workspace)
          .then(setServers)
          .catch(() => undefined);
      }, 3000);
      return () => window.clearInterval(timer);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const reconnect = async (server: string) => {
    if (!workspace) return;
    setReconnecting(server);
    try {
      await api.reconnectMCP(workspace, server);
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
    if (!workspace) return;
    setDisconnecting(server);
    try {
      await api.disconnectMCP(workspace, server);
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
    if (!workspace) return;
    setSigningIn(server);
    try {
      const started = await api.startMCPAuth(workspace, server);
      setAuth({ server, state: started.state, code: "" });
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
    if (!workspace || !auth) return;
    const code = auth.code.trim();
    if (!code) {
      setError("Authorization code is required.");
      return;
    }
    setSigningIn(auth.server);
    try {
      await api.exchangeMCPAuth(workspace, auth.server, code, auth.state);
      setNotice(`Authorized ${auth.server}.`);
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

  const callTool = async () => {
    if (!workspace || !current) return;
    const name = toolName.trim();
    if (!name) {
      setToolError("Tool name is required.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = toolArgs.trim() ? JSON.parse(toolArgs) : {};
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
      setToolResult(await api.callMCPTool(workspace, current.name, name, parsed as Record<string, unknown>));
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
    if (!workspace) return;
    setReading(uri);
    try {
      setContents(await api.readMCPResource(workspace, server, uri));
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
    if (!current || !toolResult || !toolInvocation) return;
    try {
      const path = await api.saveTextFile(
        mcpExportName(current.name, "tool"),
        serializeMCPTool({
          server: current.name,
          tool: toolInvocation.name,
          args: toolInvocation.args,
          result: toolResult,
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
    if (!current || !contents || !contentURI) return;
    try {
      const path = await api.saveTextFile(
        mcpExportName(current.name, "resource"),
        serializeMCPResource({ server: current.name, uri: contentURI, contents }),
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

  const current = servers.find((item) => item.name === selected);
  const connectedCount = servers.filter((item) => item.status === "connected").length;
  const toolCount = servers.reduce((sum, item) => sum + item.tools.length, 0);
  const currentConnected = current?.status === "connected";

  useEffect(() => {
    if (!open || !workspace || !current?.name || !current.events) {
      setEvents([]);
      setEventsError("");
      setEventsLoading(false);
      return;
    }
    let live = true;
    setEventsLoading(true);
    void api
      .mcpEvents(workspace, current.name)
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
    return () => {
      live = false;
    };
  }, [open, workspace, current?.name, current?.events]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Plug className="size-4 text-text-faint" />
              {tr("mcpServers")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {connectedCount} connected · {servers.length} configured · {toolCount} tool
              {toolCount === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          <div className="w-56 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {servers.length === 0 ? (
              <p className="px-2 py-1 text-meta text-text-faint">
                {loading ? "Loading…" : "No MCP servers connected."}
              </p>
            ) : (
              servers.map((server) => (
                <button
                  key={server.name}
                  type="button"
                  onClick={() => selectServer(server.name)}
                  className={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                    selected === server.name
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className="w-full truncate">{server.name}</span>
                  <span
                    className={`w-full truncate text-caption ${
                      server.status === "failed"
                        ? "text-state-fg-danger"
                        : server.status === "connected"
                          ? "text-text-faint"
                          : "text-state-fg-warning"
                    }`}
                  >
                    {server.status === "connected"
                      ? `${server.tools.length} tool${server.tools.length === 1 ? "" : "s"} · ${server.resources.length} resource${
                          server.resources.length === 1 ? "" : "s"
                        }`
                      : statusText(server.status)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border-base">
            {!current ? (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Loading…" : "Select a server to see its tools and resources."}
              </p>
            ) : (
              <>
                <div className="flex items-start gap-2 border-b border-border-base px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-text-base">{current.name}</p>
                    {current.title && current.title !== current.name && (
                      <p className="truncate text-caption text-text-faint">{current.title}</p>
                    )}
                    <p
                      className={`text-caption ${
                        current.status === "failed"
                          ? "text-state-fg-danger"
                          : current.status === "connected"
                            ? "text-text-faint"
                            : "text-state-fg-warning"
                      }`}
                    >
                      {statusText(current.status)}
                      {current.error ? ` · ${current.error}` : ""}
                    </p>
                  </div>
                  {(current.status === "failed" || current.status === "disabled") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={reconnecting === current.name}
                      onClick={() => void reconnect(current.name)}
                    >
                      {reconnecting === current.name ? tr("mcpReconnecting") : tr("mcpReconnect")}
                    </Button>
                  )}
                  {current.status === "connected" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={disconnecting === current.name}
                      onClick={() => void disconnect(current.name)}
                    >
                      {disconnecting === current.name ? tr("mcpDisconnecting") : tr("mcpDisconnect")}
                    </Button>
                  )}
                  {current.status === "needs_auth" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={signingIn === current.name}
                      onClick={() => void signIn(current.name)}
                    >
                      {signingIn === current.name ? tr("mcpSigningIn") : tr("mcpSignIn")}
                    </Button>
                  )}
                </div>
                {auth?.server === current.name && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-2">
                    <Input
                      value={auth.code}
                      aria-label={tr("mcpAuthCode")}
                      placeholder={tr("mcpAuthCodePlaceholder")}
                      onChange={(event) => setAuth({ ...auth, code: event.target.value })}
                      className="min-w-40 flex-1 select-text font-mono"
                    />
                    <Button type="button" size="xs" disabled={signingIn === current.name} onClick={() => void completeAuth()}>
                      {tr("mcpAuthComplete")}
                    </Button>
                  </div>
                )}
                {!currentConnected && (
                  <p className="border-b border-border-base px-3 py-2 text-meta text-text-faint">
                    The server is not connected. Reconnect it to browse tools and resources.
                  </p>
                )}
                {currentConnected && (
                  <>
                <div className="border-b border-border-base px-3 py-2">
                  <p className="text-caption text-text-faint">Tools</p>
                  {current.tools.length === 0 ? (
                    <p className="mt-1 text-meta text-text-faint">No tools.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {current.tools.map((tool) => (
                        <li key={tool.effective} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-meta text-text-base">{tool.effective}</span>
                          {tool.name !== tool.effective && (
                            <span className="font-mono text-caption text-text-faint">
                              raw {tool.name}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="ml-auto"
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
                      ))}
                    </ul>
                  )}
                </div>
                {current.events && (
                  <div className="border-b border-border-base px-3 py-2">
                    <p className="text-caption text-text-faint">Events</p>
                    {eventsLoading ? (
                      <p className="mt-1 text-meta text-text-faint">Loading…</p>
                    ) : eventsError ? (
                      <p className="mt-1 text-caption text-state-fg-danger">{eventsError}</p>
                    ) : events.length === 0 ? (
                      <p className="mt-1 text-meta text-text-faint">No events.</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {events.map((event) => (
                          <li key={event.name}>
                            <p className="font-mono text-meta text-text-base">{event.name}</p>
                            <p className="text-caption text-text-faint">
                              {event.description ?? ""}
                              {event.delivery?.length ? ` [${event.delivery.join(", ")}]` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="text-caption text-text-faint">Resources</p>
                  {current.resources.length === 0 ? (
                    <p className="mt-1 text-meta text-text-faint">No resources.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {current.resources.map((resource) => (
                        <li key={`${resource.uri}:${resource.name}`} className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-meta text-text-base">
                              {resource.uri || resource.uriTemplate || resource.name}
                            </p>
                            <p className="truncate text-caption text-text-faint">
                              {resource.name}
                              {resource.mimeType ? ` · ${resource.mimeType}` : ""}
                              {resource.description ? ` · ${resource.description}` : ""}
                            </p>
                          </div>
                          {resource.uri && (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={reading === resource.uri}
                              onClick={() => void readResource(current.name, resource.uri ?? "")}
                            >
                              {reading === resource.uri ? "Reading…" : "Read"}
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border-t border-border-base px-3 py-2">
                  <p className="text-caption text-text-faint">Invoke tool</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={toolName}
                      aria-label={tr("mCPMCPToolName")}
                      placeholder={tr("dialogToolName")}
                      onChange={(event) => setToolName(event.target.value)}
                      className="min-w-32 flex-1 select-text font-mono"
                    />
                    <Button type="button" size="xs" disabled={toolBusy} onClick={() => void callTool()}>
                      {toolBusy ? "Calling…" : "Call"}
                    </Button>
                  </div>
                  <Textarea
                    value={toolArgs}
                    aria-label={tr("mCPMCPToolArguments")}
                    placeholder="{}"
                    onChange={(event) => setToolArgs(event.target.value)}
                    className="mt-1 min-h-16 select-text font-mono text-caption"
                  />
                  {toolError && (
                    <p className="mt-1 text-caption text-state-fg-danger select-text">{toolError}</p>
                  )}
                  {toolResult && (
                    <div className="mt-2 rounded-md border border-border-base bg-bg-base">
                      <div className="flex items-center gap-2 border-b border-border-base px-2 py-1 text-caption text-text-faint">
                        <span className={toolResult.isError ? "text-state-fg-danger" : "text-state-fg-success"}>
                          {toolResult.isError ? "error" : "ok"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="ml-auto"
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
                      <div className="max-h-48 overflow-auto p-2">
                        {toolResult.content.length === 0 && toolResult.structuredContent === undefined && (
                          <p className="text-caption text-text-faint">No content.</p>
                        )}
                        {toolResult.content.map((part, index) => (
                          <div key={`${part.type}:${index}`} className="py-1">
                            <p className="text-caption text-text-faint">
                              {part.type}
                              {part.mimeType ? ` · ${part.mimeType}` : ""}
                              {part.uri ? ` · ${part.uri}` : ""}
                              {part.data ? ` · ${Math.round((part.data.length * 3) / 4)} bytes` : ""}
                            </p>
                            {part.text && (
                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                                {part.text}
                              </pre>
                            )}
                          </div>
                        ))}
                        {toolResult.structuredContent !== undefined && (
                          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-caption leading-5 text-text-muted select-text">
                            {JSON.stringify(toolResult.structuredContent, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}

                {currentConnected && contents && (
                  <div className="border-t border-border-base">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-caption text-text-faint">
                      <span className="min-w-0 flex-1 truncate font-mono">{contentURI}</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => void saveResource()}>
                        <Save />
                        {tr("dialogSaveFile")}
                      </Button>
                      <Button type="button" variant="outline" size="xs" onClick={() => setContents(undefined)}>
                        Close
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-auto px-3 pb-2">
                      {contents.length === 0 ? (
                        <p className="text-meta text-text-faint">Resource returned no content.</p>
                      ) : (
                        contents.map((part, index) => (
                          <div key={`${part.uri}:${index}`} className="py-1">
                            <p className="text-caption text-text-faint">
                              {part.mimeType || "unknown type"}
                              {part.blob ? ` · ${Math.round((part.blob.length * 3) / 4)} bytes` : ""}
                            </p>
                            {part.text ? (
                              <pre className="mt-1 max-h-40 overflow-auto rounded-md border border-border-base bg-bg-base p-2 font-mono text-caption leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                                {part.text}
                              </pre>
                            ) : part.blob ? (
                              <p className="mt-1 text-meta text-text-faint">
                                {tr("dialogBinaryNotDisplayed")}
                              </p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Only connected servers appear here; transport settings and credentials are never returned.
        </p>
      </DialogContent>
    </Dialog>
  );
}
