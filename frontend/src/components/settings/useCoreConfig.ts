import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { AppSettings, SettingsInput } from "../../lib/types";
import type { CoreDraft, SaveState } from "./types";

interface Options {
  /** Receives the workspaces whose core was not restarted by this app. */
  onSaved: (reused: string[]) => void;
}

export interface CoreConfig {
  draft?: CoreDraft;
  configPath: string;
  settingsError?: string;
  saveState: SaveState;
  saveError?: string;
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
export function useCoreConfig({ onSaved }: Options): CoreConfig {
  const [draft, setDraft] = useState<CoreDraft>();
  const [configPath, setConfigPath] = useState("");
  const [settingsError, setSettingsError] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);

  const draftRef = useRef<CoreDraft | undefined>(undefined);
  const savedKey = useRef("");
  const lastKey = useRef("");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
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

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // A successful save is acknowledged briefly instead of by a toast per field.
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const queueSave = useCallback((next: CoreDraft) => {
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
  }, []);

  const update = useCallback((patch: Partial<CoreDraft>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    draftRef.current = next;
    setDraft(next);
  }, []);

  const commit = useCallback(() => {
    const current = draftRef.current;
    if (current) queueSave(current);
  }, [queueSave]);

  const updateAndCommit = useCallback(
    (patch: Partial<CoreDraft>) => {
      const current = draftRef.current;
      if (!current) return;
      const next = { ...current, ...patch };
      draftRef.current = next;
      setDraft(next);
      queueSave(next);
    },
    [queueSave],
  );

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const dismissSaveError = useCallback(() => setSaveError(undefined), []);

  return {
    draft,
    configPath,
    settingsError,
    saveState,
    saveError,
    reload,
    dismissSaveError,
    update,
    commit,
    updateAndCommit,
  };
}

export function fromSettings(settings: AppSettings): CoreDraft {
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
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: String(model.contextWindow),
        enabled: model.enabled !== false,
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

export function toPayload(draft: CoreDraft): { payload?: SettingsInput; error?: string } {
  const model = draft.model.trim();
  if (!model) return { error: "Model is required." };
  const maxSteps = Number(draft.maxSteps);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) return { error: "Max steps must be at least 1." };
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
  try {
    if (draft.providers.length === 0) return { error: "At least one provider is required." };

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
          enabled: entry.enabled !== false,
        };
      });
      return {
        id,
        name: provider.name.trim() || id,
        baseUrl,
        apiKey: provider.apiKey.trim(),
        apiKeyEnv: provider.apiKeyEnv.trim(),
        clearKey: provider.clearKey,
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
