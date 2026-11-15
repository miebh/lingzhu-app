import { create } from "zustand";
import { api } from "../lib/api";
import { entryAttachments } from "@lingzhu/ui/attachments";
import { applyEvent, nextEntryKey } from "../lib/chat-events";
import { messageOf } from "../lib/errors";
import { splitModelID } from "../lib/models";
import {
  blankChat,
  chatKey,
  entriesFromMessages,
  type ChatState,
  type CoreEvent,
  type ModelSelection,
  type PromptAttachment,
  type PromptComment,
  type PromptReference,
  type QuestionResponse,
  type WorkspaceInfo,
} from "@lingzhu/ui/types";
import { useCatalogStore, type Catalog } from "./catalog";
import { notify } from "./notify";
import { usePreferencesStore } from "./preferences";
import { useViewStore } from "./view";
import { useWorkspaceStore } from "./workspaces";
import { t } from "@lingzhu/ui/i18n";

/** One page of older transcript entries revealed by loadOlder. */
const HISTORY_PAGE = 40;

/** The model a not-yet-created session would use, and where it would be created. */
export interface HomeModel {
  path?: string;
  provider: string;
  model: string;
}

interface ChatStore {
  /** Every live session, keyed by workspace and session ID. */
  chats: Record<string, ChatState>;
  activeByWorkspace: Record<string, string>;
  open: (workspace: string, sessionID: string) => Promise<void>;
  newChat: (workspace: string) => Promise<void>;
  send: (text: string, delivery?: 'steer' | 'queue', attachments?: PromptAttachment[], meta?: { comments?: PromptComment[]; references?: PromptReference[]; voice?: boolean }) => Promise<void>;
  /** Runs a shell command in the active session and shows its output. */
  runShell: (command: string) => Promise<void>;
  startSession: (text: string, agent?: string, attachments?: PromptAttachment[], meta?: { references?: PromptReference[] }) => Promise<void>;
  stop: () => Promise<void>;
  selectModel: (providerID: string, modelID: string) => Promise<void>;
  selectAgent: (agentID: string) => Promise<void>;
  /** Answers a permission request; a message turns a rejection into feedback. */
  reply: (requestID: string, decision: string, message?: string) => Promise<void>;
  answerQuestion: (requestID: string, response: QuestionResponse) => Promise<void>;
  discard: (workspace: string, sessionID: string) => void;
  /** Updates the in-memory title after a rename, so tabs relabel immediately. */
  setTitle: (workspace: string, sessionID: string, title: string) => void;
  /** Reloads messages, context and pending state for one session. */
  refresh: (workspace: string, sessionID: string) => Promise<void>;
  /** Reveals another page of older transcript entries. */
  loadOlder: (workspace: string, sessionID: string) => void;
  /** Folds one core event into the matching chat. */
  handleEvent: (event: CoreEvent) => void;
}

interface HomeInput {
  activePath?: string;
  workspaces: WorkspaceInfo[];
  chats: Record<string, ChatState>;
  activeByWorkspace: Record<string, string>;
  defaultModel: ModelSelection;
  catalog?: Catalog;
}

/**
 * The selection recorded on the newest user turn, so a reopened session can
 * price its model before the next turn reports one.
 */
function lastUserMeta(
  entries: ChatState["entries"],
  field: "provider" | "model" | "agent",
): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role !== "user") continue;
    const value = entry[field];
    if (value) return value;
  }
  return undefined;
}

function activeChat(input: HomeInput): ChatState | undefined {
  const sessionID = input.activePath ? input.activeByWorkspace[input.activePath] : undefined;
  return input.activePath && sessionID ? input.chats[chatKey(input.activePath, sessionID)] : undefined;
}

/** Resolves the selection the home composer should show. */
function homeModel(input: HomeInput): HomeModel {
  return resolveHomeModel({
    activePath: input.activePath,
    workspaces: input.workspaces,
    active: activeChat(input),
    defaultModel: input.defaultModel,
    catalog: input.catalog,
  });
}

/**
 * The one place the home selection is resolved. The hook passes the active
 * session's selection instead of the chat map, so a streamed token never
 * re-renders the shell.
 */
