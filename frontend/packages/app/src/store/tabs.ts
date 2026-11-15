import { create } from "zustand";
import type { ClosedSideTab, SideTab } from "../lib/sessionTabs";
import { workspaceName } from "../lib/history";
import { planTabDelete, removeTabsForSessions } from "../lib/sessionTabs";
import { chatKey, type ChatState, type SessionInfo } from "@lingzhu/ui/types";
import { useChatStore } from "./chat";
import { openDialog } from "./dialogs";
import { useViewStore } from "./view";
import { useWorkspaceStore } from "./workspaces";

export interface TabEntry {
  key: string;
  path: string;
  sessionID: string;
}

function readTabs(): TabEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("lingzhu.sessionTabs") ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (tab): tab is TabEntry =>
            tab && typeof tab.key === "string" && typeof tab.path === "string" && typeof tab.sessionID === "string",
        )
      : [];
  } catch {
    return [];
  }
}

interface TabsStore {
  tabs: TabEntry[];
  closed: TabEntry[];
  /** Last update timestamp each session was seen at. */
  seen: Record<string, string>;
  hydrate: () => void;

  addActiveTab: (path: string, sessionID: string) => void;
  removeTabs: (entries: Array<{ path: string; id: string }>) => void;
  select: (tab: SideTab) => void;
  close: (tab: SideTab) => void;
  closeOthers: (tab: SideTab) => void;
  closeAfter: (tab: SideTab) => void;
  deleteTab: (tab: SideTab) => Promise<void>;
  reopen: (key?: string) => void;
  openNew: (activeWorkspacePath?: string) => void;
  rename: (tab: SideTab, title: string) => void;
  reorder: (keys: string[]) => void;
  pruneRestored: (known: Map<string, Set<string>>, restored: Set<string>) => void;
  persist: (drafts: Set<string>) => void;
  markSeen: (seen: Record<string, string>) => void;
}

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: readTabs(),
  closed: [],
  seen: {},

  hydrate: () => set({ tabs: readTabs(), closed: [] }),

  addActiveTab: (path, sessionID) => {
    const key = chatKey(path, sessionID);
    set((state) =>
      state.tabs.some((tab) => tab.key === key)
        ? state
        : { tabs: [...state.tabs, { key, path, sessionID }] },
    );
  },

  removeTabs: (entries) => {
    if (entries.length === 0) return;
    const view = useViewStore.getState();
    const workspace = useWorkspaceStore.getState();
    const chat = useChatStore.getState();
    const activeKey = useWorkspaceStore.getState().activePath
      ? chatKey(
          useWorkspaceStore.getState().activePath!,
          useChatStore.getState().activeByWorkspace[useWorkspaceStore.getState().activePath!] ?? "",
        )
      : undefined;
    const { next, target, removedActive } = removeTabsForSessions(get().tabs, entries, activeKey);
    set({ tabs: next });
    if (next.length === 0) {
      view.showHome();
      return;
    }
    if (!removedActive) return;
    if (target) {
      view.showChat();
      workspace.select(target.path);
      void chat.open(target.path, target.sessionID);
    } else {
      view.showHome();
    }
  },

  select: (tab) => {
    const view = useViewStore.getState();
    if (tab.kind === "settings") {
      view.openSettings();
      return;
    }
    const entry = get().tabs.find((item) => item.key === tab.key);
    if (!entry) return;
    view.showChat();
    useWorkspaceStore.getState().select(entry.path);
    void useChatStore.getState().open(entry.path, entry.sessionID);
  },

  close: (tab) => {
    const view = useViewStore.getState();
    const chat = useChatStore.getState();
    if (tab.kind === "settings") {
      view.closeSettings();
      return;
    }
    const closed = get().tabs.find((item) => item.key === tab.key);
    const draft = !!chat.chats[tab.key]?.draft;
    if (closed && !draft) set({ closed: [...get().closed.slice(-19), closed] });
    if (draft && closed) chat.discard(closed.path, closed.sessionID);

    const tabs = get().tabs;
    const index = tabs.findIndex((item) => item.key === tab.key);
    const next = tabs.filter((item) => item.key !== tab.key);
    set({ tabs: next });
    if (next.length === 0) {
      view.showHome();
      return;
    }
    const activeKey = currentActiveKey();
    if (tab.key === activeKey) {
      const target = next[index] ?? next[index - 1];
      if (target) {
        view.showChat();
        useWorkspaceStore.getState().select(target.path);
        void chat.open(target.path, target.sessionID);
      }
    }
  },

  closeOthers: (tab) => {
    const view = useViewStore.getState();
    if (tab.kind === "settings") {
      set({ closed: [...get().closed, ...get().tabs].slice(-20), tabs: [] });
      view.openSettings();
      return;
    }
    const kept = get().tabs.filter((item) => item.key === tab.key);
    set({
      closed: [...get().closed, ...get().tabs.filter((item) => !kept.includes(item))].slice(-20),
      tabs: kept,
    });
    if (view.settingsOpen) view.closeSettings();
    get().select(tab);
  },

  closeAfter: (tab) => {
    const tabs = get().tabs;
    const index = tabs.findIndex((item) => item.key === tab.key);
    if (index === -1) return;
    const closing = tabs.slice(index + 1);
    if (closing.length === 0) return;
    const keys = new Set(closing.map((item) => item.key));
    set({
      closed: [...get().closed, ...closing].slice(-20),
      tabs: tabs.filter((item) => !keys.has(item.key)),
    });
    const activeKey = currentActiveKey();
    if (activeKey && keys.has(activeKey)) {
      useViewStore.getState().showChat();
      get().select(tab);
    }
  },

  deleteTab: async (tab) => {
    const entry = get().tabs.find((item) => item.key === tab.key);
    if (!entry) return;
    if (!useWorkspaceStore.getState().sessionsByWorkspace[entry.path]) {
      await useWorkspaceStore.getState().loadSessions(entry.path);
    }
    const loaded = useWorkspaceStore.getState().sessionsByWorkspace[entry.path];
    const plan = planTabDelete({
      tab,
      entry,
      tabs: get().tabs,
      activeKey: currentActiveKey(),
      sessions: loaded,
      chats: useChatStore.getState().chats as Record<string, ChatState | undefined>,
    });
    if (plan.draft || !plan.known) {
      useChatStore.getState().discard(entry.path, entry.sessionID);
      get().removeTabs([{ path: entry.path, id: entry.sessionID }]);
      return;
    }
    openDialog({ id: "delete", props: { workspace: entry.path, session: plan.session } });
  },

  reopen: (key) => {
    const entry = key ? get().closed.find((item) => item.key === key) : get().closed[get().closed.length - 1];
    if (!entry) return;
    set({ closed: get().closed.filter((item) => item.key !== entry.key) });
    useViewStore.getState().showChat();
    useWorkspaceStore.getState().select(entry.path);
    void useChatStore.getState().open(entry.path, entry.sessionID);
  },

  openNew: (activeWorkspacePath) => {
    if (activeWorkspacePath) void useChatStore.getState().newChat(activeWorkspacePath);
  },

  rename: (tab, title) => {
    const entry = get().tabs.find((item) => item.key === tab.key);
    if (!entry) return;
    void useWorkspaceStore
      .getState()
      .renameSession(entry.path, entry.sessionID, title)
      .then((ok) => {
        if (ok) useChatStore.getState().setTitle(entry.path, entry.sessionID, title);
      });
  },

  reorder: (keys) =>
    set((state) => {
      const byKey = new Map(state.tabs.map((tab) => [tab.key, tab]));
      return {
        tabs: keys.map((key) => byKey.get(key)).filter((tab): tab is TabEntry => tab !== undefined),
      };
    }),

  pruneRestored: (known, restored) =>
    set((state) => {
      const next = state.tabs.filter((tab) => {
        if (!restored.has(tab.key)) return true;
        const ids = known.get(tab.path);
        return ids ? ids.has(tab.sessionID) : true;
      });
      return next.length === state.tabs.length ? state : { tabs: next };
    }),

  persist: (drafts) => {
    localStorage.setItem("lingzhu.sessionTabs", JSON.stringify(get().tabs.filter((tab) => !drafts.has(tab.key))));
  },

  markSeen: (seen) => set({ seen }),
}));

