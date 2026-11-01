import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { applyEvent, nextEntryKey } from "../lib/chat-events";
import { messageOf } from "../lib/errors";
import { blankChat, chatKey, entriesFromMessages, type ChatState } from "../lib/types";
import { useCatalog } from "./CatalogProvider";
import { useNotify } from "./NotifyProvider";
import { usePreferences } from "./PreferencesProvider";
import { useLatest } from "./use-latest";
import { useView } from "./ViewProvider";
import { useWorkspaces } from "./WorkspaceProvider";

/** The model a not-yet-created session would use, and where it would be created. */
export interface HomeModel {
  path?: string;
  provider: string;
  model: string;
  window: number;
}

interface ChatValue {
  chats: Record<string, ChatState>;
  activeId?: string;
  active?: ChatState;
  /** True on the home screen: no session, or a draft that has not started. */
  atHome: boolean;
  /** Any session is running; settings use it to block writes to the shared config. */
  running: boolean;
  home: HomeModel;
  open: (workspace: string, sessionID: string) => Promise<void>;
  newChat: (workspace: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  startSession: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  selectModel: (providerID: string, modelID: string) => Promise<void>;
  reply: (requestID: string, decision: string) => Promise<void>;
  discard: (workspace: string, sessionID: string) => void;
  toggleWorkspaceDefault: () => void;
}

const ChatContext = createContext<ChatValue | undefined>(undefined);

/**
 * Every live session, keyed by workspace and session ID, plus the actions that
 * mutate them. Core events are folded in here so no surface parses the stream.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const notify = useNotify();
  const { preferences, save: savePreferences } = usePreferences();
  const { catalog } = useCatalog();
  const view = useView();
  const workspaces = useWorkspaces();

  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [activeByWorkspace, setActiveByWorkspace] = useState<Record<string, string>>({});
  const [homeSelection, setHomeSelection] = useState<{ provider?: string; model?: string }>({});

  const chatsRef = useLatest(chats);
  const preferencesRef = useLatest(preferences);
  const catalogRef = useLatest(catalog);
  const sessionsRef = useLatest(workspaces.sessionsByWorkspace);
  const workspacesRef = useLatest(workspaces.workspaces);

  const activePath = workspaces.activePath;
  const activePathRef = useLatest(activePath);
  const activeId = activePath ? activeByWorkspace[activePath] : undefined;
  const activeIdRef = useLatest(activeId);
  const active = activePath && activeId ? chats[chatKey(activePath, activeId)] : undefined;

  const { select: selectWorkspace, loadSessions, prependSession } = workspaces;
  const { showChat } = view;

  const activate = useCallback(
    (workspace: string, sessionID?: string) => {
      showChat();
      selectWorkspace(workspace);
      if (sessionID) setActiveByWorkspace((prev) => ({ ...prev, [workspace]: sessionID }));
    },
    [selectWorkspace, showChat],
  );

  const refreshChat = useCallback(async (workspace: string, sessionID: string, title = "") => {
    const key = chatKey(workspace, sessionID);
    try {
      const [messages, context, pending] = await Promise.all([
        api.messages(workspace, sessionID),
        api.context(workspace, sessionID),
        api.pending(workspace, sessionID),
      ]);
      setChats((prev) => {
        const chat = prev[key] ?? blankChat(sessionID, title);
        return {
          ...prev,
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
        };
      });
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? blankChat(sessionID, title)),
          loading: false,
          error: messageOf(error),
        },
      }));
    }
  }, []);

  const refreshContext = useCallback(async (workspace: string, sessionID: string) => {
    try {
      const context = await api.context(workspace, sessionID);
      const key = chatKey(workspace, sessionID);
      setChats((prev) => {
        const chat = prev[key];
        if (!chat) return prev;
        return { ...prev, [key]: { ...chat, tokens: context.tokens, window: context.window } };
      });
    } catch {
      // The context endpoint is informational; keep the previous numbers.
    }
  }, []);

  useEffect(() => {
    return api.onEvent((event) => {
      if (event.type === "permission.asked" && preferencesRef.current.autoApprove) {
        const id = String(event.data?.id ?? "");
        if (id) {
          void api
            .reply(event.workspace, event.sessionId, id, "once")
            .catch((error) => notify(messageOf(error)));
        }
      }
      const key = chatKey(event.workspace, event.sessionId);
      setChats((prev) => applyEvent(prev, key, event));
      if (event.type === "run.end" || event.type === "client.done") {
        void refreshChat(event.workspace, event.sessionId);
        void loadSessions(event.workspace);
      }
    });
  }, [loadSessions, notify, preferencesRef, refreshChat]);

  const sendTo = useCallback(
    async (
      workspace: string,
      sessionID: string,
      text: string,
      source: ChatState | undefined,
      providerID: string,
      modelID: string,
    ) => {
      const key = chatKey(workspace, sessionID);
      const chat = source ?? chatsRef.current[key] ?? blankChat(sessionID);
      const title = chat.title && chat.title !== "New session" ? chat.title : text.slice(0, 40);
      setChats((prev) => {
        const current = prev[key] ?? chat;
        return {
          ...prev,
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
        };
      });
      if (chat.draft) {
        prependSession(workspace, { id: sessionID, title, updated: new Date().toISOString() });
      }
      try {
        await api.send(
          workspace,
          sessionID,
          text,
          providerID || catalogRef.current?.provider || "",
          modelID || catalogRef.current?.model || "",
        );
        void refreshContext(workspace, sessionID);
      } catch (error) {
        setChats((prev) => {
          const failed = prev[key];
          if (!failed) return prev;
          return {
            ...prev,
            [key]: {
              ...failed,
              running: false,
              error: messageOf(error),
              entries: failed.entries.filter((entry) => !entry.pending),
            },
          };
        });
      }
    },
    [catalogRef, chatsRef, prependSession, refreshContext],
  );

  const open = useCallback(
    async (workspace: string, sessionID: string) => {
      activate(workspace, sessionID);
      const key = chatKey(workspace, sessionID);
      // A draft has no durable session yet; selecting it must not fetch history.
      if (chatsRef.current[key]?.draft) return;
      if (!chatsRef.current[key]) {
        const info = sessionsRef.current[workspace]?.find((session) => session.id === sessionID);
        setChats((prev) =>
          prev[key]
            ? prev
            : {
                ...prev,
                [key]: { ...blankChat(sessionID, info?.title ?? ""), draft: false, loading: true },
              },
        );
      }
      await refreshChat(workspace, sessionID);
    },
    [activate, chatsRef, refreshChat, sessionsRef],
  );

  const newChat = useCallback(
    async (workspace: string) => {
      // Only one draft may exist per workspace: reuse it instead of stacking a
      // second "New Session" row in the sidebar.
      const existing = Object.keys(chatsRef.current)
        .filter((key) => key.startsWith(`${workspace}\u0000`))
        .map((key) => chatsRef.current[key])
        .find((chat) => chat.draft);
      if (existing) {
        activate(workspace, existing.id);
        return;
      }
      try {
        const id = await api.newSessionID();
        const preferred = preferencesRef.current.workspaceModels[workspace];
        const providers = catalogRef.current?.providers ?? [];
        const usable =
          preferred &&
          providers.some(
            (provider) =>
              provider.id === preferred.provider && provider.models.some((entry) => entry.id === preferred.model),
          )
            ? preferred
            : undefined;
        setChats((prev) => ({
          ...prev,
          [chatKey(workspace, id)]: blankChat(
            id,
            "New session",
            usable?.provider ?? catalogRef.current?.provider,
            usable?.model ?? catalogRef.current?.model,
          ),
        }));
        activate(workspace, id);
      } catch (error) {
        notify(messageOf(error));
      }
    },
    [activate, catalogRef, chatsRef, notify, preferencesRef],
  );

  const send = useCallback(
    async (text: string) => {
      const path = activePathRef.current;
      const sessionID = activeIdRef.current;
      if (!path || !sessionID) return;
      const chat = chatsRef.current[chatKey(path, sessionID)];
      await sendTo(path, sessionID, text, chat, chat?.provider ?? "", chat?.model ?? "");
    },
    [activeIdRef, activePathRef, chatsRef, sendTo],
  );

  const homePath = activePath ?? workspaces.workspaces.find((workspace) => workspace.connected)?.path;
  const preferredHome = homePath ? preferences.workspaceModels[homePath] : undefined;
  const homeProvider = active?.provider ?? homeSelection.provider ?? preferredHome?.provider ?? catalog?.provider ?? "";
  const homeModel = active?.model ?? homeSelection.model ?? preferredHome?.model ?? catalog?.model ?? "";
  const homeWindow =
    catalog?.providers
      .find((provider) => provider.id === homeProvider)
      ?.models.find((model) => model.id === homeModel)?.contextWindow ?? 0;
  const home: HomeModel = { path: homePath, provider: homeProvider, model: homeModel, window: homeWindow };
  const homeRef = useLatest(home);

  /** Home composer: reuse an empty draft, otherwise create the session here. */
  const startSession = useCallback(
    async (text: string) => {
      const path = activePathRef.current ?? workspacesRef.current.find((workspace) => workspace.connected)?.path;
      if (!path) {
        notify("Add a workspace before starting a session");
        return;
      }
      const current =
        activePathRef.current === path && activeIdRef.current
          ? chatsRef.current[chatKey(path, activeIdRef.current)]
          : undefined;
      const draft = current?.draft && current.entries.length === 0 && !current.running ? current : undefined;
      const providerID = draft?.provider || homeRef.current.provider;
      const modelID = draft?.model || homeRef.current.model;
      if (draft) {
        await sendTo(path, draft.id, text, draft, providerID, modelID);
        return;
      }
      try {
        const id = await api.newSessionID();
        const chat = blankChat(id, "New session", providerID, modelID);
        setChats((prev) => ({ ...prev, [chatKey(path, id)]: chat }));
        activate(path, id);
        await sendTo(path, id, text, chat, providerID, modelID);
      } catch (error) {
        notify(messageOf(error));
      }
    },
    [activate, activeIdRef, activePathRef, chatsRef, homeRef, notify, sendTo, workspacesRef],
  );

