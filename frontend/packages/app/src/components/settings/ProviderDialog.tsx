import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { ChevronDown, Plus, RefreshCw, X } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Switch } from "@lingzhu/ui/switch";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { ProviderLogo } from "./ProviderLogo";
import type { ProviderDraft } from "./types";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  /** Existing provider to edit, or a prefilled draft for a new one. */
  initial?: ProviderDraft;
  /** Set when editing; the id stays fixed so saved sessions keep resolving. */
  editingID?: string;
  existingIDs: string[];
  busy?: boolean;
  /** Open the Advanced block immediately, for callers that edit the catalog. */
  advanced?: boolean;
  /** Fetch the model list as soon as the dialog opens. */
  autoRefresh?: boolean;
  /** Match the connect flow's wide, base-surface dialog. */
  presentation?: "default" | "connect";
  onOpenChange: (open: boolean) => void;
  onSave: (provider: ProviderDraft) => void;
}

/**
 * Provider connect dialog. The default surface is one key field, like the
 * reference's connect flow; endpoint and model details sit behind Advanced.
 */
export function ProviderDialog(props: Props) {
  const tr = useT();
  const [draft, setDraft] = createSignal<ProviderDraft>();
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [newModel, setNewModel] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [fetchingModels, setFetchingModels] = createSignal(false);

  /** Replaces the model list with the endpoint's current catalog. */
  const loadModels = async (source: ProviderDraft) => {
    setFetchingModels(true);
    setError(undefined);
    try {
      const models = await api.providerModels(source.id, source.baseUrl, source.apiKey, source.apiKeyEnv);
      if (models.length === 0) {
        setError(tr("providerNoModels"));
        return;
      }
      update(setDraft, draft, (current) => {
        if (!current) return current;
        const previous = new Map(current.models.map((model) => [model.id, model]));
        return {
          ...current,
          models: models.map((model) => {
            const existing = previous.get(model.id);
            return {
              id: model.id,
              name: model.name || existing?.name || model.id,
              contextWindow: String(model.contextWindow || existing?.contextWindow || 0),
              maxOutputTokens: model.maxOutputTokens
                ? String(model.maxOutputTokens)
                : existing?.maxOutputTokens ?? "",
              toolCall: model.toolCall === false ? false : existing?.toolCall,
              reasoning: model.reasoning ? true : existing?.reasoning,
              attachment: model.attachment ? true : existing?.attachment,
              inputCost: model.cost?.input ? String(model.cost.input) : existing?.inputCost ?? "",
              outputCost: model.cost?.output ? String(model.cost.output) : existing?.outputCost ?? "",
              cacheReadCost: model.cost?.cache_read
                ? String(model.cost.cache_read)
                : existing?.cacheReadCost ?? "",
              cacheWriteCost: model.cost?.cache_write
                ? String(model.cost.cache_write)
                : existing?.cacheWriteCost ?? "",
              modalities: model.modalities
                ? JSON.stringify(model.modalities, null, 2)
                : existing?.modalities ?? "",
              options: existing?.options ?? "",
              variants: model.variants
                ? JSON.stringify(model.variants, null, 2)
                : existing?.variants ?? "",
            };
          }),
        };
      });
    } catch (fetchError) {
      setError(messageOf(fetchError));
    } finally {
      setFetchingModels(false);
    }
  };

  createEffect(() => {
    const open = props.open;
    const initial = props.initial;
    const advanced = props.advanced ?? false;
    const autoRefresh = props.autoRefresh ?? false;
    if (!open) return;
    setDraft(initial ? clone(initial) : undefined);
    setAdvancedOpen(advanced || !initial?.id);
    setNewModel("");
    setError(undefined);
    setFetchingModels(false);
    if (initial && (autoRefresh || (initial.dynamicModels && initial.models.length === 0))) {
      void loadModels(initial);
    }
  });

  const editing = () => props.editingID !== undefined;
  const patchDraft = (patch: Partial<ProviderDraft>) =>
    update(setDraft, draft, (current) => (current ? { ...current, ...patch } : current));

  const updateModel = (index: number, patch: Partial<ProviderDraft["models"][number]>) => {
    const current = draft();
    if (!current) return;
    patchDraft({
      models: current.models.map((model, at) => (at === index ? { ...model, ...patch } : model)),
    });
  };

  const removeModel = (index: number) => {
    const current = draft();
    if (!current) return;
    patchDraft({ models: current.models.filter((_, at) => at !== index) });
  };

  const addModel = () => {
    const current = draft();
    if (!current) return;
    const id = newModel().trim();
    if (!id) {
      setError(tr("providerModelIDRequired"));
      return;
    }
    if (current.models.some((model) => model.id === id)) {
      setError(`Model ${id} already exists.`);
      return;
    }
    setError(undefined);
    setNewModel("");
    patchDraft({ models: [...current.models, { id, name: id, contextWindow: "128000", options: "", variants: "" }] });
  };

  const submit = () => {
    const current = draft();
    if (!current) return;
    const id = current.id.trim();
    if (!id) {
      setError(tr("providerIDRequired"));
      setAdvancedOpen(true);
      return;
    }
    if (id !== props.editingID && props.existingIDs.includes(id)) {
      setError(`Provider ${id} already exists.`);
      return;
    }
    const baseUrl = current.baseUrl.trim();
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
      setError(tr("providerBaseURLInvalid"));
      setAdvancedOpen(true);
      return;
    }
    const seen = new Set<string>();
    for (const model of current.models) {
      const modelID = model.id.trim();
      if (!modelID) {
        setError(tr("providerEveryModelID"));
        setAdvancedOpen(true);
        return;
      }
      if (seen.has(modelID)) {
        setError(`Model ${modelID} is duplicated.`);
        setAdvancedOpen(true);
        return;
      }
      seen.add(modelID);
      if (!Number.isInteger(Number(model.contextWindow)) || Number(model.contextWindow) < 0) {
        setError(`Model ${modelID} needs a non-negative context window.`);
        setAdvancedOpen(true);
        return;
      }
    }
    props.onSave({
      ...current,
      id,
      name: current.name.trim() || id,
      baseUrl,
      apiKey: current.apiKey.trim(),
      apiKeyEnv: current.apiKeyEnv.trim(),
      models: current.models.map((model) => ({
        ...model,
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        contextWindow: String(Number(model.contextWindow)),
      })),
    });
  };

  const connect = () => (props.presentation ?? "default") === "connect";

  return (
    <Show when={props.open}>
      <Show when={draft()}>
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
          <DialogContent
            size={connect() ? "manage" : "default"}
            hideClose={!connect()}
            class={connect() ? "rounded-[12px] border-0 bg-bg-base p-0 shadow-elevation-overlay" : "rounded-lg border-0 p-0"}
          >
            <div class={`flex items-start gap-3 ${connect() ? "px-5 py-4" : "items-center px-6 pt-6 pb-4"}`}>
              <span class="grid size-control-md shrink-0 place-items-center rounded-lg bg-bg-layer-01 text-text-muted">
                <ProviderLogo id={draft()!.id} name={draft()!.name} class="size-5" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <DialogTitle>
                  {editing()
                    ? tr("providerEditTitle", { name: draft()!.name || draft()!.id })
                    : tr("providerConnectTitle", {
                        name: draft()!.name || tr("providerDefaultName"),
                      })}
                </DialogTitle>
                <Show when={!connect()}>
                  <span class="truncate font-mono text-caption text-text-faint" title={draft()!.baseUrl}>
                    {draft()!.baseUrl || tr("providerCustomEndpoint")}
                  </span>
                </Show>
              </div>
            </div>
            <DialogDescription class={connect() ? "mt-0 px-5 text-body leading-5" : "mt-0 px-6"}>
              {draft()!.apiKeySet ? tr("providerAPIKeyStored") : tr("providerAPIKeyWritten")}
            </DialogDescription>

            <div class={connect() ? "mt-0 flex flex-col gap-5 px-5 pb-2" : "mt-0 flex flex-col gap-6 px-4 pt-4 pb-2"}>
              <label class="flex flex-col gap-2">
                <span class="text-body font-[530] leading-4 text-text-base">{tr("providerProviderAPIKey")}</span>
                <Input
                  type="password"
                  autocomplete="off"
                  autofocus
                  value={draft()!.apiKey}
                  aria-label={tr("providerProviderAPIKey")}
                  placeholder={draft()!.apiKeySet ? tr("providerStoredInConfig") : "sk-…"}
                  onInput={(event) => patchDraft({ apiKey: event.currentTarget.value })}
                  class="select-text"
                />
                <Show when={draft()!.clearKey}>
                  <span class="text-caption text-state-fg-warning">{tr("providerAPIKeyWillBeRemoved")}</span>
                </Show>
                <Show when={draft()!.id === "magpie"}>
                  <span class="text-caption text-text-faint">
                    {tr("providerMagpieKeyHint")}
                  </span>
                </Show>
              </label>

              <button
                type="button"
                aria-expanded={advancedOpen()}
                onClick={() => update(setAdvancedOpen, advancedOpen, (value) => !value)}
                class="interactive flex h-control-xs items-center gap-1 self-start rounded-md px-1 text-meta text-text-muted hover:text-text-base"
              >
                <ChevronDown class={`size-3 transition-transform ${advancedOpen() ? "rotate-180" : ""}`} />
                {tr("advanced")}
              </button>

              <Show when={advancedOpen()}>
                <div class="flex flex-col gap-4 border-t border-border-base pt-4">
                  <div class="flex flex-col gap-3">
                    <Field label={tr("providerProviderId")}>
                      <Input
                        size="sm"
                        value={draft()!.id}
                        aria-label={tr("providerProviderId")}
                        disabled={editing()}
                        onInput={(event) => patchDraft({ id: event.currentTarget.value })}
                        class="select-text font-mono"
                      />
                    </Field>
                    <Field label={tr("providerProviderName")}>
                      <Input
                        size="sm"
                        value={draft()!.name}
                        aria-label={tr("providerProviderName")}
                        onInput={(event) => patchDraft({ name: event.currentTarget.value })}
                        class="select-text"
                      />
                    </Field>
                    <Field label={tr("providerProviderBaseURL")}>
                      <Input
                        size="sm"
                        value={draft()!.baseUrl}
                        aria-label={tr("providerProviderBaseURL")}
                        placeholder="https://api.openai.com/v1"
                        onInput={(event) => patchDraft({ baseUrl: event.currentTarget.value })}
                        class="select-text font-mono"
                      />
                    </Field>
                    <Field label={tr("providerProviderKeyEnvironmentVariable")}>
                      <Input
                        size="sm"
                        value={draft()!.apiKeyEnv}
                        aria-label={tr("providerProviderKeyEnvironmentVariable")}
                        placeholder="OPENAI_API_KEY"
                        onInput={(event) => patchDraft({ apiKeyEnv: event.currentTarget.value })}
                        class="select-text font-mono"
                      />
                    </Field>
                    <Field label={tr("providerProviderModelBlacklist")}>
                      <Input
                        size="sm"
                        value={draft()!.blacklist ?? ""}
                        aria-label={tr("providerProviderModelBlacklist")}
                        placeholder="model-a, model-b"
                        onInput={(event) => patchDraft({ blacklist: event.currentTarget.value })}
                        class="select-text font-mono"
                      />
                    </Field>
                    <Field label={tr("providerProviderModelWhitelist")}>
                      <Input
                        size="sm"
                        value={draft()!.whitelist ?? ""}
                        aria-label={tr("providerProviderModelWhitelist")}
                        placeholder="model-a, model-b"
                        onInput={(event) => patchDraft({ whitelist: event.currentTarget.value })}
                        class="select-text font-mono"
                      />
                    </Field>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <span class="text-meta text-text-muted">{tr("models")}</span>
                      <span class="text-caption text-text-faint">{draft()!.models.length}</span>
                      <span class="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void loadModels(draft()!)}
                        disabled={fetchingModels() || !draft()!.baseUrl.trim()}
                        class="text-text-faint hover:text-text-base"
                      >
                        <RefreshCw class={fetchingModels() ? "animate-spin" : undefined} />
                        {fetchingModels() ? tr("providerFetching") : tr("refresh")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => patchDraft({ apiKey: "", apiKeySet: false, clearKey: true })}
                        disabled={!draft()!.apiKeySet && !draft()!.apiKey}
                        class="text-text-faint hover:text-state-fg-danger"
                      >
                        {tr("dialogClearKey")}
                      </Button>
                    </div>
                    <For each={draft()!.models}>
                      {(model, index) => (
                        <div class="flex flex-col gap-1.5 rounded-md border border-border-base p-2">
                          <div class="flex items-center gap-2">
                            <Input
                              size="sm"
                              value={model.id}
                              aria-label={`Model ${index() + 1} id`}
                              placeholder="gpt-4.1"
                              onInput={(event) => updateModel(index(), { id: event.currentTarget.value })}
                              class="min-w-0 flex-1 select-text font-mono"
                            />
                            <Input
                              size="sm"
                              inputmode="numeric"
                              value={model.contextWindow}
                              aria-label={`Model ${index() + 1} context window`}
                              onInput={(event) => updateModel(index(), { contextWindow: event.currentTarget.value })}
                              class="w-20 shrink-0 select-text text-right"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Remove model ${index() + 1}`}
                              onClick={() => removeModel(index())}
                              class="shrink-0 text-text-faint hover:text-text-base"
                            >
                              <X />
                            </Button>
                          </div>
                          <Input
                            size="sm"
                            value={model.name}
                            aria-label={`Model ${index() + 1} name`}
                            placeholder={model.id || tr("providerDisplayName")}
                            onInput={(event) => updateModel(index(), { name: event.currentTarget.value })}
                            class="select-text"
                          />
                          <div class="grid grid-cols-2 gap-2">
                            <Field label={tr("providerMaxOutputTokens")}>
                              <Input
                                size="sm"
                                inputmode="numeric"
                                value={model.maxOutputTokens ?? ""}
                                aria-label={`Model ${index() + 1} max output tokens`}
                                placeholder="8192"
                                onInput={(event) =>
                                  updateModel(index(), { maxOutputTokens: event.currentTarget.value })
                                }
                                class="select-text text-right"
                              />
                            </Field>
                            <Field label={tr("providerInputCost")}>
                              <Input
                                size="sm"
                                inputmode="decimal"
                                value={model.inputCost ?? ""}
                                aria-label={`Model ${index() + 1} input cost`}
                                placeholder="0"
                                onInput={(event) => updateModel(index(), { inputCost: event.currentTarget.value })}
                                class="select-text text-right"
                              />
                            </Field>
                            <Field label={tr("providerOutputCost")}>
                              <Input
                                size="sm"
                                inputmode="decimal"
                                value={model.outputCost ?? ""}
                                aria-label={`Model ${index() + 1} output cost`}
                                placeholder="0"
                                onInput={(event) => updateModel(index(), { outputCost: event.currentTarget.value })}
                                class="select-text text-right"
                              />
                            </Field>
                            <Field label={tr("providerCacheReadCost")}>
                              <Input
                                size="sm"
                                inputmode="decimal"
                                value={model.cacheReadCost ?? ""}
                                aria-label={`Model ${index() + 1} cache read cost`}
                                placeholder="0"
                                onInput={(event) =>
                                  updateModel(index(), { cacheReadCost: event.currentTarget.value })
                                }
                                class="select-text text-right"
                              />
                            </Field>
                            <Field label={tr("providerCacheWriteCost")}>
                              <Input
                                size="sm"
                                inputmode="decimal"
                                value={model.cacheWriteCost ?? ""}
                                aria-label={`Model ${index() + 1} cache write cost`}
                                placeholder="0"
                                onInput={(event) =>
                                  updateModel(index(), { cacheWriteCost: event.currentTarget.value })
                                }
                                class="select-text text-right"
                              />
                            </Field>
                          </div>
                          <div class="flex flex-wrap items-center gap-4">
                            <label class="flex items-center gap-2 text-caption text-text-muted">
                              {tr("providerTools")}
                              <Switch
                                aria-label={`Model ${index() + 1} supports tools`}
                                checked={model.toolCall !== false}
                                onCheckedChange={(checked) =>
                                  updateModel(index(), { toolCall: checked ? undefined : false })
                                }
                              />
                            </label>
                            <label class="flex items-center gap-2 text-caption text-text-muted">
                              {tr("providerReasoning")}
                              <Switch
                                aria-label={`Model ${index() + 1} returns reasoning`}
                                checked={model.reasoning === true}
                                onCheckedChange={(checked) =>
                                  updateModel(index(), { reasoning: checked ? true : undefined })
                                }
                              />
                            </label>
                            <label class="flex items-center gap-2 text-caption text-text-muted">
                              {tr("providerVision")}
                              <Switch
                                aria-label={`Model ${index() + 1} takes images`}
                                checked={model.attachment === true}
                                onCheckedChange={(checked) =>
                                  updateModel(index(), { attachment: checked ? true : undefined })
                                }
                              />
                            </label>
                          </div>
                          <label class="flex flex-col gap-1">
                            <span class="text-caption text-text-faint">{tr("providerModalities")}</span>
                            <Textarea
                              value={model.modalities ?? ""}
                              aria-label={`Model ${index() + 1} modalities`}
                              placeholder='{"input":["text","image"],"output":["text"]}'
                              onInput={(event) => updateModel(index(), { modalities: event.currentTarget.value })}
                              class="min-h-16 font-mono text-caption select-text"
                            />
                          </label>
                          <label class="flex flex-col gap-1">
                            <span class="text-caption text-text-faint">{tr("providerRequestOptions")}</span>
                            <Textarea
                              value={model.options ?? ""}
                              aria-label={`Model ${index() + 1} options`}
                              placeholder='{"reasoningEffort":"high","textVerbosity":"low"}'
                              onInput={(event) => updateModel(index(), { options: event.currentTarget.value })}
                              class="min-h-16 font-mono text-caption select-text"
                            />
                          </label>
                          <label class="flex flex-col gap-1">
                            <span class="text-caption text-text-faint">{tr("providerVariants")}</span>
                            <Textarea
                              value={model.variants ?? ""}
                              aria-label={`Model ${index() + 1} variants`}
                              placeholder='{"high":{"reasoningEffort":"high"},"low":{"reasoningEffort":"low"}}'
                              onInput={(event) => updateModel(index(), { variants: event.currentTarget.value })}
                              class="min-h-16 font-mono text-caption select-text"
                            />
                          </label>
                        </div>
                      )}
                    </For>
                    <div class="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={newModel()}
                        aria-label={tr("providerNewModelId")}
                        placeholder={tr("providerNewModelId")}
                        onInput={(event) => setNewModel(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addModel();
                          }
                        }}
                        class="min-w-0 flex-1 select-text font-mono"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addModel}>
                        <Plus />
                        {tr("dialogAddModel")}
                      </Button>
                    </div>
                  </div>
                </div>
              </Show>

              <Show when={error()}>
                <p role="alert" class="text-caption text-state-fg-danger">
                  {error()}
                </p>
              </Show>
            </div>

            <div
              class={
                connect()
                  ? "flex items-center justify-start gap-2 px-5 pt-2 pb-4"
                  : "flex items-center justify-end gap-2 p-6"
              }
            >
              <Show when={props.busy}>
                <span class="mr-auto text-caption text-state-fg-warning">{tr("providerStopBeforeSave")}</span>
              </Show>
              <Show when={!connect()}>
                <Button type="button" variant="outline" size="default" onClick={() => props.onOpenChange(false)}>
                  {tr("cancel")}
                </Button>
              </Show>
              <Button
                type="button"
                size={connect() ? "sm" : "default"}
                onClick={submit}
                disabled={props.busy || fetchingModels()}
              >
                {editing() ? tr("save") : tr("connectAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Show>
    </Show>
  );
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="flex flex-col gap-2">
      <span class="text-body font-[530] leading-4 text-text-base">{props.label}</span>
      {props.children}
    </label>
  );
}

function clone(provider: ProviderDraft): ProviderDraft {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}