function currentActiveKey() {
  const { activePath } = useWorkspaceStore.getState();
  const id = useChatStore.getState().activeByWorkspace[activePath ?? ""];
  return activePath && id ? chatKey(activePath, id) : undefined;
}

/** Sidebar rows for the open tabs. */
export function selectSideTabs(tabs: TabEntry[], chats: Record<string, ChatState>, sessionsByWorkspace: Record<string, SessionInfo[]>, unread: Set<string>): SideTab[] {
  return tabs.map((tab) => {
    const chat = chats[tab.key];
    const info = sessionsByWorkspace[tab.path]?.find((session) => session.id === tab.sessionID);
    const status = chat?.running
      ? "ongoing"
      : chat && (chat.pending.length > 0 || chat.questions.length > 0)
        ? "warning"
        : chat?.lastRunStatus === "failed"
          ? "failed"
          : undefined;
    return {
      key: tab.key,
      sessionID: tab.sessionID,
      label: chat?.title || info?.title || "New session",
      subtitle: workspaceName(tab.path),
      directory: tab.path,
      kind: "chat",
      draft: Boolean(chat?.draft),
      status,
      unread: unread.has(tab.key),
      closable: true,
    };
  });
}

export function selectClosedTabs(
  closed: TabEntry[],
  chats: Record<string, ChatState>,
  sessionsByWorkspace: Record<string, SessionInfo[]>,
): ClosedSideTab[] {
  return closed.map((entry) => {
    const chat = chats[entry.key];
    const info = sessionsByWorkspace[entry.path]?.find((session) => session.id === entry.sessionID);
    return {
      key: entry.key,
      label: chat?.title || info?.title || "New session",
      subtitle: workspaceName(entry.path),
    };
  });
}