  const stop = useCallback(async () => {
    const path = activePathRef.current;
    const sessionID = activeIdRef.current;
    if (!path || !sessionID) return;
    const key = chatKey(path, sessionID);
    try {
      await api.interrupt(path, sessionID);
    } catch (error) {
      setChats((prev) => {
        const chat = prev[key];
        if (!chat) return prev;
        return { ...prev, [key]: { ...chat, error: messageOf(error) } };
      });
    }
  }, [activeIdRef, activePathRef]);

  const selectModel = useCallback(
    async (providerID: string, modelID: string) => {
      const path = activePathRef.current;
      if (!path) return;
      const sessionID = activeIdRef.current;
      if (!sessionID) {
        setHomeSelection({ provider: providerID, model: modelID });
        return;
      }
      const key = chatKey(path, sessionID);
      const chat = chatsRef.current[key];
      if (!chat) return;
      const previous = { provider: chat.provider, model: chat.model };
      setChats((prev) => ({
        ...prev,
        [key]: { ...prev[key], provider: providerID, model: modelID },
      }));
      // A draft has no log yet; its first prompt persists the selection.
      if (chat.draft) return;
      try {
        await api.selectModel(path, sessionID, providerID, modelID);
      } catch (error) {
        setChats((prev) => ({ ...prev, [key]: { ...prev[key], ...previous } }));
        notify(messageOf(error));
      }
    },
    [activeIdRef, activePathRef, chatsRef, notify],
  );

