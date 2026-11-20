import { useEffect, useState } from "react";
import { Plug, RefreshCw } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { PluginStatus } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  workspace: string;
}

/** Per-plugin panels: one tab per connected plugin, with its tools and a call tray. */
export function PluginPanelsPane({ workspace }: Props) {
  const tr = useT();
  const [plugins, setPlugins] = useState<PluginStatus[]>([]);
  const [active, setActive] = useState<string>();
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.plugins(workspace);
      setPlugins(list);
      setActive((current) => (current && list.some((item) => item.name === current) ? current : list[0]?.name));
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const plugin = plugins.find((item) => item.name === active);

  const call = async () => {
    if (!plugin || !tool.trim()) return;
    setResult("");
    try {
      let parsed: Record<string, unknown> = {};
      if (args.trim()) {
        const value = JSON.parse(args);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Arguments must be a JSON object.");
        }
        parsed = value as Record<string, unknown>;
      }
      setResult(JSON.stringify(await api.callPluginTool(workspace, plugin.name, tool, parsed), null, 2));
      setError("");
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border-base px-2">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {plugins.map((item) => (
            <button
              key={item.name}
              type="button"
              data-active={item.name === active ? "true" : undefined}
              onClick={() => {
                setActive(item.name);
                setTool("");
                setResult("");
              }}
              className={`interactive flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-meta ${
                item.name === active ? "bg-bg-layer-03 text-text-base" : "text-text-muted hover:text-text-base"
              }`}
            >
              <Plug className="size-3" />
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-xs" aria-label={tr("pluginPanelsPaneRefreshPlugins")} onClick={() => void load()}>
          <RefreshCw className={loading ? "motion-safe:animate-spin" : undefined} />
        </Button>
      </div>
      {error && <p className="px-3 py-2 text-caption text-state-fg-danger">{error}</p>}
      {!plugin ? (
        <p className="p-3 text-meta text-text-faint">No plugins connected for this workspace.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          <p className="text-caption text-text-faint">
            {plugin.capabilities.tools ? "tools" : "no tools"} · {plugin.tools.length} ·{" "}
            {plugin.commands.length} commands
          </p>
          <div className="flex flex-wrap gap-1">
            {plugin.tools.map((item) => (
              <Button
                key={item.effective}
                variant={tool === item.name ? "default" : "outline"}
                size="sm"
                onClick={() => setTool(item.name)}
                className="font-mono text-caption"
              >
                {item.name}
              </Button>
            ))}
          </div>
          <Textarea
            value={args}
            aria-label={tr("pluginPanelsPanePanelArguments")}
            rows={3}
            onChange={(event) => setArgs(event.target.value)}
            className="font-mono text-meta"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!tool} onClick={() => void call()}>
              {tr("dialogRunTool")}
            </Button>
          </div>
          {result && (
            <pre className="max-h-64 overflow-auto rounded-md bg-bg-layer-01 p-2 font-mono text-caption text-text-muted select-text">
              {result}
            </pre>
          )}
          {plugin.panels.length > 0 && (
            <div className="flex flex-col gap-2">
              {plugin.panels.map((panel) => (
                <div key={panel.id} className="flex min-h-48 flex-col overflow-hidden rounded-md border border-border-base">
                  <div className="flex h-7 shrink-0 items-center border-b border-border-base px-2 text-caption text-text-faint">
                    {panel.title || panel.id}
                  </div>
                  <iframe
                    title={panel.title || panel.id}
                    sandbox="allow-scripts"
                    srcDoc={panel.html}
                    className="min-h-40 w-full flex-1 border-0 bg-bg-document"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
