export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  diff?: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  provider?: string;
  model?: string;
  updated: string;
  running?: boolean;
}

export interface ContextInfo {
  messages: Message[];
  tokens: number;
  window: number;
  provider: string;
  model: string;
  running?: boolean;
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  action: string;
  resources: string[];
  message?: string;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  addr: string;
  connected: boolean;
  error: string;
}

/** One permission rule in the shared core config. */
export interface ConfigRule {
  action: string;
  resource: string;
  effect: "allow" | "ask" | "deny";
}

/** Editable view of the shared core config; the API key is never returned. */
export interface AppSettings {
  configPath: string;
  provider: string;
  model: string;
  providers: ProviderSettings[];
  maxSteps: number;
  contextWindow: number;
  compactKeep: number;
  systemPrompt: string;
  shell: string[];
  permission: ConfigRule[];
}

export interface ProviderSettings {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySet: boolean;
  apiKeyEnv: string;
  ready: boolean;
  models: ModelSettings[];
}

export interface ModelSettings {
  id: string;
  name: string;
  contextWindow: number;
  enabled: boolean;
}

/** Picker visibility for one model; saved without restarting a core. */
export interface ModelVisibility {
  provider: string;
  model: string;
  enabled: boolean;
}

/** Settings payload; an empty apiKey keeps the stored key unless clearKey is set. */
export interface SettingsInput {
  provider: string;
  model: string;
  providers: ProviderInput[];
  maxSteps: number;
  contextWindow: number;
  compactKeep: number;
  systemPrompt: string;
  shell: string[];
  permission: ConfigRule[];
}

export interface ProviderInput {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  clearKey: boolean;
  models: ModelInput[];
}

export interface ModelInput {
  id: string;
  name: string;
  contextWindow: number;
  enabled: boolean;
}

/** Built-in starting point for a mainstream provider. */
export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  models: PresetModel[];
}

export interface PresetModel {
  id: string;
  name: string;
  contextWindow: number;
}

/** Local preferences; applied immediately and never restart a core. */
export interface AppPreferences {
  defaultWorkspace: string;
  autoApprove: boolean;
  /** The last model picked anywhere in the app; used by new sessions. */
  defaultModel: ModelSelection;
  appearance: AppearancePreferences;
}

export interface ModelSelection {
  provider: string;
  model: string;
}

export interface AppearancePreferences {
  fontFamily: string;
  density: "comfortable" | "compact";
  timelineWidth: "focused" | "comfortable" | "wide";
  reduceMotion: "system" | "on" | "off";
}

/** Read-only About data. */
export interface AppInfo {
  version: string;
  built: string;
  configPath: string;
  databasePath: string;
  appDataDir: string;
  dataDir: string;
  logPath: string;
}

export interface CoreEvent {
  workspace: string;
  sessionId: string;
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
}

/** One tool call: live while a run is in flight, rebuilt from history later. */
export interface ToolRun {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  diff?: string;
  failed?: boolean;
  done: boolean;
}

/**
 * One row of the transcript. Assistant text, user turns and tool calls share a
 * single ordered list so a live reply keeps the order its events arrived in.
 */
export interface TimelineEntry {
  key: string;
  role: "user" | "assistant" | "tool";
  text?: string;
  tool?: ToolRun;
  /** Streamed text not yet confirmed by an assistant.message event. */
  live?: boolean;
  /** Optimistic user turn not yet echoed by the core's user.message event. */
  pending?: boolean;
}

/** Prompt-side and output tokens reported by the provider for this client run. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type RunStatus = "completed" | "stopped" | "max-steps" | "failed";

export interface ChatState {
  id: string;
  title: string;
  draft: boolean;
  provider?: string;
  model?: string;
  loading?: boolean;
  entries: TimelineEntry[];
  running: boolean;
  tokens: number;
  window: number;
  pending: PermissionRequest[];
  usage?: UsageTotals;
  runStartedAt?: number;
  runEndedAt?: number;
  lastRunMs?: number;
  lastRunStatus?: RunStatus;
  error?: string;
  notice?: string;
}

export function blankChat(id: string, title = "New session", provider?: string, model?: string): ChatState {
  return {
    id,
    title,
    draft: true,
    provider,
    model,
    loading: false,
    entries: [],
    running: false,
    tokens: 0,
    window: 0,
    pending: [],
  };
}

/**
 * Rebuilds the transcript from stored messages. Tool arguments live on the
 * assistant message while their rows come from tool results, so the two are
 * paired here; assistant tool calls alone produce no row.
 */
export function entriesFromMessages(messages: Message[]): TimelineEntry[] {
  const argumentsByID = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      argumentsByID.set(call.id, call.arguments);
    }
  }

  const entries: TimelineEntry[] = [];
  messages.forEach((message, index) => {
    const key = `history-${index}`;
    if (message.role === "user") {
      entries.push({ key, role: "user", text: message.content });
      return;
    }
    if (message.role === "assistant") {
      if (message.content) entries.push({ key, role: "assistant", text: message.content });
      return;
    }
    entries.push({
      key,
      role: "tool",
      tool: {
        id: message.toolCallId ?? key,
        name: message.name || "tool",
        arguments: argumentsByID.get(message.toolCallId ?? "") ?? "",
        output: message.content,
        diff: message.diff,
        done: true,
      },
    });
  });
  return entries;
}

/** chatKey scopes a session to its workspace; IDs are only unique per core. */
export function chatKey(workspace: string, sessionID: string): string {
  return `${workspace}\u0000${sessionID}`;
}