  const reply = useCallback(
    async (requestID: string, decision: string) => {
      const path = activePathRef.current;
      const sessionID = activeIdRef.current;
      if (!path || !sessionID) return;
      const key = chatKey(path, sessionID);
      try {
        await api.reply(path, sessionID, requestID, decision);
        setChats((prev) => {
          const chat = prev[key];
          if (!chat) return prev;
          return { ...prev, [key]: { ...chat, pending: chat.pending.filter((item) => item.id !== requestID) } };
        });
      } catch (error) {
        setChats((prev) => {
          const chat = prev[key];
          if (!chat) return prev;
          return { ...prev, [key]: { ...chat, error: messageOf(error) } };
        });
      }
    },
    [activeIdRef, activePathRef],
  );

  const discard = useCallback((workspace: string, sessionID: string) => {
    const key = chatKey(workspace, sessionID);
    setChats((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveByWorkspace((prev) => (prev[workspace] === sessionID ? { ...prev, [workspace]: "" } : prev));
  }, []);

  const toggleWorkspaceDefault = useCallback(() => {
    const path = activePathRef.current;
    if (!path) return;
    const { provider: providerID, model: modelID } = homeRef.current;
    if (!providerID || !modelID) return;
    const current = preferencesRef.current.workspaceModels[path];
    const workspaceModels = { ...preferencesRef.current.workspaceModels };
    if (current && current.provider === providerID && current.model === modelID) {
      delete workspaceModels[path];
    } else {
      workspaceModels[path] = { provider: providerID, model: modelID };
    }
    void savePreferences({ ...preferencesRef.current, workspaceModels });
  }, [activePathRef, homeRef, preferencesRef, savePreferences]);

  const atHome = !active || (active.draft && active.entries.length === 0 && !active.running);
  const running = Object.values(chats).some((chat) => chat.running);

  const value: ChatValue = {
    chats,
    activeId,
    active,
    atHome,
    running,
    home,
    open,
    newChat,
    send,
    startSession,
    stop,
    selectModel,
    reply,
    discard,
    toggleWorkspaceDefault,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChats(): ChatValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChats must be used inside ChatProvider");
  return value;
}
