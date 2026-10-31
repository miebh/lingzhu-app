import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { blankChat, chatKey, type ChatState, type CoreEvent, type SessionInfo, type UsageTotals, type WorkspaceInfo } from "./lib/types";
import { workspaceName } from "./lib/history";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./components/Sidebar";
import { Messages } from "./components/Messages";
import { Composer } from "./components/Composer";
import { PermissionCard } from "./components/PermissionCard";
import { ConfirmDialog, RenameDialog } from "./components/Dialogs";
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
            messages,
            tools: [],
            liveText: "",
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
  };

  const open = async (workspace: string, sessionID: string) => {
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
      if (workspace !== activePathRef.current) setActivePath(workspace);
      setActiveByWorkspace((prev) => ({ ...prev, [workspace]: existing.id }));
      return;
    }
    try {
      const id = await api.newSessionID();
      const key = chatKey(workspace, id);
      setChats((prev) => ({ ...prev, [key]: blankChat(id) }));
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
    setChats((prev) => ({
      ...prev,
      [key]: {
        ...chat,
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
      },
    }));
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
      setChats((prev) => ({
        ...prev,
        [key]: { ...prev[key], running: false, error: messageOf(error) },
      }));
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

  const compact = async () => {
    if (!activePath || !activeId) return;
    try {
      await api.compact(activePath, activeId);
      await refreshChat(activePath, activeId);
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [chatKey(activePath, activeId)]: { ...prev[chatKey(activePath, activeId)], error: messageOf(error) },
      }));
    }
  };

  return (
    <div className="flex h-full bg-bg-base text-text-base">
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
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex h-12 shrink-0 select-none items-center gap-3 border-b border-border-weak px-inset-page">
              <span className="shrink-0 text-caption text-text-faint">{activeWorkspace?.name}</span>
              <h1 className="min-w-0 flex-1 truncate text-body font-medium text-text-base">{active.title || "New session"}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={compact}
                disabled={active.running || active.messages.length === 0}
                title="Summarize older context"
                className="font-normal text-text-muted hover:text-text-base"
              >
                Compact
              </Button>
            </header>

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
            <div className="grid size-12 place-items-center rounded-xl border border-border-base bg-bg-layer-01 text-body font-medium text-text-accent">
              L
            </div>
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
      </main>

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

  switch (event.type) {
    case "step.start":
      startedAt();
      break;
    case "text.delta":
      startedAt();
      next.liveText = chat.liveText + String(data.text ?? "");
      break;
    case "assistant.message":
      startedAt();
      next.messages = [...chat.messages, { role: "assistant", content: String(data.text ?? "") }];
      next.liveText = "";
      break;
    case "tool.call":
      startedAt();
      if (chat.liveText) {
        next.messages = [...chat.messages, { role: "assistant", content: chat.liveText }];
        next.liveText = "";
      }
      next.tools = [
        ...chat.tools,
        {
          id: String(data.id ?? ""),
          name: String(data.name ?? "tool"),
          arguments: String(data.arguments ?? ""),
          done: false,
        },
      ];
      break;
    case "tool.result":
      next.tools = chat.tools.map((tool) =>
        tool.id === String(data.id)
          ? { ...tool, output: String(data.output ?? ""), failed: Boolean(data.failed), done: true }
          : tool,
      );
      break;
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
      next.liveText = "";
      next.tools = chat.tools.map((tool) => (tool.done ? tool : { ...tool, done: true }));
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

  return { ...chats, [key]: next };
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
