import { For, Show, createEffect, createSignal } from "solid-js";
import { Puzzle, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { pluginExportName, serializePluginTool } from "../../lib/pluginExport";
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

function Capability(props: { label: string; on: boolean }) {
  return (
    <Show when={props.on}>
      <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">{props.label}</span>
    </Show>
  );
}

/** Connected plugins with the tools and commands they contribute. */
export function PluginsDialog(props: Props) {
  const tr = useT();
  const [plugins, setPlugins] = createSignal<PluginStatus[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [toolPlugin, setToolPlugin] = createSignal("");
  const [toolName, setToolName] = createSignal("");
  const [toolArgs, setToolArgs] = createSignal("{}");
  const [toolBusy, setToolBusy] = createSignal(false);
  const [toolResult, setToolResult] = createSignal<PluginToolResult>();
  const [toolError, setToolError] = createSignal("");
  const [toolInvocation, setToolInvocation] = createSignal<{
    plugin: string;
    name: string;
    args: unknown;
  }>();
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setPlugins(await api.plugins(props.workspace));
    } catch (err) {
      setPlugins([]);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
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
  });

  const callTool = async () => {
    if (!props.workspace) return;
    const plugin = toolPlugin().trim();
    const name = toolName().trim();
    if (!plugin || !name) {
      setToolError("Plugin and tool names are required.");
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
      setToolResult(await api.callPluginTool(props.workspace, plugin, name, parsed as Record<string, unknown>));
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
    const result = toolResult();
    const invocation = toolInvocation();
    if (!result || !invocation) return;
    try {
      const path = await api.saveTextFile(
        pluginExportName(invocation.plugin, invocation.name),
        serializePluginTool({
          plugin: invocation.plugin,
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

  const resultText = (): string => {
    const result = toolResult();
    if (!result) return "";
    if (result.output.trim()) return result.output;
    return result.content.map((part) => part.text).filter(Boolean).join("\n");
  };

  const toolCount = () => plugins().reduce((sum, plugin) => sum + plugin.tools.length, 0);
  const commandCount = () => plugins().reduce((sum, plugin) => sum + plugin.commands.length, 0);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Puzzle class="size-4 text-text-faint" />
              Plugins
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {plugins().length} connected · {toolCount()} tool{toolCount() === 1 ? "" : "s"} · {commandCount()} command
              {commandCount() === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <div class="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <Show
            when={plugins().length > 0}
            fallback={
              <p class="rounded-md border border-border-base p-3 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("noPlugins")}
              </p>
            }
          >
            <For each={plugins()}>
              {(plugin) => (
                <section class="rounded-md border border-border-base">
                  <div class="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5">
                    <span class="text-body text-text-base">{plugin.name}</span>
                    <Capability label="tools" on={plugin.capabilities.tools} />
                    <Capability label="commands" on={plugin.capabilities.commands} />
                    <Capability label="permissions" on={plugin.capabilities.permissions} />
                    <Capability label="hooks" on={plugin.capabilities.hooks} />
                  </div>
                  <div class="border-b border-border-base px-3 py-2">
                    <p class="text-caption text-text-faint">{tr("pluginTools")}</p>
                    <Show
                      when={plugin.tools.length > 0}
                      fallback={<p class="mt-1 text-meta text-text-faint">{tr("pluginNoTools")}</p>}
                    >
                      <ul class="mt-1 flex flex-col gap-1">
                        <For each={plugin.tools}>
                          {(tool) => (
                            <li class="flex flex-wrap items-center gap-2">
                              <span class="font-mono text-meta text-text-base">{tool.effective}</span>
                              <Show when={tool.name !== tool.effective}>
                                <span class="font-mono text-caption text-text-faint">raw {tool.name}</span>
                              </Show>
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                class="ml-auto"
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
                          )}
                        </For>
                      </ul>
                    </Show>
                  </div>
                  <div class="px-3 py-2">
                    <p class="text-caption text-text-faint">{tr("pluginCommands")}</p>
                    <Show
                      when={plugin.commands.length > 0}
                      fallback={<p class="mt-1 text-meta text-text-faint">{tr("pluginNoCommands")}</p>}
                    >
                      <div class="mt-1 flex flex-wrap gap-1">
                        <For each={plugin.commands}>
                          {(command) => (
                            <span class="rounded-xs border border-border-base px-1 font-mono text-caption text-text-muted">
                              /{command}
                            </span>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </section>
              )}
            </For>
          </Show>
        </div>

        <div class="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 p-3">
          <p class="text-caption text-text-faint">{tr("pluginInvokeTool")}</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <Input
              value={toolPlugin()}
              aria-label={tr("pluginsPluginName")}
              placeholder={tr("dialogPluginName")}
              onInput={(event) => setToolPlugin(event.currentTarget.value)}
              class="w-36 select-text font-mono"
            />
            <Input
              value={toolName()}
              aria-label={tr("pluginsPluginToolName")}
              placeholder={tr("dialogTool")}
              onInput={(event) => setToolName(event.currentTarget.value)}
              class="min-w-32 flex-1 select-text font-mono"
            />
            <Button type="button" size="xs" disabled={toolBusy()} onClick={() => void callTool()}>
              {toolBusy() ? tr("calling") : tr("call")}
            </Button>
          </div>
          <Textarea
            value={toolArgs()}
            aria-label={tr("pluginsPluginToolArguments")}
            placeholder="{}"
            onInput={(event) => setToolArgs(event.currentTarget.value)}
            class="mt-2 min-h-16 select-text font-mono text-caption"
          />
          <Show when={toolError()}>
            <p class="mt-1 text-caption text-state-fg-danger select-text">{toolError()}</p>
          </Show>
          <Show when={toolResult()}>
            {(result) => (
              <div class="mt-2 rounded-md border border-border-base bg-bg-base">
                <div class="flex items-center gap-2 border-b border-border-base px-2 py-1 text-caption text-text-faint">
                  <span class={result().isError ? "text-state-fg-danger" : "text-state-fg-success"}>
                    {result().isError ? tr("errorLabel") : tr("ok")}
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
                <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-caption leading-5 text-text-muted select-text">
                  {resultText() || "(no output)"}
                </pre>
              </div>
            )}
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Only connected plugins appear here; process commands, environment variables and transport details are never returned.
        </p>
      </DialogContent>
    </Dialog>
  );
}
