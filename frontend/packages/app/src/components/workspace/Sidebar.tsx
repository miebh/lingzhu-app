import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
import { formatKeybind } from "../../lib/slash";
import { chatKey } from "@lingzhu/ui/domain/chat";
import { type ChatState, type SessionInfo, type SessionSelection, type WorkspaceInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "./ProjectAvatar";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { useT } from "@lingzhu/ui/i18n";
import { closeTarget } from "../../lib/dialogs";

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

export function Sidebar(props: Props) {
  const tr = useT();
  const [query, setQuery] = createSignal("");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [visible, setVisible] = createSignal<Record<string, number>>({});
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const [projectsHidden, setProjectsHidden] = createSignal(false);
  const [showAllProjects, setShowAllProjects] = createSignal(false);
  const [selecting, setSelecting] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const openSessionKeys = () => props.openSessionKeys ?? [];
  const embedded = () => props.embedded ?? false;
  // The reference Projects tree starts fully collapsed; the active project
  // does not spring open until its row is clicked.
  const isWorkspaceCollapsed = (path: string, isActive: boolean) =>
    collapsed()[path] ?? (embedded() ? true : !isActive);
  // Drag selection is a range anchored on the row where the press started:
  // sweeping away grows the range, sweeping back shrinks it (or reveals rows
  // that were selected before the gesture).
  let gesture: {
    anchor: string;
    base: Set<string>;
    mode: "select" | "deselect";
  } | null = null;

  const allKeys = createMemo(() => {
    const keys: string[] = [];
    for (const [path, list] of Object.entries(props.sessionsByWorkspace)) {
      for (const session of list ?? []) keys.push(chatKey(path, session.id));
    }
    return keys;
  });

  const applySelection = (key: string, select: boolean) => {
    update(setSelected, selected, (previous) => {
      if (previous.has(key) === select) return previous;
      const next = new Set(previous);
      if (select) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set<string>());
    gesture = null;
  };

  const requestDelete = () => {
    const items = selectionItems(selected());
    if (items.length > 0) props.onDeleteSelected(items);
  };

  const requestMove = () => {
    const items = selectionItems(selected());
    if (items.length > 0) props.onMoveSelected(items);
  };

  const requestExport = () => {
    const items = selectionItems(selected());
    if (items.length > 0) props.onExportSelected(items);
  };

  /** Rebuilds the selection as the inclusive range from anchor to `key`. */
  const applyRange = (key: string) => {
    const current = gesture;
    if (!current) return;
    const keys = visibleKeys();
    const from = keys.indexOf(current.anchor);
    const to = keys.indexOf(key);
    if (from === -1 || to === -1) return;
    const next = new Set(current.base);
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      if (current.mode === "select") next.add(keys[index]);
      else next.delete(keys[index]);
    }
    setSelected(next);
  };

  const startPointer = (key: string, event: PointerEvent) => {
    // Row menus are portaled, so their events still bubble through the row;
    // ignore anything that is not physically inside this row.
    if (!containsTarget(event)) return;
    if (event.button !== 0) return;
    const mode = selecting() && selected().has(key) ? "deselect" : "select";
    gesture = { anchor: key, base: new Set(selected()), mode };
    // Pressing a row in selection mode toggles it right away; a later drag
    // extends the range that was implied by that press.
    if (selecting()) applyRange(key);
  };

  const enterRow = (key: string, event: PointerEvent) => {
    if (!containsTarget(event)) return;
    const current = gesture;
    if (!current || event.buttons !== 1) return;
    if (!selecting()) {
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
    setSelected(new Set<string>());
    update(setCollapsed, collapsed, (previous) => ({ ...previous, [path]: false }));
    props.onLoadSessions(path);
  };

  const selectAll = () => {
    update(setSelected, selected, (previous) =>
      previous.size === allKeys().length ? new Set<string>() : new Set(allKeys()),
    );
  };

  onMount(() => {
    const end = () => {
      gesture = null;
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    onCleanup(() => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    });
  });

  // Drop keys whose session disappeared (deleted elsewhere or a refreshed list).
  createEffect(() => {
    const alive = new Set(allKeys());
    update(setSelected, selected, (previous) => {
      if (previous.size === 0) return previous;
      const next = new Set([...previous].filter((key) => alive.has(key)));
      return next.size === previous.size ? previous : next;
    });
  });

  createEffect(() => {
    if (props.selectionReset === 0) return;
    props.selectionReset;
    setSelecting(false);
    setSelected(new Set<string>());
    gesture = null;
  });

  createEffect(() => {
    if (!selecting()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelecting(false);
        setSelected(new Set<string>());
        gesture = null;
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected().size > 0) {
        event.preventDefault();
        const items = selectionItems(selected());
        if (items.length > 0) props.onDeleteSelected(items);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  // The standalone sidebar always reveals the active workspace; the embedded
  // Projects tree follows the reference and stays collapsed until clicked.
  createEffect(() => {
    const path = props.activePath;
    if (!path) return;
    untrack(() => {
      props.onLoadSessions(path);
      if (!embedded()) {
        update(setCollapsed, collapsed, (prev) => (prev[path] === false ? prev : { ...prev, [path]: false }));
      }
    });
  });

  const draftsByWorkspace = createMemo(() => {
    const map = new Map<string, ChatState[]>();
    for (const [key, chat] of Object.entries(props.chats)) {
      if (!chat.draft) continue;
      const separator = key.indexOf("\u0000");
      const workspace = separator === -1 ? "" : key.slice(0, separator);
      const list = map.get(workspace) ?? [];
      list.push(chat);
      map.set(workspace, list);
    }
    return map;
  });

  const sortedSessions = createMemo(() => {
    const map: Record<string, SessionInfo[]> = {};
    for (const [path, list] of Object.entries(props.sessionsByWorkspace)) {
      map[path] = [...(list ?? [])].sort((a, b) => updatedAt(b) - updatedAt(a));
    }
    return map;
  });

  const searching = createMemo(() => query().trim() !== "");
  const results = createMemo<SearchHit[]>(() => {
    if (!searching()) return [];
    const needle = query().trim().toLowerCase();
    const hits: SearchHit[] = [];
    for (const workspace of props.workspaces) {
      const durable = sortedSessions()[workspace.path] ?? [];
      const durableIDs = new Set(durable.map((session) => session.id));
      for (const chat of draftsByWorkspace().get(workspace.path) ?? []) {
        if (durableIDs.has(chat.id)) continue;
        if (!"new session".includes(needle)) continue;
        hits.push({
          workspace,
          session: { id: chat.id, title: tr("newSession"), updated: "" },
          chat,
          draft: true,
        });
      }
      for (const session of durable) {
        if ((session.title || session.id).toLowerCase().includes(needle)) {
          hits.push({ workspace, session, chat: props.chats[chatKey(workspace.path, session.id)] });
        }
      }
    }
    return hits;
  });

  // Ordered keys of the rows rendered in the tree; drag selection maps the
  // pointer to a contiguous range of this list.
  const visibleKeys = createMemo(() => {
    if (searching()) return [];
    const keys: string[] = [];
    for (const workspace of props.workspaces) {
      if (isWorkspaceCollapsed(workspace.path, workspace.path === props.activePath)) continue;
      const limit = visible()[workspace.path] ?? PAGE_SIZE;
      for (const session of (sortedSessions()[workspace.path] ?? []).slice(0, limit)) {
        keys.push(chatKey(workspace.path, session.id));
      }
    }
    return keys;
  });

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const startSearch = () => {
    exitSelection();
    setSearchOpen(true);
    for (const workspace of props.workspaces) {
      if (workspace.connected) props.onLoadSessions(workspace.path);
    }
  };

  const toggleWorkspace = (path: string) => {
    const isActive = path === props.activePath;
    const isCollapsed = isWorkspaceCollapsed(path, isActive);
    if (!isActive) {
      props.onSelectWorkspace(path);
      props.onLoadSessions(path);
      update(setCollapsed, collapsed, (prev) => ({ ...prev, [path]: false }));
      return;
    }
    if (isCollapsed) props.onLoadSessions(path);
    update(setCollapsed, collapsed, (prev) => ({ ...prev, [path]: !isCollapsed }));
  };

  const openHit = (hit: SearchHit) => {
    props.onOpen(hit.workspace.path, hit.session.id);
    closeSearch();
  };

  const newSession = () => {
    const path = props.activePath ?? props.workspaces.find((workspace) => workspace.connected)?.path;
    if (path) props.onNew(path);
  };

  return (
    <aside
      aria-label={embedded() ? tr("projects") : tr("workspaces")}
      data-projects-collapsed={embedded() && projectsHidden() ? "true" : undefined}
      class={
        embedded()
          ? "flex min-h-0 w-full flex-1 select-none flex-col bg-bg-deep"
          : "flex h-full w-sidebar shrink-0 select-none flex-col border-r border-border-base bg-bg-deep"
      }
    >
      <Show when={!embedded()}>
        <div class="px-2 pt-2 pb-1">
          <button
            type="button"
            onClick={newSession}
            disabled={selecting() || (!props.activePath && !props.workspaces.some((workspace) => workspace.connected))}
            class="group/new interactive flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] leading-4 text-text-faint hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil class="size-4 shrink-0" />
            <span class="min-w-0 truncate">{tr("newSession")}</span>
            <span class="ms-auto hidden shrink-0 group-hover/new:block">
              <Keybind keys={(formatKeybind("mod+t") ?? "Ctrl+T").split("+")} />
            </span>
          </button>
        </div>
      </Show>

      <div class={`flex h-6 items-center gap-1 ${embedded() && !searching() && !selecting() ? "" : "px-2"}`}>
        <Show
          when={selecting()}
          fallback={
            <Show
              when={searchOpen()}
              fallback={
                <>
                  <Show
                    when={embedded()}
                    fallback={
                      <span class="flex-1 text-body leading-4 font-medium text-text-muted">{tr("workspaces")}</span>
                    }
                  >
                    <button
                      type="button"
                      aria-expanded={!projectsHidden()}
                      onClick={() => update(setProjectsHidden, projectsHidden, (value) => !value)}
                      class="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-body leading-4 font-medium text-text-muted hover:text-text-base focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-none"
                    >
                      <span class="min-w-0 truncate">{tr("projects")}</span>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        width="14"
                        height="14"
                        class={`shrink-0 text-icon-muted transition-transform ${projectsHidden() ? "-rotate-90" : ""}`}
                      >
                        <path
                          d="M5.37624 6.75194C5.18184 6.41861 5.42224 6 5.80814 6H10.1921C10.578 6 10.8184 6.41861 10.624 6.75194L8.43203 10.5096C8.23909 10.8404 7.76119 10.8404 7.56825 10.5096L5.37624 6.75194Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </Show>
                  <Show when={!embedded()}>
                    <Tooltip>
                      <TooltipTrigger
                        variant="ghost"
                        size="icon-xs"
                        aria-label={tr("searchSessions")}
                        onClick={startSearch}
                        class="text-text-faint hover:text-text-base"
                        as={Button}
                      >
                        <Search />
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{tr("searchSessions")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        variant="ghost"
                        size="icon-xs"
                        aria-label={tr("addWorkspace")}
                        onClick={() => props.onAddWorkspace()}
                        class="text-text-faint hover:text-text-base"
                        as={Button}
                      >
                        <Plus />
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{tr("addWorkspace")}</TooltipContent>
                    </Tooltip>
                  </Show>
                </>
              }
            >
              <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-text-faint" />
                <Input
                  autofocus
                  size="sm"
                  value={query()}
                  aria-label={tr("searchSessions")}
                  placeholder={tr("searchSessions")}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeSearch();
                  }}
                  class="pl-6 text-meta"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={tr("closeSearch")}
                onClick={closeSearch}
                class="text-text-faint hover:text-text-base"
              >
                <X />
              </Button>
            </Show>
          }
        >
          <span class="sr-only" aria-live="polite">
            {tr("selectedCount", { count: selected().size })}
          </span>
          <span class="flex-1 truncate text-body leading-4 font-medium text-text-muted">
            {embedded() ? tr("projects") : tr("workspaces")}
          </span>
          <button
            type="button"
            onClick={selectAll}
            disabled={allKeys().length === 0}
            class="interactive h-control-xs shrink-0 rounded-xs px-2 text-caption text-text-faint hover:text-text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selected().size === allKeys().length && allKeys().length > 0
              ? tr("clear")
              : tr("selectAllAction")}
          </button>
          <Tooltip>
            <TooltipTrigger
              variant="ghost"
              size="icon-xs"
              aria-label={tr("deleteSelected")}
              disabled={selected().size === 0}
              onClick={requestDelete}
              class="text-state-fg-danger"
              as={Button}
            >
              <Trash2 />
            </TooltipTrigger>
            <TooltipContent side="bottom">{tr("deleteSelected")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              variant="ghost"
              size="icon-xs"
              aria-label={tr("moveSelected")}
              disabled={selected().size === 0}
              onClick={requestMove}
              class="text-text-muted"
              as={Button}
            >
              <FolderInput />
            </TooltipTrigger>
            <TooltipContent side="bottom">{tr("moveSelected")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              variant="ghost"
              size="icon-xs"
              aria-label={tr("exportSelected")}
              disabled={selected().size === 0}
              onClick={requestExport}
              class="text-text-muted"
              as={Button}
            >
              <Download />
            </TooltipTrigger>
            <TooltipContent side="bottom">{tr("exportSelected")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              variant="ghost"
              size="icon-xs"
              aria-label={tr("cancelSelection")}
              onClick={exitSelection}
              class="text-text-faint hover:text-text-base"
              as={Button}
            >
              <X />
            </TooltipTrigger>
            <TooltipContent side="bottom">{tr("cancel")}</TooltipContent>
          </Tooltip>
        </Show>
      </div>

      <Show when={!(embedded() && projectsHidden() && !searching() && !selecting())}>
        <div
          role="tree"
          aria-label={tr("sessions")}
          class={embedded() ? "mt-2 flex flex-col gap-1" : "scroll-stable flex-1 overflow-y-auto px-2 pb-3"}
        >
          <Show
            when={searching()}
            fallback={
              <>
                <For
                  each={
                    embedded() && !showAllProjects() ? props.workspaces.slice(0, 7) : props.workspaces
                  }
                >
                  {(workspace) => {
                    const isActive = () => workspace.path === props.activePath;
                    const isCollapsed = () => isWorkspaceCollapsed(workspace.path, isActive());
                    const durable = () => sortedSessions()[workspace.path] ?? [];
                    const loadingSessions = () => !props.sessionsByWorkspace[workspace.path];
                    const draftRows = () =>
                      (draftsByWorkspace().get(workspace.path) ?? []).filter(
                        (chat) => !durable().some((session) => session.id === chat.id),
                      );
                    const limit = () => visible()[workspace.path] ?? PAGE_SIZE;
                    const hidden = () => Math.max(0, durable().length - limit());
                    return (
                      <div class={embedded() ? "" : "pb-1"}>
                        <WorkspaceRow
                          workspace={workspace}
                          active={isActive()}
                          expanded={!isCollapsed()}
                          onToggle={() => toggleWorkspace(workspace.path)}
                          onNew={() => props.onNew(workspace.path)}
                          onSelectSessions={() => startWorkspaceSelection(workspace.path)}
                          onRemove={() => props.onRemoveWorkspace(workspace.path)}
                          onWorktree={() => props.onWorktree(workspace.path)}
                          onSourceControl={() => props.onSourceControl(workspace.path)}
                          onFiles={() => props.onFiles(workspace.path)}
                          onArtifacts={() => props.onArtifacts(workspace.path)}
                          onProject={() => props.onProject(workspace.path)}
                          onImport={() => props.onImport(workspace.path)}
                          onServices={() => props.onServices(workspace.path)}
                          onCore={() => props.onCore(workspace.path)}
                          onCoreModels={() => props.onCoreModels(workspace.path)}
                          onMCP={() => props.onMCP(workspace.path)}
                          onPlugins={() => props.onPlugins(workspace.path)}
                          onSearch={() => props.onSearch(workspace.path)}
                          onLiveEvents={() => props.onLiveEvents(workspace.path)}
                          onSchedulesOverview={() => props.onSchedulesOverview(workspace.path)}
                          onJobsOverview={() => props.onJobsOverview(workspace.path)}
                          onUsageOverview={() => props.onUsageOverview(workspace.path)}
                          onWebSearch={() => props.onWebSearch(workspace.path)}
                          onImageGen={() => props.onImageGen(workspace.path)}
                          onFormatters={() => props.onFormatters(workspace.path)}
                          onOAuth={() => props.onOAuth(workspace.path)}
                          onWorktreesManage={() => props.onWorktreesManage(workspace.path)}
                        />

                        <Show when={!isCollapsed()}>
                          <div role="group" class="flex flex-col gap-[3px] pb-1">
                            <Show when={loadingSessions()}>
                              <SkeletonSessions />
                            </Show>
                            <Show when={!selecting()}>
                              <For each={draftRows()}>
                                {(chat) => (
                                  <SessionRow
                                    session={{ id: chat.id, title: tr("newSession"), updated: "" }}
                                    active={isActive() && chat.id === props.activeId}
                                    chat={chat}
                                    draft
                                    onClick={() => props.onOpen(workspace.path, chat.id)}
                                  />
                                )}
                              </For>
                            </Show>
                            <For each={durable().slice(0, limit())}>
                              {(session) => {
                                const key = chatKey(workspace.path, session.id);
                                return (
                                  <SessionRow
                                    session={session}
                                    active={isActive() && session.id === props.activeId}
                                    chat={props.chats[key]}
                                    selecting={selecting()}
                                    selected={selected().has(key)}
                                    onClick={() => {
                                      if (!selecting()) props.onOpen(workspace.path, session.id);
                                    }}
                                    onPointerDown={(event) => startPointer(key, event)}
                                    onPointerEnter={(event) => enterRow(key, event)}
                                    onToggle={() => applySelection(key, !selected().has(key))}
                                    openTab={openSessionKeys().includes(chatKey(workspace.path, session.id))}
                                    unread={props.unreadKeys?.has(key)}
                                    onRename={() => props.onRename(workspace.path, session)}
                                    onFork={() => props.onFork(workspace.path, session)}
                                    onSchedules={() => props.onSchedules(workspace.path, session)}
                                    onPairing={() => props.onPairing(workspace.path, session)}
                                    onMedia={() => props.onMedia(workspace.path, session)}
                                    onUsage={() => props.onUsage(workspace.path, session)}
                                    onContext={() => props.onContext(workspace.path, session)}
                                    onReferences={() => props.onReferences(workspace.path, session)}
                                    onLog={() => props.onLog(workspace.path, session)}
                                    onInbox={() => props.onInbox(workspace.path, session)}
                                    onForms={() => props.onForms(workspace.path, session)}
                                    onJobs={() => props.onJobs(workspace.path, session)}
                                    onSkills={() => props.onSkills(workspace.path, session)}
                                    onSynthetic={() => props.onSynthetic(workspace.path, session)}
                                    onRunCommand={() => props.onRunCommand(workspace.path, session)}
                                    onPromptOnce={() => props.onPromptOnce(workspace.path, session)}
                                    onWait={() => props.onWait(workspace.path, session)}
                                    onRevert={() => props.onRevert(workspace.path, session)}
                                    onReview={() => props.onReview(workspace.path, session)}
                                    onCompact={() => props.onCompact(workspace.path, session)}
                                    onExport={() => props.onExport(workspace.path, session)}
                                    onEnvironment={() => props.onEnvironment(workspace.path, session)}
                                    onDelete={() => props.onDelete(workspace.path, session)}
                                    onShare={() => props.onShare(workspace.path, session)}
                                    onMove={() => props.onMove(workspace.path, session)}
                                    onSelect={() => selectSession(key)}
                                  />
                                );
                              }}
                            </For>
                            <Show when={hidden() > 0}>
                              <button
                                type="button"
                                onClick={() =>
                                  update(setVisible, visible, (prev) => ({
                                    ...prev,
                                    [workspace.path]: limit() + PAGE_SIZE,
                                  }))
                                }
                                class="interactive ms-[23px] flex h-6 self-start items-center rounded-xs px-2 text-body leading-4 font-[440] text-text-muted"
                              >
                                {tr("showMore")}
                              </button>
                            </Show>
                            <Show when={!loadingSessions() && draftRows().length === 0 && durable().length === 0}>
                              <Show
                                when={embedded()}
                                fallback={
                                  <div class="flex flex-col items-center gap-2 px-4 py-4 text-center text-text-faint">
                                    <MessageSquarePlus class="size-5" />
                                    <p class="text-meta">{tr("noSessions")}</p>
                                  </div>
                                }
                              >
                                <div class="ps-8 pe-2 py-2 text-meta text-text-faint">{tr("noSessions")}</div>
                              </Show>
                            </Show>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </>
            }
          >
            <div role="group" class="pt-1">
              <div class="flex h-6 items-center px-2 text-caption text-text-faint">
                {tr(results().length === 1 ? "resultsCountOne" : "resultsCountMany", {
                  count: results().length,
                })}
              </div>
              <For each={results()}>
                {(hit) => (
                  <SessionRow
                    session={hit.session}
                    workspaceName={hit.workspace.name}
                    active={hit.workspace.path === props.activePath && hit.session.id === props.activeId}
                    chat={hit.chat}
                    draft={hit.draft}
                    unread={props.unreadKeys?.has(chatKey(hit.workspace.path, hit.session.id))}
                    variant="search"
                    onClick={() => openHit(hit)}
                    onRename={hit.draft ? undefined : () => props.onRename(hit.workspace.path, hit.session)}
                    onFork={hit.draft ? undefined : () => props.onFork(hit.workspace.path, hit.session)}
                    onSchedules={hit.draft ? undefined : () => props.onSchedules(hit.workspace.path, hit.session)}
                    onPairing={hit.draft ? undefined : () => props.onPairing(hit.workspace.path, hit.session)}
                    onMedia={hit.draft ? undefined : () => props.onMedia(hit.workspace.path, hit.session)}
                    onUsage={hit.draft ? undefined : () => props.onUsage(hit.workspace.path, hit.session)}
                    onContext={hit.draft ? undefined : () => props.onContext(hit.workspace.path, hit.session)}
                    onReferences={hit.draft ? undefined : () => props.onReferences(hit.workspace.path, hit.session)}
                    onLog={hit.draft ? undefined : () => props.onLog(hit.workspace.path, hit.session)}
                    onInbox={hit.draft ? undefined : () => props.onInbox(hit.workspace.path, hit.session)}
                    onForms={hit.draft ? undefined : () => props.onForms(hit.workspace.path, hit.session)}
                    onJobs={hit.draft ? undefined : () => props.onJobs(hit.workspace.path, hit.session)}
                    onSkills={hit.draft ? undefined : () => props.onSkills(hit.workspace.path, hit.session)}
                    onSynthetic={hit.draft ? undefined : () => props.onSynthetic(hit.workspace.path, hit.session)}
                    onRunCommand={hit.draft ? undefined : () => props.onRunCommand(hit.workspace.path, hit.session)}
                    onPromptOnce={hit.draft ? undefined : () => props.onPromptOnce(hit.workspace.path, hit.session)}
                    onWait={hit.draft ? undefined : () => props.onWait(hit.workspace.path, hit.session)}
                    onRevert={hit.draft ? undefined : () => props.onRevert(hit.workspace.path, hit.session)}
                    onReview={hit.draft ? undefined : () => props.onReview(hit.workspace.path, hit.session)}
                    onCompact={hit.draft ? undefined : () => props.onCompact(hit.workspace.path, hit.session)}
                    onExport={hit.draft ? undefined : () => props.onExport(hit.workspace.path, hit.session)}
                    onEnvironment={hit.draft ? undefined : () => props.onEnvironment(hit.workspace.path, hit.session)}
                    onDelete={hit.draft ? undefined : () => props.onDelete(hit.workspace.path, hit.session)}
                    onShare={hit.draft ? undefined : () => props.onShare(hit.workspace.path, hit.session)}
                    onMove={hit.draft ? undefined : () => props.onMove(hit.workspace.path, hit.session)}
                  />
                )}
              </For>
              <Show when={results().length === 0}>
                <div class="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-faint">
                  <Search class="size-6" />
                  <p class="text-meta">{tr("noMatches")}</p>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={embedded() && props.workspaces.length > 7 && !searching() && !selecting()}>
            <button
              type="button"
              onClick={() => update(setShowAllProjects, showAllProjects, (value) => !value)}
              class="interactive ms-[23px] flex h-6 self-start items-center rounded-xs px-2 text-body leading-4 font-[440] text-text-muted"
            >
              {showAllProjects() ? tr("showLess") : tr("showMore")}
            </button>
          </Show>

          <Show when={props.workspaces.length === 0 && !searching() && !embedded()}>
            <div class="flex flex-col items-center gap-3 px-4 py-8 text-center text-text-faint">
              <FolderClosed class="size-6" />
              <p class="text-meta">{tr("noWorkspaces")}</p>
              <Button variant="outline" size="sm" onClick={() => props.onAddWorkspace()}>
                {tr("addWorkspace")}
              </Button>
            </div>
          </Show>
        </div>
      </Show>
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
  onPointerDown?: (event: PointerEvent) => void;
  onPointerEnter?: (event: PointerEvent) => void;
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

function SessionRow(props: RowProps) {
  const tr = useT();
  // A recovered run exists before its chat has been opened, so the session
  // list carries the running flag as a fallback.
  const running = () => props.chat?.running || props.session.running;
  const attention = () => (props.chat?.pending.length ?? 0) > 0 || (props.chat?.questions.length ?? 0) > 0;
  const status = () =>
    attention()
      ? "warning"
      : running()
        ? "ongoing"
        : props.chat?.lastRunStatus === "failed"
          ? "error"
          : props.chat?.lastRunStatus === "completed"
            ? "done"
            : "idle";
  const title = () => (props.draft ? tr("paletteNewSession") : props.session.title || props.session.id);
  const search = () => (props.variant ?? "default") === "search";
  const [menuAt, setMenuAt] = createSignal<{ x: number; y: number }>();

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-selected={props.selecting ? props.selected : props.active}
      data-selected={props.selecting ? props.selected : undefined}
      data-selecting={props.selecting ? "true" : undefined}
      data-state={props.active && !props.selecting ? "pressed" : undefined}
      onClick={(event) => {
        if (!containsTarget(event)) return;
        props.onClick();
      }}
      onPointerDown={(event) => props.onPointerDown?.(event)}
      onPointerEnter={(event) => props.onPointerEnter?.(event)}
      onContextMenu={(event) => {
        if (!(props.onSelect || props.onRename || props.onDelete)) return;
        event.preventDefault();
        setMenuAt({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (props.selecting) props.onToggle?.();
          else props.onClick();
        }
      }}
      class={`side-rail-row interactive group/session relative flex cursor-default items-center gap-2 rounded-md pe-2 text-[13px] leading-4 font-medium ${
        search() ? "min-h-12 py-1 ps-2" : "h-7 ps-8"
      } ${props.active || props.selected ? "text-text-base" : props.selecting ? "text-text-muted" : "text-text-faint"}`}
    >
      <Show
        when={props.selecting}
        fallback={
          <Show when={props.openTab}>
            <span aria-hidden class="absolute start-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
              <span class="size-1 rounded-full bg-icon-faint" />
            </span>
          </Show>
        }
      >
        <span
          aria-hidden
          class={`absolute start-2 top-1/2 grid size-3 -translate-y-1/2 place-items-center rounded-xs border transition-colors ${
            props.selected
              ? "border-transparent bg-bg-layer-03 text-text-base"
              : "border-border-base text-transparent"
          }`}
        >
          <Check class="size-2" stroke-width={3} />
        </span>
      </Show>

      <Show
        when={search()}
        fallback={<span class="min-w-0 flex-1 truncate">{title()}</span>}
      >
        <span class="flex min-w-0 flex-1 flex-col justify-center">
          <span class="flex min-w-0 items-center gap-1">
            <span class="min-w-0 flex-1 truncate">{title()}</span>
          </span>
          <Show when={props.workspaceName}>
            {(workspaceName) => <span class="truncate text-meta text-text-faint">{workspaceName()}</span>}
          </Show>
        </span>
      </Show>

      <Show when={!props.draft}>
        <span class="relative flex size-4 shrink-0 items-center justify-center">
          <span class="flex items-center justify-center">
            <Show when={running()}>
              <ActivityRing size={14} />
            </Show>
            <Show when={!running() && !props.active && (attention() || status() === "error" || props.unread)}>
              <span class="size-1.5 rounded-full bg-text-base" />
            </Show>
          </span>

          <Show when={props.onSelect || props.onRename || props.onDelete}>
            <DropdownMenu open={menuAt() !== undefined} onOpenChange={closeTarget(setMenuAt)}>
              <DropdownMenuTrigger
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                style={{
                  position: "fixed",
                  left: `${menuAt()?.x ?? 0}px`,
                  top: `${menuAt()?.y ?? 0}px`,
                  width: "0px",
                  height: "0px",
                }}
              />
              <DropdownMenuContent side="bottom" align="start" sideOffset={2}>
                <Show when={props.onSelect}>
                  {(onSelect) => (
                    <DropdownMenuItem onSelect={() => props.onSelect?.()}>
                      <ListChecks />
                      {tr("selectSessionAction")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onRename}>
                  {(onRename) => (
                    <DropdownMenuItem onSelect={() => props.onRename?.()}>
                      <Pencil />
                      {tr("renamePlain")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onFork}>
                  {(onFork) => (
                    <DropdownMenuItem onSelect={() => props.onFork?.()}>
                      <GitFork />
                      {tr("paletteForkSession")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onSchedules}>
                  {(onSchedules) => (
                    <DropdownMenuItem onSelect={() => props.onSchedules?.()}>
                      <Clock />
                      {tr("schedules")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onPairing}>
                  {(onPairing) => (
                    <DropdownMenuItem onSelect={() => props.onPairing?.()}>
                      <QrCode />
                      {tr("pairingTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onMedia}>
                  {(onMedia) => (
                    <DropdownMenuItem onSelect={() => props.onMedia?.()}>
                      <Images />
                      {tr("mediaTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onUsage}>
                  {(onUsage) => (
                    <DropdownMenuItem onSelect={() => props.onUsage?.()}>
                      <Gauge />
                      {tr("usage")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onContext}>
                  {(onContext) => (
                    <DropdownMenuItem onSelect={() => props.onContext?.()}>
                      <Layers />
                      {tr("context")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onReferences}>
                  {(onReferences) => (
                    <DropdownMenuItem onSelect={() => props.onReferences?.()}>
                      <FileSearch />
                      {tr("referencesTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onLog}>
                  {(onLog) => (
                    <DropdownMenuItem onSelect={() => props.onLog?.()}>
                      <ScrollText />
                      {tr("logTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onInbox}>
                  {(onInbox) => (
                    <DropdownMenuItem onSelect={() => props.onInbox?.()}>
                      <Inbox />
                      {tr("inboxTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onCompact}>
                  {(onCompact) => (
                    <DropdownMenuItem onSelect={() => props.onCompact?.()}>
                      <Minimize2 />
                      {tr("compactTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onExport}>
                  {(onExport) => (
                    <DropdownMenuItem onSelect={() => props.onExport?.()}>
                      <Download />
                      {tr("export")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onEnvironment}>
                  {(onEnvironment) => (
                    <DropdownMenuItem onSelect={() => props.onEnvironment?.()}>
                      <Cpu />
                      {tr("environmentTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onForms}>
                  {(onForms) => (
                    <DropdownMenuItem onSelect={() => props.onForms?.()}>
                      <ClipboardList />
                      {tr("formsTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onJobs}>
                  {(onJobs) => (
                    <DropdownMenuItem onSelect={() => props.onJobs?.()}>
                      <ListTodo />
                      {tr("backgroundJobs")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onSkills}>
                  {(onSkills) => (
                    <DropdownMenuItem onSelect={() => props.onSkills?.()}>
                      <Sparkles />
                      {tr("skills")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onSynthetic}>
                  {(onSynthetic) => (
                    <DropdownMenuItem onSelect={() => props.onSynthetic?.()}>
                      <Send />
                      {tr("paletteSynthetic")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onRunCommand}>
                  {(onRunCommand) => (
                    <DropdownMenuItem onSelect={() => props.onRunCommand?.()}>
                      <Command />
                      {tr("runCommandTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onPromptOnce}>
                  {(onPromptOnce) => (
                    <DropdownMenuItem onSelect={() => props.onPromptOnce?.()}>
                      <Send />
                      {tr("palettePromptOnce")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onWait}>
                  {(onWait) => (
                    <DropdownMenuItem onSelect={() => props.onWait?.()}>
                      <Clock />
                      {tr("paletteWait")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onRevert}>
                  {(onRevert) => (
                    <DropdownMenuItem onSelect={() => props.onRevert?.()}>
                      <History />
                      {tr("revertTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onReview}>
                  {(onReview) => (
                    <DropdownMenuItem onSelect={() => props.onReview?.()}>
                      <GitCompare />
                      {tr("paletteReviewChanges")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onShare}>
                  {(onShare) => (
                    <DropdownMenuItem onSelect={() => props.onShare?.()}>
                      <Share2 />
                      {tr("shareTitle")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onMove}>
                  {(onMove) => (
                    <DropdownMenuItem onSelect={() => props.onMove?.()}>
                      <FolderInput />
                      {tr("moveToWorkspace")}
                    </DropdownMenuItem>
                  )}
                </Show>
                <Show when={props.onDelete}>
                  {(onDelete) => (
                    <>
                      <Show when={props.onSelect || props.onRename || props.onShare || props.onMove}>
                        <DropdownMenuSeparator />
                      </Show>
                      <DropdownMenuItem destructive onSelect={() => props.onDelete?.()}>
                        <Trash2 />
                        {tr("removeAction")}
                      </DropdownMenuItem>
                    </>
                  )}
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </span>
      </Show>
    </div>
  );
}

function updatedAt(session: SessionInfo): number {
  const value = new Date(session.updated).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/** True when the event came from inside the element that owns the handler. */
function containsTarget(event: Event): boolean {
  return (
    event.target instanceof Node &&
    event.currentTarget instanceof Node &&
    event.currentTarget.contains(event.target)
  );
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
 * stay visible while its menu is open: an open menu suppresses pointer
 * hit-testing on the anchor, which would otherwise collapse the strip and
 * unmount the trigger under its own open menu.
 */
function WorkspaceRow(props: WorkspaceRowProps) {
  const tr = useT();
  const [menuOpen, setMenuOpen] = createSignal(false);

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={props.expanded}
      aria-current={props.active ? "true" : undefined}
      data-open={menuOpen() ? "true" : undefined}
      title={props.workspace.error || props.workspace.path}
      onClick={(event) => {
        if (!containsTarget(event)) return;
        props.onToggle();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onToggle();
        }
      }}
      class="side-rail-row interactive group/ws flex h-7 cursor-default items-center gap-2 rounded-md ps-2 pe-1 text-[13px] leading-4"
    >
      <ProjectAvatar name={props.workspace.name} icon={props.workspace.icon} color={props.workspace.color} />
      <span class="min-w-0 flex-1 truncate font-[440] text-text-muted transition-colors group-hover/ws:text-text-base group-focus-visible/ws:text-text-base">
        {props.workspace.name}
      </span>
      <Show
        when={props.workspace.starting}
        fallback={
          <Show when={!props.workspace.connected}>
            <span class="shrink-0 text-caption text-state-fg-danger">{tr("offline")}</span>
          </Show>
        }
      >
        <span class="shrink-0 text-caption text-text-muted">{tr("starting")}</span>
      </Show>
      <span
        data-open={menuOpen() ? "true" : undefined}
        class="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/ws:pointer-events-auto group-focus-within/ws:opacity-100 group-hover/ws:pointer-events-auto group-hover/ws:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100"
      >
        <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            type="button"
            aria-label={tr("moreActionsFor", { name: props.workspace.name })}
            onClick={(event) => event.stopPropagation()}
            class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
          >
            <Ellipsis class="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <DropdownMenuItem onSelect={() => props.onNew()}>
              <MessageSquarePlus />
              {tr("paletteNewSession")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onImport()}>
              <Upload />
              {tr("importSession")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onSelectSessions()}>
              <ListChecks />
              {tr("selectSessions")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onProject()}>
              <FolderCog />
              {tr("paletteProject")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onServices()}>
              <Server />
              {tr("servicesTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onCore()}>
              <Boxes />
              {tr("coreTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onCoreModels()}>
              <Gauge />
              {tr("paletteCoreModels")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onMCP()}>
              <Plug />
              {tr("mcpServers")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onPlugins()}>
              <Puzzle />
              {tr("plugins")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onSearch()}>
              <Search />
              {tr("searchEvents")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onLiveEvents()}>
              <Activity />
              {tr("paletteLiveEvents")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onSchedulesOverview()}>
              <Clock />
              {tr("schedules")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onJobsOverview()}>
              <ListTodo />
              {tr("backgroundJobs")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onUsageOverview()}>
              <Gauge />
              {tr("paletteUsageOverview")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onWebSearch()}>
              <Globe />
              {tr("paletteWebSearch")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onImageGen()}>
              <ImagePlus />
              {tr("imageGenerate")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onFormatters()}>
              <Wand2 />
              {tr("formattersTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onOAuth()}>
              <KeyRound />
              {tr("oauthTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onFiles()}>
              <FolderTree />
              {tr("files")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onArtifacts()}>
              <Package />
              {tr("artifactsTitle")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onSourceControl()}>
              <GitCompare />
              {tr("sourceControl")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onWorktree()}>
              <GitBranch />
              {tr("newWorktree")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onWorktreesManage()}>
              <GitBranch />
              {tr("worktrees")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => props.onRemove()}>
              <Trash2 />
              {tr("removeWorkspace")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={tr("newSessionIn", { name: props.workspace.name })}
          onClick={(event) => {
            event.stopPropagation();
            props.onNew();
          }}
          class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
        >
          <Pencil class="size-4" />
        </button>
      </span>
    </div>
  );
}

/** Two quiet placeholder rows while a workspace's history is fetched. */
function SkeletonSessions() {
  const tr = useT();
  return (
    <div role="status" aria-label={tr("loadingSessions")} class="pt-1">
      <For each={[0, 1]}>
        {(index) => (
          <div aria-hidden class="flex h-control-md items-center gap-2 pr-1 pl-2">
            <span class="grid size-4 place-items-center">
              <span class="size-2 rounded-full bg-bg-layer-03" />
            </span>
            <span
              class={`h-2 rounded-xs bg-bg-layer-03 motion-safe:animate-pulse ${
                index === 0 ? "w-32" : "w-24"
              }`}
            />
          </div>
        )}
      </For>
    </div>
  );
}
