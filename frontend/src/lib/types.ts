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

export interface Status {
  connected: boolean;
  addr: string;
  owned: boolean;
  logPath: string;
  error: string;
}

export interface CoreEvent {
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

export interface ChatState {
  id: string;
  title: string;
  draft: boolean;
  messages: Message[];
  tools: ToolRun[];
  liveText: string;
  running: boolean;
  tokens: number;
  window: number;
  pending: PermissionRequest[];
  error?: string;
  notice?: string;
}

export function blankChat(id: string, title = "New session"): ChatState {
  return {
    id,
    title,
    draft: true,
    messages: [],
    tools: [],
    liveText: "",
    running: false,
    tokens: 0,
    window: 0,
    pending: [],
  };
}
