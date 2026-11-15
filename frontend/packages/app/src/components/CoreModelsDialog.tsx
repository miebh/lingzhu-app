import { useEffect, useState } from "react";
import { Cpu } from "@lingzhu/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { CoreModel, CoreProvider } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function formatWindow(value: number): string {
  if (!value) return "—";
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

/** Provider readiness, model catalogs and the default selection of one core. */
export function CoreModelsDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [providers, setProviders] = useState<CoreProvider[]>([]);
  const [models, setModels] = useState<CoreModel[]>([]);
  const [fallbackDefault, setFallbackDefault] = useState<CoreModel | null>(null);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<CoreProvider>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const [nextProviders, nextModels, nextDefault] = await Promise.all([
        api.coreProviders(workspace),
        api.coreModels(workspace),
        api.coreDefaultModel(workspace),
      ]);
      setProviders(nextProviders);
      setModels(nextModels);
      setFallbackDefault(nextDefault);
      const first = nextProviders[0]?.id;
      setSelected((current) =>
        current && nextProviders.some((item) => item.id === current) ? current : first,
      );
      if (first) {
        setDetail(await api.coreProvider(workspace, first));
      } else {
        setDetail(undefined);
      }
    } catch (err) {
      setProviders([]);
      setModels([]);
      setFallbackDefault(null);
      setDetail(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setProviders([]);
      setModels([]);
      setFallbackDefault(null);
      setSelected(undefined);
      setDetail(undefined);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const choose = async (id: string) => {
    if (!workspace) return;
    setSelected(id);
    try {
      setDetail(await api.coreProvider(workspace, id));
      setError("");
    } catch (err) {
      setDetail(undefined);
      setError(messageOf(err));
    }
  };

  const defaultModel =
    models.find((model) => model.default) ??
    fallbackDefault ??
    undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="size-4 text-text-faint" />
              {tr("paletteCoreModels")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {name ? `${name} · ` : ""}
              {providers.length} provider{providers.length === 1 ? "" : "s"} · {models.length} model
              {models.length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />

        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          <div className="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {providers.length === 0 ? (
              <p className="px-2 py-1 text-meta text-text-faint">
                {loading ? "Loading…" : "No providers configured."}
              </p>
            ) : (
              providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => void choose(provider.id)}
                  className={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                    selected === provider.id
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{provider.name || provider.id}</span>
                    <span
                      className={`rounded-xs border border-border-base px-1 text-caption ${
                        provider.ready ? "text-state-fg-success" : "text-state-fg-warning"
                      }`}
                    >
                      {provider.ready ? "ready" : "no key"}
                    </span>
                  </span>
                  <span className="w-full truncate text-caption text-text-faint">
                    {provider.id} · {provider.models.length} model
                    {provider.models.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="shrink-0 rounded-md border border-border-base">
              <div className="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                <span className="text-body text-text-base">
                  {detail?.name || detail?.id || "Select a provider"}
                </span>
                {detail && (
                  <span className={detail.ready ? "text-state-fg-success" : "text-state-fg-warning"}>
                    {detail.ready ? "ready" : "no key"}
                  </span>
                )}
                {defaultModel && (
                  <span className="ml-auto rounded-xs border border-border-base px-1 text-caption text-text-faint">
                    default {defaultModel.providerId}/{defaultModel.id}
                  </span>
                )}
              </div>
              <p className="truncate px-3 py-1.5 font-mono text-caption text-text-muted" title={detail?.baseUrl}>
                {detail?.baseUrl || "—"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
              {models.length === 0 ? (
                <p className="p-3 text-meta text-text-faint">{loading ? "Loading…" : "No models."}</p>
              ) : (
                models.map((model) => (
                  <div
                    key={`${model.providerId}:${model.id}`}
                    className={`flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0 ${
                      selected === model.providerId ? "bg-bg-layer-01" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-text-base" title={model.name || model.id}>
                      {model.name || model.id}
                    </span>
                    <span className="shrink-0 text-caption text-text-faint">{model.providerId}</span>
                    <span className="shrink-0 font-mono text-caption tabular-nums text-text-faint">
                      {formatWindow(model.contextWindow)}
                    </span>
                    {model.default && (
                      <span className="shrink-0 rounded-xs border border-border-base px-1 text-caption text-state-fg-success">
                        default
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
