import { useEffect, useState, type ReactNode } from "react";
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
export function ProviderDialog({
  open,
  initial,
  editingID,
  existingIDs,
  busy = false,
  advanced = false,
  autoRefresh = false,
  presentation = "default",
  onOpenChange,
  onSave,
}: Props) {
  const tr = useT();
  const [draft, setDraft] = useState<ProviderDraft>();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [error, setError] = useState<string>();
  const [fetchingModels, setFetchingModels] = useState(false);

  /** Replaces the model list with the endpoint's current catalog. */
  const loadModels = async (source: ProviderDraft) => {
    setFetchingModels(true);
    setError(undefined);
    try {
      const models = await api.providerModels(source.id, source.baseUrl, source.apiKey, source.apiKeyEnv);
      if (models.length === 0) {
        setError("The endpoint returned no models.");
        return;
      }
      setDraft((current) => {
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
              maxOutputTokens: model.maxOutputTokens ? String(model.maxOutputTokens) : existing?.maxOutputTokens ?? "",
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

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? clone(initial) : undefined);
    setAdvancedOpen(advanced || !initial?.id);
    setNewModel("");
    setError(undefined);
    setFetchingModels(false);
    if (initial && (autoRefresh || (initial.dynamicModels && initial.models.length === 0))) {
      void loadModels(initial);
    }
  }, [open, initial, advanced, autoRefresh]);

  if (!open || !draft) return null;

  const editing = editingID !== undefined;
  const update = (patch: Partial<ProviderDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const updateModel = (index: number, patch: Partial<ProviderDraft["models"][number]>) =>
    update({
      models: draft.models.map((model, at) => (at === index ? { ...model, ...patch } : model)),
    });

  const removeModel = (index: number) => update({ models: draft.models.filter((_, at) => at !== index) });

  const addModel = () => {
    const id = newModel.trim();
    if (!id) {
      setError("Model id is required.");
      return;
    }
    if (draft.models.some((model) => model.id === id)) {
      setError(`Model ${id} already exists.`);
      return;
    }
    setError(undefined);
    setNewModel("");
    update({ models: [...draft.models, { id, name: id, contextWindow: "128000", options: "", variants: "" }] });
  };

  const submit = () => {
    const id = draft.id.trim();
    if (!id) {
      setError("Provider id is required.");
      setAdvancedOpen(true);
      return;
    }
    if (id !== editingID && existingIDs.includes(id)) {
      setError(`Provider ${id} already exists.`);
      return;
    }
    const baseUrl = draft.baseUrl.trim();
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
      setError("Base URL must be an absolute http(s) URL.");
      setAdvancedOpen(true);
      return;
    }
    const seen = new Set<string>();
    for (const model of draft.models) {
      const modelID = model.id.trim();
      if (!modelID) {
        setError("Every model needs an id.");
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
    onSave({
      ...draft,
      id,
      name: draft.name.trim() || id,
      baseUrl,
      apiKey: draft.apiKey.trim(),
      apiKeyEnv: draft.apiKeyEnv.trim(),
      models: draft.models.map((model) => ({
        ...model,
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        contextWindow: String(Number(model.contextWindow)),
      })),
    });
  };

  const connect = presentation === "connect";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={connect ? "manage" : "default"}
        hideClose={!connect}
        className={connect ? "rounded-[12px] border-0 bg-bg-base p-0 shadow-elevation-overlay" : "rounded-lg border-0 p-0"}
      >
        <div className={`flex items-start gap-3 ${connect ? "px-5 py-4" : "items-center px-6 pt-6 pb-4"}`}>
          <span className="grid size-control-md shrink-0 place-items-center rounded-lg bg-bg-layer-01 text-text-muted">
            <ProviderLogo id={draft.id} name={draft.name} className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <DialogTitle>{editing ? `Edit ${draft.name || draft.id}` : `Connect ${draft.name || "provider"}`}</DialogTitle>
            {!connect && (
              <span className="truncate font-mono text-caption text-text-faint" title={draft.baseUrl}>
                {draft.baseUrl || "Custom endpoint"}
              </span>
            )}
          </div>
        </div>
        <DialogDescription className={connect ? "mt-0 px-5 text-body leading-5" : "mt-0 px-6"}>
          {draft.apiKeySet
            ? "A key is stored. Leave this blank to keep it."
            : "The key is written to the shared config and never returned to the client."}
        </DialogDescription>

        <div className={connect ? "mt-0 flex flex-col gap-5 px-5 pb-2" : "mt-0 flex flex-col gap-6 px-4 pt-4 pb-2"}>
          <label className="flex flex-col gap-2">
            <span className="text-body font-[530] leading-4 text-text-base">API key</span>
            <Input
              type="password"
              autoComplete="off"
              autoFocus
              value={draft.apiKey}
              aria-label={tr("providerProviderAPIKey")}
              placeholder={draft.apiKeySet ? "Stored in config" : "sk-…"}
              onChange={(event) => update({ apiKey: event.target.value })}
              className="select-text"
            />
            {draft.clearKey && <span className="text-caption text-state-fg-warning">Key will be removed on save.</span>}
            {draft.id === "magpie" && (
              <span className="text-caption text-text-faint">
                The local gateway accepts any key; magpie-lingzhu attributes usage to Lingzhu.
              </span>
            )}
          </label>

          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
            className="interactive flex h-control-xs items-center gap-1 self-start rounded-md px-1 text-meta text-text-muted hover:text-text-base"
          >
            <ChevronDown className={`size-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            Advanced
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-4 border-t border-border-base pt-4">
              <div className="flex flex-col gap-3">
                <Field label="Provider id">
                  <Input
                    size="sm"
                    value={draft.id}
                    aria-label={tr("providerProviderId")}
                    disabled={editing}
                    onChange={(event) => update({ id: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Name">
                  <Input
                    size="sm"
                    value={draft.name}
                    aria-label={tr("providerProviderName")}
                    onChange={(event) => update({ name: event.target.value })}
                    className="select-text"
                  />
                </Field>
                <Field label="Base URL">
                  <Input
                    size="sm"
                    value={draft.baseUrl}
                    aria-label={tr("providerProviderBaseURL")}
                    placeholder="https://api.openai.com/v1"
                    onChange={(event) => update({ baseUrl: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Key environment variable">
                  <Input
                    size="sm"
                    value={draft.apiKeyEnv}
                    aria-label={tr("providerProviderKeyEnvironmentVariable")}
                    placeholder="OPENAI_API_KEY"
                    onChange={(event) => update({ apiKeyEnv: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Hidden models (blacklist)">
                  <Input
                    size="sm"
                    value={draft.blacklist ?? ""}
                    aria-label={tr("providerProviderModelBlacklist")}
                    placeholder="model-a, model-b"
                    onChange={(event) => update({ blacklist: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
                <Field label="Only these models (whitelist)">
                  <Input
                    size="sm"
                    value={draft.whitelist ?? ""}
                    aria-label={tr("providerProviderModelWhitelist")}
                    placeholder="model-a, model-b"
                    onChange={(event) => update({ whitelist: event.target.value })}
                    className="select-text font-mono"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-meta text-text-muted">Models</span>
                  <span className="text-caption text-text-faint">{draft.models.length}</span>
                  <span className="flex-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void loadModels(draft)}
                    disabled={fetchingModels || !draft.baseUrl.trim()}
                    className="text-text-faint hover:text-text-base"
                  >
                    <RefreshCw className={fetchingModels ? "animate-spin" : undefined} />
                    {fetchingModels ? "Fetching" : "Refresh"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => update({ apiKey: "", apiKeySet: false, clearKey: true })}
                    disabled={!draft.apiKeySet && !draft.apiKey}
                    className="text-text-faint hover:text-state-fg-danger"
                  >
                    {tr("dialogClearKey")}
                  </Button>
                </div>
                {draft.models.map((model, index) => (
                  <div key={index} className="flex flex-col gap-1.5 rounded-md border border-border-base p-2">
                    <div className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={model.id}
                        aria-label={`Model ${index + 1} id`}
                        placeholder="gpt-4.1"
                        onChange={(event) => updateModel(index, { id: event.target.value })}
                        className="min-w-0 flex-1 select-text font-mono"
                      />
                      <Input
                        size="sm"
                        inputMode="numeric"
                        value={model.contextWindow}
                        aria-label={`Model ${index + 1} context window`}
                        onChange={(event) => updateModel(index, { contextWindow: event.target.value })}
                        className="w-20 shrink-0 select-text text-right"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove model ${index + 1}`}
                        onClick={() => removeModel(index)}
                        className="shrink-0 text-text-faint hover:text-text-base"
                      >
                        <X />
                      </Button>
                    </div>
                    <Input
                      size="sm"
                      value={model.name}
                      aria-label={`Model ${index + 1} name`}
                      placeholder={model.id || "Display name"}
                      onChange={(event) => updateModel(index, { name: event.target.value })}
                      className="select-text"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Max output tokens">
                        <Input
                          size="sm"
                          inputMode="numeric"
                          value={model.maxOutputTokens ?? ""}
                          aria-label={`Model ${index + 1} max output tokens`}
                          placeholder="8192"
                          onChange={(event) => updateModel(index, { maxOutputTokens: event.target.value })}
                          className="select-text text-right"
                        />
                      </Field>
                      <Field label="Input $/M tokens">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          value={model.inputCost ?? ""}
                          aria-label={`Model ${index + 1} input cost`}
                          placeholder="0"
                          onChange={(event) => updateModel(index, { inputCost: event.target.value })}
                          className="select-text text-right"
                        />
                      </Field>
                      <Field label="Output $/M tokens">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          value={model.outputCost ?? ""}
                          aria-label={`Model ${index + 1} output cost`}
                          placeholder="0"
                          onChange={(event) => updateModel(index, { outputCost: event.target.value })}
                          className="select-text text-right"
                        />
                      </Field>
                      <Field label="Cache read $/M">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          value={model.cacheReadCost ?? ""}
                          aria-label={`Model ${index + 1} cache read cost`}
                          placeholder="0"
                          onChange={(event) => updateModel(index, { cacheReadCost: event.target.value })}
                          className="select-text text-right"
                        />
                      </Field>
                      <Field label="Cache write $/M">
                        <Input
                          size="sm"
                          inputMode="decimal"
                          value={model.cacheWriteCost ?? ""}
                          aria-label={`Model ${index + 1} cache write cost`}
                          placeholder="0"
                          onChange={(event) => updateModel(index, { cacheWriteCost: event.target.value })}
                          className="select-text text-right"
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-caption text-text-muted">
                        Tools
                        <Switch
                          aria-label={`Model ${index + 1} supports tools`}
                          checked={model.toolCall !== false}
                          onCheckedChange={(checked) =>
                            updateModel(index, { toolCall: checked ? undefined : false })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-caption text-text-muted">
                        Reasoning
                        <Switch
                          aria-label={`Model ${index + 1} returns reasoning`}
                          checked={model.reasoning === true}
                          onCheckedChange={(checked) =>
                            updateModel(index, { reasoning: checked ? true : undefined })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-caption text-text-muted">
                        Vision
                        <Switch
                          aria-label={`Model ${index + 1} takes images`}
                          checked={model.attachment === true}
                          onCheckedChange={(checked) =>
                            updateModel(index, { attachment: checked ? true : undefined })
                          }
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-caption text-text-faint">Modalities (JSON)</span>
                      <Textarea
                        value={model.modalities ?? ""}
                        aria-label={`Model ${index + 1} modalities`}
                        placeholder='{"input":["text","image"],"output":["text"]}'
                        onChange={(event) => updateModel(index, { modalities: event.target.value })}
                        className="min-h-16 font-mono text-caption select-text"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-caption text-text-faint">Request options (JSON)</span>
                      <Textarea
                        value={model.options ?? ""}
                        aria-label={`Model ${index + 1} options`}
                        placeholder='{"reasoningEffort":"high","textVerbosity":"low"}'
                        onChange={(event) => updateModel(index, { options: event.target.value })}
                        className="min-h-16 font-mono text-caption select-text"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-caption text-text-faint">Variants (JSON)</span>
                      <Textarea
                        value={model.variants ?? ""}
                        aria-label={`Model ${index + 1} variants`}
                        placeholder='{"high":{"reasoningEffort":"high"},"low":{"reasoningEffort":"low"}}'
                        onChange={(event) => updateModel(index, { variants: event.target.value })}
                        className="min-h-16 font-mono text-caption select-text"
                      />
                    </label>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    value={newModel}
                    aria-label={tr("providerNewModelId")}
                    placeholder={tr("providerNewModelId")}
                    onChange={(event) => setNewModel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addModel();
                      }
                    }}
                    className="min-w-0 flex-1 select-text font-mono"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addModel}>
                    <Plus />
                    {tr("dialogAddModel")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-caption text-state-fg-danger">
              {error}
            </p>
          )}
        </div>

        <div
          className={
            connect
              ? "flex items-center justify-start gap-2 px-5 pt-2 pb-4"
              : "flex items-center justify-end gap-2 p-6"
          }
        >
          {busy && <span className="mr-auto text-caption text-state-fg-warning">Stop running sessions before saving.</span>}
          {!connect && (
            <Button type="button" variant="outline" size="default" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button type="button" size={connect ? "sm" : "default"} onClick={submit} disabled={busy || fetchingModels}>
            {editing ? "Save" : "Connect"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-body font-[530] leading-4 text-text-base">{label}</span>
      {children}
    </label>
  );
}

function clone(provider: ProviderDraft): ProviderDraft {
  return {
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  };
}
