import { useMemo, useState } from "react";
import { FolderClosed, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { groupByRecency, relativeTime, shortPath } from "../lib/history";
import { chatKey, type ChatState, type SessionInfo, type WorkspaceInfo } from "../lib/types";

/** How many chats a date group shows before offering "Show more". */
const PAGE_SIZE = 5;

interface Props {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  sessions: SessionInfo[];
  chats: Record<string, ChatState>;
  activeId?: string;
  onSelectWorkspace: (path: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onNew: (path: string) => void;
  onOpen: (path: string, id: string) => void;
  onRename: (path: string, session: SessionInfo) => void;
  onDelete: (path: string, session: SessionInfo) => void;
}

export function Sidebar({
  workspaces,
  activePath,
  sessions,
  chats,
  activeId,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onNew,
  onOpen,
  onRename,
  onDelete,
}: Props) {
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

  const connected = workspaces.filter((workspace) => workspace.connected).length;

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-11 items-center gap-2 px-3">
        <span className="grid h-5 w-5 place-items-center rounded-[4px] bg-brand/15 text-[11px] font-semibold text-brand">
          L
        </span>
        <span className="text-[13px] font-medium tracking-[-0.01em] text-sidebar-foreground">lingzhu</span>
      </div>

      <div className="flex h-7 items-center gap-1 pr-2 pl-3">
        <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Workspaces</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add workspace"
              onClick={onAddWorkspace}
              className="text-ink-faint hover:text-foreground"
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add workspace</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {workspaces.map((workspace) => {
          const active = workspace.path === activePath;
          return (
            <div key={workspace.path} className="pb-0.5">
              <div
                onClick={() => onSelectWorkspace(workspace.path)}
                title={workspace.error || workspace.path}
                className={`group/ws cursor-default rounded-lg px-2 py-1.5 transition ${
                  active ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <FolderClosed className={`size-4 shrink-0 ${active ? "text-foreground" : "text-ink-mid"}`} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{workspace.name}</span>
                  {!workspace.connected && <span className="shrink-0 text-[10px] text-danger">offline</span>}
                  <span className="hidden shrink-0 items-center group-hover/ws:flex">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`New session in ${workspace.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onNew(workspace.path);
                          }}
                          className="text-ink-faint hover:text-foreground"
                        >
                          <Plus />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">New session</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove workspace ${workspace.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveWorkspace(workspace.path);
                          }}
                          className="text-ink-faint hover:text-danger"
                        >
                          <X />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Remove workspace</TooltipContent>
                    </Tooltip>
                  </span>
                </div>
                <div className="truncate pl-6 text-[11px] leading-4 text-ink-faint">{shortPath(workspace.path)}</div>
                {workspace.error && (
                  <div className="truncate pl-6 text-[10px] leading-4 text-danger">{workspace.error}</div>
                )}
              </div>

              {active && (
                <div className="mt-0.5 ml-3 border-l border-sidebar-border pl-1">
                  <div className="flex h-7 items-center gap-1 pr-1 pl-2">
                    <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                      History
                    </span>
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
                    <div className="px-1 pb-1.5">
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

                  {searching ? (
                    <div className="pt-1">
                      <GroupLabel label={`${matches.length} result${matches.length === 1 ? "" : "s"}`} />
                      {matches.map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          active={session.id === activeId}
                          chat={chats[chatKey(workspace.path, session.id)]}
                          onClick={() => onOpen(workspace.path, session.id)}
                          onRename={() => onRename(workspace.path, session)}
                          onDelete={() => onDelete(workspace.path, session)}
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
                              chat={chat}
                              onClick={() => onOpen(workspace.path, chat.id)}
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
                                  chat={chats[chatKey(workspace.path, session.id)]}
                                  onClick={() => onOpen(workspace.path, session.id)}
                                  onRename={() => onRename(workspace.path, session)}
                                  onDelete={() => onDelete(workspace.path, session)}
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
                </div>
              )}
            </div>
          );
        })}

        {workspaces.length === 0 && (
          <p className="px-2 pt-2 text-[12px] leading-5 text-ink-faint">No workspaces. Add a directory to start.</p>
        )}
      </div>

      <div className="flex h-9 items-center gap-2 border-t border-sidebar-border px-3 text-[11px] text-ink-faint">
        <span className={`h-1.5 w-1.5 rounded-full ${connected > 0 ? "bg-success" : "bg-danger"}`} />
        <span className="truncate">
          {connected}/{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
        </span>
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
  chat?: ChatState;
  draft?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function SessionRow({ session, active, chat, draft, onClick, onRename, onDelete }: RowProps) {
  const running = chat?.running;
  const attention = (chat?.pending.length ?? 0) > 0;
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