function resolveHomeModel(input: {
  activePath?: string;
  workspaces: WorkspaceInfo[];
  active?: { provider?: string; model?: string };
  defaultModel: ModelSelection;
  catalog?: Catalog;
}): HomeModel {
  const active = input.active;
  const path = input.activePath ?? input.workspaces.find((workspace) => workspace.connected)?.path;
  const provider = active?.provider || input.defaultModel.provider || input.catalog?.provider || "";
  const model = active?.model || input.defaultModel.model || input.catalog?.model || "";
  return { path, provider, model };
}

/**
 * Every live session plus the actions that mutate them. Core events are folded
 * in here, so no surface parses the stream.
 */
export const useChatStore = create<ChatStore>((set, get) => {
  const snapshot = (): HomeInput => ({
    activePath: useWorkspaceStore.getState().activePath,
    workspaces: useWorkspaceStore.getState().workspaces,
    chats: get().chats,
    activeByWorkspace: get().activeByWorkspace,
    defaultModel: usePreferencesStore.getState().preferences.defaultModel,
    catalog: useCatalogStore.getState().catalog,
  });

  const patchChat = (key: string, patch: (chat: ChatState) => ChatState) => {
    set((state) => {
      const chat = state.chats[key];
      if (!chat) return state;
      return { chats: { ...state.chats, [key]: patch(chat) } };
    });
  };

  // When a live event last ended a chat's turn. A snapshot fetched right after
  // that still reports `running: true`, because the core only drops the turn
  // handle once it finished emitting, so a recent ending overrides it.
  const TURN_END_GRACE_MS = 2000;
  const turnEndedAt = new Map<string, number>();

  // Text and reasoning arrive in many small deltas. Coalesce each stream into
  // one store update per animation frame, so a burst of tokens paints once per
  // frame instead of once per token, while keeping text and reasoning in
  // arrival order. A timer backs the frame up: a hidden window stops producing
  // frames, and the stream must still land.
  type PendingDelta = { type: "text.delta" | "reasoning.delta"; text: string };
  const pendingDeltas = new Map<string, { workspace: string; sessionId: string; parts: PendingDelta[] }>();
  let deltaFrame: number | undefined;
  let deltaTimer: number | undefined;
  const cancelFlush = () => {
    if (deltaFrame !== undefined) {
      window.cancelAnimationFrame(deltaFrame);
      deltaFrame = undefined;
    }
    if (deltaTimer !== undefined) {
      window.clearTimeout(deltaTimer);
      deltaTimer = undefined;
    }
  };
  const flushDeltas = (onlyKey?: string) => {
    cancelFlush();
    for (const key of onlyKey ? [onlyKey] : [...pendingDeltas.keys()]) {
      const item = pendingDeltas.get(key);
      if (!item) continue;
      pendingDeltas.delete(key);
      for (const part of item.parts) {
        if (!part.text) continue;
        const event: CoreEvent = {
          type: part.type,
          workspace: item.workspace,
          sessionId: item.sessionId,
          seq: 0,
          at: new Date().toISOString(),
          data: { text: part.text },
        };
        set((state) => {
          const chats = applyEvent(state.chats, key, event);
          return chats === state.chats ? state : { chats };
        });
      }
    }
  };
  const scheduleFlush = () => {
    if (deltaFrame !== undefined || deltaTimer !== undefined) return;
    const frame = window.requestAnimationFrame(() => {
      deltaFrame = undefined;
      flushDeltas();
    });
    deltaFrame = frame;
    deltaTimer = window.setTimeout(() => {
      deltaTimer = undefined;
      flushDeltas();
    }, 32);
  };
  const queueDelta = (key: string, event: CoreEvent, type: PendingDelta["type"]) => {
    const current = pendingDeltas.get(key) ?? {
      workspace: event.workspace,
      sessionId: event.sessionId,
      parts: [],
    };
    const text = String(event.data?.text ?? "");
    const last = current.parts[current.parts.length - 1];
    if (last?.type === type) last.text += text;
    else current.parts.push({ type, text });
    pendingDeltas.set(key, current);
    scheduleFlush();
  };

  /** Recover prompt attachment bytes from the session log for thumbnails. */
  const hydrateAttachmentData = async (workspace: string, sessionID: string) => {
    const key = chatKey(workspace, sessionID);
    const chat = get().chats[key];
    if (!chat) return;
    const missing = chat.entries.some(
      (entry) =>
        entry.role === "user" &&
        entry.attachments?.some(
          (attachment) =>
            !attachment.data &&
            (attachment.mime.startsWith("image/") || attachment.mime === "application/pdf"),
        ),
    );
    if (!missing) return;
    try {
      const events = await api.sessionEvents(workspace, sessionID, 0);
      const data = new Map<string, string>();
      for (const event of events) {
        if (event.type !== "user.message") continue;
        const text = String(event.data?.text ?? "");
        for (const attachment of entryAttachments(event.data?.attachments) ?? []) {
          if (!attachment.data) continue;
          data.set(`${text}\u0000${attachment.name ?? ""}\u0000${attachment.mime}`, attachment.data);
        }
      }
      if (data.size === 0) return;
      set((state) => {
        const current = state.chats[key];
        if (!current) return state;
        return {
          chats: {
            ...state.chats,
            [key]: {
              ...current,
              entries: current.entries.map((entry) =>
                entry.role !== "user" || !entry.attachments
                  ? entry
                  : {
                      ...entry,
                      attachments: entry.attachments.map((attachment) => {
                        if (attachment.data) return attachment;
                        const found = data.get(
                          `${entry.text ?? ""}\u0000${attachment.name ?? ""}\u0000${attachment.mime}`,
                        );
                        return found ? { ...attachment, data: found } : attachment;
                      }),
                    },
              ),
            },
          },
        };
      });
    } catch {
      // The prompt keeps its icon when the log is unavailable.
    }
  };

  const refreshChat = async (workspace: string, sessionID: string, title = "") => {
    const key = chatKey(workspace, sessionID);
    try {
      const [messages, pending, questions, usage] = await Promise.all([
        api.messages(workspace, sessionID),
        api.pending(workspace, sessionID),
        api.questions(workspace, sessionID),
        // The context ring and the Details pane read the counters the core
        // persisted for this session, so a reopened session shows its numbers
        // before the next turn reports a fresh usage event.
        api.usage(workspace, sessionID).catch(() => undefined),
      ]);
      set((state) => {
        const chat = state.chats[key] ?? blankChat(sessionID, title);
        // A turn that just ended must not be revived by a snapshot the core
        // produced before it dropped the turn handle.
        const endedAt = turnEndedAt.get(key) ?? 0;
        const recentlyEnded = Date.now() - endedAt < TURN_END_GRACE_MS;
        // A turn that started after the ending event is a new turn; its own
        // prompt already set the flag, so a stale snapshot must not clear it.
        const restarted = endedAt > 0 && (chat.runStartedAt ?? 0) >= endedAt;
        const running = restarted ? chat.running : recentlyEnded ? false : chat.running;
        // History omits attachment bytes, but the live/optimistic rows carry
        // them; keep the thumbnail data for prompts already on screen.
        const known = new Map<string, string>();
        for (const entry of chat.entries) {
          if (entry.role !== "user") continue;
          for (const attachment of entry.attachments ?? []) {
            if (!attachment.data) continue;
            known.set(
              `${entry.text ?? ""}\u0000${attachment.name ?? ""}\u0000${attachment.mime}`,
              attachment.data,
            );
          }
        }
        const history = entriesFromMessages(messages).map((entry) => {
          if (entry.role !== "user" || !entry.attachments) return entry;
          return {
            ...entry,
            attachments: entry.attachments.map((attachment) => {
              if (attachment.data) return attachment;
              const data = known.get(
                `${entry.text ?? ""}\u0000${attachment.name ?? ""}\u0000${attachment.mime}`,
              );
              return data ? { ...attachment, data } : attachment;
            }),
          };
        });
        return {
          chats: {
            ...state.chats,
            [key]: {
              ...chat,
              loading: false,
              draft: false,
              entries: history,
              // The persisted counters are cumulative, so they replace the
              // local ones instead of adding to them. The prompt size is the
              // last call's totals, which is what the ring reports.
              tokens: usage?.last ? usage.last.input + usage.last.cacheRead : chat.tokens,
              usage: usage
                ? {
                    input: usage.input,
                    output: usage.output,
                    cacheRead: usage.cacheRead,
                    cacheWrite: usage.cacheWrite,
                  }
                : chat.usage,
              // History records the selection on each user turn; adopt the
              // newest one so the ring can price the model after a reload.
              provider: lastUserMeta(history, "provider") ?? chat.provider,
              model: lastUserMeta(history, "model") ?? chat.model,
              agent: lastUserMeta(history, "agent") ?? chat.agent,
              pending: pending ?? [],
              questions: questions ?? [],
              running,
              runStartedAt: running ? (chat.runStartedAt ?? Date.now()) : undefined,
              runEndedAt: running ? undefined : chat.runEndedAt,
              lastRunStatus: running ? undefined : chat.lastRunStatus,
            },
          },
        };
      });
      void hydrateAttachmentData(workspace, sessionID);
    } catch (error) {
      set((state) => ({
        chats: {
          ...state.chats,
          [key]: {
            ...(state.chats[key] ?? blankChat(sessionID, title)),
            loading: false,
            error: messageOf(error),
          },
        },
      }));
    }
  };

  const activate = (workspace: string, sessionID?: string) => {
    useViewStore.getState().showChat();
    useWorkspaceStore.getState().select(workspace);
    if (sessionID) {
      set((state) => ({ activeByWorkspace: { ...state.activeByWorkspace, [workspace]: sessionID } }));
    }
  };

  const sendTo = async (
    workspace: string,
    sessionID: string,
    text: string,
    source: ChatState | undefined,
    providerID: string,
    modelID: string,
    agentID: string,
    delivery: 'steer' | 'queue' = 'steer',
    attachments: PromptAttachment[] = [],
    meta?: { comments?: PromptComment[]; references?: PromptReference[]; voice?: boolean },
  ) => {
    const key = chatKey(workspace, sessionID);
    const chat = source ?? get().chats[key] ?? blankChat(sessionID);
    if ((attachments.length > 0 || meta?.comments?.length || meta?.references?.length || meta?.voice) && chat.running) {
      notify(t("notifyWaitForTurn"));
      return;
    }
    const title = chat.title && chat.title !== "New session" ? chat.title : text.slice(0, 40);
    const attachmentMeta = attachments.map((attachment) => ({
      mime: attachment.mime,
      name: attachment.name,
      data: attachment.data,
      kind: attachment.kind,
      start: attachment.start,
      end: attachment.end,
    }));
    set((state) => {
      const current = state.chats[key] ?? chat;
      // Steering input joins the active run, so it must not restart the timer
      // or clear the live run status.
      const active = current.running;
      turnEndedAt.delete(key);
      return {
        chats: {
          ...state.chats,
          [key]: {
            ...current,
            title,
            draft: false,
            loading: false,
            running: true,
            runStartedAt: active ? current.runStartedAt : Date.now(),
            runEndedAt: active ? current.runEndedAt : undefined,
            lastRunMs: active ? current.lastRunMs : undefined,
            lastRunStatus: active ? current.lastRunStatus : undefined,
            error: undefined,
            notice: active ? current.notice : undefined,
            // Show the turn immediately; the core echoes it back as user.message
            // and history replaces the optimistic row when the run ends.
            entries: [
              ...current.entries,
              {
                key: nextEntryKey("user"),
                role: "user",
                text,
                attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
                comments: meta?.comments,
                references: meta?.references?.map((reference) => ({
                  mime: reference.mime ?? "",
                  name: reference.name,
                })),
                voice: meta?.voice,
                pending: true,
                // A prompt sent into a live turn joins it as a steer, so the
                // transcript can grow the row in where it arrived.
                steer: active || undefined,
                created: new Date().toISOString(),
                agent: agentID,
                provider: providerID,
                model: modelID,
              },
            ],
          },
        },
      };
    });
    if (chat.draft) {
      useWorkspaceStore.getState().prependSession(workspace, {
        id: sessionID,
        title,
        updated: new Date().toISOString(),
      });
    }
    try {
      const catalog = useCatalogStore.getState().catalog;
      const provider = providerID || catalog?.provider || "";
      const model = modelID || catalog?.model || "";
      if (attachments.length > 0 || meta?.comments?.length || meta?.references?.length || meta?.voice) {
        await api.sendWithMeta(
          workspace,
          sessionID,
          text,
          provider,
          model,
          agentID,
          delivery,
          attachments,
          meta?.comments ?? [],
          meta?.references ?? [],
          meta?.voice ?? false,
        );
      } else {
        await api.send(workspace, sessionID, text, provider, model, agentID, delivery);
      }
    } catch (error) {
      patchChat(key, (failed) => ({
        ...failed,
        running: false,
        error: messageOf(error),
        entries: failed.entries.filter((entry) => !entry.pending),
      }));
    }
  };

  return {
    chats: {},
    activeByWorkspace: {},

    open: async (workspace, sessionID) => {
      activate(workspace, sessionID);
      const key = chatKey(workspace, sessionID);
      // A draft has no durable session yet; selecting it must not fetch history.
      if (get().chats[key]?.draft) return;
      if (!get().chats[key]) {
        const info = useWorkspaceStore
          .getState()
          .sessionsByWorkspace[workspace]?.find((session) => session.id === sessionID);
        set((state) =>
          state.chats[key]
            ? state
            : {
                chats: {
                  ...state.chats,
                  [key]: { ...blankChat(sessionID, info?.title ?? ""), draft: false, loading: true },
                },
              },
        );
      }
      await refreshChat(workspace, sessionID);
    },

    newChat: async (workspace) => {
      // Every "New session" click opens its own draft tab, like the reference;
      // drafts are keyed by a fresh core session ID so they never collide.
      try {
        const id = await api.newSessionID();
        const preferred = usePreferencesStore.getState().preferences.defaultModel;
        const catalog = useCatalogStore.getState().catalog;
        const providers = catalog?.providers ?? [];
        const preferredBase = splitModelID(preferred.model).model;
        const usable =
          preferred.provider &&
          preferred.model &&
          providers.some(
            (provider) =>
              provider.id === preferred.provider &&
              provider.models.some((entry) => entry.id === preferredBase),
          )
            ? preferred
            : undefined;
        set((state) => ({
          chats: {
            ...state.chats,
            [chatKey(workspace, id)]: blankChat(
              id,
              "New session",
              usable?.provider ?? catalog?.provider,
              usable?.model ?? catalog?.model,
            ),
          },
        }));
        activate(workspace, id);
      } catch (error) {
        notify(messageOf(error));
      }
    },

    send: async (text, delivery = "steer", attachments = [], meta) => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const chat = get().chats[chatKey(path, sessionID)];
      await sendTo(
        path,
        sessionID,
        text,
        chat,
        chat?.provider ?? "",
        chat?.model ?? "",
        chat?.agent ?? "",
        delivery,
        attachments,
        meta,
      );
    },

    runShell: async (command) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      if (!get().chats[key]) return;
      const entryKey = nextEntryKey("shell");
      // The row appears while the command runs and is replaced by the same
      // command's shell.ended event.
      set((state) => {
        const chat = state.chats[key];
        if (!chat) return state;
        return {
          chats: {
            ...state.chats,
            [key]: {
              ...chat,
              entries: [
                ...chat.entries,
                {
                  key: entryKey,
                  role: "shell",
                  shell: { command: trimmed, output: "", exit: 0, running: true },
                  created: new Date().toISOString(),
                },
              ],
            },
          },
        };
      });
      try {
        const result = await api.sessionShell(path, sessionID, trimmed);
        patchChat(key, (chat) => ({
          ...chat,
          entries: chat.entries.map((entry) =>
            entry.key !== entryKey
              ? entry
              : {
                  ...entry,
                  shell: {
                    command: trimmed,
                    output: result.output,
                    exit: result.exit,
                    timedOut: result.timedOut,
                    truncated: result.truncated,
                  },
                },
          ),
        }));
      } catch (error) {
        patchChat(key, (chat) => ({
          ...chat,
          entries: chat.entries.filter((entry) => entry.key !== entryKey),
        }));
        notify(messageOf(error));
      }
    },

    /** Home composer: reuse an empty draft, otherwise create the session here. */
    startSession: async (text, agent = "", attachments = [], meta) => {
      const workspaceState = useWorkspaceStore.getState();
      const path =
        workspaceState.activePath ?? workspaceState.workspaces.find((workspace) => workspace.connected)?.path;
      if (!path) {
        notify(t("notifyAddWorkspace"));
        return;
      }
      const state = get();
      const activeID = workspaceState.activePath === path ? state.activeByWorkspace[path] : undefined;
      const current = activeID ? state.chats[chatKey(path, activeID)] : undefined;
      const draft = current?.draft && current.entries.length === 0 && !current.running ? current : undefined;
      const home = homeModel(snapshot());
      const providerID = draft?.provider || home.provider;
      const modelID = draft?.model || home.model;
      const agentID = draft?.agent || agent;
      if (draft) {
        await sendTo(path, draft.id, text, draft, providerID, modelID, agentID, "steer", attachments, meta);
        return;
      }
      try {
        const id = await api.newSessionID();
        const chat = blankChat(id, "New session", providerID, modelID, agentID);
        set((state) => ({ chats: { ...state.chats, [chatKey(path, id)]: chat } }));
        activate(path, id);
        await sendTo(path, id, text, chat, providerID, modelID, agentID, "steer", attachments, meta);
      } catch (error) {
        notify(messageOf(error));
      }
    },

    stop: async () => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      try {
        await api.interrupt(path, sessionID);
      } catch (error) {
        patchChat(chatKey(path, sessionID), (chat) => ({ ...chat, error: messageOf(error) }));
      }
    },

    selectModel: async (providerID, modelID) => {
      if (!providerID || !modelID) return;
      // Remember the pick app-wide so the next new session starts here.
      const preferences = usePreferencesStore.getState().preferences;
      if (preferences.defaultModel.provider !== providerID || preferences.defaultModel.model !== modelID) {
        void usePreferencesStore
          .getState()
          .save({ ...preferences, defaultModel: { provider: providerID, model: modelID } });
      }
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      const chat = get().chats[key];
      if (!chat) return;
      const previous = { provider: chat.provider, model: chat.model };
      patchChat(key, (current) => ({ ...current, provider: providerID, model: modelID }));
      // A draft has no log yet; its first prompt persists the selection.
      if (chat.draft) return;
      try {
        await api.selectModel(path, sessionID, providerID, modelID);
      } catch (error) {
        patchChat(key, (current) => ({ ...current, ...previous }));
        notify(messageOf(error));
      }
    },

    selectAgent: async (agentID) => {
      if (!agentID) return;
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      const chat = get().chats[key];
      if (!chat) return;
      const previous = chat.agent;
      patchChat(key, (current) => ({ ...current, agent: agentID }));
      if (chat.draft) return;
      try {
        await api.selectAgent(path, sessionID, agentID);
      } catch (error) {
        patchChat(key, (current) => ({ ...current, agent: previous }));
        notify(messageOf(error));
      }
    },

    reply: async (requestID, decision, message = "") => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      try {
        await api.reply(path, sessionID, requestID, decision, message);
        patchChat(key, (chat) => ({ ...chat, pending: chat.pending.filter((item) => item.id !== requestID) }));
      } catch (error) {
        patchChat(key, (chat) => ({ ...chat, error: messageOf(error) }));
      }
    },

    answerQuestion: async (requestID, response) => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      try {
        await api.replyQuestion(path, sessionID, requestID, response);
        patchChat(key, (chat) => ({ ...chat, questions: chat.questions.filter((item) => item.id !== requestID) }));
      } catch (error) {
        patchChat(key, (chat) => ({ ...chat, error: messageOf(error) }));
      }
    },

    discard: (workspace, sessionID) => {
      const key = chatKey(workspace, sessionID);
      turnEndedAt.delete(key);
      set((state) => {
        const chats = { ...state.chats };
        delete chats[key];
        const activeByWorkspace = { ...state.activeByWorkspace };
        if (activeByWorkspace[workspace] === sessionID) delete activeByWorkspace[workspace];
        return { chats, activeByWorkspace };
      });
    },

    setTitle: (workspace, sessionID, title) => {
      const key = chatKey(workspace, sessionID);
      patchChat(key, (chat) => ({ ...chat, title }));
    },

    refresh: async (workspace, sessionID) => {
      await refreshChat(workspace, sessionID);
    },

    loadOlder: (workspace, sessionID) => {
      const key = chatKey(workspace, sessionID);
      patchChat(key, (chat) => ({
        ...chat,
        historyLimit: (chat.historyLimit ?? 0) + HISTORY_PAGE,
      }));
    },

    handleEvent: (event) => {
      const autoApprove =
        usePreferencesStore.getState().preferences.autoApprove ||
        usePreferencesStore.getState().preferences.projectAutoApprove[event.workspace] === true;
      if (event.type === "permission.asked" && autoApprove) {
        const id = String(event.data?.id ?? "");
        if (id) {
          void api.reply(event.workspace, event.sessionId, id, "once").catch((error) => notify(messageOf(error)));
        }
      }
      const key = chatKey(event.workspace, event.sessionId);
      // Ending events clear the flag's opposite; every other event means a turn
      // is live again, so a later snapshot may trust the core's `running`.
      // `client.done` only reports that one prompt stream closed: a stream that
      // belonged to the previous turn can land after the next prompt started,
      // so it must not mark this turn as ended.
      const ends =
        event.type === "run.end" ||
        event.type === "client.error" ||
        event.type === "error";
      if (ends) turnEndedAt.set(key, Date.now());
      else turnEndedAt.delete(key);
      if (event.type === "text.delta" || event.type === "reasoning.delta") {
        queueDelta(key, event, event.type);
        return;
      }
      // Keep ordering: anything already buffered for this session must land
      // before the next structural event.
      flushDeltas(key);
      set((state) => {
        const chats = applyEvent(state.chats, key, event);
        return chats === state.chats ? state : { chats };
      });
      if (event.type === "run.end" || event.type === "client.done") {
        flushDeltas();
        void refreshChat(event.workspace, event.sessionId);
        void useWorkspaceStore.getState().loadSessions(event.workspace);
      }
    },
  };
});

