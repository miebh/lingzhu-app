import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  ExternalLink,
  FolderClosed,
  FolderOpen,
  Layers,
  MessageSquarePlus,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "@lingzhu/ui/icons";
import { Button, buttonVariants } from "@lingzhu/ui/button";
import { cn } from "@lingzhu/ui/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { SegmentedControl } from "@lingzhu/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { update, createReducer } from "@lingzhu/ui/solid";
import { ReviewFileTree } from "@lingzhu/session-ui/ReviewFileTree";
import { PluginPanelsPane } from "./PluginPanelsPane";
import { CopyButton } from "@lingzhu/session-ui/Markdown";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import {
  addReviewComment,
  diffLineNumber,
  formatReviewPrompt,
  parsePatch,
  removeReviewComment,
  splitPatch,
  type DiffLine,
  type ReviewComment,
} from "@lingzhu/session-ui/review";
import type { ChatState, FileContent, FileSearchHit, FsEntry } from "@lingzhu/ui/types";
import {
  createSessionDiffState,
  sessionDiffView,
  transitionSessionDiff,
} from "../../app/features/session/review-machine";
import { fileStatusLetter, fileStatusTone } from "@lingzhu/ui/status";

import { sessionChanges } from "@lingzhu/session-ui/timeline";
import { useT } from "@lingzhu/ui/i18n";
import { formatTokens } from "@lingzhu/ui/format";
import {
  isFilePanelTab,
  CONFIG_FILE_TAB,
  SIDE_PANEL_TAB_IDS,
  type SidePanelTab,
  type SidePanelTabID,
} from "../../lib/sidePanel";
import {
  CHAT_PANEL_WIDTH_MIN,
  PANEL_ROW_GAP,
  SIDE_PANEL_WIDTH_MIN,
  clampSidePanelWidth,
  overlaySidePanelWidth,
  panelRowHoldsBoth,
  readSidePanelWidth,
} from "../../lib/panelWidth";
import {
  panelContentOpacity,
  panelSpring,
  prefersReducedMotion,
  stepPanelSpring,
  type PanelSpring,
} from "../../lib/panelMotion";

function iconFor(id: SidePanelTabID) {
  if (isFilePanelTab(id)) return FileText;
  if (id === "review") return MessageSquarePlus;
  if (id === "files") return FolderClosed;
  if (id === "details") return Layers;
  return Plug;
}

/** The strip label of a fixed view. */
function tabLabel(tr: ReturnType<typeof useT>, id: SidePanelTabID): string {
  if (id === "review") return tr("review");
  if (id === "files") return tr("files");
  if (id === "details") return tr("details");
  return tr("plugins");
}

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  tabs: SidePanelTab[];
  active?: SidePanelTabID;
  onSelect: (id: SidePanelTabID) => void;
  onCloseTab: (id: SidePanelTabID) => void;
  /** Adds a view to the panel; the + menu lists the views it does not show yet. */
  onAddTab?: (id: SidePanelTabID) => void;
  onReorderTabs?: (ids: SidePanelTabID[]) => void;
  /** Kept for callers that pass it; the floating review toggle now closes the panel. */
  onClose?: () => void;
  onSendReview: (text: string, comments?: ReviewComment[]) => void;
  /** Opens a workspace file in its own side tab. */
  onOpenFile?: (path: string) => void;
  /** The active session, shown by the Details pane. */
  chat?: ChatState;
  /** Catalog context window of the active model, shown by the Details pane. */
  contextWindow?: number;
  /** Header end inset: 10px beside vertical tabs, 12px beside the horizontal strip. */
  endInset?: number;
}

/** Splits a workspace-relative path into the trailing name and the directory prefix. */
function splitFilePath(file: string): { name: string; directory: string } {
  const index = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  if (index < 0) return { name: file, directory: "" };
  return { name: file.slice(index + 1), directory: file.slice(0, index + 1) };
}

function lineClass(line: DiffLine): string {
  if (line.kind === "add") return "bg-[var(--diff-add-bg)]";
  if (line.kind === "del") return "bg-[var(--diff-remove-bg)]";
  if (line.kind === "meta") return "text-text-faint";
  return "";
}

function lineNumberClass(line: DiffLine, selected?: boolean): string {
  if (selected) return "text-text-accent";
  if (line.kind === "add") return "text-[var(--diff-add-fg)]";
  if (line.kind === "del") return "text-[var(--diff-remove-fg)]";
  return "text-text-faint";
}

/** A saved note rendered directly under the diff line it belongs to. */
function InlineReviewNote(props: { note: ReviewComment; onRemove: () => void }) {
  const tr = useT();
  return (
    <div
      data-slot="review-line-note"
      data-line={props.note.start}
      class="flex min-w-full items-start gap-2 border-s-[2px] border-border-focus bg-bg-layer-01 py-2 pe-2 ps-3"
    >
      <MessageSquarePlus class="mt-0.5 size-3.5 shrink-0 text-text-faint" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
          L{props.note.start}
          {props.note.end === props.note.start ? "" : `-${props.note.end}`} ({props.note.side})
        </span>
        <p class="whitespace-pre-wrap text-body leading-4 text-text-base select-text">{props.note.text}</p>
      </div>
      <button
        type="button"
        aria-label={tr("removeReviewNote")}
        onClick={props.onRemove}
        class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
      >
        <Trash2 class="size-3" />
      </button>
    </div>
  );
}

