import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { ChevronRight, Plus, Search, Unplug, X } from "@lingzhu/ui/icons";
import { ConfirmDialog } from "@/components/dialogs/Dialogs";
import { Badge } from "@lingzhu/ui/badge";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import type { MagpieGateway, ProviderPreset } from "@lingzhu/ui/types";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLogo } from "./ProviderLogo";
import { modelDraftFromPreset, type ProviderDraft } from "./types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  /** Configured providers, listed first so they can be disconnected here. */
  existing: ProviderDraft[];
  busy?: boolean;
  canDisconnect?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: ProviderDraft) => void;
  onDisconnect?: (providerID: string) => void;
}

/**
 * Provider picker that mirrors the reference connect flow: choose a preset (or
 * a custom endpoint), then enter the key in the provider dialog.
 */
export function ConnectProviderDialog(props: Props) {
  const tr = useT();
  const [presets, setPresets] = createSignal<ProviderPreset[]>();
  const [magpie, setMagpie] = createSignal<MagpieGateway>();
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal<ProviderDraft>();
  const [disconnecting, setDisconnecting] = createSignal<ProviderDraft>();

  createEffect(() => {
    if (!props.open) return;
    let alive = true;
    setPresets(undefined);
    setMagpie(undefined);
    setQuery("");
    setSelected(undefined);
    setDisconnecting(undefined);
    Promise.all([api.presets(), api.magpie().catch(() => undefined)])
      .then(([value, gateway]) => {
        if (!alive) return;
        setMagpie(gateway);
        // A running gateway knows its real port; the preset's stored one may
        // predate a settings change.
        setPresets(
          gateway?.available
            ? value.map((preset) => (preset.id === "magpie" ? { ...preset, baseUrl: gateway.url } : preset))
            : value,
        );
      })
      .catch(() => {
        if (alive) setPresets([]);
      });
    onCleanup(() => {
      alive = false;
    });
  });

  const existingIDs = createMemo(() => props.existing.map((provider) => provider.id));
  const existingSet = createMemo(() => new Set(existingIDs()));

  const connected = createMemo(() => {
    const term = query().trim().toLowerCase();
    return props.existing.filter(
      (provider) =>
        !term ||
        provider.name.toLowerCase().includes(term) ||
        provider.id.toLowerCase().includes(term) ||
        provider.baseUrl.toLowerCase().includes(term) ||
        provider.apiKeyEnv.toLowerCase().includes(term),
    );
  });

  const available = createMemo(() => {
    const term = query().trim().toLowerCase();
    return (presets() ?? []).filter(
      (preset) =>
        !existingSet().has(preset.id) &&
        (!term ||
          preset.name.toLowerCase().includes(term) ||
          preset.id.toLowerCase().includes(term) ||
          preset.baseUrl.toLowerCase().includes(term) ||
          preset.apiKeyEnv.toLowerCase().includes(term)),
    );
  });

  const close = () => props.onOpenChange(false);

  const chooseCustom = () =>
    setSelected({
      id: "",
      name: "",
      baseUrl: "",
      apiKey: "",
      apiKeyEnv: "",
      apiKeySet: false,
      clearKey: false,
      ready: false,
      models: [],
    });

  const choosePreset = (preset: ProviderPreset) =>
    setSelected({
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: preset.defaultApiKey ?? "",
      apiKeyEnv: preset.apiKeyEnv,
      apiKeySet: false,
      clearKey: false,
      ready: false,
      dynamicModels: preset.dynamicModels,
      models: (preset.models ?? []).map(modelDraftFromPreset),
    });

  const save = (provider: ProviderDraft) => {
    setSelected(undefined);
    props.onSave(provider);
    close();
  };

  return (
    <>
      <Dialog open={props.open && selected() === undefined} onOpenChange={props.onOpenChange}>
        <DialogContent
          size="manage"
          height="connect"
          hideClose
          class="flex flex-col gap-0 overflow-hidden rounded-[12px] border-0 bg-bg-base p-0 shadow-elevation-overlay"
        >
          <div class="flex shrink-0 items-start gap-3 px-3.5 pt-2.5 pb-1.5">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogTitle class="text-body leading-5 font-[440] tracking-[-0.04px]">Connect provider</DialogTitle>
              <DialogDescription class="mt-0 text-meta leading-5">
                {tr("dialogConnectProviderHint")}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={tr("connectProviderClose")}
              onClick={close}
              class="text-text-faint hover:text-text-base"
            >
              <X class="size-4" />
            </Button>
          </div>

          <div class="shrink-0 border-b-[0.5px] border-border-weak px-3 pt-px pb-2">
            <div class="relative">
              <Search class="pointer-events-none absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-text-muted" />
              <Input
                autofocus
                size="sm"
                value={query()}
                aria-label={tr("connectProviderSearchProviders")}
                placeholder={tr("connectProviderSearchProviders")}
                onInput={(event) => setQuery(event.currentTarget.value)}
                class="border-0 bg-transparent pl-6"
              />
            </div>
          </div>

          <div
            role="group"
            aria-label={tr("connectProviderProviders")}
            class="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2"
          >
            <button
              type="button"
              onClick={chooseCustom}
              title={tr("connectProviderAnyOpenAICompatibleBaseURL")}
              class="interactive flex h-9 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left"
            >
              <span class="grid size-4 shrink-0 place-items-center text-text-muted">
                <Plus class="size-4" />
              </span>
              <span class="min-w-0 flex-1 truncate text-body text-text-base">Custom endpoint</span>
              <span class="hidden shrink-0 text-caption text-text-faint sm:block">Any base URL</span>
              <ChevronRight class="size-3.5 shrink-0 text-text-faint" />
            </button>

            <Show when={connected().length > 0}>
              <div class="mt-2 flex h-control-sm items-center px-2 text-meta text-text-faint">Connected</div>
              <For each={connected()}>
                {(provider) => (
                  <div class="flex h-9 w-full min-w-0 items-center gap-3 rounded-md px-2">
                    <ProviderLogo id={provider.id} name={provider.name} class="size-4 shrink-0 text-text-muted" />
                    <span class="min-w-0 flex-1 truncate text-body text-text-base">
                      {provider.name || provider.id}
                    </span>
                    <span
                      class="hidden shrink-0 font-mono text-caption text-text-faint sm:block"
                      title={provider.baseUrl}
                    >
                      {provider.baseUrl}
                    </span>
                    <Show
                      when={props.onDisconnect && props.canDisconnect}
                      fallback={
                        <Badge variant="secondary" class="shrink-0">
                          Connected
                        </Badge>
                      }
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={props.busy}
                        onClick={() => setDisconnecting(provider)}
                        class="shrink-0 text-text-faint hover:text-state-fg-danger"
                      >
                        <Unplug />
                        Disconnect
                      </Button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>

            <div class="mt-2 flex h-control-sm items-center px-2 text-meta text-text-faint">Providers</div>

            <Show when={presets() === undefined}>
              <div class="grid min-h-32 place-items-center text-meta text-text-faint">Loading providers…</div>
            </Show>
            <Show when={presets() !== undefined && available().length === 0 && connected().length === 0}>
              <div class="grid min-h-32 place-items-center text-meta text-text-faint">
                {query().trim() ? "No matching providers" : "No presets available"}
              </div>
            </Show>
            <For each={available()}>
              {(preset) => (
                <button
                  type="button"
                  title={preset.baseUrl}
                  onClick={() => choosePreset(preset)}
                  class="interactive flex h-9 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left"
                >
                  <ProviderLogo id={preset.id} name={preset.name} class="size-4 shrink-0 text-text-muted" />
                  <span class="min-w-0 flex-1 truncate text-body text-text-base">{preset.name}</span>
                  <span class="hidden shrink-0 text-caption text-text-faint sm:block">
                    {preset.dynamicModels
                      ? magpie()?.available
                        ? `Gateway ${magpie()!.version || "running"}`
                        : "Discover models"
                      : `${preset.models?.length ?? 0} models`}
                  </span>
                  <ChevronRight class="size-3.5 shrink-0 text-text-faint" />
                </button>
              )}
            </For>
          </div>
        </DialogContent>
      </Dialog>

      <Show when={selected()}>
        {(current) => (
          <ProviderDialog
            open
            initial={current()}
            existingIDs={existingIDs()}
            busy={props.busy}
            advanced={current().id === ""}
            presentation="connect"
            onOpenChange={(next) => {
              if (!next) setSelected(undefined);
            }}
            onSave={save}
          />
        )}
      </Show>

      <ConfirmDialog
        open={disconnecting() !== undefined}
        title={`Disconnect ${disconnecting()?.name || disconnecting()?.id || "provider"}?`}
        description="This removes the provider and its saved key. The session keeps its current model until another provider is selected."
        confirmLabel="Disconnect"
        destructive
        onOpenChange={(next) => {
          if (!next) setDisconnecting(undefined);
        }}
        onConfirm={() => {
          const target = disconnecting();
          if (target) props.onDisconnect?.(target.id);
          setDisconnecting(undefined);
        }}
      />
    </>
  );
}
