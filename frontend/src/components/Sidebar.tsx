import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Ellipsis,
  FolderClosed,
  FolderOpen,
  ListChecks,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Settings,
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

/** One row picked in multi-select mode. */
export interface SessionSelection {
  path: string;
  id: string;
}

interface Props {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  chats: Record<string, ChatState>;
  activeId?: string;
  /** Bumped after a bulk delete so the selection mode resets. */
  selectionReset: number;
  onSelectWorkspace: (path: string) => void;
  onLoadSessions: (path: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onNew: (path: string) => void;
  onOpen: (path: string, id: string) => void;
  onRename: (path: string, session: SessionInfo) => void;
  onDelete: (path: string, session: SessionInfo) => void;
  onDeleteSelected: (items: SessionSelection[]) => void;
  onOpenSettings: () => void;
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
  onDeleteSelected,
  selectionReset,
  onOpenSettings,
}: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Drag selection is a range anchored on the row where the press started:
  // sweeping away grows the range, sweeping back shrinks it (or reveals rows
  // that were selected before the gesture).
  const gesture = useRef<{
    anchor: string;
    base: Set<string>;
    mode: "select" | "deselect";
  } | null>(null);

  const allKeys = useMemo(() => {
    const keys: string[] = [];
    for (const [path, list] of Object.entries(sessionsByWorkspace)) {
      for (const session of list ?? []) keys.push(chatKey(path, session.id));
    }
    return keys;
  }, [sessionsByWorkspace]);

