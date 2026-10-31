import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Copy, FileText, Search, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatState, Message, ToolRun } from "../lib/types";

export function Messages({ chat }: { chat: ChatState }) {
  const container = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // History carries tool results but not their arguments, so pair them with the
  // assistant tool calls that produced them.
  const argumentsByID = new Map<string, string>();
  for (const message of chat.messages) {
    for (const call of message.toolCalls ?? []) {
      argumentsByID.set(call.id, call.arguments);
    }
  }

  useEffect(() => {
    const element = container.current;
    if (element && pinned.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [chat.messages.length, chat.liveText, chat.tools.length, chat.running]);

  const onScroll = () => {
    const element = container.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  const empty = chat.messages.length === 0 && chat.tools.length === 0 && !chat.liveText;
  const working = chat.running && !chat.liveText && chat.tools.every((tool) => tool.done);

  return (
    <div ref={container} onScroll={onScroll} className="flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-[736px] flex-col gap-5">
        {empty && (
          <div className="mt-28 text-center">
            <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-sm font-semibold text-brand">
              L
            </div>
            <p className="text-[13px] text-ink-mid">Ask lingzhu to work in this project.</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-5 text-ink-faint">
              It reads files, runs commands and edits code. Tool calls ask for permission first.
            </p>
          </div>
        )}

        {chat.messages.map((message, index) => (
          <MessageView key={index} message={message} argumentsByID={argumentsByID} />
        ))}

        {chat.tools.map((tool) => (
          <ToolRow key={tool.id} tool={tool} />
        ))}

        {chat.liveText && (
          <div className="whitespace-pre-wrap text-[14px] leading-[1.65] text-foreground">
            {chat.liveText}
            <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-brand align-middle" />
          </div>
        )}

        {working && (
          <div className="flex items-center gap-1.5 py-0.5 text-[13px] text-ink-faint">
            <span className="thinking-dot h-1 w-1 rounded-full bg-ink-weak" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-ink-weak" />
            <span className="thinking-dot h-1 w-1 rounded-full bg-ink-weak" />
            <span className="ml-1">Working…</span>
          </div>
        )}

        {chat.notice && (
          <div className="flex items-center gap-3 py-1 text-[12px] text-ink-faint">
            <span className="h-px flex-1 bg-line-weak" />
            {chat.notice}
            <span className="h-px flex-1 bg-line-weak" />
          </div>
        )}

        {chat.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[12px] leading-5 text-destructive">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{chat.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageView({ message, argumentsByID }: { message: Message; argumentsByID: Map<string, string> }) {
  if (message.role === "tool") {
    return (
      <ToolRow
        tool={{
          id: message.toolCallId ?? "",
          name: message.name || "tool",
          arguments: argumentsByID.get(message.toolCallId ?? "") ?? "",
          output: message.content,
          done: true,
        }}
      />
    );
  }
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-[10px] bg-white/[0.06] px-3.5 py-2 text-[14px] leading-[1.6] text-foreground">
        {message.content}
      </div>
    );
  }
  if (!message.content) return null;
  return <AssistantText text={message.content} />;
}

function AssistantText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group/assistant relative whitespace-pre-wrap text-[14px] leading-[1.65] text-foreground">
      {text}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy response"
            onClick={() => void copy()}
            className="absolute -top-1 right-0 hidden text-ink-faint group-hover/assistant:inline-flex"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{copied ? "Copied" : "Copy response"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolRun }) {
  const [open, setOpen] = useState(false);
  const running = !tool.done;
  const subtitle = toolSubtitle(tool.name, tool.arguments);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/70 bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] [&[data-state=open]>svg:first-child]:rotate-90">
        <ChevronRight className="size-3 shrink-0 text-ink-faint transition-transform" />
        <ToolIcon name={tool.name} />
        <span className="shrink-0 text-ink-mid">{tool.name}</span>
        {subtitle && <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-faint">{subtitle}</span>}
        {!subtitle && <span className="flex-1" />}
        {running ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
        ) : tool.failed ? (
          <span className="text-[11px] text-destructive">failed</span>
        ) : (
          <Check className="size-3 text-ink-faint" />
        )}
      </CollapsibleTrigger>
      {tool.output !== undefined && (
        <CollapsibleContent>
          <pre className="max-h-64 overflow-auto border-t border-border/60 px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre-wrap text-ink-weak">
            {tool.output || "(no output)"}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function ToolIcon({ name }: { name: string }) {
  const className = "size-3.5 shrink-0 text-ink-faint";
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
