import { For, Show, createEffect, createSignal } from "solid-js";
import { Plug, RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Textarea } from "@lingzhu/ui/textarea";
import { update } from "@lingzhu/ui/solid";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { PluginStatus } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  workspace: string;
}

/** Per-plugin panels: one tab per connected plugin, with its tools and a call tray. */
export function PluginPanelsPane(props: Props) {
  const tr = useT();
  const [plugins, setPlugins] = createSignal<PluginStatus[]>([]);
  const [active, setActive] = createSignal<string>();
  const [tool, setTool] = createSignal("");
  const [args, setArgs] = createSignal("{}");
  const [result, setResult] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.plugins(props.workspace);
      setPlugins(list);
      update(setActive, active, (current) =>
        current && list.some((item) => item.name === current) ? current : list[0]?.name,
      );
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    props.workspace;
    void load();
  });

  const plugin = () => plugins().find((item) => item.name === active());

  const call = async () => {
    const current = plugin();
    if (!current || !tool().trim()) return;
    setResult("");
    try {
      let parsed: Record<string, unknown> = {};
      if (args().trim()) {
        const value = JSON.parse(args());
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Arguments must be a JSON object.");
        }
        parsed = value as Record<string, unknown>;
      }
      setResult(
        JSON.stringify(await api.callPluginTool(props.workspace, current.name, tool(), parsed), null, 2),
      );
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex h-9 shrink-0 items-center gap-1 border-b border-border-base px-2">
        <div class="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <For each={plugins()}>
            {(item) => (
              <button
                type="button"
                data-active={item.name === active() ? "true" : undefined}
                onClick={() => {
                  setActive(item.name);
                  setTool("");
                  setResult("");
                }}
                class={`interactive flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-meta ${
                  item.name === active()
                    ? "bg-bg-layer-03 text-text-base"
                    : "text-text-muted hover:text-text-base"
                }`}
              >
                <Plug class="size-3" />
                <span class="truncate">{item.name}</span>
              </button>
            )}
          </For>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={tr("pluginPanelsPaneRefreshPlugins")}
          onClick={() => void load()}
        >
          <RefreshCw class={loading() ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </div>
      <Show when={error()}>
        <p class="px-3 py-2 text-caption text-state-fg-danger">{error()}</p>
      </Show>
      <Show
        when={plugin()}
        fallback={<p class="p-3 text-meta text-text-faint">{tr("pluginPanelsPaneNoPlugins")}</p>}
      >
        {(current) => (
          <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
            <p class="text-caption text-text-faint">
              {current().capabilities.tools ? tr("toolsEnabled") : tr("toolsDisabled")} · {current().tools.length} ·{" "}
              {current().commands.length} commands
            </p>
            <div class="flex flex-wrap gap-1">
              <For each={current().tools}>
                {(item) => (
                  <Button
                    variant={tool() === item.name ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTool(item.name)}
                    class="font-mono text-caption"
                  >
                    {item.name}
                  </Button>
                )}
              </For>
            </div>
            <Textarea
              value={args()}
              aria-label={tr("pluginPanelsPanePanelArguments")}
              rows={3}
              onInput={(event) => setArgs(event.currentTarget.value)}
              class="font-mono text-meta"
            />
            <div class="flex justify-end">
              <Button size="sm" disabled={!tool()} onClick={() => void call()}>
                {tr("dialogRunTool")}
              </Button>
            </div>
            <Show when={result()}>
              <pre class="max-h-64 overflow-auto rounded-md bg-bg-layer-01 p-2 font-mono text-caption text-text-muted select-text">
                {result()}
              </pre>
            </Show>
            <Show when={current().panels.length > 0}>
              <div class="flex flex-col gap-2">
                <For each={current().panels}>
                  {(panel) => (
                    <div class="flex min-h-48 flex-col overflow-hidden rounded-md border border-border-base">
                      <div class="flex h-7 shrink-0 items-center border-b border-border-base px-2 text-caption text-text-faint">
                        {panel.title || panel.id}
                      </div>
                      <iframe
                        title={panel.title || panel.id}
                        sandbox="allow-scripts"
                        srcdoc={panel.html}
                        class="min-h-40 w-full flex-1 border-0 bg-bg-document"
                      />
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