/** The composer that opens under a clicked line, anchored to its range. */
function ReviewComposer(props: {
  target: { start: number; end: number; side: "old" | "new" };
  text: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const tr = useT();
  return (
    <div
      data-slot="review-line-composer"
      data-line={props.target.start}
      class="min-w-full border-s-[2px] border-border-focus bg-bg-layer-01 p-2"
    >
      <div class="flex flex-col gap-2 rounded-md bg-bg-base p-2.5 shadow-elevation-raised">
        <div class="flex items-center gap-2 text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
          <MessageSquarePlus class="size-3.5 shrink-0" />
          <span>
            L{props.target.start}
            {props.target.end === props.target.start ? "" : `-${props.target.end}`} ({props.target.side})
          </span>
        </div>
        <textarea
          autofocus
          value={props.text}
          aria-label={tr("reviewComment")}
          placeholder={tr("reviewCommentPlaceholder")}
          rows={2}
          onInput={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onCancel();
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              props.onSubmit();
            }
          }}
          class="block w-full resize-none border-0 bg-transparent text-body leading-4 font-[440] text-text-base outline-none placeholder:text-text-faint"
        />
        <div class="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={props.text.trim() === ""} onClick={props.onSubmit}>
            {tr("dialogAddNote")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The session's right-hand panel: a tab strip over the review diff and the
 * workspace files. The strip stays visible while the panel is open; closing
 * the last tab closes the panel, as in the reference shell.
 */
export function SessionSidePanel(props: Props) {
  const tr = useT();
  const [dragKey, setDragKey] = createSignal<SidePanelTabID>();
  let aside: HTMLElement | undefined;
  // The user's chosen width. The shown width is derived from it and the row, so
  // narrowing the window shrinks the panel and widening it restores the choice.
  const [storedWidth, setStoredWidth] = createSignal(
    readSidePanelWidth(localStorage.getItem("lingzhu.sidePanelWidth")),
  );
  // The row's measured width decides how much the panel may take and whether it
  // still fits beside the transcript; undefined until the first measurement.
  const [rowWidth, setRowWidth] = createSignal<number>();
  const drag = { current: null as { startX: number; startWidth: number } | null };
  // Closing keeps the pane mounted while its width travels back to zero, so the
  // transcript gets its room on the last frame instead of the toggle's.
  const [present, setPresent] = createSignal(props.open);
  // The inner surface, held at the open width while the panel travels so its
  // text wraps once instead of on every frame.
  let contentBox: HTMLDivElement | undefined;
  // The width last written to the aside, where the next flight starts from.
  const paintedWidth = { current: 0 };
  // Where the running flight is heading; a resize mid-flight retargets it.
  const flightTarget = { current: 0 };
  const flight = {
    current: undefined as { spring: PanelSpring; frame: number; last: number } | undefined,
  };
  // The open width, read by flight frames that outlive this render.
  const openWidth = { current: 0 };
  // A panel first shown already open appears at its width; only toggles travel.
  const paintedOnce = { current: false };
  // Whether the component has mounted already, so a panel mounted closed and
  // opened later still travels on its first open.
  const renderedBefore = { current: false };
  // Views the panel has shown stay mounted while their tab is open, so coming
  // back shows the same diff or tree instead of reading it again.
  const [visited, setVisited] = createSignal<SidePanelTabID[]>(props.active ? [props.active] : []);

  // The transcript keeps its minimum and the panel takes what is left: the
  // shown width is clamped to the row rather than shrinking the chat under its
  // floor. The row is looked up by marker, not by parent, so an intermediate
  // wrapper can never be mistaken for it and collapse the pane to its minimum.
  const measureRow = () => {
    const row = aside?.closest<HTMLElement>("[data-panel-row]");
    if (!row) return;
    const next = row.getBoundingClientRect().width;
    if (next > 0) {
      update(setRowWidth, rowWidth, (current) =>
        current !== undefined && Math.abs(current - next) < 0.5 ? current : next,
      );
    }
  };
  const clamp = (next: number) => clampSidePanelWidth(next, rowWidth());

  onMount(() => {
    measureRow();
    const row = aside?.closest<HTMLElement>("[data-panel-row]");
    if (!row) return;
    // The row's own observer covers layout changes; the window listener covers
    // hosts whose observer never fires, and both funnel into one measurement.
    makeResizeObserver<Element>(() => measureRow()).observe(row);
    makeEventListener(window, "resize", measureRow);
  });

  onMount(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      setStoredWidth(clamp(current.startWidth - (event.clientX - current.startX)));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      const value = storedWidth();
      localStorage.setItem("lingzhu.sidePanelWidth", String(value));
    };
    makeEventListener(window, "pointermove", move);
    makeEventListener(window, "pointerup", up);
  });

  // Below the row width that holds both minimums the panel stops taking space
  // from the transcript and floats over it, so the chat never drops under its
  // own minimum while the window narrows.
  const overlay = createMemo(() => !panelRowHoldsBoth(rowWidth() ?? 0));
  const width = createMemo(() => (overlay() ? overlaySidePanelWidth(storedWidth(), rowWidth()) : clamp(storedWidth())));
  // The same limit in CSS, so the browser applies it on the frame the row
  // resizes instead of after the observer reports the new width.
  const maxWidth = createMemo(() =>
    overlay() ? undefined : `max(${SIDE_PANEL_WIDTH_MIN}px, 100% - ${PANEL_ROW_GAP + CHAT_PANEL_WIDTH_MIN}px)`,
  );
  const visible = createMemo(() => present() || props.open);

  // Every view the user has visited stays in the tree while its tab is open; a
  // tab that closes drops its view.
  const paneIDs = createMemo(() =>
    (props.active && !visited().includes(props.active) ? [...visited(), props.active] : visited()).filter(
      (id) => id === props.active || props.tabs.some((tab) => tab.id === id),
    ),
  );

  createEffect(() => {
    const active = props.active;
    if (!active) return;
    update(setVisited, visited, (current) =>
      current.includes(active) ? current : [...current, active],
    );
  });

  // Runs after the first commit, before any later toggle can use it.
  const stopFlight = () => {
    if (flight.current) window.cancelAnimationFrame(flight.current.frame);
    flight.current = undefined;
  };

  onCleanup(stopFlight);

  // Shows `target` at once: writes the real box size and lets the contents wrap
  // with the panel again. A closed landing also removes the pane.
  const settle = (target: number) => {
    stopFlight();
    const element = aside;
    if (element) {
      element.style.width = `${target}px`;
      element.style.overflow = "";
    }
    if (contentBox) {
      contentBox.style.width = "";
      contentBox.style.opacity = "";
    }
    paintedWidth.current = target;
    if (target === 0) setPresent(false);
  };

  // Runs the panel's width along the shared spring. The contents keep the open
  // width, so the shrinking box clips them rather than rewrapping them, and they
  // fade only across the last 15% of the travel.
  const fly = (target: number) => {
    const element = aside;
    if (!element || prefersReducedMotion()) {
      settle(target);
      return;
    }
    const box = contentBox;
    element.style.overflow = "hidden";
    // Start the first frame where the last one left off, so a panel that
    // mounts open cannot paint at its content width for a moment.
    element.style.width = `${paintedWidth.current}px`;
    if (box) {
      box.style.width = `${openWidth.current}px`;
      box.style.opacity = `${panelContentOpacity(paintedWidth.current, openWidth.current)}`;
    }
    const state = {
      spring: panelSpring(paintedWidth.current, openWidth.current),
      frame: 0,
      last: performance.now(),
    };
    flight.current = state;
    const step = (time: number) => {
      if (flight.current !== state) return;
      const dt = Math.min(0.064, Math.max(1 / 240, (time - state.last) / 1000));
      state.last = time;
      const goal = flightTarget.current;
      const resting = stepPanelSpring(state.spring, goal, dt);
      const value = Math.max(0, state.spring.value);
      element.style.width = `${value}px`;
      paintedWidth.current = value;
      if (box) box.style.opacity = `${panelContentOpacity(value, openWidth.current)}`;
      if (!resting) {
        state.frame = window.requestAnimationFrame(step);
        return;
      }
      settle(goal);
    };
    state.frame = window.requestAnimationFrame(step);
  };

  // Toggling flies the width; opening also brings the pane into the tree so its
  // close can travel. A panel first shown already open has no flight to make.
  createEffect(
    on([() => props.open, visible], () => {
      const element = aside;
      if (!element) return;
      const target = props.open ? width() : 0;
      openWidth.current = width();
      flightTarget.current = target;
      if (props.open) setPresent(true);
      if (!paintedOnce.current) {
        paintedOnce.current = true;
        // A first paint that is already open, like the app starting with the
        // panel open, has no travel to make; a panel mounted closed and opened
        // later flies like any other toggle.
        if (props.open && !renderedBefore.current) {
          settle(target);
          return;
        }
      }
      // A second toggle mid-flight retargets it: the spring keeps its velocity, so
      // a reversed close turns around smoothly instead of restarting.
      if (flight.current) return;
      if (Math.abs(paintedWidth.current - target) < 0.5) {
        settle(target);
        return;
      }
      fly(target);
      // Width rides on a flight only when the panel toggles; a resize at rest is
      // applied by the effect below.
    }),
  );

  // A width change at rest, from a drag or the window resizing, applies at once
  // so the panel follows the pointer and the row rather than chasing them.
  createEffect(
    on([width, () => props.open], () => {
      const element = aside;
      if (!element) return;
      const target = props.open ? width() : 0;
      openWidth.current = width();
      flightTarget.current = target;
      if (flight.current) return;
      settle(target);
    }),
  );

  // Runs after the first commit, before any later toggle can use it. Registered
  // after the flights so their first run still sees the first paint.
  onMount(() => {
    renderedBefore.current = true;
  });

  const workspace = () => props.workspace ?? "";
  const sessionID = () => props.sessionID ?? "";

  const renderContent = (tab: SidePanelTabID | undefined, select: (id: SidePanelTabID) => void) => {
    if (!tab) {
      return (
        <div class="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <FileText class="size-14 text-text-base opacity-10" />
          <p class="max-w-56 text-body text-text-faint">{tr("selectFileToOpen")}</p>
        </div>
      );
    }
    if (tab === "review") {
      return (
        <ReviewPane
          workspace={workspace()}
          sessionID={sessionID()}
          title={props.title}
          onSendReview={props.onSendReview}
          onOpenFile={props.onOpenFile}
        />
      );
    }
    if (tab === "files") return <FilesPane workspace={workspace()} onOpenFile={props.onOpenFile} />;
    if (tab === "details") {
      return (
        <DetailsPane
          chat={props.chat}
          workspace={workspace()}
          sessionID={sessionID()}
          contextWindow={props.contextWindow}
          onSelect={select}
        />
      );
    }
    if (tab === "plugins") return <PluginPanelsPane workspace={workspace()} />;
    if (isFilePanelTab(tab)) return <FileViewer workspace={workspace()} path={tab.slice(5)} />;
    return (
      <div class="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <FileText class="size-14 text-text-base opacity-10" />
        <p class="max-w-56 text-body text-text-faint">{tr("selectFileToOpen")}</p>
      </div>
    );
  };

  return (
    <Show when={visible() && props.workspace && props.sessionID}>
      <aside
        ref={(el) => (aside = el)}
        // The width is written frame by frame while the panel travels, so the
        // render leaves it alone; max-width keeps the row's limit applied in CSS.
        style={{ "max-width": overlay() ? undefined : maxWidth() }}
        aria-label={tr("reviewAndFiles")}
        data-open={props.open ? "true" : "false"}
        data-overlay={overlay() ? "true" : undefined}
        // The panel itself must not clip: the resize handle straddles its start
        // edge and its pill would be cut in half. Only a flight clips, since its
        // contents keep the open width and would otherwise paint past the box.
        class={`relative flex h-full min-h-0 shrink-0 flex-col rounded-[10px] bg-bg-base elevation-raised ${
          overlay() ? "absolute inset-y-0 end-0 z-30" : ""
        } ${props.open ? "" : "pointer-events-none"}`}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={tr("resizeSidePanel")}
          onPointerDown={(event) => {
            event.preventDefault();
            // Start from the width on screen: in a narrow row the shown width is
            // already clamped, so dragging can only move within the room there is.
            drag.current = { startX: event.clientX, startWidth: width() };
          }}
          // The row leaves an 8px gap between the transcript and this panel. The
          // handle is 8px wide and starts one gap before the panel, so its pill
          // lands in the middle of that gap instead of on the panel's edge.
          class="resize-handle-h absolute inset-y-0 -start-2 z-20 w-2 cursor-col-resize"
        />

        <div ref={(el) => (contentBox = el)} class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px]">
          <div
            class="flex h-12 shrink-0 items-center gap-2 border-b-[0.5px] border-border-base bg-bg-raised pl-3"
            style={{ "padding-inline-end": `${props.endInset ?? 12}px` }}
          >
            <div role="tablist" aria-label={tr("panelTabs")} class="no-scrollbar flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
              <For each={props.tabs}>
                {(tab) => {
                  const selected = () => tab.id === props.active;
                  const Icon = iconFor(tab.id);
                  return (
                    <div
                      data-selected={selected() ? "true" : undefined}
                      data-dragging={dragKey() === tab.id ? "true" : undefined}
                      draggable={Boolean(props.onReorderTabs)}
                      onDragStart={(event) => {
                        setDragKey(tab.id);
                        if (event.dataTransfer) {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", tab.id);
                        }
                      }}
                      onDragOver={(event) => {
                        if (!dragKey()) return;
                        event.preventDefault();
                        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dragging = dragKey();
                        if (!dragging || dragging === tab.id) return;
                        const ids = props.tabs.map((item) => item.id);
                        const from = ids.indexOf(dragging);
                        const to = ids.indexOf(tab.id);
                        if (from >= 0 && to >= 0 && props.onReorderTabs) {
                          ids.splice(from, 1);
                          ids.splice(to, 0, dragging);
                          props.onReorderTabs(ids);
                        }
                        setDragKey(undefined);
                      }}
                      onDragEnd={() => setDragKey(undefined)}
                      class="group/panel-tab relative flex h-6 max-w-80 shrink-0 items-center gap-1 rounded-md border border-transparent pe-0.5 ps-1 text-text-muted hover:bg-[var(--overlay-hover)] hover:text-text-base data-[dragging=true]:opacity-40 data-[selected]:border-border-base data-[selected]:bg-[var(--overlay-selected)] data-[selected]:text-text-base"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selected()}
                        onClick={() => props.onSelect(tab.id)}
                        class="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-body font-[440] tracking-[-0.04px] tabular-nums"
                      >
                        <Icon class="size-3.5 shrink-0" />
                        <span class="truncate">{tab.label}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`${tr("closeTab")} ${tab.label}`}
                        onClick={() => props.onCloseTab(tab.id)}
                        class={`interactive grid size-4 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base ${
                          selected() ? "" : "opacity-0 group-hover/panel-tab:opacity-100"
                        }`}
                      >
                        <X class="size-3" />
                      </button>
                      {/* The reference marks the selected tab with a hairline that meets
                          the strip's bottom border instead of tinting the pill. */}
                      <Show when={selected()}>
                        <span aria-hidden="true" class="pointer-events-none absolute inset-x-1 -bottom-[9px] h-px bg-text-base" />
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  aria-label={tr("addPanelTab")}
                  class="interactive grid size-7 place-items-center rounded-md text-text-muted hover:text-text-base"
                >
                  <Plus class="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end" class="min-w-44">
                  <For each={SIDE_PANEL_TAB_IDS.filter((id) => !props.tabs.some((tab) => tab.id === id))}>
                    {(id) => {
                      const Icon = iconFor(id);
                      return (
                        <DropdownMenuItem onSelect={() => props.onAddTab?.(id)}>
                          <Icon class="text-text-muted" />
                          {tabLabel(tr, id)}
                        </DropdownMenuItem>
                      );
                    }}
                  </For>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* The floating review toggle sits over this bar's trailing end, so the
                  strip keeps its 28px slot instead of drawing under it. */}
              <div class="size-7 shrink-0" aria-hidden="true" />
            </div>
          </div>

          <div class="flex min-h-0 flex-1">
            <div class="relative min-h-0 flex-1 overflow-hidden">
              <For each={paneIDs()}>
                {(id) => {
                  const shown = () => id === props.active;
                  return (
                    <div
                      // Hidden views keep their state and scroll position, so a
                      // switch back shows the same diff or tree instead of reading
                      // it again; content-visibility skips their layout and paint.
                      class="absolute inset-0 flex min-h-0 flex-col"
                      data-active={shown() ? "true" : undefined}
                      aria-hidden={!shown() || undefined}
                      inert={!shown() || undefined}
                      style={shown() ? undefined : { "content-visibility": "hidden" }}
                    >
                      {renderContent(id, props.onSelect)}
                    </div>
                  );
                }}
              </For>
              <Show when={!props.active}>{renderContent(undefined, props.onSelect)}</Show>
            </div>
          </div>
        </div>
      </aside>
    </Show>
  );
}

