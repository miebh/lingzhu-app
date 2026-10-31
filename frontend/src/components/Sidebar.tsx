import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "../lib/history";
import { chatKey, type ChatState, type SessionInfo, type WorkspaceInfo } from "../lib/types";

/** Sessions shown per workspace before "Show more". */
const PAGE_SIZE = 5;

interface Props {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  chats: Record<string, ChatState>;
  activeId?: string;
  onSelectWorkspace: (path: string) => void;
  onLoadSessions: (path: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onNew: (path: string) => void;
  onOpen: (path: string, id: string) => void;
  onRename: (path: string, session: SessionInfo) => void;
  onDelete: (path: string, session: SessionInfo) => void;
}

interface SearchHit {
  workspace: WorkspaceInfo;
  session: SessionInfo;
  chat?: ChatState;
  draft?: boolean;
}

export function Sidebar({
  workspaces,
  activePath,
  sessionsByWorkspace,
  chats,
  activeId,
  onSelectWorkspace,
  onLoadSessions,
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

  // The active workspace always reveals its sessions; a user fold only hides groups they are not working in.
  useEffect(() => {
    if (!activePath) return;
    onLoadSessions(activePath);
    setCollapsed((prev) => (prev[activePath] === false ? prev : { ...prev, [activePath]: false }));
  }, [activePath, onLoadSessions]);

  const draftsByWorkspace = useMemo(() => {
    const map = new Map<string, ChatState[]>();
    for (const [key, chat] of Object.entries(chats)) {
      if (!chat.draft) continue;
      const separator = key.indexOf("\u0000");
      const workspace = separator === -1 ? "" : key.slice(0, separator);
      const list = map.get(workspace) ?? [];
      list.push(chat);
      map.set(workspace, list);
    }
    return map;
  }, [chats]);

  const sortedSessions = useMemo(() => {
    const map: Record<string, SessionInfo[]> = {};
    for (const [path, list] of Object.entries(sessionsByWorkspace)) {
      map[path] = [...list].sort((a, b) => updatedAt(b) - updatedAt(a));
    }
    return map;
  }, [sessionsByWorkspace]);

  const searching = query.trim() !== "";
  const results = useMemo<SearchHit[]>(() => {
    if (!searching) return [];
    const needle = query.trim().toLowerCase();
    const hits: SearchHit[] = [];
    for (const workspace of workspaces) {
      const durable = sortedSessions[workspace.path] ?? [];
      const durableIDs = new Set(durable.map((session) => session.id));
      for (const chat of draftsByWorkspace.get(workspace.path) ?? []) {
        if (durableIDs.has(chat.id)) continue;
        if (!"new session".includes(needle)) continue;
        hits.push({
          workspace,
          session: { id: chat.id, title: "New Session", updated: "" },
          chat,
          draft: true,
        });
      }
      for (const session of durable) {
        if ((session.title || session.id).toLowerCase().includes(needle)) {
          hits.push({ workspace, session, chat: chats[chatKey(workspace.path, session.id)] });
        }
      }
    }
    return hits;
  }, [searching, query, workspaces, sortedSessions, draftsByWorkspace, chats]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const startSearch = () => {
    setSearchOpen(true);
    for (const workspace of workspaces) {
      if (workspace.connected) onLoadSessions(workspace.path);
    }
  };

  const toggleWorkspace = (path: string) => {
    const isActive = path === activePath;
    const isCollapsed = collapsed[path] ?? !isActive;
    if (!isActive) {
      onSelectWorkspace(path);
      onLoadSessions(path);
      setCollapsed((prev) => ({ ...prev, [path]: false }));
      return;
    }
    if (isCollapsed) onLoadSessions(path);
    setCollapsed((prev) => ({ ...prev, [path]: !isCollapsed }));
  };

  const openHit = (hit: SearchHit) => {
    onOpen(hit.workspace.path, hit.session.id);
    closeSearch();
  };

  const connected = workspaces.filter((workspace) => workspace.connected).length;
  const newSession = () => {
    const path = activePath ?? workspaces.find((workspace) => workspace.connected)?.path;
    if (path) onNew(path);
  };

  return (
    <aside aria-label="Workspaces" className="flex h-full w-sidebar shrink-0 select-none flex-col border-r border-border-base bg-bg-base">
      <div className="flex h-12 items-center gap-2 px-3">
        <span className="grid size-control-xs place-items-center rounded-xs bg-bg-accent-soft text-caption font-medium text-text-accent">
          L
        </span>
        <span className="text-body font-medium text-text-base">lingzhu</span>
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={newSession}
          disabled={!activePath && !workspaces.some((workspace) => workspace.connected)}
          className="interactive flex h-control-md w-full items-center justify-center gap-2 rounded-md border border-border-base bg-bg-layer-01 text-row font-medium text-text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          New session
        </button>
      </div>

      <div className="flex h-control-md items-center gap-1 pr-2 pl-3">
        {searchOpen ? (
          <>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-text-faint" />
              <Input
                autoFocus
                size="sm"
                value={query}
                aria-label="Search sessions"
                placeholder="Search sessions"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSearch();
                }}
                className="pl-6 text-meta"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close search"
              onClick={closeSearch}
              className="text-text-faint hover:text-text-base"
            >
              <X />
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-body font-medium text-text-faint">Workspaces</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Search sessions"
                  onClick={startSearch}
                  className="text-text-faint hover:text-text-base"
                >
                  <Search />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Search sessions</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Add workspace"
                  onClick={onAddWorkspace}
                  className="text-text-faint hover:text-text-base"
                >
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add workspace</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      <div role="tree" aria-label="Sessions" className="scroll-stable flex-1 overflow-y-auto px-2 pb-3">
        {searching ? (
          <div role="group" className="pt-1">
            <div className="flex h-6 items-center px-2 text-caption text-text-faint">
              {results.length} result{results.length === 1 ? "" : "s"}
            </div>
            {results.map((hit) => (
              <SessionRow
                key={`${hit.workspace.path}:${hit.session.id}`}
                session={hit.session}
                workspaceName={hit.workspace.name}
                active={hit.workspace.path === activePath && hit.session.id === activeId}
                chat={hit.chat}
                draft={hit.draft}
                variant="search"
                onClick={() => openHit(hit)}
                onRename={hit.draft ? undefined : () => onRename(hit.workspace.path, hit.session)}
                onDelete={hit.draft ? undefined : () => onDelete(hit.workspace.path, hit.session)}
              />
            ))}
            {results.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-faint">
                <Search className="size-6" />
                <p className="text-meta">No matches.</p>
              </div>
            )}
          </div>
        ) : (
          workspaces.map((workspace) => {
            const isActive = workspace.path === activePath;
            const isCollapsed = collapsed[workspace.path] ?? !isActive;
            const durable = sortedSessions[workspace.path] ?? [];
            const loadingSessions = sessionsByWorkspace[workspace.path] === undefined;
            const draftRows = (draftsByWorkspace.get(workspace.path) ?? []).filter(
              (chat) => !durable.some((session) => session.id === chat.id),
            );
            const limit = visible[workspace.path] ?? PAGE_SIZE;
            const hidden = Math.max(0, durable.length - limit);
            return (
              <div key={workspace.path} className="pb-1">
                <WorkspaceRow
                  workspace={workspace}
                  active={isActive}
                  expanded={!isCollapsed}
                  onToggle={() => toggleWorkspace(workspace.path)}
                  onNew={() => onNew(workspace.path)}
                  onRemove={() => onRemoveWorkspace(workspace.path)}
                />

                {!isCollapsed && (
                  <div role="group">
                    {loadingSessions && <SkeletonSessions />}
                    {draftRows.map((chat) => (
                      <SessionRow
                        key={chat.id}
                        session={{ id: chat.id, title: "New Session", updated: "" }}
                        active={isActive && chat.id === activeId}
                        chat={chat}
                        draft
                        onClick={() => onOpen(workspace.path, chat.id)}
                      />
                    ))}
                    {durable.slice(0, limit).map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        active={isActive && session.id === activeId}
                        chat={chats[chatKey(workspace.path, session.id)]}
                        onClick={() => onOpen(workspace.path, session.id)}
                        onRename={() => onRename(workspace.path, session)}
                        onDelete={() => onDelete(workspace.path, session)}
                      />
                    ))}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVisible((prev) => ({ ...prev, [workspace.path]: limit + PAGE_SIZE }))
                        }
                        className="interactive flex h-6 w-full items-center rounded-xs pr-2 pl-8 text-caption text-text-faint hover:text-text-base"
                      >
                        Show {hidden} more
                      </button>
                    )}
                    {hidden === 0 && limit > PAGE_SIZE && (
                      <button
                        type="button"
                        onClick={() => setVisible((prev) => ({ ...prev, [workspace.path]: PAGE_SIZE }))}
                        className="interactive flex h-6 w-full items-center rounded-xs pr-2 pl-8 text-caption text-text-faint hover:text-text-base"
                      >
                        Show less
                      </button>
                    )}
                    {!loadingSessions && draftRows.length === 0 && durable.length === 0 && (
                      <div className="flex flex-col items-center gap-2 px-4 py-4 text-center text-text-faint">
                        <MessageSquarePlus className="size-5" />
                        <p className="text-meta">No sessions yet.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {workspaces.length === 0 && !searching && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text-faint">
            <FolderClosed className="size-6" />
            <p className="text-meta">No workspaces yet.</p>
            <Button variant="outline" size="sm" onClick={onAddWorkspace}>
              Add workspace
            </Button>
          </div>
        )}
      </div>

      <div className="flex h-control-md items-center gap-2 border-t border-border-base px-3 text-caption text-text-faint">
        <span className={`size-1.5 rounded-full bg-current ${connected > 0 ? "text-state-fg-success" : "text-state-fg-danger"}`} />
        <span className="truncate">
          {connected}/{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
        </span>
      </div>
    </aside>
  );
}

interface RowProps {
  session: SessionInfo;
  active: boolean;
  chat?: ChatState;
  draft?: boolean;
  workspaceName?: string;
  variant?: "default" | "search";
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function SessionRow({
  session,
  active,
  chat,
  draft,
  workspaceName,
  variant = "default",
  onClick,
  onRename,
  onDelete,
}: RowProps) {
  const running = chat?.running;
  const attention = (chat?.pending.length ?? 0) > 0;
  const status = attention
    ? "warning"
    : running
      ? "ongoing"
      : chat?.lastRunStatus === "failed"
        ? "error"
        : chat?.lastRunStatus === "completed"
          ? "done"
          : "idle";
  const title = draft ? "New Session" : session.title || session.id;
  const search = variant === "search";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={active}
      data-selected={active}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`interactive group/session flex cursor-default items-center gap-2 rounded-md pr-1 pl-2 text-row ${
        search ? "min-h-12 py-1" : "h-control-md"
      } ${active ? "text-text-base" : "text-text-muted hover:text-text-base"}`}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {status !== "idle" && (
          <span
            className={`size-2 rounded-full bg-current ${
              status === "warning"
                ? "text-state-fg-warning"
                : status === "ongoing"
                  ? "text-text-accent motion-safe:animate-pulse"
                  : status === "error"
                    ? "text-state-fg-danger"
                    : "text-state-fg-success"
            }`}
          />
        )}
      </span>

      {search ? (
        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="truncate">{title}</span>
          {workspaceName && <span className="truncate text-meta text-text-faint">{workspaceName}</span>}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{title}</span>
      )}

      {!draft && (
        <span
          data-open={menuOpen ? "true" : undefined}
          className="shrink-0 text-caption tabular-nums text-text-faint group-focus-within/session:hidden group-hover/session:hidden data-[open=true]:hidden"
        >
          {attention ? (
            <span className="text-state-fg-warning">Needs input</span>
          ) : running ? (
            <span className="text-text-accent">Working</span>
          ) : (
            relativeTime(session.updated)
          )}
        </span>
      )}

      {(onRename || onDelete) && (
        <span
          data-open={menuOpen ? "true" : undefined}
          className="hidden shrink-0 items-center group-focus-within/session:flex group-hover/session:flex data-[open=true]:flex"
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`More actions for ${title}`}
                onClick={(event) => event.stopPropagation()}
                className="text-text-faint hover:text-text-base"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              {onRename && (
                <DropdownMenuItem onSelect={onRename}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  {onRename && <DropdownMenuSeparator />}
                  <DropdownMenuItem destructive onSelect={onDelete}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </div>
  );
}

function updatedAt(session: SessionInfo): number {
  const value = new Date(session.updated).getTime();
  return Number.isNaN(value) ? 0 : value;
}

interface WorkspaceRowProps {
  workspace: WorkspaceInfo;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNew: () => void;
  onRemove: () => void;
}

/**
 * One workspace tree row. The action strip is hover/focus-revealed, so it must
 * stay visible while its menu is open: an open Radix menu suppresses pointer
 * hit-testing on the anchor, which would otherwise collapse the strip and
 * unmount the trigger under its own open menu.
 */
function WorkspaceRow({ workspace, active, expanded, onToggle, onNew, onRemove }: WorkspaceRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={expanded}
      aria-current={active ? "true" : undefined}
      data-selected={active ? "true" : undefined}
      data-open={menuOpen ? "true" : undefined}
      title={workspace.error || workspace.path}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className="group/ws flex h-control-md cursor-default items-center gap-2 rounded-md px-2 text-row"
    >
      <span className="grid size-4 shrink-0 place-items-center text-text-faint transition-colors group-hover/ws:text-text-muted group-data-[selected=true]/ws:text-text-accent">
        {expanded ? (
          <FolderOpen className="size-4 group-focus-within/ws:hidden group-hover/ws:hidden group-data-[open=true]/ws:hidden" />
        ) : (
          <FolderClosed className="size-4 group-focus-within/ws:hidden group-hover/ws:hidden group-data-[open=true]/ws:hidden" />
        )}
        <ChevronRight
          className={`hidden size-3 group-focus-within/ws:block group-hover/ws:block group-data-[open=true]/ws:block ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-text-muted transition-colors group-hover/ws:text-text-base group-data-[selected=true]/ws:font-medium group-data-[selected=true]/ws:text-text-base">
        {workspace.name}
      </span>
      {!workspace.connected && (
        <span className="shrink-0 text-caption text-state-fg-danger">offline</span>
      )}
      <span
        data-open={menuOpen ? "true" : undefined}
        className="hidden shrink-0 items-center gap-1 group-focus-within/ws:flex group-hover/ws:flex data-[open=true]:flex"
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`More actions for ${workspace.name}`}
              onClick={(event) => event.stopPropagation()}
              className="text-text-faint hover:text-text-base"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={onNew}>
              <MessageSquarePlus />
              New session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onRemove}>
              <Trash2 />
              Remove workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}

/** Two quiet placeholder rows while a workspace's history is fetched. */
function SkeletonSessions() {
  return (
    <div role="status" aria-label="Loading sessions" className="pt-1">
      {[0, 1].map((index) => (
        <div key={index} aria-hidden className="flex h-control-md items-center gap-2 pr-1 pl-2">
          <span className="grid size-4 place-items-center">
            <span className="size-2 rounded-full bg-bg-layer-03" />
          </span>
          <span
            className={`h-2 rounded-xs bg-bg-layer-03 motion-safe:animate-pulse ${
              index === 0 ? "w-32" : "w-24"
            }`}
          />
        </div>
      ))}
    </div>
  );
}
