import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { blankChat, chatKey, entriesFromMessages, type ChatState, type CoreEvent, type SessionInfo, type TimelineEntry, type UsageTotals, type WorkspaceInfo } from "./lib/types";
import { workspaceName } from "./lib/history";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Messages } from "./components/Messages";
import { Composer } from "./components/Composer";
import { PermissionCard } from "./components/PermissionCard";
import { ConfirmDialog, RenameDialog } from "./components/Dialogs";
import { SettingsPage } from "./components/SettingsPage";
import { TabBar, type AppTab, type AppTabID } from "./components/TabBar";
import { Toast, type ToastTone } from "./components/Toast";

interface Notice {
  id: number;
  text: string;
  tone: ToastTone;
}

export default function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionInfo[]>>({});
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [activeByWorkspace, setActiveByWorkspace] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<Notice>();
  const [renameTarget, setRenameTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [deleteTarget, setDeleteTarget] = useState<{ workspace: string; session: SessionInfo }>();
  const [removeWorkspaceTarget, setRemoveWorkspaceTarget] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<AppTabID>("chat");

  const toastID = useRef(0);
  const notify = useCallback((text: string, tone: ToastTone = "error") => {
    toastID.current += 1;
    setToast({ id: toastID.current, text, tone });
  }, []);

  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  const activeId = activePath ? activeByWorkspace[activePath] : undefined;
  const active = activePath && activeId ? chats[chatKey(activePath, activeId)] : undefined;
  const activeWorkspace = workspaces.find((workspace) => workspace.path === activePath);

  const loadWorkspaces = useCallback(async () => {
    try {
      const list = await api.workspaces();
      setWorkspaces(list);
      setActivePath((prev) => {
        if (prev && list.some((workspace) => workspace.path === prev)) return prev;
        const first = list.find((workspace) => workspace.connected) ?? list[0];
        return first?.path;
      });
    } catch (error) {
      notify(messageOf(error));
    }
  }, [notify]);

  const loadSessions = useCallback(async (path: string) => {
    try {
      const list = await api.sessions(path);
      setSessionsByWorkspace((prev) => ({ ...prev, [path]: list }));
    } catch (error) {
      setSessionsByWorkspace((prev) => ({ ...prev, [path]: [] }));
      notify(messageOf(error));
    }
  }, [notify]);

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

  useEffect(() => {
    void loadWorkspaces();
    const off = api.onEvent((event) => {
      const key = chatKey(event.workspace, event.sessionId);
      setChats((prev) => applyEvent(prev, key, event));
      if (event.type === "run.end" || event.type === "client.done") {
        void refreshChat(event.workspace, event.sessionId);
        void loadSessions(event.workspace);
      }
    });
    return off;
  }, [loadSessions, loadWorkspaces, refreshChat]);

  const selectWorkspace = (path: string) => {
    if (path === activePathRef.current) return;
    setActivePath(path);
    setTab("chat");
  };

  const open = async (workspace: string, sessionID: string) => {
    setTab("chat");
    if (workspace !== activePathRef.current) {
      setActivePath(workspace);
    }
    setActiveByWorkspace((prev) => ({ ...prev, [workspace]: sessionID }));
    const key = chatKey(workspace, sessionID);
    // A draft has no durable session yet; selecting it must not fetch history.
    if (chats[key]?.draft) return;
    if (!chats[key]) {
      const info = sessionsByWorkspace[workspace]?.find((session) => session.id === sessionID);
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
  };

  const newChat = async (workspace: string) => {
    // Only one draft may exist per workspace: reuse it instead of stacking a
    // second "New Session" row in the sidebar.
    const existing = Object.keys(chats)
      .filter((key) => key.startsWith(`${workspace}\u0000`))
      .map((key) => chats[key])
      .find((chat) => chat.draft);
    if (existing) {
      setTab("chat");
      if (workspace !== activePathRef.current) setActivePath(workspace);
      setActiveByWorkspace((prev) => ({ ...prev, [workspace]: existing.id }));
      return;
    }
    try {
      const id = await api.newSessionID();
      const key = chatKey(workspace, id);
      setChats((prev) => ({ ...prev, [key]: blankChat(id) }));
      setTab("chat");
      if (workspace !== activePathRef.current) {
        setActivePath(workspace);
      }
      setActiveByWorkspace((prev) => ({ ...prev, [workspace]: id }));
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const send = async (text: string) => {
    if (!activePath || !activeId) return;
    const key = chatKey(activePath, activeId);
    const chat = chats[key] ?? blankChat(activeId);
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
      setSessionsByWorkspace((prev) => ({
        ...prev,
        [activePath]: [{ id: activeId, title, updated: new Date().toISOString() }, ...(prev[activePath] ?? [])],
      }));
    }
    try {
      await api.send(activePath, activeId, text);
      void refreshContext(activePath, activeId);
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
  };

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

  const stop = async () => {
    if (!activePath || !activeId) return;
    try {
      await api.interrupt(activePath, activeId);
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [chatKey(activePath, activeId)]: { ...prev[chatKey(activePath, activeId)], error: messageOf(error) },
      }));
    }
  };

  const reply = async (requestID: string, decision: string) => {
    if (!activePath || !activeId) return;
    const key = chatKey(activePath, activeId);
    try {
      await api.reply(activePath, activeId, requestID, decision);
      setChats((prev) => {
        const chat = prev[key];
        if (!chat) return prev;
        return { ...prev, [key]: { ...chat, pending: chat.pending.filter((item) => item.id !== requestID) } };
      });
    } catch (error) {
      setChats((prev) => ({ ...prev, [key]: { ...prev[key], error: messageOf(error) } }));
    }
  };

  const requestRename = (workspace: string, session: SessionInfo) => {
    setRenameTarget({ workspace, session });
  };

  const confirmRename = async (title: string) => {
    const target = renameTarget;
    if (!target) return;
    setRenameTarget(undefined);
    try {
      await api.rename(target.workspace, target.session.id, title);
      if (target.workspace === activePathRef.current) await loadSessions(target.workspace);
      notify("Session renamed", "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const requestDelete = (workspace: string, session: SessionInfo) => {
    setDeleteTarget({ workspace, session });
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(undefined);
    try {
      await api.remove(target.workspace, target.session.id);
      setSessionsByWorkspace((prev) => ({
        ...prev,
        [target.workspace]: (prev[target.workspace] ?? []).filter((item) => item.id !== target.session.id),
      }));
      setChats((prev) => {
        const next = { ...prev };
        delete next[chatKey(target.workspace, target.session.id)];
        return next;
      });
      if (activeByWorkspace[target.workspace] === target.session.id) {
        setActiveByWorkspace((prev) => ({ ...prev, [target.workspace]: "" }));
      }
      notify("Session deleted", "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const addWorkspace = async () => {
    try {
      const info = await api.addWorkspace();
      await loadWorkspaces();
      if (info?.path) setActivePath(info.path);
      notify("Workspace added", "info");
    } catch (error) {
      notify(messageOf(error));
      await loadWorkspaces();
    }
  };

  const requestRemoveWorkspace = (path: string) => {
    setRemoveWorkspaceTarget(path);
  };

  const confirmRemoveWorkspace = async () => {
    const path = removeWorkspaceTarget;
    if (!path) return;
    setRemoveWorkspaceTarget(undefined);
    try {
      await api.removeWorkspace(path);
      await loadWorkspaces();
      setSessionsByWorkspace((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      if (activePath === path) {
        setActivePath(undefined);
      }
      notify("Workspace removed", "info");
    } catch (error) {
      notify(messageOf(error));
    }
  };

  const settingsSaved = async (reused: string[]) => {
    await loadWorkspaces();
    notify(
      reused.length > 0
        ? `Settings saved. Restart the shared core for ${reused.join(", ")} to apply.`
        : "Settings saved",
      "info",
    );
  };

  const openSettings = () => {
    setSettingsOpen(true);
    setTab("settings");
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    if (tab === "settings") setTab("chat");
  };

  const chatStatus: AppTab["status"] =
    active && active.pending.length > 0 ? "warning" : active?.running ? "ongoing" : undefined;
  const tabs: AppTab[] = [
    { id: "chat", label: active ? active.title || "New session" : "Chat", status: chatStatus },
    ...(settingsOpen ? [{ id: "settings" as const, label: "Settings", closable: true }] : []),
  ];

  return (
    <div className="flex h-full flex-col bg-bg-base text-text-base">
      <TitleBar
        workspace={tab === "settings" ? undefined : activeWorkspace?.name}
        title={tab === "settings" ? "Settings" : active ? active.title || "New session" : undefined}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          workspaces={workspaces}
          activePath={activePath}
          sessionsByWorkspace={sessionsByWorkspace}
          chats={chats}
          activeId={activeId}
          onSelectWorkspace={selectWorkspace}
          onLoadSessions={loadSessions}
          onAddWorkspace={addWorkspace}
          onRemoveWorkspace={requestRemoveWorkspace}
          onNew={newChat}
          onOpen={open}
          onRename={requestRename}
          onDelete={requestDelete}
          onOpenSettings={openSettings}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {settingsOpen && (
            <TabBar tabs={tabs} active={tab} onSelect={setTab} onClose={closeSettings} />
          )}

          <div className="relative flex min-h-0 flex-1">
            <div
              inert={tab === "settings" ? true : undefined}
              aria-hidden={tab === "settings" ? true : undefined}
              className={`flex min-h-0 flex-1 flex-col ${tab === "settings" ? "invisible" : ""}`}
            >
              {active ? (
                <>
                  <Messages chat={active} />
                  <PermissionCard requests={active.pending} onReply={reply} />
                  <Composer
                    running={active.running}
                    disabled={!activeWorkspace?.connected}
                    tokens={active.tokens}
                    window={active.window}
                    usage={active.usage}
                    onSend={send}
                    onStop={stop}
                  />
                </>
              ) : (
                <div className="flex flex-1 select-none flex-col items-center justify-center gap-4 px-inset-page">
                  <div className="text-center">
                    <p className="text-body text-text-muted">
                      {workspaces.length === 0 ? "No workspace yet" : "No session selected"}
                    </p>
                    <p className="mt-1 text-meta text-text-faint">
                      {workspaces.length === 0
                        ? "Add a directory to use as a workspace."
                        : "Pick a session on the left or start a new one."}
                    </p>
                  </div>
                  <Button onClick={() => (workspaces.length === 0 ? void addWorkspace() : activePath && void newChat(activePath))} disabled={workspaces.length > 0 && !activePath}>
                    {workspaces.length === 0 ? "Add workspace" : "New session"}
                  </Button>
                </div>
              )}
            </div>

            {settingsOpen && (
              <div
                className={`absolute inset-0 z-10 flex min-h-0 flex-col bg-bg-base ${
                  tab === "settings" ? "" : "invisible"
                }`}
              >
                <SettingsPage
                  busy={Object.values(chats).some((chat) => chat.running)}
                  onSaved={(reused) => void settingsSaved(reused)}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {toast && <Toast key={toast.id} text={toast.text} tone={toast.tone} onDone={() => setToast(undefined)} />}

      <RenameDialog
        open={renameTarget !== undefined}
        initial={renameTarget?.session.title ?? ""}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(undefined);
        }}
        onConfirm={(title) => void confirmRename(title)}
      />

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title="Delete session"
        description={`Delete "${deleteTarget?.session.title || deleteTarget?.session.id || "this session"}"? Its log is removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onConfirm={() => void confirmDelete()}
      />

      <ConfirmDialog
        open={removeWorkspaceTarget !== undefined}
        title="Remove workspace"
        description={`Remove "${removeWorkspaceTarget ? workspaceName(removeWorkspaceTarget) : ""}" from the sidebar? Session data stays on disk.`}
        confirmLabel="Remove"
        destructive
        onOpenChange={(open) => {
          if (!open) setRemoveWorkspaceTarget(undefined);
        }}
        onConfirm={() => void confirmRemoveWorkspace()}
      />
    </div>
  );
}

function applyEvent(chats: Record<string, ChatState>, key: string, event: CoreEvent): Record<string, ChatState> {
  const chat = chats[key];
  if (!chat) return chats;
  const data = event.data ?? {};
  const next: ChatState = { ...chat, loading: false };
  const startedAt = () => {
    if (next.runStartedAt === undefined) next.runStartedAt = Date.now();
  };
  let entries = chat.entries;

  switch (event.type) {
    case "user.message": {
      // The composer already rendered an optimistic row; adopt it instead of
      // stacking a second copy when the core echoes the prompt back.
      const text = String(data.text ?? "");
      const pendingAt = findLastIndex(entries, (entry) => entry.pending === true && entry.text === text);
      if (pendingAt >= 0) {
        entries = entries.map((entry, index) => (index === pendingAt ? { ...entry, pending: false } : entry));
      } else {
        entries = [...entries, { key: nextEntryKey("user"), role: "user", text }];
      }
      break;
    }
    case "step.start":
      startedAt();
      break;
    case "text.delta": {
      startedAt();
      const text = String(data.text ?? "");
      if (!text) break;
      const last = entries[entries.length - 1];
      if (last?.role === "assistant" && last.live) {
        entries = [...entries.slice(0, -1), { ...last, text: (last.text ?? "") + text }];
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text, live: true }];
      }
      break;
    }
    case "assistant.message": {
      startedAt();
      const text = String(data.text ?? "");
      const last = entries[entries.length - 1];
      // The streamed row is authoritative until this event confirms it.
      if (last?.role === "assistant" && last.live) {
        entries = [...entries.slice(0, -1), { ...last, text, live: false }];
      } else {
        entries = [...entries, { key: nextEntryKey("assistant"), role: "assistant", text }];
      }
      break;
    }
    case "tool.call":
      startedAt();
      entries = [
        ...entries,
        {
          key: nextEntryKey("tool"),
          role: "tool",
          tool: {
            id: String(data.id ?? ""),
            name: String(data.name ?? "tool"),
            arguments: String(data.arguments ?? ""),
            done: false,
          },
        },
      ];
      break;
    case "tool.result": {
      const id = String(data.id ?? "");
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool?.id === id && !entry.tool.done
          ? {
              ...entry,
              tool: {
                ...entry.tool,
                output: String(data.output ?? ""),
                failed: Boolean(data.failed),
                done: true,
              },
            }
          : entry,
      );
      break;
    }
    case "permission.asked":
      next.pending = [
        ...chat.pending,
        {
          id: String(data.id ?? ""),
          sessionId: event.sessionId,
          action: String(data.action ?? ""),
          resources: Array.isArray(data.resources) ? (data.resources as string[]) : [],
          message: data.message ? String(data.message) : undefined,
        },
      ];
      break;
    case "permission.replied":
      next.pending = chat.pending.filter((item) => item.id !== String(data.id));
      break;
    case "usage":
      next.tokens = Number(data.input ?? 0) + Number(data.cacheRead ?? 0);
      next.usage = addUsage(chat.usage, data);
      break;
    case "compaction":
      next.notice = "Context compacted";
      break;
    case "run.end": {
      const reason = String(data.reason ?? "done");
      next.running = false;
      // The checkpoint message already marks the compaction in history; the
      // live separator only belongs to the turn that produced it.
      next.notice = undefined;
      entries = entries.map((entry) =>
        entry.role === "tool" && entry.tool && !entry.tool.done
          ? { ...entry, tool: { ...entry.tool, done: true } }
          : entry,
      );
      next.lastRunStatus =
        reason === "done"
          ? "completed"
          : reason === "interrupted"
            ? "stopped"
            : reason === "max_steps"
              ? "max-steps"
              : "failed";
      next.lastRunMs = chat.runStartedAt === undefined ? undefined : Date.now() - chat.runStartedAt;
      next.runEndedAt = Date.now();
      next.runStartedAt = undefined;
      break;
    }
    case "client.done":
      next.running = false;
      break;
    case "client.error":
      next.running = false;
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "stream failed");
      break;
    case "error":
      next.running = false;
      next.lastRunStatus = "failed";
      next.error = String(data.message ?? "run failed");
      break;
  }

  next.entries = entries;
  return { ...chats, [key]: next };
}

let entryID = 0;
function nextEntryKey(prefix: string): string {
  entryID += 1;
  return `${prefix}-${entryID}`;
}

function findLastIndex(entries: TimelineEntry[], match: (entry: TimelineEntry) => boolean): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (match(entries[index])) return index;
  }
  return -1;
}

function addUsage(previous: UsageTotals | undefined, data: Record<string, unknown>): UsageTotals {
  return {
    input: (previous?.input ?? 0) + Number(data.input ?? 0),
    output: (previous?.output ?? 0) + Number(data.output ?? 0),
    cacheRead: (previous?.cacheRead ?? 0) + Number(data.cacheRead ?? 0),
    cacheWrite: (previous?.cacheWrite ?? 0) + Number(data.cacheWrite ?? 0),
  };
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
