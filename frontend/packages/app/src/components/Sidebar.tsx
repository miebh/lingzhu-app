import { memo, useEffect, useMemo, useRef, useState } from "react";
import { layoutPropsEqual } from "@/lib/layoutMemo";
import {
  Activity,
  Boxes,
  Check,
  ClipboardList,
  Clock,
  Command,
  Cpu,
  Download,
  Ellipsis,
  FolderClosed,
  FolderCog,
  FolderInput,
  FolderTree,
  FileSearch,
  Gauge,
  GitBranch,
  GitCompare,
  GitFork,
  Globe,
  History,
  ImagePlus,
  Images,
  Inbox,
  KeyRound,
  Layers,
  ListChecks,
  ListTodo,
  MessageSquarePlus,
  Minimize2,
  Package,
  Pencil,
  Plug,
  Plus,
  Puzzle,
  QrCode,
  Search,
  ScrollText,
  Send,
  Server,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Input } from "@lingzhu/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { Keybind } from "@lingzhu/ui/keybind";
import { formatKeybind } from "../lib/slash";
import {
  chatKey,
  type ChatState,
  type SessionInfo,
  type SessionSelection,
  type WorkspaceInfo,
} from "@lingzhu/ui/types";
import { ProjectAvatar } from "./ProjectAvatar";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { useT } from "@lingzhu/ui/i18n";
import { closeTarget } from "../lib/dialogs";

/** Sessions shown per workspace before "Show more". */
const PAGE_SIZE = 5;

interface Props {
  workspaces: WorkspaceInfo[];
  activePath?: string;
  sessionsByWorkspace: Record<string, SessionInfo[]>;
  /** `chatKey` values of sessions that currently have an open tab. */
  openSessionKeys?: string[];
  chats: Record<string, ChatState>;
  activeId?: string;
  /** Bumped after a bulk delete so the selection mode resets. */
  selectionReset: number;
  onSelectWorkspace: (path: string) => void;
  onLoadSessions: (path: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onWorktree: (path: string) => void;
  onSourceControl: (path: string) => void;
  onFiles: (path: string) => void;
  onArtifacts: (path: string) => void;
  onProject: (path: string) => void;
  onImport: (path: string) => void;
  onServices: (path: string) => void;
  onCore: (path: string) => void;
  onCoreModels: (path: string) => void;
  onMCP: (path: string) => void;
  onPlugins: (path: string) => void;
  onSearch: (path: string) => void;
  onLiveEvents: (path: string) => void;
  onSchedulesOverview: (path: string) => void;
  onJobsOverview: (path: string) => void;
  onUsageOverview: (path: string) => void;
  onWebSearch: (path: string) => void;
  onImageGen: (path: string) => void;
  onFormatters: (path: string) => void;
  onOAuth: (path: string) => void;
  onWorktreesManage: (path: string) => void;
  onNew: (path: string) => void;
  onOpen: (path: string, id: string) => void;
  onRename: (path: string, session: SessionInfo) => void;
  onFork: (path: string, session: SessionInfo) => void;
  onSchedules: (path: string, session: SessionInfo) => void;
  onPairing: (path: string, session: SessionInfo) => void;
  onMedia: (path: string, session: SessionInfo) => void;
  onUsage: (path: string, session: SessionInfo) => void;
  onContext: (path: string, session: SessionInfo) => void;
  onReferences: (path: string, session: SessionInfo) => void;
  onLog: (path: string, session: SessionInfo) => void;
  onInbox: (path: string, session: SessionInfo) => void;
  onForms: (path: string, session: SessionInfo) => void;
  onJobs: (path: string, session: SessionInfo) => void;
  onSkills: (path: string, session: SessionInfo) => void;
  onSynthetic: (path: string, session: SessionInfo) => void;
  onRunCommand: (path: string, session: SessionInfo) => void;
  onPromptOnce: (path: string, session: SessionInfo) => void;
  onWait: (path: string, session: SessionInfo) => void;
  onRevert: (path: string, session: SessionInfo) => void;
  onReview: (path: string, session: SessionInfo) => void;
  onCompact: (path: string, session: SessionInfo) => void;
  onExport: (path: string, session: SessionInfo) => void;
  onEnvironment: (path: string, session: SessionInfo) => void;
  onDelete: (path: string, session: SessionInfo) => void;
  onShare: (path: string, session: SessionInfo) => void;
  onMove: (path: string, session: SessionInfo) => void;
  onDeleteSelected: (items: SessionSelection[]) => void;
  onMoveSelected: (items: SessionSelection[]) => void;
  onExportSelected: (items: SessionSelection[]) => void;
  /** Renders inside the side-tabs rail instead of as the standalone sidebar. */
  embedded?: boolean;
  /** Sessions that finished while another session was active. */
  unreadKeys?: ReadonlySet<string>;
}

interface SearchHit {
  workspace: WorkspaceInfo;
  session: SessionInfo;
  chat?: ChatState;
  draft?: boolean;
}

function SidebarView({
  workspaces,
  activePath,
  sessionsByWorkspace,
  openSessionKeys = [],
  chats,
  activeId,
  onSelectWorkspace,
  onLoadSessions,
  onAddWorkspace,
  onRemoveWorkspace,
  onWorktree,
  onSourceControl,
  onFiles,
  onArtifacts,
  onProject,
  onImport,
  onServices,
  onCore,
  onCoreModels,
  onMCP,
  onPlugins,
  onSearch,
  onLiveEvents,
  onSchedulesOverview,
  onJobsOverview,
  onUsageOverview,
  onWebSearch,
  onImageGen,
  onFormatters,
  onOAuth,
  onWorktreesManage,
  onNew,
  onOpen,
  onRename,
  onFork,
  onSchedules,
  onPairing,
  onMedia,
  onUsage,
  onContext,
  onReferences,
  onLog,
  onInbox,
  onForms,
  onJobs,
  onSkills,
  onSynthetic,
  onRunCommand,
  onPromptOnce,
  onWait,
  onRevert,
  onReview,
  onCompact,
  onExport,
  onEnvironment,
  onDelete,
  onShare,
  onMove,
  onDeleteSelected,
  onMoveSelected,
  onExportSelected,
  selectionReset,
  embedded,
  unreadKeys,
}: Props) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [projectsHidden, setProjectsHidden] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The reference Projects tree starts fully collapsed; the active project
  // does not spring open until its row is clicked.
  const isWorkspaceCollapsed = (path: string, isActive: boolean) =>
    collapsed[path] ?? (embedded ? true : !isActive);
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