export function useChatMap(): Record<string, ChatState> {
  return useChatStore((state) => state.chats);
}

export function useActiveChatID(): string | undefined {
  const path = useWorkspaceStore((state) => state.activePath);
  return useChatStore((state) => (path ? state.activeByWorkspace[path] : undefined));
}

export function useActiveChat(): ChatState | undefined {
  const path = useWorkspaceStore((state) => state.activePath);
  const sessionID = useChatStore((state) => (path ? state.activeByWorkspace[path] : undefined));
  return useChatStore((state) =>
    path && sessionID ? state.chats[chatKey(path, sessionID)] : undefined,
  );
}

/**
 * A field of the active session, read through its own selector. A streamed
 * token replaces the whole chat object, so a container that only needs the
 * title or the running flag must not subscribe to the chat itself.
 */
export function useActiveChatField<T>(select: (chat: ChatState) => T, fallback: T): T {
  const path = useWorkspaceStore((state) => state.activePath);
  const sessionID = useChatStore((state) => (path ? state.activeByWorkspace[path] : undefined));
  return useChatStore((state) => {
    const chat = path && sessionID ? state.chats[chatKey(path, sessionID)] : undefined;
    return chat ? select(chat) : fallback;
  });
}

/** Any session is running; settings use it to block writes to the shared config. */
export function useAnyChatRunning(): boolean {
  return useChatStore((state) => Object.values(state.chats).some((chat) => chat.running));
}

