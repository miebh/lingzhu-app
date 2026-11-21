import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Cpu } from "@lingzhu/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
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
export function CoreModelsDialog(props: Props) {
  const tr = useT();
  const [providers, setProviders] = createSignal<CoreProvider[]>([]);
  const [models, setModels] = createSignal<CoreModel[]>([]);
  const [fallbackDefault, setFallbackDefault] = createSignal<CoreModel | null>(null);
  const [selected, setSelected] = createSignal<string>();
  const [detail, setDetail] = createSignal<CoreProvider>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
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
      update(setSelected, selected, (current) =>
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void load();
    } else {
      setProviders([]);
      setModels([]);
      setFallbackDefault(null);
      setSelected(undefined);
      setDetail(undefined);
      setError("");
    }
  });

  const choose = async (id: string) => {
    const workspace = props.workspace;
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

  const defaultModel = createMemo(() => models().find((model) => model.default) ?? fallbackDefault() ?? undefined);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Cpu class="size-4 text-text-faint" />
              {tr("paletteCoreModels")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.name ? `${props.name} · ` : ""}
              {providers().length} provider{providers().length === 1 ? "" : "s"} · {models().length} model
              {models().length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />

        <div class="mt-4 flex min-h-0 flex-1 gap-3">
          <div class="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            <Show
              when={providers().length > 0}
              fallback={
                <p class="px-2 py-1 text-meta text-text-faint">
                  {loading() ? "Loading…" : "No providers configured."}
                </p>
              }
            >
              <For each={providers()}>
                {(provider) => (
                  <button
                    type="button"
                    onClick={() => void choose(provider.id)}
                    class={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                      selected() === provider.id
                        ? "bg-bg-layer-02 text-text-base"
                        : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <span class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 truncate">{provider.name || provider.id}</span>
                      <span
                        class={`rounded-xs border border-border-base px-1 text-caption ${
                          provider.ready ? "text-state-fg-success" : "text-state-fg-warning"
                        }`}
                      >
                        {provider.ready ? "ready" : "no key"}
                      </span>
                    </span>
                    <span class="w-full truncate text-caption text-text-faint">
                      {provider.id} · {provider.models.length} model
                      {provider.models.length === 1 ? "" : "s"}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            <div class="shrink-0 rounded-md border border-border-base">
              <div class="flex flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                <span class="text-body text-text-base">
                  {detail()?.name || detail()?.id || "Select a provider"}
                </span>
                <Show when={detail()}>
                  {(provider) => (
                    <span class={provider().ready ? "text-state-fg-success" : "text-state-fg-warning"}>
                      {provider().ready ? "ready" : "no key"}
                    </span>
                  )}
                </Show>
                <Show when={defaultModel()}>
                  {(model) => (
                    <span class="ml-auto rounded-xs border border-border-base px-1 text-caption text-text-faint">
                      default {model().providerId}/{model().id}
                    </span>
                  )}
                </Show>
              </div>
              <p class="truncate px-3 py-1.5 font-mono text-caption text-text-muted" title={detail()?.baseUrl}>
                {detail()?.baseUrl || "—"}
              </p>
            </div>

            <div class="min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
              <Show
                when={models().length > 0}
                fallback={<p class="p-3 text-meta text-text-faint">{loading() ? "Loading…" : "No models."}</p>}
              >
                <For each={models()}>
                  {(model) => (
                    <div
                      class={`flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0 ${
                        selected() === model.providerId ? "bg-bg-layer-01" : ""
                      }`}
                    >
                      <span class="min-w-0 flex-1 truncate font-mono text-text-base" title={model.name || model.id}>
                        {model.name || model.id}
                      </span>
                      <span class="shrink-0 text-caption text-text-faint">{model.providerId}</span>
                      <span class="shrink-0 font-mono text-caption tabular-nums text-text-faint">
                        {formatWindow(model.contextWindow)}
                      </span>
                      <Show when={model.default}>
                        <span class="shrink-0 rounded-xs border border-border-base px-1 text-caption text-state-fg-success">
                          default
                        </span>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
