import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api";
import { blankChat, type ChatState, type CoreEvent, type SessionInfo, type Status } from "./lib/types";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./components/Sidebar";
import { Messages } from "./components/Messages";
import { Composer } from "./components/Composer";
import { PermissionCard } from "./components/PermissionCard";

const emptyStatus: Status = { connected: false, addr: "", owned: false, logPath: "", workdir: "", error: "" };

export default function App() {
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const [activeId, setActiveId] = useState<string>();

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.sessions());
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: messageOf(error) }));
    }
  }, []);

  const refreshChat = useCallback(async (id: string) => {
    try {
      const [messages, context, pending] = await Promise.all([
        api.messages(id),
        api.context(id),
        api.pending(id),
      ]);
      setChats((prev) => {
        const chat = prev[id] ?? blankChat(id, "");
        return {
          ...prev,
          [id]: {
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
        [id]: { ...(prev[id] ?? blankChat(id)), error: messageOf(error) },
      }));
    }
  }, []);

  const refreshContext = useCallback(async (id: string) => {
    try {
      const context = await api.context(id);
      setChats((prev) => {
        const chat = prev[id];
        if (!chat) return prev;
        return { ...prev, [id]: { ...chat, tokens: context.tokens, window: context.window } };
      });
    } catch {
      // The context endpoint is informational; keep the previous numbers.
    }
  }, []);

  useEffect(() => {
    void api.status().then(setStatus).catch((error) => setStatus({ ...emptyStatus, error: messageOf(error) }));
    void loadSessions();
    const offStatus = api.onStatus(setStatus);
    return offStatus;
  }, [loadSessions]);

  useEffect(() => {
    const off = api.onEvent((event) => {
      setChats((prev) => applyEvent(prev, event));
      if (event.type === "run.end" || event.type === "client.done") {
        void refreshChat(event.sessionId);
        void loadSessions();
      }
    });
    return off;
  }, [loadSessions, refreshChat]);

  const open = async (id: string) => {
    setActiveId(id);
    const chat = chats[id];
    if (!chat) {
      const info = sessions.find((session) => session.id === id);
      setChats((prev) =>
        prev[id]
          ? prev
          : { ...prev, [id]: { ...blankChat(id, info?.title ?? ""), draft: false } },
      );
    }
    if (!chat || !chat.draft) {
      await refreshChat(id);
    }
  };

  const newChat = async () => {
    try {
      const id = await api.newSessionID();
      setChats((prev) => ({ ...prev, [id]: blankChat(id) }));
      setActiveId(id);
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: messageOf(error) }));
    }
  };

  const send = async (text: string) => {
    if (!activeId) return;
    const chat = chats[activeId] ?? blankChat(activeId);
    const title = chat.title && chat.title !== "New session" ? chat.title : text.slice(0, 40);
    setChats((prev) => ({
      ...prev,
      [activeId]: {
        ...chat,
        title,
        draft: false,
        running: true,
        error: undefined,
        notice: undefined,
      },
    }));
    if (chat.draft) {
      setSessions((prev) => [{ id: activeId, title, updated: new Date().toISOString() }, ...prev]);
    }
    try {
      await api.send(activeId, text);
      void refreshContext(activeId);
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], running: false, error: messageOf(error) },
      }));
    }
  };

  const stop = async () => {
    if (!activeId) return;
    try {
      await api.interrupt(activeId);
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], error: messageOf(error) },
      }));
    }
  };

  const reply = async (requestID: string, decision: string) => {
    if (!activeId) return;
    try {
      await api.reply(activeId, requestID, decision);
      setChats((prev) => {
        const chat = prev[activeId];
        if (!chat) return prev;
        return {
          ...prev,
          [activeId]: { ...chat, pending: chat.pending.filter((item) => item.id !== requestID) },
        };
      });
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], error: messageOf(error) },
      }));
    }
  };

  const rename = async (session: SessionInfo) => {
    const title = window.prompt("Rename session", session.title);
    if (!title || title.trim() === "") return;
    try {
      await api.rename(session.id, title.trim());
      await loadSessions();
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: messageOf(error) }));
    }
  };

  const remove = async (session: SessionInfo) => {
    if (!window.confirm(`Delete "${session.title || session.id}"?`)) return;
    try {
      await api.remove(session.id);
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
      setChats((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      if (activeId === session.id) setActiveId(undefined);
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: messageOf(error) }));
    }
  };

  const compact = async () => {
    if (!activeId) return;
    try {
      await api.compact(activeId);
      await refreshChat(activeId);
    } catch (error) {
      setChats((prev) => ({
        ...prev,
        [activeId]: { ...prev[activeId], error: messageOf(error) },
      }));
    }
  };

  const active = activeId ? chats[activeId] : undefined;

  return (
    <div className="flex h-full bg-bg text-ink">
      <Sidebar
        sessions={sessions}
        chats={chats}
        activeId={activeId}
        status={status}
        onNew={newChat}
        onOpen={open}
        onRename={rename}
        onDelete={remove}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line-weak px-6">
              <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {active.title || "New session"}
              </h1>
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
            <Composer running={active.running} disabled={!status.connected} onSend={send} onStop={stop} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-[#141414] text-sm font-semibold text-brand">
              L
            </div>
            <div className="text-center">
              <p className="text-[13px] text-ink-mid">No session selected</p>
              <p className="mt-1 text-[12px] text-ink-faint">Pick one on the left or start a new session.</p>
            </div>
            <Button onClick={newChat} disabled={!status.connected}>
              New session
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function applyEvent(chats: Record<string, ChatState>, event: CoreEvent): Record<string, ChatState> {
  const chat = chats[event.sessionId];
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

  return { ...chats, [event.sessionId]: next };
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
