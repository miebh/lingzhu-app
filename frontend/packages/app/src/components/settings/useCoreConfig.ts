import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { AppSettings, SettingsInput } from "@lingzhu/ui/types";
import type { CoreDraft, SaveState } from "./types";
import { splitList } from "@lingzhu/ui/text";

interface Options {
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
}

export interface CoreConfig {
  draft: Accessor<CoreDraft | undefined>;
  configPath: Accessor<string>;
  settingsError: Accessor<string | undefined>;
  saveState: Accessor<SaveState>;
  saveError: Accessor<string | undefined>;
  reload: () => void;
  dismissSaveError: () => void;
  update: (patch: Partial<CoreDraft>) => void;
  commit: () => void;
  updateAndCommit: (patch: Partial<CoreDraft>) => void;
}

/**
 * Shared core-config draft and save queue. The settings page and the manage
 * models dialog each mount their own copy; writes are queued so rapid edits
 * reach the host in order.
 */
export function useCoreConfig(options: Options): CoreConfig {
  const [draft, setDraft] = createSignal<CoreDraft>();
  const [configPath, setConfigPath] = createSignal("");
  const [settingsError, setSettingsError] = createSignal<string>();
  const [saveState, setSaveState] = createSignal<SaveState>("idle");
  const [saveError, setSaveError] = createSignal<string>();
  const [reloadKey, setReloadKey] = createSignal(0);

  const draftRef: { current: CoreDraft | undefined } = { current: undefined };
  const savedKey = { current: "" };
  const lastKey = { current: "" };
  const queue = { current: Promise.resolve() as Promise<void> };
  const onSavedRef = { current: options.onSaved };
  onSavedRef.current = options.onSaved;

  createEffect(() => {
    reloadKey();
    let alive = true;
    setDraft(undefined);
    setSettingsError(undefined);
    api
      .settings()
      .then((settings) => {
        if (!alive) return;
        const next = fromSettings(settings);
        draftRef.current = next;
        const key = serialize(next);
        savedKey.current = key;
        lastKey.current = key;
        setDraft(next);
        setConfigPath(settings.configPath);
      })
      .catch((cause) => {
        if (alive) setSettingsError(messageOf(cause));
      });

    onCleanup(() => {
      alive = false;
    });
  });

  // A successful save is acknowledged briefly instead of by a toast per field.
  createEffect(() => {
    if (saveState() !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 2000);
    onCleanup(() => window.clearTimeout(timer));
  });

  const queueSave = (next: CoreDraft) => {
    const result = toPayload(next);
    if (result.error) {
      lastKey.current = savedKey.current;
      setSaveState("error");
      setSaveError(result.error);
      return;
    }
    const key = JSON.stringify(result.payload);
    if (key === lastKey.current) return;
    lastKey.current = key;
    setSaveState("saving");
    setSaveError(undefined);

    queue.current = queue.current.then(async () => {
      try {
        const reused = await api.saveSettings(result.payload as SettingsInput);
        savedKey.current = key;
        setSaveState("saved");
        onSavedRef.current(reused);

        // Never keep a submitted key, a pending clear flag, or a stale ready
        // flag after the save succeeds.
        const current = draftRef.current;
        if (current) {
          let changed = false;
          const providers = current.providers.map((provider) => {
            const sent = next.providers.find((item) => item.id === provider.id);
            if (!sent) return provider;
            const hasKey = sent.apiKey.trim() !== "" || (provider.apiKeySet && !sent.clearKey);
            const ready =
              sent.baseUrl.trim() !== "" &&
              (hasKey || sent.apiKeyEnv.trim() !== "" || (sent.clearKey === false && provider.ready));
            const updated = {
              ...provider,
              apiKey: "",
              apiKeySet: hasKey,
              clearKey: false,
              ready,
            };
            if (
              updated.apiKey !== provider.apiKey ||
              updated.apiKeySet !== provider.apiKeySet ||
              updated.clearKey !== provider.clearKey ||
              updated.ready !== provider.ready
            ) {
              changed = true;
            }
            return updated;
          });
          if (changed) {
            const updated = { ...current, providers };
            draftRef.current = updated;
            setDraft(updated);
            const stable = serialize(updated);
            savedKey.current = stable;
            lastKey.current = stable;
          }
        }
      } catch (cause) {
        lastKey.current = savedKey.current;
        setSaveState("error");
        setSaveError(messageOf(cause));
      }
    });
  };

  const updateDraft = (patch: Partial<CoreDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    const current = draftRef.current;
    if (current) queueSave(current);
  };

  const updateAndCommit = (patch: Partial<CoreDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    draftRef.current = next;
    setDraft(next);
    queueSave(next);
  };

  const reload = () => update(setReloadKey, reloadKey, (value) => value + 1);
  const dismissSaveError = () => setSaveError(undefined);

  return {
    draft,
    configPath,
    settingsError,
    saveState,
    saveError,
    reload,
    dismissSaveError,
    update: updateDraft,
    commit,
    updateAndCommit,
  };
}

