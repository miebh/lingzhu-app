import { useEffect, useRef, useState } from "react";
import { ArrowDown, Check, ChevronRight, CircleAlert, FileText, Search, Terminal } from "lucide-react";
import { CopyButton, Markdown } from "./Markdown";
import { formatDuration } from "../lib/format";
import type { ChatState, TimelineEntry, ToolRun } from "../lib/types";

export function Messages({ chat }: { chat: ChatState }) {
  const container = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const scrollToEnd = () => {
    const element = container.current;
    if (element) element.scrollTop = element.scrollHeight;
  };

  // Switching sessions starts at the newest content, never at the previous
  // session's scroll offset.
  useEffect(() => {
    pinned.current = true;
    setAwayFromBottom(false);
    scrollToEnd();
  }, [chat.id]);

  // A new turn pulls the view back down, even if the user had scrolled up.
  useEffect(() => {
    if (!chat.running) return;
    pinned.current = true;
    setAwayFromBottom(false);
  }, [chat.running]);

  useEffect(() => {
    if (pinned.current) scrollToEnd();
  }, [chat.entries]);

  // History arrives after the first paint; pin again once it is rendered.
  useEffect(() => {
    if (chat.loading) return;
    if (pinned.current) scrollToEnd();
  }, [chat.loading]);

  // The composer grows with its content; keeping the bottom pinned on container
  // resizes prevents the last message from jumping out of view while typing.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const element = container.current;
    if (!element) return;
    const near = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    pinned.current = near;
    setAwayFromBottom(!near);
  };

  const toBottom = () => {
    const element = container.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    pinned.current = true;
    setAwayFromBottom(false);
  };

  const empty = chat.entries.length === 0;
  const streaming = chat.entries.some((entry) => entry.live && entry.text);
  const working = chat.running && !streaming;

  if (chat.loading && empty) {
    return (
      <div className="flex-1 overflow-y-auto py-inset-panel">
        <div role="status" aria-label="Loading conversation" className="mx-auto flex w-full max-w-session flex-col gap-6 px-3">
          {[0, 1, 2].map((index) => (
            <div key={index} aria-hidden className="flex flex-col gap-2">
              <div className={`h-2 rounded-xs bg-bg-layer-02 motion-safe:animate-pulse ${index === 1 ? "w-2/3" : "w-1/2"}`} />
              <div className="h-2 w-full rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
              <div className="h-2 w-4/5 rounded-xs bg-bg-layer-01 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        onScroll={onScroll}
        aria-busy={chat.running}
        className="scroll-stable-both flex-1 overflow-y-auto pt-6 pb-4"
      >
        <div className="mx-auto flex w-full max-w-session flex-col px-3">
          {empty && <EmptyState />}

          {chat.entries.map((entry) => (
            <EntryView key={entry.key} entry={entry} />
          ))}

          {working && <RunningStatus startedAt={chat.runStartedAt} />}

          {chat.notice && <TimelineSeparator label={chat.notice} />}

          {chat.error && (
            <div className="mt-4 flex select-none items-start gap-2 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta leading-5 text-state-fg-danger">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="select-text">{chat.error}</span>
            </div>
          )}

          {chat.lastRunStatus && !chat.running && (
            <RunFooter status={chat.lastRunStatus} ms={chat.lastRunMs} />
          )}
        </div>
      </div>

      {awayFromBottom && (
        <button
          type="button"
          onClick={toBottom}
          aria-label="Scroll to latest"
          className="interactive absolute right-6 bottom-4 z-10 grid size-control-md place-items-center rounded-full border border-border-strong bg-bg-layer-02 text-text-muted"
        >
          <ArrowDown className="size-4" />
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="select-none py-24 text-center">
      <p className="text-reading text-text-base">Ask lingzhu to work in this project.</p>
      <p className="mx-auto mt-2 max-w-measure-narrow text-body leading-5 text-text-faint">
        It reads files, runs commands and edits code. Tool calls ask for permission first.
      </p>
    </div>
  );
}

/** One row of the ordered transcript: user turn, assistant text or tool call. */
function EntryView({ entry }: { entry: TimelineEntry }) {
  if (entry.role === "tool") {
    return entry.tool ? <ToolRow tool={entry.tool} /> : null;
  }
  if (entry.role === "user") {
    return <UserBubble text={entry.text ?? ""} pending={entry.pending} />;
  }
  if (!entry.text) return null;
  return <AssistantText text={entry.text} />;
}

/** Right-aligned user bubble; the action row reveals on hover or keyboard focus. */
function UserBubble({ text, pending }: { text: string; pending?: boolean }) {
  return (
    <div data-entry="user" className="group/user mt-6 flex flex-col items-end">
      <div
        data-pending={pending ? "true" : undefined}
        className="max-w-[min(82%,64ch)] rounded-[10px] bg-bg-layer-02 px-3 py-2 text-reading whitespace-pre-wrap text-text-base select-text"
      >
        {text}
      </div>
      <div className="mt-2 flex h-5 items-center opacity-0 transition-opacity group-focus-within/user:opacity-100 group-hover/user:opacity-100">
        <CopyButton text={text} label="Copy message" />
      </div>
    </div>
  );
}

/** Assistant reply: full-width Markdown with a hover-revealed copy footer. */
function AssistantText({ text }: { text: string }) {
  return (
    <div data-entry="assistant" className="group/assistant mt-6">
      <Markdown text={text} />
      <div className="mt-2 flex h-5 select-none items-center opacity-0 transition-opacity group-focus-within/assistant:opacity-100 group-hover/assistant:opacity-100">
        <CopyButton text={text} label="Copy response" />
      </div>
    </div>
  );
}

/** Timeline divider for context compaction, as a timeline separator. */
function TimelineSeparator({ label }: { label: string }) {
  return (
    <div className="my-2 flex h-8 select-none items-center gap-3 text-text-faint">
      <span className="h-px min-w-0 flex-1 bg-gradient-to-r from-transparent to-border-strong" />
      <span className="shrink-0 text-body">{label}</span>
      <span className="h-px min-w-0 flex-1 bg-gradient-to-l from-transparent to-border-strong" />
    </div>
  );
}

/** Live turn clock under the last content, matching a running row. */
function RunningStatus({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsed = startedAt === undefined ? "" : ` for ${formatDuration(now - startedAt)}`;

  return (
    <div className="mt-4 flex select-none items-center gap-2 text-body text-text-faint">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-text-accent" />
      <span>Working{elapsed}…</span>
    </div>
  );
}

function RunFooter({ status, ms }: { status: NonNullable<ChatState["lastRunStatus"]>; ms?: number }) {
  const label =
    status === "completed"
      ? "Completed"
      : status === "stopped"
        ? "Stopped"
        : status === "max-steps"
          ? "Step limit reached"
          : "Failed";
  return (
    <div className="mt-3 flex select-none items-center gap-2 text-caption text-text-faint">
      <span
        className={`size-1.5 rounded-full bg-current ${
          status === "completed"
            ? "text-state-fg-success"
            : status === "stopped"
              ? "text-text-faint"
              : status === "max-steps"
                ? "text-state-fg-warning"
                : "text-state-fg-danger"
        }`}
      />
      <span>{label}</span>
      {ms !== undefined && ms > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatDuration(ms)}</span>
        </>
      )}
    </div>
  );
}

/**
 * One tool call: a 28px trigger row (icon, name, argument subtitle, state) that
 * expands into an indented rail, following a compact tool row.
 */
function ToolRow({ tool }: { tool: ToolRun }) {
  const [open, setOpen] = useState(false);
  const running = !tool.done;
  const subtitle = toolSubtitle(tool.name, tool.arguments);

  return (
    <div data-entry="tool" className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="interactive group/tool flex h-7 w-full select-none items-center gap-2 rounded-xs px-1 text-left"
      >
        <ChevronRight
          className={`size-3 shrink-0 text-text-faint transition-transform ${open ? "rotate-90" : ""}`}
        />
        <ToolIcon name={tool.name} />
        <span className="shrink-0 text-body font-medium text-text-base">{tool.name}</span>
        {subtitle && (
          <span className="min-w-0 flex-1 truncate font-mono text-body text-text-muted">{subtitle}</span>
        )}
        {!subtitle && <span className="flex-1" />}
        {running ? (
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-text-accent" />
        ) : tool.failed ? (
          <span className="shrink-0 text-caption text-state-fg-danger">failed</span>
        ) : (
          <Check className="size-3.5 shrink-0 text-text-faint" />
        )}
      </button>

      {open && tool.output !== undefined && (
        <div className="mt-1 ml-2 border-l border-border-base py-1 pl-3">
          <pre className="max-h-60 select-text overflow-auto font-mono text-meta leading-5 whitespace-pre-wrap break-all text-text-muted">
            {tool.output || "(no output)"}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name: string }) {
  const className = "size-4 shrink-0 text-text-faint";
  if (name === "bash") return <Terminal className={className} />;
  if (name === "glob" || name === "grep") return <Search className={className} />;
  if (name === "read_file" || name === "write_file" || name === "edit") return <FileText className={className} />;
  return <CircleAlert className={className} />;
}

// toolSubtitle shows the most useful argument instead of raw JSON, matching the
// one-line titles of tool rows.
function toolSubtitle(name: string, args: string): string {
  if (!args) return "";
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    switch (name) {
      case "bash":
        return text(parsed.command);
      case "read_file":
      case "write_file":
      case "edit":
        return text(parsed.path);
      case "glob":
        return text(parsed.pattern);
      case "grep":
        return [text(parsed.pattern), text(parsed.include)].filter(Boolean).join(" · ");
      default:
        return text(Object.values(parsed).find((value) => typeof value === "string")) || args;
    }
  } catch {
    return args;
  }
}