function ReviewEmpty(props: { title: string; description: string }) {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-6 pb-40 text-center">
      <FileText class="mb-2 size-5 text-text-muted" />
      <p class="text-body leading-[13px] font-[530] text-text-base">{props.title}</p>
      <p class="max-w-[282px] text-body leading-5 text-text-muted">{props.description}</p>
    </div>
  );
}

function DetailSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <h2 class="px-1 text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{props.title}</h2>
      <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-weak)]">
        {props.children}
      </div>
    </section>
  );
}

function DetailRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="flex items-center justify-between gap-4 border-b-[0.5px] border-border-base py-3 last:border-0">
      <span class="shrink-0 text-meta text-text-muted">{props.label}</span>
      <span
        class={`min-w-0 truncate text-right text-body text-text-base ${props.mono ? "font-mono text-meta" : ""}`}
        title={props.value}
      >
        {props.value}
      </span>
    </div>
  );
}

/** Session summary: identity, context usage, and the turn's diff totals. */
function DetailsPane(props: {
  chat?: ChatState;
  workspace: string;
  sessionID: string;
  contextWindow?: number;
  onSelect: (id: SidePanelTabID) => void;
}) {
  const tr = useT();
  const usage = () => props.chat?.usage;
  const changes = createMemo(() => (props.chat ? sessionChanges(props.chat.entries) : undefined));
  const window = () => props.contextWindow ?? 0;
  const ratio = createMemo(() => {
    const total = window();
    const tokens = props.chat?.tokens ?? 0;
    return total > 0 ? Math.min(100, Math.round((tokens / total) * 100)) : 0;
  });

  return (
    <Show
      when={props.chat}
      fallback={<p class="p-3 text-meta text-text-faint">{tr("sessionDetailsUnavailable")}</p>}
    >
      {(chat) => (
        <div class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-3">
          <DetailSection title={tr("sessionLabel")}>
            <DetailRow label={tr("titleLabel")} value={chat().title || tr("paletteNewSession")} />
            <DetailRow label={tr("agentLabel")} value={chat().agent || "—"} />
            <DetailRow
              label={tr("modelLabel")}
              value={
                chat().model ? `${chat().provider ? `${chat().provider}/` : ""}${chat().model}` : "—"
              }
            />
            <DetailRow label={tr("workspaceLabel")} value={props.workspace} mono />
            <DetailRow label={tr("sessionLabel")} value={props.sessionID} mono />
          </DetailSection>

          <DetailSection title={tr("contextLabel")}>
            <div class="flex items-center justify-between gap-4 pt-3 pb-2">
              <span class="text-meta text-text-muted">{tr("tokensLabel")}</span>
              <span class="font-mono text-meta tabular-nums text-text-base">
                {formatTokens(chat().tokens)} / {formatTokens(window())}
              </span>
            </div>
            <div class="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-layer-02">
              <div class="h-full rounded-full bg-text-accent" style={{ width: `${ratio()}%` }} />
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border-base py-3 text-meta text-text-muted">
              <span class="flex items-center justify-between gap-2">
                <span>{tr("inputLabel")}</span>
                <span class="font-mono tabular-nums text-text-base">{formatTokens(usage()?.input)}</span>
              </span>
              <span class="flex items-center justify-between gap-2">
                <span>{tr("outputLabel")}</span>
                <span class="font-mono tabular-nums text-text-base">{formatTokens(usage()?.output)}</span>
              </span>
              <span class="flex items-center justify-between gap-2">
                <span>{tr("cacheReadLabel")}</span>
                <span class="font-mono tabular-nums text-text-base">{formatTokens(usage()?.cacheRead)}</span>
              </span>
              <span class="flex items-center justify-between gap-2">
                <span>{tr("cacheWriteLabel")}</span>
                <span class="font-mono tabular-nums text-text-base">{formatTokens(usage()?.cacheWrite)}</span>
              </span>
            </div>
          </DetailSection>

          <DetailSection title={tr("changesLabel")}>
            <Show
              when={changes()}
              fallback={<p class="py-3 text-meta text-text-faint">{tr("noChanges")}</p>}
            >
              {(summary) => (
                <>
                  <DetailRow label={tr("files")} value={String(summary().files)} />
                  <DetailRow label={tr("addedLabel")} value={`+${summary().added}`} />
                  <DetailRow label={tr("removedLabel")} value={`-${summary().removed}`} />
                  <div class="py-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => props.onSelect("review")}>
                      {tr("openReview")}
                    </Button>
                  </div>
                </>
              )}
            </Show>
          </DetailSection>
        </div>
      )}
    </Show>
  );
}

