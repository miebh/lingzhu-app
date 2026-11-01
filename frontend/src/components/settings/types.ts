import type { AppPreferences, ConfigRule } from "../../lib/types";

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
  models: ModelDraft[];
}

export interface ModelDraft {
  id: string;
  name: string;
  contextWindow: string;
  enabled: boolean;
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