function fromSettings(settings: AppSettings): CoreDraft {
  return {
    provider: settings.provider,
    model: settings.model,
    providers: settings.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: "",
      apiKeyEnv: provider.apiKeyEnv,
      apiKeySet: provider.apiKeySet,
      clearKey: false,
      ready: provider.ready,
      dynamicModels: provider.dynamicModels,
      blacklist: (provider.blacklist ?? []).join(", "),
      whitelist: (provider.whitelist ?? []).join(", "),
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: String(model.contextWindow),
        maxOutputTokens: model.maxOutputTokens ? String(model.maxOutputTokens) : "",
        toolCall: model.toolCall === false ? false : undefined,
        reasoning: model.reasoning ? true : undefined,
        attachment: model.attachment ? true : undefined,
        inputCost: model.cost?.input ? String(model.cost.input) : "",
        outputCost: model.cost?.output ? String(model.cost.output) : "",
        cacheReadCost: model.cost?.cache_read ? String(model.cost.cache_read) : "",
        cacheWriteCost: model.cost?.cache_write ? String(model.cost.cache_write) : "",
        modalities: model.modalities ? JSON.stringify(model.modalities, null, 2) : "",
        options: model.options ? JSON.stringify(model.options, null, 2) : "",
        variants: model.variants ? JSON.stringify(model.variants, null, 2) : "",
      })),
    })),
    maxSteps: String(settings.maxSteps),
    contextWindow: String(settings.contextWindow),
    compactKeep: String(settings.compactKeep),
    systemPrompt: settings.systemPrompt,
    shell: (settings.shell ?? []).join(" "),
    permission: settings.permission.map((rule) => ({ ...rule })),
  };
}