/** The reference review-mode glyphs, drawn on the shared 16px icon grid. */
function ReviewModeIcon(props: { name: "expand" | "collapse" | "unified" | "split" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <Show when={props.name === "expand"}>
        <path d="M8.25 6.17773V1.17773M11.25 4.17773L8.25 1.17773L5.25 4.17773" stroke="currentColor" />
        <path d="M8.25 9.17773V14.1777M11.25 11.1777L8.25 14.1777L5.25 11.1777" stroke="currentColor" />
        <path d="M4.25 7.67773H12.25" stroke="currentColor" />
      </Show>
      <Show when={props.name === "collapse"}>
        <path d="M8 1V6M11 3L8 6L5 3" stroke="currentColor" />
        <path d="M8 15V10M11 13L8 10L5 13" stroke="currentColor" />
        <path d="M4 8H6" stroke="currentColor" />
        <path d="M7 8H9" stroke="currentColor" />
        <path d="M10 8H12" stroke="currentColor" />
      </Show>
      <Show when={props.name === "split"}>
        <path d="M1 14H15L15 2H1V14Z" stroke="currentColor" />
        <rect x="3" y="4" width="4" height="8" fill="currentColor" fill-opacity="0.5" />
        <rect x="9" y="4" width="4" height="8" fill="currentColor" fill-opacity="0.5" />
      </Show>
      <Show when={props.name === "unified"}>
        <path
          d="M3.00001 4.00045L12.9998 4L13 6.99955L3 7L3.00001 4.00045Z"
          fill="currentColor"
          fill-opacity="0.5"
        />
        <path d="M3.0001 9H13L12.9999 12H3L3.0001 9Z" fill="currentColor" fill-opacity="0.5" />
        <path d="M1 14H15L15 2H1V14Z" stroke="currentColor" />
      </Show>
    </svg>
  );
}