export function useChatHome(): HomeModel {
  const activePath = useWorkspaceStore((state) => state.activePath);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  // Only the active session's selection matters here. Subscribing to the chat
  // map would re-render every caller on each streamed token.
  const provider = useChatStore((state) => {
    const sessionID = activePath ? state.activeByWorkspace[activePath] : undefined;
    return activePath && sessionID ? state.chats[chatKey(activePath, sessionID)]?.provider : undefined;
  });
  const model = useChatStore((state) => {
    const sessionID = activePath ? state.activeByWorkspace[activePath] : undefined;
    return activePath && sessionID ? state.chats[chatKey(activePath, sessionID)]?.model : undefined;
  });
  const defaultModel = usePreferencesStore((state) => state.preferences.defaultModel);
  const catalog = useCatalogStore((state) => state.catalog);
  return resolveHomeModel({
    activePath,
    workspaces,
    active: provider === undefined && model === undefined ? undefined : { provider, model },
    defaultModel,
    catalog,
  });
}

/** True on the home screen: no session, or a draft that has not started. */
export function useAtHome(): boolean {
  const activePath = useWorkspaceStore((state) => state.activePath);
  // Derived inside the selector so a streamed token, which replaces the chat
  // object, does not re-render every caller of this hook.
  return useChatStore((state) => {
    const sessionID = activePath ? state.activeByWorkspace[activePath] : undefined;
    const active = activePath && sessionID ? state.chats[chatKey(activePath, sessionID)] : undefined;
    return !active || (active.draft && active.entries.length === 0 && !active.running);
  });
}