  const applySelection = (key: string, select: boolean) => {
    setSelected((previous) => {
      if (previous.has(key) === select) return previous;
      const next = new Set(previous);
      if (select) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
    gesture.current = null;
  };

  const requestDelete = () => {
    const items = selectionItems(selected);
    if (items.length > 0) onDeleteSelected(items);
  };

  /** Rebuilds the selection as the inclusive range from anchor to `key`. */
  const applyRange = (key: string) => {
    const current = gesture.current;
    if (!current) return;
    const from = visibleKeys.indexOf(current.anchor);
    const to = visibleKeys.indexOf(key);
    if (from === -1 || to === -1) return;
    const next = new Set(current.base);
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      if (current.mode === "select") next.add(visibleKeys[index]);
      else next.delete(visibleKeys[index]);
    }
    setSelected(next);
  };

  const startPointer = (key: string, event: React.PointerEvent) => {
    // Row menus are portaled, so their React events still bubble through the
    // row; ignore anything that is not physically inside this row.
    if (!containsTarget(event)) return;
    if (event.button !== 0) return;
    const mode = selecting && selected.has(key) ? "deselect" : "select";
    gesture.current = { anchor: key, base: new Set(selected), mode };
    // Pressing a row in selection mode toggles it right away; a later drag
    // extends the range that was implied by that press.
    if (selecting) applyRange(key);
  };

  const enterRow = (key: string, event: React.PointerEvent) => {
    if (!containsTarget(event)) return;
    const current = gesture.current;
    if (!current || event.buttons !== 1) return;
    if (!selecting) {
      // A press only becomes a drag once it reaches another row.
      if (key === current.anchor) return;
      setSelecting(true);
    }
    applyRange(key);
  };

  const selectSession = (key: string) => {
    setSelecting(true);
    setSelected(new Set([key]));
  };

  const startWorkspaceSelection = (path: string) => {
    setSelecting(true);
    setSelected(new Set());
    setCollapsed((previous) => ({ ...previous, [path]: false }));
    onLoadSessions(path);
  };

  const selectAll = () => {
    setSelected((previous) => (previous.size === allKeys.length ? new Set() : new Set(allKeys)));
  };

  useEffect(() => {
    const end = () => {
      gesture.current = null;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  // Drop keys whose session disappeared (deleted elsewhere or a refreshed list).
  useEffect(() => {
    setSelected((previous) => {
      if (previous.size === 0) return previous;
      const alive = new Set(allKeys);
      const next = new Set([...previous].filter((key) => alive.has(key)));
      return next.size === previous.size ? previous : next;
    });
  }, [allKeys]);

  useEffect(() => {
    if (selectionReset === 0) return;
    setSelecting(false);
    setSelected(new Set());
    gesture.current = null;
  }, [selectionReset]);

  useEffect(() => {
    if (!selecting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelecting(false);
        setSelected(new Set());
        gesture.current = null;
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected.size > 0) {
        event.preventDefault();
        const items = selectionItems(selected);
        if (items.length > 0) onDeleteSelected(items);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selecting, selected, onDeleteSelected]);

  // The active workspace always reveals its sessions; a user fold only hides
  // groups they are not working in.
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
      map[path] = [...(list ?? [])].sort((a, b) => updatedAt(b) - updatedAt(a));
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

  // Ordered keys of the rows rendered in the tree; drag selection maps the
  // pointer to a contiguous range of this list.
  const visibleKeys = useMemo(() => {
    if (searching) return [];
    const keys: string[] = [];
    for (const workspace of workspaces) {
      const isCollapsed = collapsed[workspace.path] ?? workspace.path !== activePath;
      if (isCollapsed) continue;
      const limit = visible[workspace.path] ?? PAGE_SIZE;
      for (const session of (sortedSessions[workspace.path] ?? []).slice(0, limit)) {
        keys.push(chatKey(workspace.path, session.id));
      }
    }
    return keys;
  }, [searching, workspaces, collapsed, activePath, sortedSessions, visible]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const startSearch = () => {
    exitSelection();
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

  const newSession = () => {
    const path = activePath ?? workspaces.find((workspace) => workspace.connected)?.path;
    if (path) onNew(path);
  };

  return (
    <aside aria-label="Workspaces" className="flex h-full w-sidebar shrink-0 select-none flex-col border-r border-border-base bg-bg-base">
      <div className="px-2 pt-3 pb-1">
        <button
          type="button"
          onClick={newSession}
          disabled={selecting || (!activePath && !workspaces.some((workspace) => workspace.connected))}
          className="interactive flex h-control-md w-full items-center justify-center gap-2 rounded-md border border-border-base bg-bg-layer-01 text-row font-medium text-text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          New session
        </button>
      </div>

      <div className="flex h-control-md items-center gap-1 pr-2 pl-3">
        {selecting ? (
          <>
            <span className="sr-only" aria-live="polite">
              {selected.size} selected
            </span>
            <span className="flex-1 truncate text-body font-medium text-text-faint">Workspaces</span>
            <button
              type="button"
              onClick={selectAll}
              disabled={allKeys.length === 0}
              className="interactive h-control-xs shrink-0 rounded-xs px-2 text-caption text-text-faint hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selected.size === allKeys.length && allKeys.length > 0 ? "Clear" : "Select all"}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete selected sessions"
                  disabled={selected.size === 0}
                  onClick={requestDelete}
                  className="text-state-fg-danger"
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete selected</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Cancel selection"
                  onClick={exitSelection}
                  className="text-text-faint hover:text-text-base"
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cancel</TooltipContent>
            </Tooltip>
          </>
        ) : searchOpen ? (
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
            const loadingSessions = !sessionsByWorkspace[workspace.path];
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
                  onSelectSessions={() => startWorkspaceSelection(workspace.path)}
                  onRemove={() => onRemoveWorkspace(workspace.path)}
                />

                {!isCollapsed && (
                  <div role="group">
                    {loadingSessions && <SkeletonSessions />}
                    {!selecting &&
                      draftRows.map((chat) => (
                        <SessionRow
                          key={chat.id}
                          session={{ id: chat.id, title: "New Session", updated: "" }}
                          active={isActive && chat.id === activeId}
                          chat={chat}
                          draft
                          onClick={() => onOpen(workspace.path, chat.id)}
                        />
                      ))}
                    {durable.slice(0, limit).map((session) => {
                      const key = chatKey(workspace.path, session.id);
                      return (
                        <SessionRow
                          key={session.id}
                          session={session}
                          active={isActive && session.id === activeId}
                          chat={chats[key]}
                          selecting={selecting}
                          selected={selected.has(key)}
                          onClick={() => {
                            if (!selecting) onOpen(workspace.path, session.id);
                          }}
                          onPointerDown={(event) => startPointer(key, event)}
                          onPointerEnter={(event) => enterRow(key, event)}
                          onToggle={() => applySelection(key, !selected.has(key))}
                          onRename={() => onRename(workspace.path, session)}
                          onDelete={() => onDelete(workspace.path, session)}
                          onSelect={() => selectSession(key)}
                        />
                      );
                    })}
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

      <div className="border-t border-border-base p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="More"
              className="w-full justify-start gap-2 px-2 font-normal text-text-muted hover:text-text-base"
            >
              <Ellipsis />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings />
              Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  /** Multi-select mode: show a check box and toggle instead of opening. */
  selecting?: boolean;
  selected?: boolean;
  onClick: () => void;
  onToggle?: () => void;
  onPointerDown?: (event: React.PointerEvent) => void;
  onPointerEnter?: (event: React.PointerEvent) => void;
  onSelect?: () => void;
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
  selecting = false,
  selected = false,
  onClick,
  onToggle,
  onPointerDown,
  onPointerEnter,
  onSelect,
  onRename,
  onDelete,
}: RowProps) {
  // A recovered run exists before its chat has been opened, so the session
  // list carries the running flag as a fallback.
  const running = chat?.running || session.running;
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
      aria-selected={selecting ? selected : active}
      data-selected={selecting ? selected : active}
      data-selecting={selecting ? "true" : undefined}
      onClick={(event) => {
        if (!containsTarget(event)) return;
        onClick();
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (selecting) onToggle?.();
          else onClick();
        }
      }}
      className={`interactive group/session flex cursor-default items-center gap-2 rounded-md pr-1 pl-2 text-row ${
        search ? "min-h-12 py-1" : "h-control-md"
      } ${active || selected ? "text-text-base" : selecting ? "text-text-muted" : "text-text-muted hover:text-text-base"}`}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {selecting ? (
          <span
            aria-hidden
            className={`grid size-3 place-items-center rounded-xs border transition-colors ${
              selected
                ? "border-transparent bg-bg-inverse text-text-inverse"
                : "border-border-base text-transparent"
            }`}
          >
            <Check className="size-2" strokeWidth={3} />
          </span>
        ) : (
          status !== "idle" && (
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
          )
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
        <span className="relative flex min-w-6 shrink-0 self-stretch items-center justify-end">
          <span
            data-open={menuOpen ? "true" : undefined}
            className={`text-caption tabular-nums text-text-faint transition-opacity ${
              onRename || onDelete || onSelect
                ? "group-hover/session:opacity-0 group-focus-within/session:opacity-0 data-[open=true]:opacity-0"
                : ""
            }`}
          >
            {attention ? (
              <span className="text-state-fg-warning">Needs input</span>
            ) : running ? (
              <span className="text-text-accent">Working</span>
            ) : (
              relativeTime(session.updated)
            )}
          </span>

          {(onSelect || onRename || onDelete) && (
            <span
              data-open={menuOpen ? "true" : undefined}
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center opacity-0 transition-opacity group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100 group-hover/session:pointer-events-auto group-hover/session:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
            >
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`More actions for ${title}`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="text-text-faint hover:text-text-base"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                  {onSelect && (
                    <DropdownMenuItem onSelect={onSelect}>
                      <ListChecks />
                      Select
                    </DropdownMenuItem>
                  )}
                  {onRename && (
                    <DropdownMenuItem onSelect={onRename}>
                      <Pencil />
                      Rename
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      {(onSelect || onRename) && <DropdownMenuSeparator />}
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
        </span>
      )}
    </div>
  );
}

function updatedAt(session: SessionInfo): number {
  const value = new Date(session.updated).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/** True when the event came from inside the element that owns the handler. */
function containsTarget(event: React.SyntheticEvent): boolean {
  return event.target instanceof Node && event.currentTarget.contains(event.target);
}

/** Splits chat keys back into workspace/session pairs for bulk actions. */
function selectionItems(keys: Set<string>): SessionSelection[] {
  const items: SessionSelection[] = [];
  for (const key of keys) {
    const separator = key.indexOf("\u0000");
    if (separator === -1) continue;
    items.push({ path: key.slice(0, separator), id: key.slice(separator + 1) });
  }
  return items;
}

interface WorkspaceRowProps {
  workspace: WorkspaceInfo;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelectSessions: () => void;
  onRemove: () => void;
}

/**
 * One workspace tree row. The action strip is hover/focus-revealed, so it must
 * stay visible while its menu is open: an open Radix menu suppresses pointer
 * hit-testing on the anchor, which would otherwise collapse the strip and
 * unmount the trigger under its own open menu.
 */
function WorkspaceRow({ workspace, active, expanded, onToggle, onNew, onSelectSessions, onRemove }: WorkspaceRowProps) {
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
      onClick={(event) => {
        if (!containsTarget(event)) return;
        onToggle();
      }}
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
        {expanded ? <FolderOpen className="size-4" /> : <FolderClosed className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-text-muted transition-colors group-hover/ws:text-text-base group-data-[selected=true]/ws:font-medium group-data-[selected=true]/ws:text-text-base">
        {workspace.name}
      </span>
      {!workspace.connected && (
        <span className="shrink-0 text-caption text-state-fg-danger">offline</span>
      )}
      <span
        data-open={menuOpen ? "true" : undefined}
        className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/ws:pointer-events-auto group-focus-within/ws:opacity-100 group-hover/ws:pointer-events-auto group-hover/ws:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
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
            <DropdownMenuItem onSelect={onSelectSessions}>
              <ListChecks />
              Select sessions
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