function ReviewPane(props: {
  workspace: string;
  sessionID: string;
  title?: string;
  onSendReview: (text: string, comments?: ReviewComment[]) => void;
  onOpenFile?: (path: string) => void;
}) {
  const tr = useT();
  // The diff machine lives here; the attempt counter drops a late response
  // from the session that was open before.
  const [state, dispatch] = createReducer(transitionSessionDiff, createSessionDiffState);
  const attempt = { current: 0 };
  createEffect(() => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    const id = ++attempt.current;
    dispatch({ type: "load", attempt: id });
    let alive = true;
    api
      .sessionDiff(workspace, sessionID)
      .then((diff) => {
        if (alive) dispatch({ type: "loaded", attempt: id, diff });
      })
      .catch((cause) => {
        if (alive) dispatch({ type: "failed", attempt: id, message: messageOf(cause) });
      });
    onCleanup(() => {
      alive = false;
    });
  });
  const view = createMemo(() => sessionDiffView(state()));
  const diff = () => view().diff;
  const selected = () => view().selected;
  const loading = () => view().loading;
  const error = () => view().error;
  const select = (file?: string) => dispatch({ type: "selected", file });

  const [comments, setComments] = createSignal<ReviewComment[]>([]);
  const [selection, setSelection] = createSignal<{ start: number; end: number; side: "old" | "new" }>();
  const [anchor, setAnchor] = createSignal<number>();
  const [commentText, setCommentText] = createSignal("");
  const [diffMode, setDiffMode] = createSignal<"unified" | "split">("unified");
  const [expandMode, setExpandMode] = createSignal<"expand" | "collapse">("expand");
  const [treeOpen, setTreeOpen] = createSignal(true);
  const [treeWidth, setTreeWidth] = createSignal(240);
  const [filter, setFilter] = createSignal("");
  let treeScroll: HTMLDivElement | undefined;

  const updateTreeFade = () => {
    const element = treeScroll;
    if (!element) return;
    const fade = (hidden: number) => `${Math.min(16, Math.max(0, hidden))}px`;
    element.style.setProperty("--review-fade-top", fade(element.scrollTop));
    element.style.setProperty(
      "--review-fade-bottom",
      fade(element.scrollHeight - element.clientHeight - element.scrollTop),
    );
  };

  // The review tree column resizes between 200 and 480px, defaulting to 240
  // and resetting on double-click, like the reference review sidebar.
  const startTreeResize = (event: PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = treeWidth();
    const move = (moveEvent: PointerEvent) => {
      setTreeWidth(Math.min(480, Math.max(200, startWidth + moveEvent.clientX - startX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  createEffect(() => {
    props.workspace;
    props.sessionID;
    setComments([]);
    setSelection(undefined);
    setAnchor(undefined);
    setCommentText("");
  });

  const current = createMemo(() => diff()?.diffs.find((item) => item.file === selected()));
  const fileParts = createMemo(() => (current() ? splitFilePath(current()!.file) : undefined));
  const filteredDiffs = createMemo(() => {
    const term = filter().trim().toLowerCase();
    if (!term) return diff()?.diffs ?? [];
    return (diff()?.diffs ?? []).filter((item) => item.file.toLowerCase().includes(term));
  });

  createEffect(() => {
    if (!treeOpen()) return;
    filteredDiffs();
    const frame = requestAnimationFrame(updateTreeFade);
    onCleanup(() => cancelAnimationFrame(frame));
  });
  const lines = createMemo(() => (current() ? parsePatch(current()!.patch) : []));
  // Collapse hides unchanged context, leaving only hunks and changed lines.
  const visibleLines = createMemo(() =>
    expandMode() === "collapse" ? lines().filter((line) => line.kind !== "context") : lines(),
  );
  const splitRows = createMemo(() => splitPatch(visibleLines()));
  const additions = createMemo(() => diff()?.diffs.reduce((sum, item) => sum + item.additions, 0) ?? 0);
  const deletions = createMemo(() => diff()?.diffs.reduce((sum, item) => sum + item.deletions, 0) ?? 0);
  const fileComments = createMemo(() => comments().filter((item) => item.file === selected()));
  // Notes anchored to a line that is on screen render under that line; the rest
  // stay in the file list so collapsing context never hides a note.
  const visibleNumbers = createMemo(() => {
    const numbers = new Set<string>();
    for (const line of visibleLines()) {
      const number = diffLineNumber(line);
      if (number !== undefined) numbers.add(`${line.kind === "del" ? "old" : "new"}:${number}`);
    }
    return numbers;
  });
  const detachedComments = createMemo(() =>
    fileComments().filter((comment) => !visibleNumbers().has(`${comment.side}:${comment.start}`)),
  );

  const pickLine = (line: DiffLine, extend: boolean) => {
    const number = diffLineNumber(line);
    if (number === undefined) return;
    const side = line.kind === "del" ? "old" : "new";
    const selectedRange = selection();
    const start = anchor();
    if (extend && selectedRange && start !== undefined) {
      setSelection({
        start: Math.min(start, number),
        end: Math.max(start, number),
        side: selectedRange.side,
      });
      return;
    }
    setAnchor(number);
    setSelection({ start: number, end: number, side });
    setCommentText("");
  };

  /** The gutter control anchors one note to a single line without a drag. */
  const commentOnLine = (line: DiffLine) => {
    const number = diffLineNumber(line);
    if (number === undefined) return;
    setAnchor(number);
    setSelection({ start: number, end: number, side: line.kind === "del" ? "old" : "new" });
    setCommentText("");
  };

  const addComment = () => {
    const file = current();
    const range = selection();
    if (!file || !range || commentText().trim() === "") return;
    const comment: ReviewComment = {
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: file.file,
      start: range.start,
      end: range.end,
      side: range.side,
      text: commentText().trim(),
    };
    update(setComments, comments, (items) => addReviewComment(items, comment));
    setSelection(undefined);
    setAnchor(undefined);
    setCommentText("");
  };

  const sendReview = () => {
    const prompt = formatReviewPrompt(comments());
    if (!prompt) return;
    props.onSendReview(prompt, comments());
    setComments([]);
  };

  const selectedInRange = (line: DiffLine): boolean => {
    const range = selection();
    if (!range) return false;
    const number = diffLineNumber(line);
    return number !== undefined && number >= range.start && number <= range.end;
  };

  const resetSelection = () => {
    setSelection(undefined);
    setAnchor(undefined);
    setCommentText("");
  };

  const selectFile = (file: string) => {
    select(file);
    resetSelection();
  };

  return (
    <div class="flex h-full min-h-0 flex-col">
      <Show when={error()}>
        <div role="alert" class="mx-3 mt-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
          {error()}
        </div>
      </Show>

      <Show when={!error() && loading() && !diff()}>
        <p class="p-3 text-meta text-text-faint">{tr("loadingChanges")}</p>
      </Show>

      <Show when={!error() && diff() && diff()!.diffs.length === 0 && !loading()}>
        <ReviewEmpty title={tr("noChanges")} description="Changes made during this session will show up here." />
      </Show>

      <Show when={diff() && diff()!.diffs.length > 0}>
        <div class="flex min-h-0 flex-1">
          <Show when={treeOpen()}>
            <div class="relative flex shrink-0 flex-col border-r border-border-base" style={{ width: `${treeWidth()}px` }}>
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={tr("resizeFileTree")}
                onPointerDown={startTreeResize}
                onDblClick={() => setTreeWidth(240)}
                class="resize-handle-h absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
              />
              <div class="flex h-12 shrink-0 items-center justify-between gap-2 ps-2 pe-4">
                <span class="min-w-0 truncate text-body leading-4 font-[500] text-text-base">{tr("changesLabel")}</span>
                <span class="flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums">
                  <span class="text-state-fg-success">+{additions()}</span>
                  <span class="text-state-fg-danger">-{deletions()}</span>
                </span>
              </div>
              <div class="shrink-0 px-2 pb-1">
                <label class="mt-[3px] flex h-7 items-center gap-1.5 rounded-md px-1.5 text-text-faint focus-within:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]">
                  <Search class="size-3.5 shrink-0" />
                  <input
                    value={filter()}
                    aria-label={tr("filterFiles")}
                    placeholder={tr("filterFiles")}
                    spellcheck={false}
                    autocomplete="off"
                    onInput={(event) => setFilter(event.currentTarget.value)}
                    class="min-w-0 flex-1 bg-transparent text-body text-text-base outline-none placeholder:text-text-faint"
                  />
                  <Show when={filter()}>
                    <button
                      type="button"
                      aria-label={tr("clearFilter")}
                      onClick={() => setFilter("")}
                      class="grid size-4 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      <X class="size-3" />
                    </button>
                  </Show>
                </label>
              </div>
              <div
                ref={(el) => (treeScroll = el)}
                onScroll={updateTreeFade}
                class="review-tree-scroll min-h-0 flex-1 overflow-auto px-2 pt-1 pb-3"
              >
                <Show
                  when={filteredDiffs().length > 0}
                  fallback={<p class="px-2 py-2 text-meta text-text-faint">{tr("noFilesMatch")}</p>}
                >
                  <ReviewFileTree
                    files={filteredDiffs()}
                    selected={selected()}
                    flat={filter().trim() !== ""}
                    onSelect={selectFile}
                  />
                </Show>
              </div>
            </div>
          </Show>

          <div class="flex min-w-0 flex-1 flex-col">
            <Show
              when={current()}
              fallback={
                <ReviewEmpty title={tr("selectFile")} description="Choose a changed file to review its diff." />
              }
            >
              {(file) => (
                <>
                  <div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-base ps-2 pe-3">
                    <div class="flex min-w-0 items-center gap-0">
                      <button
                        type="button"
                        aria-label={treeOpen() ? tr("hideFileTree") : tr("showFileTree")}
                        aria-expanded={treeOpen()}
                        onClick={() => setTreeOpen(!treeOpen())}
                        class={`interactive grid h-7 w-9 shrink-0 place-items-center rounded-md hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${
                          treeOpen() ? "bg-bg-layer-02 text-text-base" : "text-text-base"
                        }`}
                      >
                        <Show when={treeOpen()} fallback={<FolderClosed class="size-4" />}>
                          <FolderOpen class="size-4" />
                        </Show>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tr("previousFile")}
                        disabled={(diff()?.diffs.findIndex((item) => item.file === selected()) ?? 0) <= 0}
                        onClick={() => {
                          const list = diff()?.diffs ?? [];
                          const index = list.findIndex((item) => item.file === selected());
                          const next = list[Math.max(0, index - 1)];
                          if (next) selectFile(next.file);
                        }}
                        class="h-7 w-9 rounded-md text-text-faint hover:text-text-base"
                      >
                        <ArrowLeft class="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tr("nextFile")}
                        disabled={
                          (diff()?.diffs.findIndex((item) => item.file === selected()) ?? 0) >=
                          (diff()?.diffs.length ?? 1) - 1
                        }
                        onClick={() => {
                          const list = diff()?.diffs ?? [];
                          const index = list.findIndex((item) => item.file === selected());
                          const next = list[Math.min(list.length - 1, index + 1)];
                          if (next) selectFile(next.file);
                        }}
                        class="h-7 w-9 rounded-md text-text-faint hover:text-text-base"
                      >
                        <ArrowRight class="size-4" />
                      </Button>
                      <Show when={!treeOpen() && diff()!.diffs.length > 1}>
                        <span class="shrink-0 text-caption leading-3 font-[440] tracking-[0.05px] uppercase tabular-nums text-text-faint">
                          {Math.max(0, diff()!.diffs.findIndex((item) => item.file === selected())) + 1}/
                          {diff()!.diffs.length}
                        </span>
                      </Show>
                    </div>
                    <div class="flex shrink-0 items-center gap-3">
                      <Show when={comments().length > 0}>
                        <Button type="button" size="sm" onClick={sendReview}>
                          <Send />
                          Send ({comments().length})
                        </Button>
                      </Show>
                      <Show when={props.onOpenFile}>
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            aria-label={`Open ${file().file} in panel`}
                            onClick={() => props.onOpenFile?.(file().file)}
                            class={cn(
                              buttonVariants({ variant: "ghost", size: "icon-sm" }),
                              "text-icon-base shadow-[inset_0_0_0_1px_var(--border-muted)]",
                            )}
                          >
                            <ExternalLink class="size-4" />
                          </TooltipTrigger>
                          <TooltipContent side="top" appearance="standard">
                            {tr("openInPanel")}
                          </TooltipContent>
                        </Tooltip>
                      </Show>
                      <SegmentedControl
                        compact
                        label={tr("expandMode")}
                        value={expandMode()}
                        onChange={setExpandMode}
                        options={[
                          {
                            value: "expand",
                            label: "",
                            icon: <ReviewModeIcon name="expand" />,
                            ariaLabel: tr("showAllLines"),
                          },
                          {
                            value: "collapse",
                            label: "",
                            icon: <ReviewModeIcon name="collapse" />,
                            ariaLabel: tr("hideNonDiffLines"),
                          },
                        ]}
                      />
                      <SegmentedControl
                        compact
                        label={tr("diffLayout")}
                        value={diffMode()}
                        onChange={setDiffMode}
                        options={[
                          {
                            value: "unified",
                            label: "",
                            icon: <ReviewModeIcon name="unified" />,
                            ariaLabel: tr("unifiedDiff"),
                          },
                          {
                            value: "split",
                            label: "",
                            icon: <ReviewModeIcon name="split" />,
                            ariaLabel: tr("splitDiff"),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-4 py-2">
                    <div class="flex min-w-0 flex-1 items-center gap-1.5" dir="ltr">
                      <span
                        class={`grid size-4 shrink-0 place-items-center text-caption font-[530] uppercase tabular-nums ${fileStatusTone(file().status)}`}
                      >
                        {fileStatusLetter(file().status)}
                      </span>
                      <span class="shrink-0 truncate text-body font-[530] tabular-nums text-text-base">
                        {fileParts()?.name}
                      </span>
                      <Show when={fileParts()?.directory}>
                        <span class="min-w-0 truncate text-body font-[440] tabular-nums text-text-muted">
                          {fileParts()!.directory}
                        </span>
                      </Show>
                    </div>
                    <span class="ms-auto flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums">
                      <span class="text-state-fg-success">+{file().additions}</span>
                      <span class="text-state-fg-danger">-{file().deletions}</span>
                    </span>
                  </div>

                  <div class="min-h-0 flex-1 overflow-auto font-mono text-body leading-6 [scroll-padding-top:28px]">
                    <Show
                      when={diffMode() === "split"}
                      fallback={
                        <For each={visibleLines().slice(0, 4000)}>
                          {(line) => {
                            const selectedLine = () => selectedInRange(line);
                            const number = () => diffLineNumber(line);
                            const side = () => (line.kind === "del" ? "old" : "new");
                            const composer = () => {
                              const range = selection();
                              return !!range && range.start === number() && range.side === side();
                            };
                            const notes = () =>
                              number() === undefined
                                ? []
                                : fileComments().filter(
                                    (note) => note.start === number() && note.side === side(),
                                  );
                            return (
                              <Show
                                when={line.kind !== "meta"}
                                fallback={
                                  <div class="sticky top-0 z-[1] flex min-w-full gap-1 bg-bg-base ps-3 pe-2 text-text-faint">
                                    <span class="w-10 shrink-0 text-right tabular-nums" />
                                    <span class="w-3 shrink-0" />
                                    <span class="whitespace-pre">{line.text}</span>
                                  </div>
                                }
                              >
                                <div
                                  data-slot="review-diff-row"
                                  data-line={number()}
                                  data-kind={line.kind}
                                  data-selected={selectedLine() ? "true" : undefined}
                                  class={`group/line relative flex min-w-full gap-1 ps-3 pe-2 text-left hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${lineClass(line)} ${
                                    selectedLine()
                                      ? "shadow-[inset_0_0_0_9999px_color-mix(in_srgb,var(--bg-accent)_20%,transparent)]"
                                      : ""
                                  }`}
                                >
                                  <span
                                    class={`w-10 shrink-0 select-none text-right tabular-nums ${lineNumberClass(line, selectedLine())}`}
                                  >
                                    {line.kind === "add" ? line.next : line.old ?? ""}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Comment on line ${number() ?? ""}`}
                                    title={tr("addNoteToLine")}
                                    onClick={() => commentOnLine(line)}
                                    class="absolute inset-y-0 start-0 grid w-3 place-items-center text-text-faint opacity-0 transition-opacity hover:text-text-base focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-border-focus group-hover/line:opacity-100"
                                  >
                                    <Plus class="size-3" />
                                  </button>
                                  <span class="flex h-full w-3 shrink-0 select-none items-center justify-center">
                                    <Show when={line.kind === "add"}>
                                      <span class="h-full w-0.5 rounded-full bg-[var(--diff-add-fg)]" />
                                    </Show>
                                    <Show when={line.kind === "del"}>
                                      <span class="h-full w-0.5 rounded-full bg-[var(--diff-remove-fg)]" />
                                    </Show>
                                  </span>
                                  <span
                                    onClick={(event) => pickLine(line, event.shiftKey)}
                                    class="min-w-0 flex-1 cursor-pointer whitespace-pre-wrap break-words select-text"
                                  >
                                    {line.text || " "}
                                  </span>
                                </div>
                                <For each={notes()}>
                                  {(note) => (
                                    <InlineReviewNote
                                      note={note}
                                      onRemove={() =>
                                        update(setComments, comments, (items) =>
                                          removeReviewComment(items, note.id),
                                        )
                                      }
                                    />
                                  )}
                                </For>
                                <Show when={composer()}>
                                  <ReviewComposer
                                    target={selection()!}
                                    text={commentText()}
                                    onChange={setCommentText}
                                    onCancel={resetSelection}
                                    onSubmit={addComment}
                                  />
                                </Show>
                              </Show>
                            );
                          }}
                        </For>
                      }
                    >
                      <For each={splitRows().slice(0, 4000)}>
                        {(row) => (
                          <div class="flex min-w-full">
                            <For each={[row.left, row.right]}>
                              {(side, column) => (
                                <Show
                                  when={side}
                                  fallback={<span class="min-w-0 flex-1 bg-bg-layer-01/40" aria-hidden="true" />}
                                >
                                  {(line) => (
                                    <Show
                                      when={line().kind !== "meta"}
                                      fallback={
                                        <span
                                          class={`sticky top-0 z-[1] flex min-w-0 flex-1 bg-bg-base px-2 text-text-faint ${
                                            column() === 0 ? "border-r-[0.5px] border-border-base" : ""
                                          }`}
                                        >
                                          <span class="w-10 shrink-0 text-right tabular-nums" />
                                          <span class="truncate">{line().text}</span>
                                        </span>
                                      }
                                    >
                                      <button
                                        type="button"
                                        onClick={(event) => pickLine(line(), event.shiftKey)}
                                        class={`flex min-w-0 flex-1 gap-1 ps-3 pe-2 text-left hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${lineClass(line())} ${
                                          column() === 0 ? "border-r-[0.5px] border-border-base" : ""
                                        } ${selectedInRange(line()) ? "shadow-[inset_0_0_0_9999px_color-mix(in_srgb,var(--bg-accent)_20%,transparent)]" : ""}`}
                                      >
                                        <span
                                          class={`w-10 shrink-0 select-none text-right tabular-nums ${lineNumberClass(line(), selectedInRange(line()))}`}
                                        >
                                          {line().old ?? line().next ?? ""}
                                        </span>
                                        <span class="flex h-full w-3 shrink-0 select-none items-center justify-center">
                                          <Show when={line().kind === "add"}>
                                            <span class="h-full w-0.5 rounded-full bg-[var(--diff-add-fg)]" />
                                          </Show>
                                          <Show when={line().kind === "del"}>
                                            <span class="h-full w-0.5 rounded-full bg-[var(--diff-remove-fg)]" />
                                          </Show>
                                        </span>
                                        <span class="min-w-0 whitespace-pre-wrap break-words select-text">
                                          {line().text || " "}
                                        </span>
                                      </button>
                                    </Show>
                                  )}
                                </Show>
                              )}
                            </For>
                          </div>
                        )}
                      </For>
                    </Show>
                    <Show when={lines().length > 4000}>
                      <div class="px-3 py-2 text-caption text-text-faint">
                        Showing the first 4000 lines. Open the source control panel for the full patch.
                      </div>
                    </Show>
                  </div>

                  <Show when={selection() && diffMode() === "split"}>
                    <ReviewComposer
                      target={selection()!}
                      text={commentText()}
                      onChange={setCommentText}
                      onCancel={resetSelection}
                      onSubmit={addComment}
                    />
                  </Show>

                  <Show when={detachedComments().length > 0}>
                    <div class="max-h-48 shrink-0 overflow-y-auto border-t border-border-base p-2">
                      <div class="flex flex-col gap-2">
                        <For each={detachedComments()}>
                          {(comment) => (
                            <div class="flex items-start gap-2 rounded-md bg-bg-layer-01 p-3 shadow-elevation-raised">
                              <div class="flex min-w-0 flex-1 flex-col gap-2">
                                <span class="text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
                                  L{comment.start}
                                  {comment.end === comment.start ? "" : `-${comment.end}`} ({comment.side})
                                </span>
                                <p class="whitespace-pre-wrap text-body leading-4 text-text-base select-text">
                                  {comment.text}
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label={tr("removeReviewNote")}
                                onClick={() =>
                                  update(setComments, comments, (items) =>
                                    removeReviewComment(items, comment.id),
                                  )
                                }
                                class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
                              >
                                <Trash2 class="size-3" />
                              </button>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Read-only file text with a line-number gutter; very large files stay plain. */
function NumberedText(props: { text: string }) {
  const lines = createMemo(() => props.text.split("\n"));
  return (
    <Show
      when={lines().length > 3000}
      fallback={
        <div class="min-w-max py-2">
          <For each={lines()}>
            {(line, index) => (
              <div class="flex">
                <span class="w-12 shrink-0 select-none pr-3 text-right font-mono text-[12px] leading-5 text-text-faint">
                  {index() + 1}
                </span>
                <span class="whitespace-pre font-mono text-[12px] leading-5 text-text-base select-text">
                  {line || " "}
                </span>
              </div>
            )}
          </For>
        </div>
      }
    >
      <pre class="px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre text-text-base select-text">{props.text}</pre>
    </Show>
  );
}

/** One file opened in its own side tab, with a reload control. */
function FileViewer(props: { workspace: string; path: string }) {
  const tr = useT();
  const [content, setContent] = createSignal<FileContent>();
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const configFile = () => props.path === CONFIG_FILE_TAB;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (configFile()) {
        const file = await api.readConfigFile();
        setContent({
          path: file.path,
          content: file.content,
          truncated: false,
          binary: false,
          size: file.content.length,
        });
      } else {
        setContent(await api.fileContent(props.workspace, props.path));
      }
    } catch (cause) {
      setError(messageOf(cause));
      setContent(undefined);
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    props.workspace;
    props.path;
    setContent(undefined);
    void load();
  });

  const title = () => (configFile() ? "lingzhu.json" : props.path);

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5">
        <FileText class="size-3.5 shrink-0 text-text-faint" />
        <span class="min-w-0 flex-1 truncate font-mono text-meta text-text-base" title={title()}>
          {title()}
        </span>
        <CopyButton text={configFile() ? content()?.path ?? props.path : props.path} label={tr("copyPath")} />
        <button
          type="button"
          aria-label={tr("reloadFile")}
          disabled={loading()}
          onClick={() => void load()}
          class="interactive grid size-6 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base disabled:opacity-50"
        >
          <RefreshCw class={`size-3.5 ${loading() ? "motion-safe:animate-spin" : ""}`} />
        </button>
      </div>
      <Show
        when={!error()}
        fallback={
          <div role="alert" class="m-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
            {error()}
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-auto">
          <Show
            when={content()}
            fallback={<p class="p-3 text-meta text-text-faint">{tr("loadingFile")}</p>}
          >
            {(file) => (
              <Show
                when={!file().binary}
                fallback={<p class="p-3 text-meta text-text-faint">{tr("binaryPreviewUnavailable")}</p>}
              >
                <NumberedText text={file().content || "(empty file)"} />
              </Show>
            )}
          </Show>
          <Show when={content()?.truncated}>
            <div class="border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
              {tr("dialogPreviewTruncated256kb")}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function FilesPane(props: { workspace: string; onOpenFile?: (path: string) => void }) {
  const tr = useT();
  const [children, setChildren] = createSignal<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<FileSearchHit[]>([]);
  const [hitsTruncated, setHitsTruncated] = createSignal(false);
  const [searching, setSearching] = createSignal(false);

  const loadDir = async (path: string) => {
    const list = await api.files(props.workspace, path, false);
    update(setChildren, children, (current) => ({ ...current, [path]: list.entries }));
  };

  createEffect(() => {
    props.workspace;
    setChildren({});
    setExpanded({});
    setError("");
    setQuery("");
    setHits([]);
    setLoading(true);
    loadDir("")
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  });

  // Workspace-wide filename search; an empty query returns to the tree.
  createEffect(() => {
    const term = query().trim();
    if (!term) {
      setHits([]);
      setHitsTruncated(false);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api
        .searchFiles(props.workspace, term, 50)
        .then((result) => {
          if (!alive) return;
          setHits(result.files);
          setHitsTruncated(result.truncated);
          setError("");
        })
        .catch((cause) => {
          if (alive) setError(messageOf(cause));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 180);
    onCleanup(() => {
      alive = false;
      window.clearTimeout(timer);
    });
  });

  const toggleDir = async (path: string) => {
    const open = !expanded()[path];
    update(setExpanded, expanded, (current) => ({ ...current, [path]: open }));
    if (open && !children()[path]) {
      try {
        await loadDir(path);
      } catch (cause) {
        setError(messageOf(cause));
      }
    }
  };

  const open = (path: string) => props.onOpenFile?.(path);

  const rows = createMemo(() => {
    const result: JSX.Element[] = [];
    const renderDir = (path: string, depth: number) => {
      const entries = children()[path];
      if (!entries) return;
      for (const entry of entries) {
        const padding = 8 + depth * 12;
        if (entry.type === "dir") {
          const isOpen = expanded()[entry.path] ?? false;
          result.push(
            <button
              type="button"
              onClick={() => void toggleDir(entry.path)}
              style={{ "padding-left": `${padding}px` }}
              class="interactive flex h-7 w-full items-center gap-1.5 pr-2 text-left text-meta text-text-muted hover:text-text-base"
            >
              <Show
                when={isOpen}
                fallback={<FolderClosed class="size-3.5 shrink-0 text-text-faint" />}
              >
                <FolderOpen class="size-3.5 shrink-0 text-text-faint" />
              </Show>
              <span class="truncate">{entry.name}</span>
            </button>,
          );
          if (isOpen) renderDir(entry.path, depth + 1);
        } else {
          result.push(
            <button
              type="button"
              onClick={() => open(entry.path)}
              style={{ "padding-left": `${padding}px` }}
              class="interactive flex h-7 w-full items-center gap-1.5 pr-2 text-left text-meta text-text-muted hover:text-text-base"
            >
              <FileText class="size-3.5 shrink-0 text-text-faint" />
              <span class="truncate" title={entry.path}>
                {entry.name}
              </span>
            </button>,
          );
        }
      }
    };
    renderDir("", 0);
    return result;
  });

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 flex-col gap-1.5 border-b border-border-base px-2 py-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-caption text-text-faint">{tr("workspaceFiles")}</span>
          <button
            type="button"
            aria-label={tr("reloadFiles")}
            disabled={loading()}
            onClick={() => {
              setChildren({});
              setExpanded({});
              setLoading(true);
              loadDir("")
                .catch((cause) => setError(messageOf(cause)))
                .finally(() => setLoading(false));
            }}
            class="interactive grid size-6 place-items-center rounded-md text-text-faint hover:text-text-base disabled:opacity-50"
          >
            <RefreshCw class={`size-3.5 ${loading() ? "motion-safe:animate-spin" : ""}`} />
          </button>
        </div>
        <div class="relative flex h-7 items-center">
          <Search class="pointer-events-none absolute left-1.5 size-3.5 text-text-faint" />
          <input
            value={query()}
            aria-label={tr("searchWorkspaceFiles")}
            placeholder={tr("searchFiles")}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setQuery(event.currentTarget.value)}
            class="h-full w-full rounded-md bg-transparent pr-7 pl-6 text-meta text-text-base outline-none placeholder:text-text-faint"
          />
          <Show when={query()}>
            <button
              type="button"
              aria-label={tr("clearFileSearch")}
              onClick={() => setQuery("")}
              class="interactive absolute right-1 grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
            >
              <X class="size-3" />
            </button>
          </Show>
        </div>
      </div>
      <Show when={error()}>
        <div role="alert" class="m-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
          {error()}
        </div>
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto py-1">
        <Show when={query().trim()} fallback={rows()}>
          <Show
            when={!(searching() && hits().length === 0)}
            fallback={<p class="px-2 py-3 text-meta text-text-faint">{tr("searching")}</p>}
          >
            <Show
              when={hits().length > 0}
              fallback={<p class="px-2 py-3 text-meta text-text-faint">{tr("noMatchingFiles")}</p>}
            >
              <For each={hits()}>
                {(hit) => (
                  <button
                    type="button"
                    onClick={() => open(hit.path)}
                    class="interactive flex h-7 w-full items-center gap-1.5 px-2 text-left text-meta text-text-muted hover:text-text-base"
                  >
                    <FileText class="size-3.5 shrink-0 text-text-faint" />
                    <span class="min-w-0 flex-1 truncate" title={hit.path}>
                      {hit.path}
                    </span>
                  </button>
                )}
              </For>
              <Show when={hitsTruncated()}>
                <p class="px-2 py-2 text-caption text-text-faint">{tr("firstMatches", { count: 50 })}</p>
              </Show>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
