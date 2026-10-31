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
}

export interface SessionInfo {
  id: string;
  title: string;
  updated: string;
}

export interface ContextInfo {
  messages: Message[];
  tokens: number;
  window: number;
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

export interface CoreEvent {
  workspace: string;
  sessionId: string;
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
}

/** One live tool call in the running step. */
export interface ToolRun {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  failed?: boolean;
  done: boolean;
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
  loading?: boolean;
  messages: Message[];
  tools: ToolRun[];
  liveText: string;
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

export function blankChat(id: string, title = "New session"): ChatState {
  return {
    id,
    title,
    draft: true,
    loading: false,
    messages: [],
    tools: [],
    liveText: "",
    running: false,
    tokens: 0,
    window: 0,
    pending: [],
  };
}

/** chatKey scopes a session to its workspace; IDs are only unique per core. */
export function chatKey(workspace: string, sessionID: string): string {
  return `${workspace}\u0000${sessionID}`;
}
