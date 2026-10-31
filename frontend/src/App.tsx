import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { blankChat, chatKey, type ChatState, type CoreEvent, type SessionInfo, type WorkspaceInfo } from "./lib/types";
import { workspaceName } from "./lib/history";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./components/Sidebar";
import { Messages } from "./components/Messages";
import { Composer } from "./components/Composer";
import { PermissionCard } from "./components/PermissionCard";

export default function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [activeByWorkspace, setActiveByWorkspace] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();

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
      setNotice(messageOf(error));
    }
  }, []);

  const loadSessions = useCallback(async (path: string) => {
    try {
      const list = await api.sessions(path);
      if (activePathRef.current === path) setSessions(list);
    } catch (error) {
      if (activePathRef.current === path) setSessions([]);
      setNotice(messageOf(error));
    }
  }, []);

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
        [key]: { ...(prev[key] ?? blankChat(sessionID, title)), error: messageOf(error) },
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
        if (event.workspace === activePathRef.current) void loadSessions(event.workspace);
      }
    });
    return off;
  }, [loadSessions, loadWorkspaces, refreshChat]);

  useEffect(() => {
    if (!activePath) {
      setSessions([]);
      return;
    }
    void loadSessions(activePath);
  }, [activePath, loadSessions]);

  const selectWorkspace = (path: string) => {
    if (path === activePathRef.current) return;
    setActivePath(path);
    setSessions([]);
  };

  const open = async (workspace: string, sessionID: string) => {
    if (workspace !== activePathRef.current) {
      setActivePath(workspace);
      setSessions([]);
    }
    setActiveByWorkspace((prev) => ({ ...prev, [workspace]: sessionID }));
    const key = chatKey(workspace, sessionID);
    if (!chats[key]) {
      const info = workspace === activePathRef.current ? sessions.find((session) => session.id === sessionID) : undefined;
      setChats((prev) => (prev[key] ? prev : { ...prev, [key]: { ...blankChat(sessionID, info?.title ?? ""), draft: false } }));
    }
    await refreshChat(workspace, sessionID);
  };

  const newChat = async (workspace: string) => {
    try {
      const id = await api.newSessionID();
      const key = chatKey(workspace, id);
      setChats((prev) => ({ ...prev, [key]: blankChat(id) }));
      if (workspace !== activePathRef.current) {
        setActivePath(workspace);
        setSessions([]);
      }
      setActiveByWorkspace((prev) => ({ ...prev, [workspace]: id }));
    } catch (error) {
      setNotice(messageOf(error));
    }
  };

  const send = async (text: string) => {
    if (!activePath || !activeId) return;
    const key = chatKey(activePath, activeId);
    const chat = chats[key] ?? blankChat(activeId);
    const title = chat.title && chat.title !== "New session" ? chat.title : text.slice(0, 40);
    setChats((prev) => ({
      ...prev,
      [key]: { ...chat, title, draft: false, running: true, error: undefined, notice: undefined },
    }));
    if (chat.draft) {
      setSessions((prev) => [{ id: activeId, title, updated: new Date().toISOString() }, ...prev]);
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

  const rename = async (workspace: string, session: SessionInfo) => {
    const title = window.prompt("Rename session", session.title);
    if (!title || title.trim() === "") return;
    try {
      await api.rename(workspace, session.id, title.trim());
      if (workspace === activePathRef.current) await loadSessions(workspace);
    } catch (error) {
      setNotice(messageOf(error));
    }
  };

  const remove = async (workspace: string, session: SessionInfo) => {
    if (!window.confirm(`Delete "${session.title || session.id}"?`)) return;
    try {
      await api.remove(workspace, session.id);
      if (workspace === activePathRef.current) {
        setSessions((prev) => prev.filter((item) => item.id !== session.id));
      }
      setChats((prev) => {
        const next = { ...prev };
        delete next[chatKey(workspace, session.id)];
        return next;
      });
      if (activeByWorkspace[workspace] === session.id) {
        setActiveByWorkspace((prev) => ({ ...prev, [workspace]: "" }));
      }
    } catch (error) {
      setNotice(messageOf(error));
    }
  };

  const addWorkspace = async () => {
    try {
      const info = await api.addWorkspace();
      await loadWorkspaces();
      if (info?.path) setActivePath(info.path);
    } catch (error) {
      setNotice(messageOf(error));
      await loadWorkspaces();
    }
  };

  const removeWorkspace = async (path: string) => {
    if (!window.confirm(`Remove workspace "${workspaceName(path)}"? Session data stays on disk.`)) return;
    try {
      await api.removeWorkspace(path);
      await loadWorkspaces();
      if (activePath === path) {
        setActivePath(undefined);
        setSessions([]);
      }
    } catch (error) {
      setNotice(messageOf(error));
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
    <div className="flex h-full bg-bg text-ink">
      <Sidebar
        workspaces={workspaces}
        activePath={activePath}
        sessions={sessions}
        chats={chats}
        activeId={activeId}
        onSelectWorkspace={selectWorkspace}
        onAddWorkspace={addWorkspace}
        onRemoveWorkspace={removeWorkspace}
        onNew={newChat}
        onOpen={open}
        onRename={rename}
        onDelete={remove}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {notice && (
          <div className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/[0.06] px-6 py-2 text-[12px] text-destructive">
            <span className="min-w-0 flex-1 truncate">{notice}</span>
            <button onClick={() => setNotice(undefined)} className="text-destructive/70 hover:text-destructive">
              Dismiss
            </button>
          </div>
        )}

        {active ? (
          <>
            <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line-weak px-6">
              <span className="shrink-0 text-[12px] text-ink-faint">{activeWorkspace?.name}</span>
              <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{active.title || "New session"}</h1>
              <span className="text-[11px] tabular-nums text-ink-faint">
                {active.window > 0 ? `${formatTokens(active.tokens)} / ${formatTokens(active.window)}` : "—"}
              </span>
              <div className="h-[3px] w-20 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    active.window > 0 && active.tokens / active.window > 0.8 ? "bg-warning" : "bg-brand"
                  }`}
                  style={{ width: `${active.window > 0 ? Math.min(100, (active.tokens / active.window) * 100) : 0}%` }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={compact}
                disabled={active.running || active.messages.length === 0}
                title="Summarize older context"
                className="font-normal text-ink-weak hover:text-foreground"
              >
                Compact
              </Button>
            </header>

            <Messages chat={active} />
            <PermissionCard requests={active.pending} onReply={reply} />
            <Composer running={active.running} disabled={!activeWorkspace?.connected} onSend={send} onStop={stop} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-[#141414] text-sm font-semibold text-brand">
              L
            </div>
            <div className="text-center">
              <p className="text-[13px] text-ink-mid">
                {workspaces.length === 0 ? "No workspace yet" : "No session selected"}
              </p>
              <p className="mt-1 text-[12px] text-ink-faint">
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
    </div>
  );
}

function applyEvent(chats: Record<string, ChatState>, key: string, event: CoreEvent): Record<string, ChatState> {
  const chat = chats[key];
  if (!chat) return chats;
  const data = event.data ?? {};
  const next: ChatState = { ...chat };

  switch (event.type) {
    case "text.delta":
      next.liveText = chat.liveText + String(data.text ?? "");
      break;
    case "assistant.message":
      next.messages = [...chat.messages, { role: "assistant", content: String(data.text ?? "") }];
      next.liveText = "";
      break;
    case "tool.call":
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
      break;
    case "compaction":
      next.notice = "Context compacted";
      break;
    case "run.end":
      next.running = false;
      next.liveText = "";
      next.tools = chat.tools.map((tool) => (tool.done ? tool : { ...tool, done: true }));
      break;
    case "client.done":
      next.running = false;
      break;
    case "client.error":
      next.running = false;
      next.error = String(data.message ?? "stream failed");
      break;
  }

  return { ...chats, [key]: next };
}

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatTokens(value: number): string {
  if (!value) return "0";
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}k`;
}
