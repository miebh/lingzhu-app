import { create } from "zustand";
import { api } from "../lib/api";
import { applyEvent, nextEntryKey } from "../lib/chat-events";
import { messageOf } from "../lib/errors";
import {
  blankChat,
  chatKey,
  entriesFromMessages,
  type ChatState,
  type CoreEvent,
  type ModelSelection,
  type WorkspaceInfo,
} from "../lib/types";
import { useCatalogStore, type Catalog } from "./catalog";
import { notify } from "./notify";
import { usePreferencesStore } from "./preferences";
import { useViewStore } from "./view";
import { useWorkspaceStore } from "./workspaces";

/** The model a not-yet-created session would use, and where it would be created. */
export interface HomeModel {
  path?: string;
  provider: string;
  model: string;
  window: number;
}

interface ChatStore {
  /** Every live session, keyed by workspace and session ID. */
  chats: Record<string, ChatState>;
  activeByWorkspace: Record<string, string>;
  open: (workspace: string, sessionID: string) => Promise<void>;
  newChat: (workspace: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  startSession: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  selectModel: (providerID: string, modelID: string) => Promise<void>;
  reply: (requestID: string, decision: string) => Promise<void>;
  discard: (workspace: string, sessionID: string) => void;
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

function activeChat(input: HomeInput): ChatState | undefined {
  const sessionID = input.activePath ? input.activeByWorkspace[input.activePath] : undefined;
  return input.activePath && sessionID ? input.chats[chatKey(input.activePath, sessionID)] : undefined;
}

/** Resolves the selection the home composer should show. */
export function homeModel(input: HomeInput): HomeModel {
  const active = activeChat(input);
  const path = input.activePath ?? input.workspaces.find((workspace) => workspace.connected)?.path;
  const provider = active?.provider || input.defaultModel.provider || input.catalog?.provider || "";
  const model = active?.model || input.defaultModel.model || input.catalog?.model || "";
  const window =
    input.catalog?.providers
      .find((entry) => entry.id === provider)
      ?.models.find((entry) => entry.id === model)?.contextWindow ?? 0;
  return { path, provider, model, window };
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

  const refreshChat = async (workspace: string, sessionID: string, title = "") => {
    const key = chatKey(workspace, sessionID);
    try {
      const [messages, context, pending] = await Promise.all([
        api.messages(workspace, sessionID),
        api.context(workspace, sessionID),
        api.pending(workspace, sessionID),
      ]);
      set((state) => {
        const chat = state.chats[key] ?? blankChat(sessionID, title);
        return {
          chats: {
            ...state.chats,
            [key]: {
              ...chat,
              loading: false,
              draft: false,
              entries: entriesFromMessages(messages),
              tokens: context.tokens,
              window: context.window,
              provider: context.provider,
              model: context.model,
              pending,
            },
          },
        };
      });
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

  const refreshContext = async (workspace: string, sessionID: string) => {
    try {
      const context = await api.context(workspace, sessionID);
      patchChat(chatKey(workspace, sessionID), (chat) => ({
        ...chat,
        tokens: context.tokens,
        window: context.window,
      }));
    } catch {
      // The context endpoint is informational; keep the previous numbers.
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
  ) => {
    const key = chatKey(workspace, sessionID);
    const chat = source ?? get().chats[key] ?? blankChat(sessionID);
    const title = chat.title && chat.title !== "New session" ? chat.title : text.slice(0, 40);
    set((state) => {
      const current = state.chats[key] ?? chat;
      return {
        chats: {
          ...state.chats,
          [key]: {
            ...current,
            title,
            draft: false,
            loading: false,
            running: true,
            runStartedAt: Date.now(),
            runEndedAt: undefined,
            lastRunMs: undefined,
            lastRunStatus: undefined,
            error: undefined,
            notice: undefined,
            // Show the turn immediately; the core echoes it back as user.message
            // and history replaces the optimistic row when the run ends.
            entries: [...current.entries, { key: nextEntryKey("user"), role: "user", text, pending: true }],
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
      await api.send(
        workspace,
        sessionID,
        text,
        providerID || catalog?.provider || "",
        modelID || catalog?.model || "",
      );
      void refreshContext(workspace, sessionID);
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
      // Only one draft may exist per workspace: reuse it instead of stacking a
      // second "New session" row in the sidebar.
      const chats = get().chats;
      const existing = Object.keys(chats)
        .filter((key) => key.startsWith(`${workspace}\u0000`))
        .map((key) => chats[key])
        .find((chat) => chat.draft);
      if (existing) {
        activate(workspace, existing.id);
        return;
      }
      try {
        const id = await api.newSessionID();
        const preferred = usePreferencesStore.getState().preferences.defaultModel;
        const catalog = useCatalogStore.getState().catalog;
        const providers = catalog?.providers ?? [];
        const usable =
          preferred.provider &&
          preferred.model &&
          providers.some(
            (provider) =>
              provider.id === preferred.provider && provider.models.some((entry) => entry.id === preferred.model),
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

    send: async (text) => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const chat = get().chats[chatKey(path, sessionID)];
      await sendTo(path, sessionID, text, chat, chat?.provider ?? "", chat?.model ?? "");
    },

    /** Home composer: reuse an empty draft, otherwise create the session here. */
    startSession: async (text) => {
      const workspaceState = useWorkspaceStore.getState();
      const path =
        workspaceState.activePath ?? workspaceState.workspaces.find((workspace) => workspace.connected)?.path;
      if (!path) {
        notify("Add a workspace before starting a session");
        return;
      }
      const state = get();
      const activeID = workspaceState.activePath === path ? state.activeByWorkspace[path] : undefined;
      const current = activeID ? state.chats[chatKey(path, activeID)] : undefined;
      const draft = current?.draft && current.entries.length === 0 && !current.running ? current : undefined;
      const home = homeModel(snapshot());
      const providerID = draft?.provider || home.provider;
      const modelID = draft?.model || home.model;
      if (draft) {
        await sendTo(path, draft.id, text, draft, providerID, modelID);
        return;
      }
      try {
        const id = await api.newSessionID();
        const chat = blankChat(id, "New session", providerID, modelID);
        set((state) => ({ chats: { ...state.chats, [chatKey(path, id)]: chat } }));
        activate(path, id);
        await sendTo(path, id, text, chat, providerID, modelID);
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

    reply: async (requestID, decision) => {
      const path = useWorkspaceStore.getState().activePath;
      const sessionID = path ? get().activeByWorkspace[path] : undefined;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      try {
        await api.reply(path, sessionID, requestID, decision);
        patchChat(key, (chat) => ({ ...chat, pending: chat.pending.filter((item) => item.id !== requestID) }));
      } catch (error) {
        patchChat(key, (chat) => ({ ...chat, error: messageOf(error) }));
      }
    },

    discard: (workspace, sessionID) => {
      const key = chatKey(workspace, sessionID);
      set((state) => {
        const chats = { ...state.chats };
        delete chats[key];
        const activeByWorkspace = { ...state.activeByWorkspace };
        if (activeByWorkspace[workspace] === sessionID) delete activeByWorkspace[workspace];
        return { chats, activeByWorkspace };
      });
    },

    handleEvent: (event) => {
      if (event.type === "permission.asked" && usePreferencesStore.getState().preferences.autoApprove) {
        const id = String(event.data?.id ?? "");
        if (id) {
          void api.reply(event.workspace, event.sessionId, id, "once").catch((error) => notify(messageOf(error)));
        }
      }
      const key = chatKey(event.workspace, event.sessionId);
      set((state) => {
        const chats = applyEvent(state.chats, key, event);
        return chats === state.chats ? state : { chats };
      });
      if (event.type === "run.end" || event.type === "client.done") {
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

/** Any session is running; settings use it to block writes to the shared config. */
export function useAnyChatRunning(): boolean {
  return useChatStore((state) => Object.values(state.chats).some((chat) => chat.running));
}

export function useChatHome(): HomeModel {
  const activePath = useWorkspaceStore((state) => state.activePath);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const chats = useChatStore((state) => state.chats);
  const activeByWorkspace = useChatStore((state) => state.activeByWorkspace);
  const defaultModel = usePreferencesStore((state) => state.preferences.defaultModel);
  const catalog = useCatalogStore((state) => state.catalog);
  return homeModel({ activePath, workspaces, chats, activeByWorkspace, defaultModel, catalog });
}

/** True on the home screen: no session, or a draft that has not started. */
export function useAtHome(): boolean {
  const active = useActiveChat();
  return !active || (active.draft && active.entries.length === 0 && !active.running);
}
