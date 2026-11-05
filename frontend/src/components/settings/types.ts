import type { AppPreferences, ConfigRule, ModelCost, PresetModel } from "../../lib/types";

/** One page in the settings center, addressable from other parts of the app. */
export type SettingsSectionID =
  | "general"
  | "appearance"
  | "providers"
  | "models"
  | "permissions"
  | "advanced"
  | "about";

/** Editable strings for the shared core config; numbers stay text until commit. */
export interface CoreDraft {
  provider: string;
  model: string;
  providers: ProviderDraft[];
  maxSteps: string;
  contextWindow: string;
  compactKeep: string;
  systemPrompt: string;
  shell: string;
  permission: ConfigRule[];
}

export interface ProviderDraft {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  apiKeySet: boolean;
  clearKey: boolean;
  ready: boolean;
  /** Preset whose model list is fetched from the endpoint. */
  dynamicModels?: boolean;
  /** Comma- or newline-separated model ids. */
  blacklist?: string;
  whitelist?: string;
  models: ModelDraft[];
}

export interface ModelDraft {
  id: string;
  name: string;
  contextWindow: string;
  maxOutputTokens?: string;
  enabled: boolean;
  /** Tools are on unless the catalog says the model takes none. */
  toolCall?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  inputCost?: string;
  outputCost?: string;
  cacheReadCost?: string;
  cacheWriteCost?: string;
  /** JSON object of input and output modalities. */
  modalities?: string;
  /** JSON object of extra request-body fields. */
  options?: string;
  /** JSON object of variant name to option object. */
  variants?: string;
}

/** Map one preset or gateway model onto the editable draft shape. */
export function modelDraftFromPreset(model: PresetModel): ModelDraft {
  return {
    id: model.id,
    name: model.name,
    contextWindow: String(model.contextWindow),
    maxOutputTokens: model.maxOutputTokens ? String(model.maxOutputTokens) : "",
    enabled: true,
    toolCall: model.toolCall === false ? false : undefined,
    reasoning: model.reasoning ? true : undefined,
    attachment: model.attachment ? true : undefined,
    inputCost: costText(model.cost, "input"),
    outputCost: costText(model.cost, "output"),
    cacheReadCost: costText(model.cost, "cache_read"),
    cacheWriteCost: costText(model.cost, "cache_write"),
    modalities: model.modalities ? JSON.stringify(model.modalities, null, 2) : "",
    options: "",
    variants: "",
  };
}

function costText(cost: ModelCost | undefined, key: keyof ModelCost): string {
  const value = cost?.[key];
  return typeof value === "number" && value > 0 ? String(value) : "";
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface CoreSettingsScope {
  draft: CoreDraft;
  busy: boolean;
  /** Changes the draft without writing; use for text while typing. */
  update: (patch: Partial<CoreDraft>) => void;
  /** Writes the current draft. */
  commit: () => void;
  /** Changes the draft and writes it in one step, for switches and selects. */
  updateAndCommit: (patch: Partial<CoreDraft>) => void;
}

export interface PreferencesScope {
  preferences: AppPreferences;
  save: (preferences: AppPreferences) => void;
}
