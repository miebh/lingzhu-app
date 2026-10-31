import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatState, SessionInfo, Status } from "../lib/types";

interface Props {
  sessions: SessionInfo[];
  drafts: ChatState[];
  activeId?: string;
  status: Status;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (session: SessionInfo) => void;
  onDelete: (session: SessionInfo) => void;
}

export function Sidebar({ sessions, drafts, activeId, status, onNew, onOpen, onRename, onDelete }: Props) {
  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="grid h-5 w-5 place-items-center rounded-[4px] bg-brand/15 text-[11px] font-semibold text-brand">
          L
        </span>
        <span className="text-[13px] font-medium tracking-[-0.01em] text-sidebar-foreground">lingzhu</span>
      </div>

      <div className="px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNew}
          className="h-8 w-full justify-start gap-2 px-2 text-[13px] font-normal text-sidebar-foreground hover:text-foreground"
        >
          <Plus />
          New session
        </Button>
      </div>

      <div className="px-3 pt-5 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Sessions</div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {drafts.map((chat) => (
          <Row key={chat.id} title={chat.title} active={chat.id === activeId} draft onClick={() => onOpen(chat.id)} />
        ))}
        {sessions.map((session) => (
          <Row
            key={session.id}
            title={session.title || session.id}
            active={session.id === activeId}
            onClick={() => onOpen(session.id)}
            onRename={() => onRename(session)}
            onDelete={() => onDelete(session)}
          />
        ))}
        {sessions.length === 0 && drafts.length === 0 && (
          <p className="px-2 pt-2 text-[12px] leading-5 text-ink-faint">No sessions yet.</p>
        )}
      </nav>

      <div className="flex h-9 items-center gap-2 border-t border-sidebar-border px-3 text-[11px]">
        <span className={`h-1.5 w-1.5 rounded-full ${status.connected ? "bg-success" : "bg-danger"}`} />
        <span className="truncate text-ink-faint">{status.connected ? status.addr : "core offline"}</span>
      </div>
    </aside>
  );
}

interface RowProps {
  title: string;
  active: boolean;
  draft?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function Row({ title, active, draft, onClick, onRename, onDelete }: RowProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex h-8 cursor-default items-center gap-1 rounded-md px-2 text-[13px] transition ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-white/[0.03] hover:text-foreground"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">
        {draft ? <span className="text-ink-faint">New · </span> : null}
        {title || "New session"}
      </span>
      <span className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
        {onRename && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Rename session"
                onClick={(event) => {
                  event.stopPropagation();
                  onRename();
                }}
                className="text-ink-faint hover:text-foreground"
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Rename</TooltipContent>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete session"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                className="text-ink-faint hover:text-danger"
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Delete</TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
