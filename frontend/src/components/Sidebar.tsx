import { useMemo, useState } from "react";
import { FolderClosed, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { groupByRecency, relativeTime, shortPath, workspaceName } from "../lib/history";
import type { ChatState, SessionInfo, Status } from "../lib/types";

/** How many chats a date group shows before offering "Show more". */
const PAGE_SIZE = 5;

interface Props {
  sessions: SessionInfo[];
  chats: Record<string, ChatState>;
  activeId?: string;
  status: Status;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (session: SessionInfo) => void;
  onDelete: (session: SessionInfo) => void;
}

export function Sidebar({ sessions, chats, activeId, status, onNew, onOpen, onRename, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const drafts = useMemo(
    () => Object.values(chats).filter((chat) => chat.draft && !sessions.some((session) => session.id === chat.id)),
    [chats, sessions],
  );
  const groups = useMemo(() => groupByRecency(sessions), [sessions]);
  const searching = query.trim() !== "";
  const matches = useMemo(() => {
    if (!searching) return [];
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => (session.title || session.id).toLowerCase().includes(needle));
  }, [query, searching, sessions]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="grid h-5 w-5 place-items-center rounded-[4px] bg-brand/15 text-[11px] font-semibold text-brand">
          L
        </span>
        <span className="text-[13px] font-medium tracking-[-0.01em] text-sidebar-foreground">lingzhu</span>
      </div>

      <div className="mx-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <FolderClosed className="size-4 shrink-0 text-ink-mid" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={status.workdir}>
            {workspaceName(status.workdir)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="New session"
                onClick={onNew}
                className="text-ink-mid hover:text-foreground"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New session</TooltipContent>
          </Tooltip>
        </div>
        <div className="truncate pl-6 text-[11px] leading-4 text-ink-faint">
          {status.workdir ? shortPath(status.workdir) : "not connected"}
        </div>
      </div>

      <div className="mt-3 flex h-7 items-center gap-1 pr-2 pl-3">
        <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">History</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={searchOpen ? "Close search" : "Search chats"}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              className="text-ink-faint hover:text-foreground"
            >
              {searchOpen ? <X /> : <Search />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{searchOpen ? "Close search" : "Search"}</TooltipContent>
        </Tooltip>
      </div>

      {searchOpen && (
        <div className="px-2 pb-1.5">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
            placeholder="Search chats"
            className="h-7 rounded-md border-border/70 bg-white/[0.03] px-2 text-[12px] shadow-none focus-visible:border-border focus-visible:ring-0"
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {searching ? (
          <div className="pt-1">
            <GroupLabel label={`${matches.length} result${matches.length === 1 ? "" : "s"}`} />
            {matches.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === activeId}
                running={chats[session.id]?.running}
                attention={(chats[session.id]?.pending.length ?? 0) > 0}
                onClick={() => onOpen(session.id)}
                onRename={() => onRename(session)}
                onDelete={() => onDelete(session)}
              />
            ))}
            {matches.length === 0 && <p className="px-2 py-2 text-[12px] text-ink-faint">No matches.</p>}
          </div>
        ) : (
          <>
            {drafts.length > 0 && (
              <div className="pt-1">
                <GroupLabel label="Drafts" />
                {drafts.map((chat) => (
                  <SessionRow
                    key={chat.id}
                    session={{ id: chat.id, title: chat.title, updated: "" }}
                    draft
                    active={chat.id === activeId}
                    running={chat.running}
                    onClick={() => onOpen(chat.id)}
                  />
                ))}
              </div>
            )}

            {groups.map((group) => {
              const limit = visible[group.key] ?? PAGE_SIZE;
              const hidden = group.sessions.length - limit;
              const isCollapsed = collapsed[group.key] ?? false;
              return (
                <div key={group.key} className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !isCollapsed }))}
                    className="flex h-6 w-full items-center gap-1 rounded px-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint transition hover:text-ink-mid"
                  >
                    <span className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </span>
                    {group.label}
                    <span className="ml-auto tabular-nums opacity-60">{group.sessions.length}</span>
                  </button>
                  {!isCollapsed &&
                    group.sessions.slice(0, limit).map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        active={session.id === activeId}
                        running={chats[session.id]?.running}
                        attention={(chats[session.id]?.pending.length ?? 0) > 0}
                        onClick={() => onOpen(session.id)}
                        onRename={() => onRename(session)}
                        onDelete={() => onDelete(session)}
                      />
                    ))}
                  {!isCollapsed && hidden > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setVisible((prev) => ({ ...prev, [group.key]: limit + PAGE_SIZE }))}
                      className="h-6 px-2 text-[11px] font-normal text-ink-faint hover:text-foreground"
                    >
                      Show {hidden} more
                    </Button>
                  )}
                </div>
              );
            })}

            {sessions.length === 0 && drafts.length === 0 && (
              <p className="px-2 pt-2 text-[12px] leading-5 text-ink-faint">No chats yet.</p>
            )}
          </>
        )}
      </nav>

      <div className="flex h-9 items-center gap-2 border-t border-sidebar-border px-3 text-[11px]">
        <span className={`h-1.5 w-1.5 rounded-full ${status.connected ? "bg-success" : "bg-danger"}`} />
        <span className="truncate text-ink-faint">{status.connected ? status.addr : "core offline"}</span>
      </div>
    </aside>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex h-6 items-center px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
      {label}
    </div>
  );
}

interface RowProps {
  session: SessionInfo;
  active: boolean;
  running?: boolean;
  attention?: boolean;
  draft?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function SessionRow({ session, active, running, attention, draft, onClick, onRename, onDelete }: RowProps) {
  return (
    <div
      onClick={onClick}
      className={`group/session flex h-8 cursor-default items-center gap-2 rounded-md pr-1 pl-2 text-[13px] transition ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-white/[0.03] hover:text-foreground"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">
        {draft && <span className="text-ink-faint">New · </span>}
        {session.title || session.id}
      </span>

      {attention ? (
        <span className="shrink-0 text-[11px] text-warning group-hover/session:hidden">Needs input</span>
      ) : running ? (
        <span className="shrink-0 text-[11px] text-brand group-hover/session:hidden">Working</span>
      ) : (
        !draft && (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-faint group-hover/session:hidden">
            {relativeTime(session.updated)}
          </span>
        )
      )}

      <span className="hidden shrink-0 items-center group-hover/session:flex">
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
            <TooltipContent side="bottom">Rename</TooltipContent>
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
            <TooltipContent side="bottom">Delete</TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
