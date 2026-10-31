import { CoreService } from "../../bindings/lingzhu-app";
import { Events } from "@wailsio/runtime";
import type {
  ContextInfo,
  CoreEvent,
  Message,
  PermissionRequest,
  SessionInfo,
  Status,
} from "./types";

// The generated bindings are plain JS with JSDoc types, so results are cast
// here once instead of at every call site.
const call = CoreService as any;

export const api = {
  status: (): Promise<Status> => call.Status(),
  sessions: (): Promise<SessionInfo[]> => call.Sessions(),
  messages: (sessionID: string): Promise<Message[]> => call.Messages(sessionID),
  context: (sessionID: string): Promise<ContextInfo> => call.Context(sessionID),
  send: (sessionID: string, text: string): Promise<void> => call.Send(sessionID, text),
  interrupt: (sessionID: string): Promise<boolean> => call.Interrupt(sessionID),
  pending: (sessionID: string): Promise<PermissionRequest[]> => call.Pending(sessionID),
  reply: (sessionID: string, requestID: string, decision: string, message = ""): Promise<void> =>
    call.Reply(sessionID, requestID, decision, message),
  compact: (sessionID: string): Promise<void> => call.Compact(sessionID),
  rename: (sessionID: string, title: string): Promise<void> => call.Rename(sessionID, title),
  remove: (sessionID: string): Promise<void> => call.Delete(sessionID),
  newSessionID: (): Promise<string> => call.NewSessionID(),

  onEvent(handler: (event: CoreEvent) => void): () => void {
    return Events.On("lingzhu:event", (payload: any) => handler(payload.data as CoreEvent));
  },

  onStatus(handler: (status: Status) => void): () => void {
    return Events.On("lingzhu:status", (payload: any) => handler(payload.data as Status));
  },
};
