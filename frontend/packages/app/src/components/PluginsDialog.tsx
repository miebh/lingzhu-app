import { useEffect, useState } from "react";
import { Puzzle, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { pluginExportName, serializePluginTool } from "../lib/pluginExport";
import type { PluginStatus, PluginToolResult } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function Capability({ label, on }: { label: string; on: boolean }) {
  if (!on) return null;
  return (
    <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">{label}</span>
  );
}

/** Connected plugins with the tools and commands they contribute. */
export function PluginsDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toolPlugin, setToolPlugin] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolBusy, setToolBusy] = useState(false);
  const [toolResult, setToolResult] = useState<PluginToolResult>();
  const [toolError, setToolError] = useState("");
  const [toolInvocation, setToolInvocation] = useState<{
    plugin: string;
    name: string;
    args: unknown;
  }>();
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setPlugins(await api.plugins(workspace));
    } catch (err) {
      setPlugins([]);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setPlugins([]);
      setError("");
      setToolPlugin("");
      setToolName("");
      setToolArgs("{}");
      setToolBusy(false);
      setToolResult(undefined);
      setToolError("");
      setToolInvocation(undefined);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const callTool = async () => {
    if (!workspace) return;
    const plugin = toolPlugin.trim();
    const name = toolName.trim();
    if (!plugin || !name) {
      setToolError("Plugin and tool names are required.");
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
      setToolResult(await api.callPluginTool(workspace, plugin, name, parsed as Record<string, unknown>));
      setToolInvocation({ plugin, name, args: parsed });
      setToolError("");
    } catch (err) {
      setToolResult(undefined);
      setToolError(messageOf(err));
    } finally {
      setToolBusy(false);
    }
  };

  const saveToolResult = async () => {
    if (!toolResult || !toolInvocation) return;
    try {
      const path = await api.saveTextFile(
        pluginExportName(toolInvocation.plugin, toolInvocation.name),
        serializePluginTool({
          plugin: toolInvocation.plugin,
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

  const resultText = (): string => {
    if (!toolResult) return "";
    if (toolResult.output.trim()) return toolResult.output;
    return toolResult.content.map((part) => part.text).filter(Boolean).join("\n");
  };

  const toolCount = plugins.reduce((sum, plugin) => sum + plugin.tools.length, 0);
  const commandCount = plugins.reduce((sum, plugin) => sum + plugin.commands.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Puzzle className="size-4 text-text-faint" />
              Plugins
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {plugins.length} connected · {toolCount} tool{toolCount === 1 ? "" : "s"} · {commandCount} command
              {commandCount === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {plugins.length === 0 ? (
            <p className="rounded-md border border-border-base p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No plugins connected."}
            </p>
          ) : (
            plugins.map((plugin) => (
              <section key={plugin.name} className="rounded-md border border-border-base">
                <div className="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5">
                  <span className="text-body text-text-base">{plugin.name}</span>
                  <Capability label="tools" on={plugin.capabilities.tools} />
                  <Capability label="commands" on={plugin.capabilities.commands} />
                  <Capability label="permissions" on={plugin.capabilities.permissions} />
                  <Capability label="hooks" on={plugin.capabilities.hooks} />
                </div>
                <div className="border-b border-border-base px-3 py-2">
                  <p className="text-caption text-text-faint">Tools</p>
                  {plugin.tools.length === 0 ? (
                    <p className="mt-1 text-meta text-text-faint">No tools.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {plugin.tools.map((tool) => (
                        <li key={tool.effective} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-meta text-text-base">{tool.effective}</span>
                          {tool.name !== tool.effective && (
                            <span className="font-mono text-caption text-text-faint">raw {tool.name}</span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="ml-auto"
                            onClick={() => {
                              setToolPlugin(plugin.name);
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
                <div className="px-3 py-2">
                  <p className="text-caption text-text-faint">Commands</p>
                  {plugin.commands.length === 0 ? (
                    <p className="mt-1 text-meta text-text-faint">No commands.</p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {plugin.commands.map((command) => (
                        <span key={command} className="rounded-xs border border-border-base px-1 font-mono text-caption text-text-muted">
                          /{command}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p className="text-caption text-text-faint">Invoke tool</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Input
              value={toolPlugin}
              aria-label={tr("pluginsPluginName")}
              placeholder={tr("dialogPluginName")}
              onChange={(event) => setToolPlugin(event.target.value)}
              className="w-36 select-text font-mono"
            />
            <Input
              value={toolName}
              aria-label={tr("pluginsPluginToolName")}
              placeholder={tr("dialogTool")}
              onChange={(event) => setToolName(event.target.value)}
              className="min-w-32 flex-1 select-text font-mono"
            />
            <Button type="button" size="xs" disabled={toolBusy} onClick={() => void callTool()}>
              {toolBusy ? "Calling…" : "Call"}
            </Button>
          </div>
          <Textarea
            value={toolArgs}
            aria-label={tr("pluginsPluginToolArguments")}
            placeholder="{}"
            onChange={(event) => setToolArgs(event.target.value)}
            className="mt-2 min-h-16 select-text font-mono text-caption"
          />
          {toolError && <p className="mt-1 text-caption text-state-fg-danger select-text">{toolError}</p>}
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
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-caption leading-5 text-text-muted select-text">
                {resultText() || "(no output)"}
              </pre>
            </div>
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Only connected plugins appear here; process commands, environment variables and transport details are never returned.
        </p>
      </DialogContent>
    </Dialog>
  );
}