  const requestMove = () => {
    const items = selectionItems(selected);
    if (items.length > 0) onMoveSelected(items);
  };

  const requestExport = () => {
    const items = selectionItems(selected);
    if (items.length > 0) onExportSelected(items);
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

  // The standalone sidebar always reveals the active workspace; the embedded
  // Projects tree follows the reference and stays collapsed until clicked.
  useEffect(() => {
    if (!activePath) return;
    onLoadSessions(activePath);
    if (!embedded) {
      setCollapsed((prev) => (prev[activePath] === false ? prev : { ...prev, [activePath]: false }));
    }
  }, [activePath, onLoadSessions, embedded]);

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
      if (isWorkspaceCollapsed(workspace.path, workspace.path === activePath)) continue;
      const limit = visible[workspace.path] ?? PAGE_SIZE;
      for (const session of (sortedSessions[workspace.path] ?? []).slice(0, limit)) {
        keys.push(chatKey(workspace.path, session.id));
      }
    }
    return keys;
  }, [searching, workspaces, collapsed, activePath, sortedSessions, visible, embedded]);

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
    const isCollapsed = isWorkspaceCollapsed(path, isActive);
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
    <aside
      aria-label={embedded ? tr("projects") : tr("workspaces")}
      data-projects-collapsed={embedded && projectsHidden ? "true" : undefined}
      className={
        embedded
          ? "flex min-h-0 w-full flex-1 select-none flex-col bg-bg-deep"
          : "flex h-full w-sidebar shrink-0 select-none flex-col border-r border-border-base bg-bg-deep"
      }
    >
      {!embedded && (
      <div className="px-2 pt-2 pb-1">
        <button
          type="button"
          onClick={newSession}
          disabled={selecting || (!activePath && !workspaces.some((workspace) => workspace.connected))}
          className="group/new interactive flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-text-faint hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{tr("newSession")}</span>
          <span className="ms-auto hidden shrink-0 group-hover/new:block">
            <Keybind keys={(formatKeybind("mod+t") ?? "Ctrl+T").split("+")} />
          </span>
        </button>
      </div>
      )}

      <div className={`flex h-6 items-center gap-1 ${embedded && !searching && !selecting ? "" : "px-2"}`}>
        {selecting ? (
          <>
            <span className="sr-only" aria-live="polite">
              {selected.size} selected
            </span>
            <span className="flex-1 truncate text-body leading-4 font-medium text-text-muted">{embedded ? tr("projects") : tr("workspaces")}</span>
            <button
              type="button"
              onClick={selectAll}
              disabled={allKeys.length === 0}
              className="interactive h-control-xs shrink-0 rounded-xs px-2 text-caption text-text-faint hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selected.size === allKeys.length && allKeys.length > 0 ? tr("clear") : tr("selectAllAction")}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("deleteSelected")}
                  disabled={selected.size === 0}
                  onClick={requestDelete}
                  className="text-state-fg-danger"
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tr("deleteSelected")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("moveSelected")}
                  disabled={selected.size === 0}
                  onClick={requestMove}
                  className="text-text-muted"
                >
                  <FolderInput />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tr("moveSelected")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("exportSelected")}
                  disabled={selected.size === 0}
                  onClick={requestExport}
                  className="text-text-muted"
                >
                  <Download />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tr("exportSelected")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tr("cancelSelection")}
                  onClick={exitSelection}
                  className="text-text-faint hover:text-text-base"
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tr("cancel")}</TooltipContent>
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
                aria-label={tr("searchSessions")}
                placeholder={tr("searchSessions")}
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
              aria-label={tr("closeSearch")}
              onClick={closeSearch}
              className="text-text-faint hover:text-text-base"
            >
              <X />
            </Button>
          </>
        ) : (
          <>
            {embedded ? (
              <button
                type="button"
                aria-expanded={!projectsHidden}
                onClick={() => setProjectsHidden((value) => !value)}
                className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-body leading-4 font-medium text-text-muted hover:text-text-base focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-none"
              >
                <span className="min-w-0 truncate">{tr("projects")}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  className={`shrink-0 text-icon-muted transition-transform ${projectsHidden ? "-rotate-90" : ""}`}
                >
                  <path
                    d="M5.37624 6.75194C5.18184 6.41861 5.42224 6 5.80814 6H10.1921C10.578 6 10.8184 6.41861 10.624 6.75194L8.43203 10.5096C8.23909 10.8404 7.76119 10.8404 7.56825 10.5096L5.37624 6.75194Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ) : (
              <span className="flex-1 text-body leading-4 font-medium text-text-muted">{tr("workspaces")}</span>
            )}
            {!embedded && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={tr("searchSessions")}
                      onClick={startSearch}
                      className="text-text-faint hover:text-text-base"
                    >
                      <Search />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tr("searchSessions")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={tr("addWorkspace")}
                      onClick={onAddWorkspace}
                      className="text-text-faint hover:text-text-base"
                    >
                      <Plus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tr("addWorkspace")}</TooltipContent>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>

      {!(embedded && projectsHidden && !searching && !selecting) && (
      <div
        role="tree"
        aria-label={tr("sessions")}
        className={embedded ? "mt-2 flex flex-col gap-1" : "scroll-stable flex-1 overflow-y-auto px-2 pb-3"}
      >
        {searching ? (
          <div role="group" className="pt-1">
            <div className="flex h-6 items-center px-2 text-caption text-text-faint">
              {tr(results.length === 1 ? "resultsCountOne" : "resultsCountMany", { count: results.length })}
            </div>
            {results.map((hit) => (
              <SessionRow
                key={`${hit.workspace.path}:${hit.session.id}`}
                session={hit.session}
                workspaceName={hit.workspace.name}
                active={hit.workspace.path === activePath && hit.session.id === activeId}
                chat={hit.chat}
                draft={hit.draft}
                unread={unreadKeys?.has(chatKey(hit.workspace.path, hit.session.id))}
                variant="search"
                onClick={() => openHit(hit)}
                onRename={hit.draft ? undefined : () => onRename(hit.workspace.path, hit.session)}
                onFork={hit.draft ? undefined : () => onFork(hit.workspace.path, hit.session)}
                onSchedules={hit.draft ? undefined : () => onSchedules(hit.workspace.path, hit.session)}
                onPairing={hit.draft ? undefined : () => onPairing(hit.workspace.path, hit.session)}
                onMedia={hit.draft ? undefined : () => onMedia(hit.workspace.path, hit.session)}
                onUsage={hit.draft ? undefined : () => onUsage(hit.workspace.path, hit.session)}
          onContext={hit.draft ? undefined : () => onContext(hit.workspace.path, hit.session)}
                onReferences={hit.draft ? undefined : () => onReferences(hit.workspace.path, hit.session)}
                onLog={hit.draft ? undefined : () => onLog(hit.workspace.path, hit.session)}
                onInbox={hit.draft ? undefined : () => onInbox(hit.workspace.path, hit.session)}
                onForms={hit.draft ? undefined : () => onForms(hit.workspace.path, hit.session)}
                onJobs={hit.draft ? undefined : () => onJobs(hit.workspace.path, hit.session)}
                onSkills={hit.draft ? undefined : () => onSkills(hit.workspace.path, hit.session)}
                onSynthetic={hit.draft ? undefined : () => onSynthetic(hit.workspace.path, hit.session)}
                onRunCommand={hit.draft ? undefined : () => onRunCommand(hit.workspace.path, hit.session)}
                onPromptOnce={hit.draft ? undefined : () => onPromptOnce(hit.workspace.path, hit.session)}
                onWait={hit.draft ? undefined : () => onWait(hit.workspace.path, hit.session)}
                onRevert={hit.draft ? undefined : () => onRevert(hit.workspace.path, hit.session)}
                onReview={hit.draft ? undefined : () => onReview(hit.workspace.path, hit.session)}
                onCompact={hit.draft ? undefined : () => onCompact(hit.workspace.path, hit.session)}
                onExport={hit.draft ? undefined : () => onExport(hit.workspace.path, hit.session)}
                onEnvironment={hit.draft ? undefined : () => onEnvironment(hit.workspace.path, hit.session)}
                onDelete={hit.draft ? undefined : () => onDelete(hit.workspace.path, hit.session)}
                onShare={hit.draft ? undefined : () => onShare(hit.workspace.path, hit.session)}
                onMove={hit.draft ? undefined : () => onMove(hit.workspace.path, hit.session)}
              />
            ))}
            {results.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-faint">
                <Search className="size-6" />
                <p className="text-meta">{tr("noMatches")}</p>
              </div>
            )}
          </div>
        ) : (
          (embedded && !showAllProjects ? workspaces.slice(0, 7) : workspaces).map((workspace) => {
            const isActive = workspace.path === activePath;
            const isCollapsed = isWorkspaceCollapsed(workspace.path, isActive);
            const durable = sortedSessions[workspace.path] ?? [];
            const loadingSessions = !sessionsByWorkspace[workspace.path];
            const draftRows = (draftsByWorkspace.get(workspace.path) ?? []).filter(
              (chat) => !durable.some((session) => session.id === chat.id),
            );
            const limit = visible[workspace.path] ?? PAGE_SIZE;
            const hidden = Math.max(0, durable.length - limit);
            return (
              <div key={workspace.path} className={embedded ? "" : "pb-1"}>
                <WorkspaceRow
                  workspace={workspace}
                  active={isActive}
                  expanded={!isCollapsed}
                  onToggle={() => toggleWorkspace(workspace.path)}
                  onNew={() => onNew(workspace.path)}
                  onSelectSessions={() => startWorkspaceSelection(workspace.path)}
                  onRemove={() => onRemoveWorkspace(workspace.path)}
                  onWorktree={() => onWorktree(workspace.path)}
                  onSourceControl={() => onSourceControl(workspace.path)}
                  onFiles={() => onFiles(workspace.path)}
                  onArtifacts={() => onArtifacts(workspace.path)}
                  onProject={() => onProject(workspace.path)}
                  onImport={() => onImport(workspace.path)}
                  onServices={() => onServices(workspace.path)}
                  onCore={() => onCore(workspace.path)}
                  onCoreModels={() => onCoreModels(workspace.path)}
                  onMCP={() => onMCP(workspace.path)}
                  onPlugins={() => onPlugins(workspace.path)}
                  onSearch={() => onSearch(workspace.path)}
                  onLiveEvents={() => onLiveEvents(workspace.path)}
                  onSchedulesOverview={() => onSchedulesOverview(workspace.path)}
                  onJobsOverview={() => onJobsOverview(workspace.path)}
                  onUsageOverview={() => onUsageOverview(workspace.path)}
                  onWebSearch={() => onWebSearch(workspace.path)}
                  onImageGen={() => onImageGen(workspace.path)}
                  onFormatters={() => onFormatters(workspace.path)}
                  onOAuth={() => onOAuth(workspace.path)}
                  onWorktreesManage={() => onWorktreesManage(workspace.path)}
                />

                {!isCollapsed && (
                  <div role="group" className="flex flex-col gap-[3px] pb-1">
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
                          openTab={openSessionKeys.includes(chatKey(workspace.path, session.id))}
                          unread={unreadKeys?.has(key)}
                          onRename={() => onRename(workspace.path, session)}
                          onFork={() => onFork(workspace.path, session)}
                          onSchedules={() => onSchedules(workspace.path, session)}
                          onPairing={() => onPairing(workspace.path, session)}
                          onMedia={() => onMedia(workspace.path, session)}
                          onUsage={() => onUsage(workspace.path, session)}
                          onContext={() => onContext(workspace.path, session)}
                          onReferences={() => onReferences(workspace.path, session)}
                          onLog={() => onLog(workspace.path, session)}
                          onInbox={() => onInbox(workspace.path, session)}
                          onForms={() => onForms(workspace.path, session)}
                          onJobs={() => onJobs(workspace.path, session)}
                          onSkills={() => onSkills(workspace.path, session)}
                          onSynthetic={() => onSynthetic(workspace.path, session)}
                          onRunCommand={() => onRunCommand(workspace.path, session)}
                          onPromptOnce={() => onPromptOnce(workspace.path, session)}
                          onWait={() => onWait(workspace.path, session)}
                          onRevert={() => onRevert(workspace.path, session)}
                          onReview={() => onReview(workspace.path, session)}
                          onCompact={() => onCompact(workspace.path, session)}
                          onExport={() => onExport(workspace.path, session)}
                          onEnvironment={() => onEnvironment(workspace.path, session)}
                          onDelete={() => onDelete(workspace.path, session)}
                          onShare={() => onShare(workspace.path, session)}
                          onMove={() => onMove(workspace.path, session)}
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
                        className="interactive ms-[23px] flex h-6 self-start items-center rounded-xs px-2 text-body leading-4 font-[440] text-text-muted"
                      >
                        {tr("showMore")}
                      </button>
                    )}
                    {!loadingSessions && draftRows.length === 0 && durable.length === 0 &&
                      (embedded ? (
                        <div className="ps-8 pe-2 py-2 text-meta text-text-faint">{tr("noSessions")}</div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 px-4 py-4 text-center text-text-faint">
                          <MessageSquarePlus className="size-5" />
                          <p className="text-meta">{tr("noSessions")}</p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {embedded && workspaces.length > 7 && !searching && !selecting && (
          <button
            type="button"
            onClick={() => setShowAllProjects((value) => !value)}
            className="interactive ms-[23px] flex h-6 self-start items-center rounded-xs px-2 text-body leading-4 font-[440] text-text-muted"
          >
            {showAllProjects ? tr("showLess") : tr("showMore")}
          </button>
        )}

        {workspaces.length === 0 && !searching && !embedded && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-text-faint">
            <FolderClosed className="size-6" />
            <p className="text-meta">{tr("noWorkspaces")}</p>
            <Button variant="outline" size="sm" onClick={onAddWorkspace}>
              {tr("addWorkspace")}
            </Button>
          </div>
        )}
      </div>
      )}
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
  /** The session has an open tab elsewhere in the rail. */
  openTab?: boolean;
  /** The session changed while another session was active. */
  unread?: boolean;
  onRename?: () => void;
  onFork?: () => void;
  onSchedules?: () => void;
  onPairing?: () => void;
  onMedia?: () => void;
  onUsage?: () => void;
  onContext?: () => void;
  onReferences?: () => void;
  onLog?: () => void;
  onInbox?: () => void;
  onForms?: () => void;
  onJobs?: () => void;
  onSkills?: () => void;
  onSynthetic?: () => void;
  onRunCommand?: () => void;
  onPromptOnce?: () => void;
  onWait?: () => void;
  onRevert?: () => void;
  onReview?: () => void;
  onCompact?: () => void;
  onExport?: () => void;
  onEnvironment?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onMove?: () => void;
}

function SessionRow({
  session,
  active,
  chat,
  draft,
  openTab = false,
  unread = false,
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
  onFork,
  onSchedules,
  onPairing,
  onMedia,
  onUsage,
  onContext,
  onReferences,
  onLog,
  onInbox,
  onForms,
  onJobs,
  onSkills,
  onSynthetic,
  onRunCommand,
  onPromptOnce,
  onWait,
  onRevert,
  onReview,
  onCompact,
  onExport,
  onEnvironment,
  onDelete,
  onShare,
  onMove,
}: RowProps) {
  const tr = useT();
  // A recovered run exists before its chat has been opened, so the session
  // list carries the running flag as a fallback.
  const running = chat?.running || session.running;
  const attention = (chat?.pending.length ?? 0) > 0 || (chat?.questions.length ?? 0) > 0;
  const status = attention
    ? "warning"
    : running
      ? "ongoing"
      : chat?.lastRunStatus === "failed"
        ? "error"
        : chat?.lastRunStatus === "completed"
          ? "done"
          : "idle";
  const title = draft ? tr("paletteNewSession") : session.title || session.id;
  const search = variant === "search";
  const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={selecting ? selected : active}
      data-selected={selecting ? selected : undefined}
      data-selecting={selecting ? "true" : undefined}
      data-state={active && !selecting ? "pressed" : undefined}
      onClick={(event) => {
        if (!containsTarget(event)) return;
        onClick();
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onContextMenu={(event) => {
        if (!(onSelect || onRename || onDelete)) return;
        event.preventDefault();
        setMenuAt({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (selecting) onToggle?.();
          else onClick();
        }
      }}
      className={`side-rail-row interactive group/session relative flex cursor-default items-center gap-2 rounded-md pe-2 text-[13px] leading-4 font-medium ${
        search ? "min-h-12 py-1 ps-2" : "h-7 ps-8"
      } ${active || selected ? "text-text-base" : selecting ? "text-text-muted" : "text-text-faint"}`}
    >
      {selecting ? (
        <span
          aria-hidden
          className={`absolute start-2 top-1/2 grid size-3 -translate-y-1/2 place-items-center rounded-xs border transition-colors ${
            selected
              ? "border-transparent bg-bg-layer-03 text-text-base"
              : "border-border-base text-transparent"
          }`}
        >
          <Check className="size-2" strokeWidth={3} />
        </span>
      ) : openTab ? (
        <span
          aria-hidden
          className="absolute start-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center"
        >
          <span className="size-1 rounded-full bg-icon-faint" />
        </span>
      ) : null}

      {search ? (
        <span className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </span>
          {workspaceName && <span className="truncate text-meta text-text-faint">{workspaceName}</span>}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{title}</span>
      )}

      {!draft && (
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <span className="flex items-center justify-center">
            {running ? (
              <ActivityRing size={14} />
            ) : !active && (attention || status === "error" || unread) ? (
              <span className="size-1.5 rounded-full bg-text-base" />
            ) : null}
          </span>

          {(onSelect || onRename || onDelete) && (
            <DropdownMenu
              open={menuAt !== undefined}
              onOpenChange={closeTarget(setMenuAt)}
            >
              <DropdownMenuTrigger asChild>
                <span
                  aria-hidden="true"
                  style={{
                    position: "fixed",
                    left: menuAt?.x ?? 0,
                    top: menuAt?.y ?? 0,
                    width: 0,
                    height: 0,
                  }}
                />
              </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="start" sideOffset={2}>
                  {onSelect && (
                    <DropdownMenuItem onSelect={onSelect}>
                      <ListChecks />
                      {tr("selectSessionAction")}
                    </DropdownMenuItem>
                  )}
                  {onRename && (
                    <DropdownMenuItem onSelect={onRename}>
                      <Pencil />
                      {tr("renamePlain")}
                    </DropdownMenuItem>
                  )}
                  {onFork && (
                    <DropdownMenuItem onSelect={onFork}>
                      <GitFork />
                      {tr("paletteForkSession")}
                    </DropdownMenuItem>
                  )}
                  {onSchedules && (
                    <DropdownMenuItem onSelect={onSchedules}>
                      <Clock />
                      {tr("schedules")}
                    </DropdownMenuItem>
                  )}
                  {onPairing && (
                    <DropdownMenuItem onSelect={onPairing}>
                      <QrCode />
                      {tr("pairingTitle")}
                    </DropdownMenuItem>
                  )}
                  {onMedia && (
                    <DropdownMenuItem onSelect={onMedia}>
                      <Images />
                      {tr("mediaTitle")}
                    </DropdownMenuItem>
                  )}
                  {onUsage && (
                    <DropdownMenuItem onSelect={onUsage}>
                      <Gauge />
                      {tr("usage")}
                    </DropdownMenuItem>
                  )}
                  {onContext && (
                    <DropdownMenuItem onSelect={onContext}>
                      <Layers />
                      {tr("context")}
                    </DropdownMenuItem>
                  )}
                  {onReferences && (
                    <DropdownMenuItem onSelect={onReferences}>
                      <FileSearch />
                      {tr("referencesTitle")}
                    </DropdownMenuItem>
                  )}
                  {onLog && (
                    <DropdownMenuItem onSelect={onLog}>
                      <ScrollText />
                      {tr("logTitle")}
                    </DropdownMenuItem>
                  )}
                  {onInbox && (
                    <DropdownMenuItem onSelect={onInbox}>
                      <Inbox />
                      {tr("inboxTitle")}
                    </DropdownMenuItem>
                  )}
                  {onCompact && (
                    <DropdownMenuItem onSelect={onCompact}>
                      <Minimize2 />
                      {tr("compactTitle")}
                    </DropdownMenuItem>
                  )}
                  {onExport && (
                    <DropdownMenuItem onSelect={onExport}>
                      <Download />
                      {tr("export")}
                    </DropdownMenuItem>
                  )}
                  {onEnvironment && (
                    <DropdownMenuItem onSelect={onEnvironment}>
                      <Cpu />
                      {tr("environmentTitle")}
                    </DropdownMenuItem>
                  )}
                  {onForms && (
                    <DropdownMenuItem onSelect={onForms}>
                      <ClipboardList />
                      {tr("formsTitle")}
                    </DropdownMenuItem>
                  )}
                  {onJobs && (
                    <DropdownMenuItem onSelect={onJobs}>
                      <ListTodo />
                      {tr("backgroundJobs")}
                    </DropdownMenuItem>
                  )}
                  {onSkills && (
                    <DropdownMenuItem onSelect={onSkills}>
                      <Sparkles />
                      {tr("skills")}
                    </DropdownMenuItem>
                  )}
                  {onSynthetic && (
                    <DropdownMenuItem onSelect={onSynthetic}>
                      <Send />
                      {tr("paletteSynthetic")}
                    </DropdownMenuItem>
                  )}
                  {onRunCommand && (
                    <DropdownMenuItem onSelect={onRunCommand}>
                      <Command />
                      {tr("runCommandTitle")}
                    </DropdownMenuItem>
                  )}
                  {onPromptOnce && (
                    <DropdownMenuItem onSelect={onPromptOnce}>
                      <Send />
                      {tr("palettePromptOnce")}
                    </DropdownMenuItem>
                  )}
                  {onWait && (
                    <DropdownMenuItem onSelect={onWait}>
                      <Clock />
                      {tr("paletteWait")}
                    </DropdownMenuItem>
                  )}
                  {onRevert && (
                    <DropdownMenuItem onSelect={onRevert}>
                      <History />
                      {tr("revertTitle")}
                    </DropdownMenuItem>
                  )}
                  {onReview && (
                    <DropdownMenuItem onSelect={onReview}>
                      <GitCompare />
                      {tr("paletteReviewChanges")}
                    </DropdownMenuItem>
                  )}
                                    {onShare && (
                    <DropdownMenuItem onSelect={onShare}>
                      <Share2 />
                      {tr("shareTitle")}
                    </DropdownMenuItem>
                  )}
                  {onMove && (
                    <DropdownMenuItem onSelect={onMove}>
                      <FolderInput />
                      {tr("moveToWorkspace")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      {(onSelect || onRename || onShare || onMove) && <DropdownMenuSeparator />}
                      <DropdownMenuItem destructive onSelect={onDelete}>
                        <Trash2 />
                        {tr("removeAction")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
  onWorktree: () => void;
  onSourceControl: () => void;
  onFiles: () => void;
  onArtifacts: () => void;
  onProject: () => void;
  onImport: () => void;
  onServices: () => void;
  onCore: () => void;
  onCoreModels: () => void;
  onMCP: () => void;
  onPlugins: () => void;
  onSearch: () => void;
  onLiveEvents: () => void;
  onSchedulesOverview: () => void;
  onJobsOverview: () => void;
  onUsageOverview: () => void;
  onWebSearch: () => void;
  onImageGen: () => void;
  onFormatters: () => void;
  onOAuth: () => void;
  onWorktreesManage: () => void;
}

/**
 * One workspace tree row. The action strip is hover/focus-revealed, so it must
 * stay visible while its menu is open: an open Radix menu suppresses pointer
 * hit-testing on the anchor, which would otherwise collapse the strip and
 * unmount the trigger under its own open menu.
 */
function WorkspaceRow({ workspace, active, expanded, onToggle, onNew, onSelectSessions, onRemove, onWorktree, onSourceControl, onFiles, onArtifacts, onProject, onImport, onServices, onCore, onCoreModels, onMCP, onPlugins, onSearch, onLiveEvents, onSchedulesOverview, onJobsOverview, onUsageOverview, onWebSearch, onImageGen, onFormatters, onOAuth, onWorktreesManage }: WorkspaceRowProps) {
  const tr = useT();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={expanded}
      aria-current={active ? "true" : undefined}
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
      className="side-rail-row interactive group/ws flex h-7 cursor-default items-center gap-2 rounded-md ps-2 pe-1 text-[13px] leading-4"
    >
      <ProjectAvatar name={workspace.name} icon={workspace.icon} color={workspace.color} />
      <span className="min-w-0 flex-1 truncate font-[440] text-text-muted transition-colors group-hover/ws:text-text-base group-focus-visible/ws:text-text-base">
        {workspace.name}
      </span>
      {workspace.starting ? (
        <span className="shrink-0 text-caption text-text-muted">{tr("starting")}</span>
      ) : !workspace.connected ? (
        <span className="shrink-0 text-caption text-state-fg-danger">{tr("offline")}</span>
      ) : null}
      <span
        data-open={menuOpen ? "true" : undefined}
        className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/ws:pointer-events-auto group-focus-within/ws:opacity-100 group-hover/ws:pointer-events-auto group-hover/ws:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={tr("moreActionsFor", { name: workspace.name })}
              onClick={(event) => event.stopPropagation()}
              className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
            >
              <Ellipsis className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={onNew}>
              <MessageSquarePlus />
              {tr("paletteNewSession")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>
              <Upload />
              {tr("importSession")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSelectSessions}>
              <ListChecks />
              {tr("selectSessions")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onProject}>
              <FolderCog />
              {tr("paletteProject")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onServices}>
              <Server />
              {tr("servicesTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCore}>
              <Boxes />
              {tr("coreTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCoreModels}>
              <Gauge />
              {tr("paletteCoreModels")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onMCP}>
              <Plug />
              {tr("mcpServers")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPlugins}>
              <Puzzle />
              {tr("plugins")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSearch}>
              <Search />
              {tr("searchEvents")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onLiveEvents}>
              <Activity />
              {tr("paletteLiveEvents")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSchedulesOverview}>
              <Clock />
              {tr("schedules")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onJobsOverview}>
              <ListTodo />
              {tr("backgroundJobs")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onUsageOverview}>
              <Gauge />
              {tr("paletteUsageOverview")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onWebSearch}>
              <Globe />
              {tr("paletteWebSearch")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onImageGen}>
              <ImagePlus />
              {tr("imageGenerate")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFormatters}>
              <Wand2 />
              {tr("formattersTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOAuth}>
              <KeyRound />
              {tr("oauthTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFiles}>
              <FolderTree />
              {tr("files")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onArtifacts}>
              <Package />
              {tr("artifactsTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSourceControl}>
              <GitCompare />
              {tr("sourceControl")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onWorktree}>
              <GitBranch />
              {tr("newWorktree")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onWorktreesManage}>
              <GitBranch />
              {tr("worktrees")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onRemove}>
              <Trash2 />
              {tr("removeWorkspace")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={tr("newSessionIn", { name: workspace.name })}
          onClick={(event) => {
            event.stopPropagation();
            onNew();
          }}
          className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
        >
          <Pencil className="size-4" />
        </button>
      </span>
    </div>
  );
}

/** Two quiet placeholder rows while a workspace's history is fetched. */
function SkeletonSessions() {
  const tr = useT();
  return (
    <div role="status" aria-label={tr("loadingSessions")} className="pt-1">
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


export const Sidebar = memo(SidebarView, layoutPropsEqual);