function toPayload(draft: CoreDraft): { payload?: SettingsInput; error?: string } {
  const model = draft.model.trim();
  const maxSteps = Number(draft.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 0) return { error: "Max steps cannot be negative (0 means no limit)." };
  const contextWindow = Number(draft.contextWindow);
  if (!Number.isInteger(contextWindow) || contextWindow < 0) {
    return { error: "Context window cannot be negative." };
  }
  const compactKeep = Number(draft.compactKeep);
  if (!Number.isInteger(compactKeep) || compactKeep < 1) {
    return { error: "Compact keep must be at least 1." };
  }
  const permission = draft.permission.map((rule) => ({
    action: rule.action.trim(),
    resource: rule.resource.trim(),
    effect: rule.effect,
  }));
  for (const rule of permission) {
    if (!rule.action || !rule.resource) {
      return { error: "Every permission rule needs an action and a resource." };
    }
  }
  if (draft.providers.length === 0) {
    if (draft.provider.trim() || model) return { error: "No providers configured." };
    return {
      payload: {
        provider: "",
        model: "",
        providers: [],
        maxSteps,
        contextWindow,
        compactKeep,
        systemPrompt: draft.systemPrompt,
        shell: draft.shell.trim() === "" ? [] : draft.shell.trim().split(/\s+/),
        permission,
      },
    };
  }
  if (!model) return { error: "Model is required." };
  try {
    const seenProvider = new Set<string>();
    const providers = draft.providers.map((provider) => {
      const id = provider.id.trim();
      if (!id) throw new Error("Every provider needs an id.");
      if (seenProvider.has(id)) throw new Error(`Provider ${id} is duplicated.`);
      seenProvider.add(id);
      const baseUrl = provider.baseUrl.trim();
      if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
        throw new Error(`Provider ${id} needs an absolute http(s) base URL.`);
      }
      const seenModel = new Set<string>();
      const models = provider.models.map((entry) => {
        const modelID = entry.id.trim();
        if (!modelID) throw new Error(`Provider ${id} has a model without an id.`);
        if (seenModel.has(modelID)) throw new Error(`Provider ${id} has duplicate model ${modelID}.`);
        seenModel.add(modelID);
        const window = Number(entry.contextWindow);
        if (!Number.isInteger(window) || window < 0) {
          throw new Error(`Model ${modelID} needs a non-negative context window.`);
        }
        return {
          id: modelID,
          name: entry.name.trim() || modelID,
          contextWindow: window,
          maxOutputTokens: optionalNumber(entry.maxOutputTokens, `Model ${modelID} max output tokens`, true),
          toolCall: entry.toolCall === false ? false : undefined,
          reasoning: entry.reasoning === true ? true : undefined,
          attachment: entry.attachment === true ? true : undefined,
          cost: costFromDraft(entry, modelID),
          modalities: parseModalitiesText(entry.modalities, `Model ${modelID} modalities`),
          options: parseObjectText(entry.options, `Model ${modelID} options`),
          variants: parseVariantsText(entry.variants, `Model ${modelID} variants`),
        };
      });
      return {
        id,
        name: provider.name.trim() || id,
        baseUrl,
        apiKey: provider.apiKey.trim(),
        apiKeyEnv: provider.apiKeyEnv.trim(),
        clearKey: provider.clearKey,
        blacklist: splitList(provider.blacklist),
        whitelist: splitList(provider.whitelist),
        models,
      };
    });

    const selected = providers.find((provider) => provider.id === draft.provider);
    if (!selected) return { error: "Choose a default provider." };
    if (!selected.models.some((entry) => entry.id === model)) {
      return { error: `Provider ${selected.name} has no model ${model}.` };
    }

    return {
      payload: {
        provider: selected.id,
        model,
        providers,
        maxSteps,
        contextWindow,
        compactKeep,
        systemPrompt: draft.systemPrompt,
        shell: draft.shell.trim() === "" ? [] : draft.shell.trim().split(/\s+/),
        permission,
      },
    };
  } catch (error) {
    return { error: messageOf(error) };
  }
}

function serialize(draft: CoreDraft): string {
  const result = toPayload(draft);
  return result.payload ? JSON.stringify(result.payload) : "";
}

function optionalNumber(text: string | undefined, label: string, integer = false): number | undefined {
  const raw = (text ?? "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be a non-negative ${integer ? "integer" : "number"}.`);
  }
  return value;
}

function costFromDraft(
  entry: { inputCost?: string; outputCost?: string; cacheReadCost?: string; cacheWriteCost?: string },
  modelID: string,
) {
  const input = optionalNumber(entry.inputCost, `Model ${modelID} input cost`);
  const output = optionalNumber(entry.outputCost, `Model ${modelID} output cost`);
  const cacheRead = optionalNumber(entry.cacheReadCost, `Model ${modelID} cache read cost`);
  const cacheWrite = optionalNumber(entry.cacheWriteCost, `Model ${modelID} cache write cost`);
  if (input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) {
    return undefined;
  }
  return { input, output, cache_read: cacheRead, cache_write: cacheWrite };
}

function parseModalitiesText(text: string | undefined, label: string) {
  const value = parseObjectText(text, label);
  if (!value) return undefined;
  const input = Array.isArray(value.input) ? value.input.filter((item): item is string => typeof item === "string") : [];
  const output = Array.isArray(value.output)
    ? value.output.filter((item): item is string => typeof item === "string")
    : [];
  if (input.length === 0 && output.length === 0) return undefined;
  return { input, output };
}

function parseObjectText(text: string | undefined, label: string): Record<string, unknown> | undefined {
  const raw = (text ?? "").trim();
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function parseVariantsText(
  text: string | undefined,
  label: string,
): Record<string, Record<string, unknown>> | undefined {
  const value = parseObjectText(text, label);
  if (!value) return undefined;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, variant] of Object.entries(value)) {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
      throw new Error(`Variant ${name} in ${label} must be a JSON object.`);
    }
    out[name] = variant as Record<string, unknown>;
  }
  return out;
}
