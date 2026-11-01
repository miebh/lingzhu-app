import { CoreService } from "../../bindings/lingzhu-app";
import { Events } from "@wailsio/runtime";
import type {
  AppSettings,
  ContextInfo,
  CoreEvent,
  Message,
  PermissionRequest,
  SessionInfo,
  SettingsInput,
  WorkspaceInfo,
} from "./types";

// The generated bindings are plain JS with JSDoc types, so results are cast
// here once instead of at every call site.
const call = CoreService as any;

export const api = {
  workspaces: (): Promise<WorkspaceInfo[]> => call.Workspaces(),
  addWorkspace: (): Promise<WorkspaceInfo> => call.AddWorkspace(),
  removeWorkspace: (path: string): Promise<void> => call.RemoveWorkspace(path),

  sessions: (workspace: string): Promise<SessionInfo[]> => call.Sessions(workspace),
  messages: (workspace: string, sessionID: string): Promise<Message[]> => call.Messages(workspace, sessionID),
  context: (workspace: string, sessionID: string): Promise<ContextInfo> => call.Context(workspace, sessionID),
  send: (workspace: string, sessionID: string, text: string): Promise<void> => call.Send(workspace, sessionID, text),
  interrupt: (workspace: string, sessionID: string): Promise<boolean> => call.Interrupt(workspace, sessionID),
  pending: (workspace: string, sessionID: string): Promise<PermissionRequest[]> => call.Pending(workspace, sessionID),
  reply: (workspace: string, sessionID: string, requestID: string, decision: string, message = ""): Promise<void> =>
    call.Reply(workspace, sessionID, requestID, decision, message),
  compact: (workspace: string, sessionID: string): Promise<void> => call.Compact(workspace, sessionID),
  rename: (workspace: string, sessionID: string, title: string): Promise<void> =>
    call.Rename(workspace, sessionID, title),
  remove: (workspace: string, sessionID: string): Promise<void> => call.Delete(workspace, sessionID),
  newSessionID: (): Promise<string> => call.NewSessionID(),

  settings: (): Promise<AppSettings> => call.Settings(),
  saveSettings: (input: SettingsInput): Promise<string[]> => call.SaveSettings(input),

  onEvent(handler: (event: CoreEvent) => void): () => void {
    return Events.On("lingzhu:event", (payload: any) => handler(payload.data as CoreEvent));
  },
};
