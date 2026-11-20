import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { SegmentedControl } from "@lingzhu/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { ReviewFileTree } from "@lingzhu/session-ui/ReviewFileTree";
import { PluginPanelsPane } from "./PluginPanelsPane";
import { CopyButton } from "@lingzhu/session-ui/Markdown";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { addReviewComment, diffLineNumber, formatReviewPrompt, parsePatch, removeReviewComment, splitPatch, type DiffLine, type ReviewComment } from "@lingzhu/session-ui/review";
import type { ChatState, FileContent, FileSearchHit, FsEntry } from "@lingzhu/ui/types";
import { useSessionDiff } from "../../app/features/session/useSessionDiff";
import { fileStatusLetter, fileStatusTone } from "@lingzhu/ui/status";

import { sessionChanges } from "@lingzhu/session-ui/timeline";
import { useT } from "@lingzhu/ui/i18n";
import { formatTokens } from "@lingzhu/ui/format";
import { isFilePanelTab, CONFIG_FILE_TAB, SIDE_PANEL_TAB_IDS, type SidePanelTab, type SidePanelTabID } from "../../lib/sidePanel";
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
function InlineReviewNote({ note, onRemove }: { note: ReviewComment; onRemove: () => void }) {
  const tr = useT();
  return (
    <div
      data-slot="review-line-note"
      data-line={note.start}
      className="flex min-w-full items-start gap-2 border-s-[2px] border-border-focus bg-bg-layer-01 py-2 pe-2 ps-3"
    >
      <MessageSquarePlus className="mt-0.5 size-3.5 shrink-0 text-text-faint" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
          L{note.start}
          {note.end === note.start ? "" : `-${note.end}`} ({note.side})
        </span>
        <p className="whitespace-pre-wrap text-body leading-4 text-text-base select-text">{note.text}</p>
      </div>
      <button
        type="button"
        aria-label={tr("removeReviewNote")}
        onClick={onRemove}
        className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

/** The composer that opens under a clicked line, anchored to its range. */
function ReviewComposer({
  target,
  text,
  onChange,
  onCancel,
  onSubmit,
}: {
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
      data-line={target.start}
      className="min-w-full border-s-[2px] border-border-focus bg-bg-layer-01 p-2"
    >
      <div className="flex flex-col gap-2 rounded-md bg-bg-base p-2.5 shadow-elevation-raised">
        <div className="flex items-center gap-2 text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
          <MessageSquarePlus className="size-3.5 shrink-0" />
          <span>
            L{target.start}
            {target.end === target.start ? "" : `-${target.end}`} ({target.side})
          </span>
        </div>
        <textarea
          autoFocus
          value={text}
          aria-label={tr("reviewComment")}
          placeholder={tr("reviewCommentPlaceholder")}
          rows={2}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
              return;
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="block w-full resize-none border-0 bg-transparent text-body leading-4 font-[440] text-text-base outline-none placeholder:text-text-faint"
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={text.trim() === ""} onClick={onSubmit}>
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
export function SessionSidePanel({
  open,
  workspace,
  sessionID,
  title,
  tabs,
  active,
  onSelect,
  onCloseTab,
  onAddTab,
  onReorderTabs,
  onClose,
  onSendReview,
  onOpenFile,
  chat,
  contextWindow,
  endInset = 12,
}: Props) {
  const tr = useT();
  const [dragKey, setDragKey] = useState<SidePanelTabID>();
  const aside = useRef<HTMLElement>(null);
  // The user's chosen width. The shown width is derived from it and the row, so
  // narrowing the window shrinks the panel and widening it restores the choice.
  const [storedWidth, setStoredWidth] = useState(() =>
    readSidePanelWidth(localStorage.getItem("lingzhu.sidePanelWidth")),
  );
  // The row's measured width decides how much the panel may take and whether it
  // still fits beside the transcript; undefined until the first measurement.
  const [rowWidth, setRowWidth] = useState<number>();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // Closing keeps the pane mounted while its width travels back to zero, so the
  // transcript gets its room on the last frame instead of the toggle's.
  const [present, setPresent] = useState(open);
  // The inner surface, held at the open width while the panel travels so its
  // text wraps once instead of on every frame.
  const contentBox = useRef<HTMLDivElement>(null);
  // The width last written to the aside, where the next flight starts from.
  const paintedWidth = useRef(0);
  // Where the running flight is heading; a resize mid-flight retargets it.
  const flightTarget = useRef(0);
  const flight = useRef<{ spring: PanelSpring; frame: number; last: number } | undefined>(undefined);
  // The open width, read by flight frames that outlive this render.
  const openWidth = useRef(0);
  // A panel first shown already open appears at its width; only toggles travel.
  const paintedOnce = useRef(false);
  // Whether the component has committed a render already, so a panel mounted
  // closed and opened later still travels on its first open.
  const renderedBefore = useRef(false);
  // Views the panel has shown stay mounted while their tab is open, so coming
  // back shows the same diff or tree instead of reading it again.
  const [visited, setVisited] = useState<SidePanelTabID[]>(() => (active ? [active] : []));

  // The transcript keeps its minimum and the panel takes what is left: the
  // shown width is clamped to the row rather than shrinking the chat under its
  // floor. The row is looked up by marker, not by parent, so an intermediate
  // wrapper can never be mistaken for it and collapse the pane to its minimum.
  const measureRow = useCallback(() => {
    const row = aside.current?.closest<HTMLElement>("[data-panel-row]");
    if (!row) return;
    const next = row.getBoundingClientRect().width;
    if (next > 0) setRowWidth((current) => (current !== undefined && Math.abs(current - next) < 0.5 ? current : next));
  }, []);
  const clamp = useCallback((next: number) => clampSidePanelWidth(next, rowWidth), [rowWidth]);

  // Measure before paint so the first frame already has the panel on the
  // correct side of the row instead of flashing at its stored width.
  useLayoutEffect(() => {
    measureRow();
  }, [measureRow]);

  useEffect(() => {
    const row = aside.current?.closest<HTMLElement>("[data-panel-row]");
    if (!row) return;
    // The row's own observer covers layout changes; the window listener covers
    // hosts whose observer never fires, and both funnel into one measurement.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measureRow);
    observer?.observe(row);
    window.addEventListener("resize", measureRow);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureRow);
    };
  }, [measureRow]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      setStoredWidth(clamp(current.startWidth - (event.clientX - current.startX)));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setStoredWidth((value) => {
        localStorage.setItem("lingzhu.sidePanelWidth", String(value));
        return value;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [clamp]);

  // Below the row width that holds both minimums the panel stops taking space
  // from the transcript and floats over it, so the chat never drops under its
  // own minimum while the window narrows.
  const overlay = !panelRowHoldsBoth(rowWidth ?? 0);
  const width = overlay ? overlaySidePanelWidth(storedWidth, rowWidth) : clamp(storedWidth);
  // The same limit in CSS, so the browser applies it on the frame the row
  // resizes instead of after the observer reports the new width.
  const maxWidth = overlay
    ? undefined
    : `max(${SIDE_PANEL_WIDTH_MIN}px, 100% - ${PANEL_ROW_GAP + CHAT_PANEL_WIDTH_MIN}px)`;
  const visible = present || open;

  // Every view the user has visited stays in the tree while its tab is open; a
  // tab that closes drops its view.
  const paneIDs = (active && !visited.includes(active) ? [...visited, active] : visited).filter(
    (id) => id === active || tabs.some((tab) => tab.id === id),
  );

  useEffect(() => {
    if (!active) return;
    setVisited((current) => (current.includes(active) ? current : [...current, active]));
  }, [active]);

  // Runs after the first commit, before any later toggle can use it.
  useEffect(() => {
    renderedBefore.current = true;
  }, []);

  const stopFlight = useCallback(() => {
    if (flight.current) window.cancelAnimationFrame(flight.current.frame);
    flight.current = undefined;
  }, []);

  useEffect(() => stopFlight, [stopFlight]);

  // Shows `target` at once: writes the real box size and lets the contents wrap
  // with the panel again. A closed landing also removes the pane.
  const settle = useCallback(
    (target: number) => {
      stopFlight();
      const element = aside.current;
      if (element) {
        element.style.width = `${target}px`;
        element.style.overflow = "";
      }
      if (contentBox.current) {
        contentBox.current.style.width = "";
        contentBox.current.style.opacity = "";
      }
      paintedWidth.current = target;
      if (target === 0) setPresent(false);
    },
    [stopFlight],
  );

  // Runs the panel's width along the shared spring. The contents keep the open
  // width, so the shrinking box clips them rather than rewrapping them, and they
  // fade only across the last 15% of the travel.
  const fly = useCallback(
    (target: number) => {
      const element = aside.current;
      if (!element || prefersReducedMotion()) {
        settle(target);
        return;
      }
      const box = contentBox.current;
      element.style.overflow = "hidden";
      // Start the first frame where the last one left off, so a panel that
      // mounts open cannot paint at its content width for a moment.
      element.style.width = `${paintedWidth.current}px`;
      if (box) {
        box.style.width = `${openWidth.current}px`;
        box.style.opacity = `${panelContentOpacity(paintedWidth.current, openWidth.current)}`;
      }
      const state = { spring: panelSpring(paintedWidth.current, openWidth.current), frame: 0, last: performance.now() };
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
    },
    [settle],
  );

  // Toggling flies the width; opening also brings the pane into the tree so its
  // close can travel. A panel first shown already open has no flight to make.
  useLayoutEffect(() => {
    const element = aside.current;
    if (!element) return;
    const target = open ? width : 0;
    openWidth.current = width;
    flightTarget.current = target;
    if (open) setPresent(true);
    if (!paintedOnce.current) {
      paintedOnce.current = true;
      // A first paint that is already open, like the app starting with the
      // panel open, has no travel to make; a panel mounted closed and opened
      // later flies like any other toggle.
      if (open && !renderedBefore.current) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visible, fly, settle]);

  // A width change at rest, from a drag or the window resizing, applies at once
  // so the panel follows the pointer and the row rather than chasing them.
  useLayoutEffect(() => {
    const element = aside.current;
    if (!element) return;
    const target = open ? width : 0;
    openWidth.current = width;
    flightTarget.current = target;
    if (flight.current) return;
    settle(target);
  }, [width, open, settle]);

  if (!visible || !workspace || !sessionID) return null;

  const renderContent = (tab: SidePanelTabID | undefined, select: (id: SidePanelTabID) => void) => {
    if (!tab) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
          <FileText className="size-14 text-text-base opacity-10" />
          <p className="max-w-56 text-body text-text-faint">{tr("selectFileToOpen")}</p>
        </div>
      );
    }
    if (tab === "review") {
      return (
        <ReviewPane
          workspace={workspace}
          sessionID={sessionID}
          title={title}
          onSendReview={onSendReview}
          onOpenFile={onOpenFile}
        />
      );
    }
    if (tab === "files") return <FilesPane workspace={workspace} onOpenFile={onOpenFile} />;
    if (tab === "details") {
      return (
        <DetailsPane
          chat={chat}
          workspace={workspace}
          sessionID={sessionID}
          contextWindow={contextWindow}
          onSelect={select}
        />
      );
    }
    if (tab === "plugins") return <PluginPanelsPane workspace={workspace} />;
    if (isFilePanelTab(tab)) return <FileViewer workspace={workspace} path={tab.slice(5)} />;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <FileText className="size-14 text-text-base opacity-10" />
        <p className="max-w-56 text-body text-text-faint">{tr("selectFileToOpen")}</p>
      </div>
    );
  };

  const renderStrip = (paneTabs: SidePanelTab[], paneActive: SidePanelTabID | undefined, paneSelect: (id: SidePanelTabID) => void) => (
    <div
      role="tablist"
      aria-label={tr("panelTabs")}
      className="no-scrollbar flex min-w-0 flex-1 items-center gap-4 overflow-x-auto"
    >
      {paneTabs.map((tab) => {
        const selected = tab.id === paneActive;
        const Icon = iconFor(tab.id);
        return (
          <div
            key={tab.id}
            data-selected={selected ? "true" : undefined}
            data-dragging={dragKey === tab.id ? "true" : undefined}
            draggable={Boolean(onReorderTabs)}
            onDragStart={(event) => {
              setDragKey(tab.id);
              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tab.id);
              }
            }}
            onDragOver={(event) => {
              if (!dragKey) return;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragKey || dragKey === tab.id) return;
              const ids = paneTabs.map((item) => item.id);
              const from = ids.indexOf(dragKey);
              const to = ids.indexOf(tab.id);
              if (from >= 0 && to >= 0 && onReorderTabs) {
                ids.splice(from, 1);
                ids.splice(to, 0, dragKey);
                onReorderTabs(ids);
              }
              setDragKey(undefined);
            }}
            onDragEnd={() => setDragKey(undefined)}
            className="group/panel-tab relative flex h-6 max-w-80 shrink-0 items-center gap-1 rounded-md border border-transparent pe-0.5 ps-1 text-text-muted hover:bg-[var(--overlay-hover)] hover:text-text-base data-[dragging=true]:opacity-40 data-[selected]:border-border-base data-[selected]:bg-[var(--overlay-selected)] data-[selected]:text-text-base"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => paneSelect(tab.id)}
              className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-body font-[440] tracking-[-0.04px] tabular-nums"
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
            <button
              type="button"
              aria-label={`${tr("closeTab")} ${tab.label}`}
              onClick={() => onCloseTab(tab.id)}
              className={`interactive grid size-4 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base ${
                selected ? "" : "opacity-0 group-hover/panel-tab:opacity-100"
              }`}
            >
              <X className="size-3" />
            </button>
            {/* The reference marks the selected tab with a hairline that meets
                the strip's bottom border instead of tinting the pill. */}
            {selected && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1 -bottom-[9px] h-px bg-text-base"
              />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <aside
      ref={aside}
      // The width is written frame by frame while the panel travels, so React
      // leaves it alone; maxWidth keeps the row's limit applied in CSS.
      style={{ maxWidth }}
      aria-label={tr("reviewAndFiles")}
      data-open={open ? "true" : "false"}
      data-overlay={overlay ? "true" : undefined}
      // The panel itself must not clip: the resize handle straddles its start
      // edge and its pill would be cut in half. Only a flight clips, since its
      // contents keep the open width and would otherwise paint past the box.
      className={`relative flex h-full min-h-0 shrink-0 flex-col rounded-[10px] bg-bg-base elevation-raised ${
        overlay ? "absolute inset-y-0 end-0 z-30" : ""
      } ${open ? "" : "pointer-events-none"}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={tr("resizeSidePanel")}
        onPointerDown={(event) => {
          event.preventDefault();
          // Start from the width on screen: in a narrow row the shown width is
          // already clamped, so dragging can only move within the room there is.
          drag.current = { startX: event.clientX, startWidth: width };
        }}
        // The row leaves an 8px gap between the transcript and this panel. The
        // handle is 8px wide and starts one gap before the panel, so its pill
        // lands in the middle of that gap instead of on the panel's edge.
        className="resize-handle-h absolute inset-y-0 -start-2 z-20 w-2 cursor-col-resize"
      />

      <div ref={contentBox} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px]">
        <div
          className="flex h-12 shrink-0 items-center gap-2 border-b-[0.5px] border-border-base bg-bg-raised pl-3"
          style={{ paddingInlineEnd: endInset }}
        >
        {renderStrip(tabs, active, onSelect)}

        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={tr("addPanelTab")}
                className="interactive grid size-7 place-items-center rounded-md text-text-muted hover:text-text-base"
              >
                <Plus className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" className="min-w-44">
              {SIDE_PANEL_TAB_IDS.filter((id) => !tabs.some((tab) => tab.id === id)).map((id) => {
                const Icon = iconFor(id);
                return (
                  <DropdownMenuItem key={id} onSelect={() => onAddTab?.(id)}>
                    <Icon className="text-text-muted" />
                    {tabLabel(tr, id)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* The floating review toggle sits over this bar's trailing end, so the
              strip keeps its 28px slot instead of drawing under it. */}
          <div className="size-7 shrink-0" aria-hidden="true" />
        </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {paneIDs.map((id) => {
              const shown = id === active;
              return (
                <div
                  key={id}
                  // Hidden views keep their state and scroll position, so a
                  // switch back shows the same diff or tree instead of reading
                  // it again; content-visibility skips their layout and paint.
                  className="absolute inset-0 flex min-h-0 flex-col"
                  data-active={shown ? "true" : undefined}
                  aria-hidden={!shown || undefined}
                  inert={!shown || undefined}
                  style={shown ? undefined : { contentVisibility: "hidden" }}
                >
                  {renderContent(id, onSelect)}
                </div>
              );
            })}
            {!active && renderContent(undefined, onSelect)}
          </div>
        </div>
      </div>
    </aside>
  );
}

function ReviewEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 pb-40 text-center">
      <FileText className="mb-2 size-5 text-text-muted" />
      <p className="text-body leading-[13px] font-[530] text-text-base">{title}</p>
      <p className="max-w-[282px] text-body leading-5 text-text-muted">{description}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{title}</h2>
      <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-weak)]">
        {children}
      </div>
    </section>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b-[0.5px] border-border-base py-3 last:border-0">
      <span className="shrink-0 text-meta text-text-muted">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-body text-text-base ${mono ? "font-mono text-meta" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** Session summary: identity, context usage, and the turn's diff totals. */
function DetailsPane({
  chat,
  workspace,
  sessionID,
  contextWindow,
  onSelect,
}: {
  chat?: ChatState;
  workspace: string;
  sessionID: string;
  contextWindow?: number;
  onSelect: (id: SidePanelTabID) => void;
}) {
  const tr = useT();
  if (!chat) {
    return <p className="p-3 text-meta text-text-faint">{tr("sessionDetailsUnavailable")}</p>;
  }

  const usage = chat.usage;
  const changes = sessionChanges(chat.entries);
  const window = contextWindow ?? 0;
  const ratio = window > 0 ? Math.min(100, Math.round((chat.tokens / window) * 100)) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-3">
      <DetailSection title={tr("sessionLabel")}>
        <DetailRow label={tr("titleLabel")} value={chat.title || tr("paletteNewSession")} />
          <DetailRow label={tr("agentLabel")} value={chat.agent || "—"} />
        <DetailRow
          label={tr("modelLabel")}
          value={chat.model ? `${chat.provider ? `${chat.provider}/` : ""}${chat.model}` : "—"}
        />
        <DetailRow label={tr("workspaceLabel")} value={workspace} mono />
        <DetailRow label={tr("sessionLabel")} value={sessionID} mono />
      </DetailSection>

      <DetailSection title={tr("contextLabel")}>
        <div className="flex items-center justify-between gap-4 pt-3 pb-2">
          <span className="text-meta text-text-muted">{tr("tokensLabel")}</span>
          <span className="font-mono text-meta tabular-nums text-text-base">
            {formatTokens(chat.tokens)} / {formatTokens(window)}
          </span>
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-layer-02">
          <div className="h-full rounded-full bg-text-accent" style={{ width: `${ratio}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-border-base py-3 text-meta text-text-muted">
          <span className="flex items-center justify-between gap-2">
            <span>{tr("inputLabel")}</span>
            <span className="font-mono tabular-nums text-text-base">{formatTokens(usage?.input)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>{tr("outputLabel")}</span>
            <span className="font-mono tabular-nums text-text-base">{formatTokens(usage?.output)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>{tr("cacheReadLabel")}</span>
            <span className="font-mono tabular-nums text-text-base">{formatTokens(usage?.cacheRead)}</span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span>{tr("cacheWriteLabel")}</span>
            <span className="font-mono tabular-nums text-text-base">{formatTokens(usage?.cacheWrite)}</span>
          </span>
        </div>
      </DetailSection>

      <DetailSection title={tr("changesLabel")}>
        {changes ? (
          <>
            <DetailRow label={tr("files")} value={String(changes.files)} />
            <DetailRow label={tr("addedLabel")} value={`+${changes.added}`} />
            <DetailRow label={tr("removedLabel")} value={`-${changes.removed}`} />
            <div className="py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => onSelect("review")}>
                {tr("openReview")}
              </Button>
            </div>
          </>
        ) : (
          <p className="py-3 text-meta text-text-faint">{tr("noChanges")}</p>
        )}
      </DetailSection>
    </div>
  );
}

/** The reference review-mode glyphs, drawn on the shared 16px icon grid. */
function ReviewModeIcon({ name }: { name: "expand" | "collapse" | "unified" | "split" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {name === "expand" && (
        <>
          <path d="M8.25 6.17773V1.17773M11.25 4.17773L8.25 1.17773L5.25 4.17773" stroke="currentColor" />
          <path d="M8.25 9.17773V14.1777M11.25 11.1777L8.25 14.1777L5.25 11.1777" stroke="currentColor" />
          <path d="M4.25 7.67773H12.25" stroke="currentColor" />
        </>
      )}
      {name === "collapse" && (
        <>
          <path d="M8 1V6M11 3L8 6L5 3" stroke="currentColor" />
          <path d="M8 15V10M11 13L8 10L5 13" stroke="currentColor" />
          <path d="M4 8H6" stroke="currentColor" />
          <path d="M7 8H9" stroke="currentColor" />
          <path d="M10 8H12" stroke="currentColor" />
        </>
      )}
      {name === "split" && (
        <>
          <path d="M1 14H15L15 2H1V14Z" stroke="currentColor" />
          <rect x="3" y="4" width="4" height="8" fill="currentColor" fillOpacity="0.5" />
          <rect x="9" y="4" width="4" height="8" fill="currentColor" fillOpacity="0.5" />
        </>
      )}
      {name === "unified" && (
        <>
          <path
            d="M3.00001 4.00045L12.9998 4L13 6.99955L3 7L3.00001 4.00045Z"
            fill="currentColor"
            fillOpacity="0.5"
          />
          <path d="M3.0001 9H13L12.9999 12H3L3.0001 9Z" fill="currentColor" fillOpacity="0.5" />
          <path d="M1 14H15L15 2H1V14Z" stroke="currentColor" />
        </>
      )}
    </svg>
  );
}

function ReviewPane({
  workspace,
  sessionID,
  onSendReview,
  onOpenFile,
}: {
  workspace: string;
  sessionID: string;
  title?: string;
  onSendReview: (text: string, comments?: ReviewComment[]) => void;
  onOpenFile?: (path: string) => void;
}) {
  const tr = useT();
  const { diff, selected, loading, error, select } = useSessionDiff(workspace, sessionID);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [selection, setSelection] = useState<{ start: number; end: number; side: "old" | "new" }>();
  const [anchor, setAnchor] = useState<number>();
  const [commentText, setCommentText] = useState("");
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");
  const [expandMode, setExpandMode] = useState<"expand" | "collapse">("expand");
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeWidth, setTreeWidth] = useState(240);
  const [filter, setFilter] = useState("");
  const treeScroll = useRef<HTMLDivElement>(null);

  const updateTreeFade = () => {
    const element = treeScroll.current;
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
  const startTreeResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = treeWidth;
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

  useEffect(() => {
    setComments([]);
    setSelection(undefined);
    setAnchor(undefined);
    setCommentText("");
  }, [workspace, sessionID]);

  const current = useMemo(() => diff?.diffs.find((item) => item.file === selected), [diff, selected]);
  const fileParts = current ? splitFilePath(current.file) : undefined;
  const filteredDiffs = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return diff?.diffs ?? [];
    return (diff?.diffs ?? []).filter((item) => item.file.toLowerCase().includes(term));
  }, [diff, filter]);

  useEffect(() => {
    if (!treeOpen) return;
    const frame = requestAnimationFrame(updateTreeFade);
    return () => cancelAnimationFrame(frame);
  }, [treeOpen, filteredDiffs]);
  const lines = useMemo(() => (current ? parsePatch(current.patch) : []), [current]);
  // Collapse hides unchanged context, leaving only hunks and changed lines.
  const visibleLines = useMemo(
    () => (expandMode === "collapse" ? lines.filter((line) => line.kind !== "context") : lines),
    [expandMode, lines],
  );
  const splitRows = useMemo(() => splitPatch(visibleLines), [visibleLines]);
  const additions = diff?.diffs.reduce((sum, item) => sum + item.additions, 0) ?? 0;
  const deletions = diff?.diffs.reduce((sum, item) => sum + item.deletions, 0) ?? 0;
  const fileComments = comments.filter((item) => item.file === selected);
  // Notes anchored to a line that is on screen render under that line; the rest
  // stay in the file list so collapsing context never hides a note.
  const visibleNumbers = useMemo(() => {
    const numbers = new Set<string>();
    for (const line of visibleLines) {
      const number = diffLineNumber(line);
      if (number !== undefined) numbers.add(`${line.kind === "del" ? "old" : "new"}:${number}`);
    }
    return numbers;
  }, [visibleLines]);
  const detachedComments = fileComments.filter((comment) => !visibleNumbers.has(`${comment.side}:${comment.start}`));

  const pickLine = (line: DiffLine, extend: boolean) => {
    const number = diffLineNumber(line);
    if (number === undefined) return;
    const side = line.kind === "del" ? "old" : "new";
    if (extend && selection && anchor !== undefined) {
      setSelection({
        start: Math.min(anchor, number),
        end: Math.max(anchor, number),
        side: selection.side,
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
    if (!current || !selection || commentText.trim() === "") return;
    const comment: ReviewComment = {
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: current.file,
      start: selection.start,
      end: selection.end,
      side: selection.side,
      text: commentText.trim(),
    };
    setComments((items) => addReviewComment(items, comment));
    setSelection(undefined);
    setAnchor(undefined);
    setCommentText("");
  };

  const sendReview = () => {
    const prompt = formatReviewPrompt(comments);
    if (!prompt) return;
    onSendReview(prompt, comments);
    setComments([]);
  };

  const selectedInRange = (line: DiffLine): boolean => {
    if (!selection) return false;
    const number = diffLineNumber(line);
    return number !== undefined && number >= selection.start && number <= selection.end;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <div role="alert" className="mx-3 mt-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
          {error}
        </div>
      )}

      {!error && loading && !diff && <p className="p-3 text-meta text-text-faint">{tr("loadingChanges")}</p>}

      {!error && diff && diff.diffs.length === 0 && !loading && (
        <ReviewEmpty
          title={tr("noChanges")}
          description="Changes made during this session will show up here."
        />
      )}

      {diff && diff.diffs.length > 0 && (
        <div className="flex min-h-0 flex-1">
          {treeOpen && (
          <div className="relative flex shrink-0 flex-col border-r border-border-base" style={{ width: treeWidth }}>
            <span
              role="separator"
              aria-orientation="vertical"
              aria-label={tr("resizeFileTree")}
              onPointerDown={startTreeResize}
              onDoubleClick={() => setTreeWidth(240)}
              className="resize-handle-h absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
            />
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 ps-2 pe-4">
              <span className="min-w-0 truncate text-body leading-4 font-[500] text-text-base">{tr("changesLabel")}</span>
              <span className="flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums">
                <span className="text-state-fg-success">+{additions}</span>
                <span className="text-state-fg-danger">-{deletions}</span>
              </span>
            </div>
            <div className="shrink-0 px-2 pb-1">
              <label className="mt-[3px] flex h-7 items-center gap-1.5 rounded-md px-1.5 text-text-faint focus-within:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]">
                <Search className="size-3.5 shrink-0" />
                <input
                  value={filter}
                  aria-label={tr("filterFiles")}
                  placeholder={tr("filterFiles")}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setFilter(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-body text-text-base outline-none placeholder:text-text-faint"
                />
                {filter && (
                  <button
                    type="button"
                    aria-label={tr("clearFilter")}
                    onClick={() => setFilter("")}
                    className="grid size-4 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </label>
            </div>
            <div ref={treeScroll} onScroll={updateTreeFade} className="review-tree-scroll min-h-0 flex-1 overflow-auto px-2 pt-1 pb-3">
              {filteredDiffs.length > 0 ? (
                <ReviewFileTree
                  files={filteredDiffs}
                  selected={selected}
                  flat={filter.trim() !== ""}
                  onSelect={(file) => {
                    select(file);
                    setSelection(undefined);
                    setAnchor(undefined);
                    setCommentText("");
                  }}
                />
              ) : (
                <p className="px-2 py-2 text-meta text-text-faint">{tr("noFilesMatch")}</p>
              )}
            </div>
          </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {current ? (
              <>
                <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-base ps-2 pe-3">
                  <div className="flex min-w-0 items-center gap-0">
                    <button
                      type="button"
                      aria-label={treeOpen ? "Hide file tree" : "Show file tree"}
                      aria-expanded={treeOpen}
                      onClick={() => setTreeOpen((value) => !value)}
                      className={`interactive grid h-7 w-9 shrink-0 place-items-center rounded-md hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${
                        treeOpen ? "bg-bg-layer-02 text-text-base" : "text-text-base"
                      }`}
                    >
                      {treeOpen ? <FolderOpen className="size-4" /> : <FolderClosed className="size-4" />}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("previousFile")}
                      disabled={(diff?.diffs.findIndex((item) => item.file === selected) ?? 0) <= 0}
                      onClick={() => {
                        const list = diff?.diffs ?? [];
                        const index = list.findIndex((item) => item.file === selected);
                        const next = list[Math.max(0, index - 1)];
                        if (next) {
                          select(next.file);
                          setSelection(undefined);
                          setAnchor(undefined);
                          setCommentText("");
                        }
                      }}
                      className="h-7 w-9 rounded-md text-text-faint hover:text-text-base"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tr("nextFile")}
                      disabled={
                        (diff?.diffs.findIndex((item) => item.file === selected) ?? 0) >= (diff?.diffs.length ?? 1) - 1
                      }
                      onClick={() => {
                        const list = diff?.diffs ?? [];
                        const index = list.findIndex((item) => item.file === selected);
                        const next = list[Math.min(list.length - 1, index + 1)];
                        if (next) {
                          select(next.file);
                          setSelection(undefined);
                          setAnchor(undefined);
                          setCommentText("");
                        }
                      }}
                      className="h-7 w-9 rounded-md text-text-faint hover:text-text-base"
                    >
                      <ArrowRight className="size-4" />
                    </Button>
                    {!treeOpen && diff.diffs.length > 1 && (
                      <span className="shrink-0 text-caption leading-3 font-[440] tracking-[0.05px] uppercase tabular-nums text-text-faint">
                        {Math.max(0, diff.diffs.findIndex((item) => item.file === selected)) + 1}/{diff.diffs.length}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {comments.length > 0 && (
                      <Button type="button" size="sm" onClick={sendReview}>
                        <Send />
                        Send ({comments.length})
                      </Button>
                    )}
                    {onOpenFile && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Open ${current.file} in panel`}
                            onClick={() => onOpenFile(current.file)}
                            className="text-icon-base shadow-[inset_0_0_0_1px_var(--border-muted)]"
                          >
                            <ExternalLink className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" appearance="standard">{tr("openInPanel")}</TooltipContent>
                      </Tooltip>
                    )}
                    <SegmentedControl
                      compact
                      label="Expand mode"
                      value={expandMode}
                      onChange={setExpandMode}
                      options={[
                        {
                          value: "expand",
                          label: "",
                          icon: <ReviewModeIcon name="expand" />,
                          ariaLabel: "Show all lines",
                        },
                        {
                          value: "collapse",
                          label: "",
                          icon: <ReviewModeIcon name="collapse" />,
                          ariaLabel: "Hide non-diff lines",
                        },
                      ]}
                    />
                    <SegmentedControl
                      compact
                      label="Diff layout"
                      value={diffMode}
                      onChange={setDiffMode}
                      options={[
                        {
                          value: "unified",
                          label: "",
                          icon: <ReviewModeIcon name="unified" />,
                          ariaLabel: "Unified diff",
                        },
                        {
                          value: "split",
                          label: "",
                          icon: <ReviewModeIcon name="split" />,
                          ariaLabel: "Split diff",
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-4 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5" dir="ltr">
                    <span
                      className={`grid size-4 shrink-0 place-items-center text-caption font-[530] uppercase tabular-nums ${fileStatusTone(current.status)}`}
                    >
                      {fileStatusLetter(current.status)}
                    </span>
                    <span className="shrink-0 truncate text-body font-[530] tabular-nums text-text-base">
                      {fileParts?.name}
                    </span>
                    {fileParts?.directory && (
                      <span className="min-w-0 truncate text-body font-[440] tabular-nums text-text-muted">
                        {fileParts.directory}
                      </span>
                    )}
                  </div>
                  <span className="ms-auto flex shrink-0 items-center gap-1 font-mono text-caption tabular-nums">
                    <span className="text-state-fg-success">+{current.additions}</span>
                    <span className="text-state-fg-danger">-{current.deletions}</span>
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-auto font-mono text-body leading-6 [scroll-padding-top:28px]">
                  {diffMode === "split"
                    ? splitRows.slice(0, 4000).map((row, index) => (
                        <div key={index} className="flex min-w-full">
                          {[row.left, row.right].map((side, column) => {
                            if (!side) {
                              return (
                                <span
                                  key={column}
                                  className="min-w-0 flex-1 bg-bg-layer-01/40"
                                  aria-hidden="true"
                                />
                              );
                            }
                            if (side.kind === "meta") {
                              return (
                                <span
                                  key={column}
                                  className={`sticky top-0 z-[1] flex min-w-0 flex-1 bg-bg-base px-2 text-text-faint ${
                                    column === 0 ? "border-r-[0.5px] border-border-base" : ""
                                  }`}
                                >
                                  <span className="w-10 shrink-0 text-right tabular-nums" />
                                  <span className="truncate">{side.text}</span>
                                </span>
                              );
                            }
                            return (
                              <button
                                key={column}
                                type="button"
                                onClick={(event) => pickLine(side, event.shiftKey)}
                                className={`flex min-w-0 flex-1 gap-1 ps-3 pe-2 text-left hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${lineClass(side)} ${
                                  column === 0 ? "border-r-[0.5px] border-border-base" : ""
                                } ${selectedInRange(side) ? "shadow-[inset_0_0_0_9999px_color-mix(in_srgb,var(--bg-accent)_20%,transparent)]" : ""}`}
                              >
                                <span className={`w-10 shrink-0 select-none text-right tabular-nums ${lineNumberClass(side, selectedInRange(side))}`}>
                                  {side.old ?? side.next ?? ""}
                                </span>
                                <span className="flex h-full w-3 shrink-0 select-none items-center justify-center">
                                  {side.kind === "add" && (
                                    <span className="h-full w-0.5 rounded-full bg-[var(--diff-add-fg)]" />
                                  )}
                                  {side.kind === "del" && (
                                    <span className="h-full w-0.5 rounded-full bg-[var(--diff-remove-fg)]" />
                                  )}
                                </span>
                                <span className="min-w-0 whitespace-pre-wrap break-words select-text">{side.text || " "}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))
                    : visibleLines.slice(0, 4000).map((line, index) => {
                        const selectedLine = selectedInRange(line);
                        if (line.kind === "meta") {
                          return (
                            <div
                              key={index}
                              className="sticky top-0 z-[1] flex min-w-full gap-1 bg-bg-base ps-3 pe-2 text-text-faint"
                            >
                              <span className="w-10 shrink-0 text-right tabular-nums" />
                              <span className="w-3 shrink-0" />
                              <span className="whitespace-pre">{line.text}</span>
                            </div>
                          );
                        }
                        const number = diffLineNumber(line);
                        // Old and new sides can share a line number, so the
                        // composer and its notes also match the side.
                        const side = line.kind === "del" ? "old" : "new";
                        const composer = selection && selection.start === number && selection.side === side;
                        const notes =
                          number === undefined
                            ? []
                            : fileComments.filter((note) => note.start === number && note.side === side);
                        return (
                          <Fragment key={index}>
                            <div
                              data-slot="review-diff-row"
                              data-line={number}
                              data-kind={line.kind}
                              data-selected={selectedLine ? "true" : undefined}
                              className={`group/line relative flex min-w-full gap-1 ps-3 pe-2 text-left hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] ${lineClass(line)} ${
                                selectedLine ? "shadow-[inset_0_0_0_9999px_color-mix(in_srgb,var(--bg-accent)_20%,transparent)]" : ""
                              }`}
                            >
                              <span className={`w-10 shrink-0 select-none text-right tabular-nums ${lineNumberClass(line, selectedLine)}`}>
                                {line.kind === "add" ? line.next : line.old ?? ""}
                              </span>
                              <button
                                type="button"
                                aria-label={`Comment on line ${number ?? ""}`}
                                title={tr("addNoteToLine")}
                                onClick={() => commentOnLine(line)}
                                className="absolute inset-y-0 start-0 grid w-3 place-items-center text-text-faint opacity-0 transition-opacity hover:text-text-base focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-border-focus group-hover/line:opacity-100"
                              >
                                <Plus className="size-3" />
                              </button>
                              <span className="flex h-full w-3 shrink-0 select-none items-center justify-center">
                                {line.kind === "add" && (
                                  <span className="h-full w-0.5 rounded-full bg-[var(--diff-add-fg)]" />
                                )}
                                {line.kind === "del" && (
                                  <span className="h-full w-0.5 rounded-full bg-[var(--diff-remove-fg)]" />
                                )}
                              </span>
                              <span
                                onClick={(event) => pickLine(line, event.shiftKey)}
                                className="min-w-0 flex-1 cursor-pointer whitespace-pre-wrap break-words select-text"
                              >
                                {line.text || " "}
                              </span>
                            </div>
                            {notes.map((note) => (
                              <InlineReviewNote
                                key={note.id}
                                note={note}
                                onRemove={() => setComments((items) => removeReviewComment(items, note.id))}
                              />
                            ))}
                            {composer && (
                              <ReviewComposer
                                target={selection}
                                text={commentText}
                                onChange={setCommentText}
                                onCancel={() => {
                                  setSelection(undefined);
                                  setAnchor(undefined);
                                  setCommentText("");
                                }}
                                onSubmit={addComment}
                              />
                            )}
                          </Fragment>
                        );
                      })}
                  {lines.length > 4000 && (
                    <div className="px-3 py-2 text-caption text-text-faint">
                      Showing the first 4000 lines. Open the source control panel for the full patch.
                    </div>
                  )}
                </div>

                {selection && diffMode === "split" && (
                  <ReviewComposer
                    target={selection}
                    text={commentText}
                    onChange={setCommentText}
                    onCancel={() => {
                      setSelection(undefined);
                      setAnchor(undefined);
                      setCommentText("");
                    }}
                    onSubmit={addComment}
                  />
                )}

                {detachedComments.length > 0 && (
                  <div className="max-h-48 shrink-0 overflow-y-auto border-t border-border-base p-2">
                    <div className="flex flex-col gap-2">
                      {detachedComments.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-start gap-2 rounded-md bg-bg-layer-01 p-3 shadow-elevation-raised"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <span className="text-caption leading-4 font-[530] tracking-[0.05px] text-text-faint">
                              L{comment.start}
                              {comment.end === comment.start ? "" : `-${comment.end}`} ({comment.side})
                            </span>
                            <p className="whitespace-pre-wrap text-body leading-4 text-text-base select-text">
                              {comment.text}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={tr("removeReviewNote")}
                            onClick={() => setComments((items) => removeReviewComment(items, comment.id))}
                            className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <ReviewEmpty
                title={tr("selectFile")}
                description="Choose a changed file to review its diff."
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

/** Read-only file text with a line-number gutter; very large files stay plain. */
function NumberedText({ text }: { text: string }) {
  const lines = text.split("\n");
  if (lines.length > 3000) {
    return (
      <pre className="px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre text-text-base select-text">{text}</pre>
    );
  }
  return (
    <div className="min-w-max py-2">
      {lines.map((line, index) => (
        <div key={index} className="flex">
          <span className="w-12 shrink-0 select-none pr-3 text-right font-mono text-[12px] leading-5 text-text-faint">
            {index + 1}
          </span>
          <span className="whitespace-pre font-mono text-[12px] leading-5 text-text-base select-text">
            {line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One file opened in its own side tab, with a reload control. */
function FileViewer({ workspace, path }: { workspace: string; path: string }) {
  const tr = useT();
  const [content, setContent] = useState<FileContent>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const configFile = path === CONFIG_FILE_TAB;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (configFile) {
        const file = await api.readConfigFile();
        setContent({
          path: file.path,
          content: file.content,
          truncated: false,
          binary: false,
          size: file.content.length,
        });
      } else {
        setContent(await api.fileContent(workspace, path));
      }
    } catch (cause) {
      setError(messageOf(cause));
      setContent(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setContent(undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, path]);

  const title = configFile ? "lingzhu.json" : path;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5">
        <FileText className="size-3.5 shrink-0 text-text-faint" />
        <span className="min-w-0 flex-1 truncate font-mono text-meta text-text-base" title={title}>
          {title}
        </span>
        <CopyButton text={configFile ? content?.path ?? path : path} label="Copy path" />
        <button
          type="button"
          aria-label={tr("reloadFile")}
          disabled={loading}
          onClick={() => void load()}
          className="interactive grid size-6 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} />
        </button>
      </div>
      {error ? (
        <div role="alert" className="m-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
          {error}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {content ? (
            content.binary ? (
              <p className="p-3 text-meta text-text-faint">{tr("binaryPreviewUnavailable")}</p>
            ) : (
              <NumberedText text={content.content || "(empty file)"} />
            )
          ) : (
            <p className="p-3 text-meta text-text-faint">{tr("loadingFile")}</p>
          )}
          {content?.truncated && (
            <div className="border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
              {tr("dialogPreviewTruncated256kb")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilesPane({ workspace, onOpenFile }: { workspace: string; onOpenFile?: (path: string) => void }) {
  const tr = useT();
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FileSearchHit[]>([]);
  const [hitsTruncated, setHitsTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadDir = async (path: string) => {
    const list = await api.files(workspace, path, false);
    setChildren((current) => ({ ...current, [path]: list.entries }));
  };

  useEffect(() => {
    setChildren({});
    setExpanded({});
    setError("");
    setQuery("");
    setHits([]);
    setLoading(true);
    loadDir("")
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  // Workspace-wide filename search; an empty query returns to the tree.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setHits([]);
      setHitsTruncated(false);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api
        .searchFiles(workspace, term, 50)
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
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, workspace]);

  const toggleDir = async (path: string) => {
    const open = !expanded[path];
    setExpanded((current) => ({ ...current, [path]: open }));
    if (open && !children[path]) {
      try {
        await loadDir(path);
      } catch (cause) {
        setError(messageOf(cause));
      }
    }
  };

  const open = (path: string) => onOpenFile?.(path);

  const rows: ReactNode[] = [];
  const renderDir = (path: string, depth: number) => {
    const entries = children[path];
    if (!entries) return;
    for (const entry of entries) {
      const padding = 8 + depth * 12;
      if (entry.type === "dir") {
        const isOpen = expanded[entry.path] ?? false;
        rows.push(
          <button
            key={entry.path}
            type="button"
            onClick={() => void toggleDir(entry.path)}
            style={{ paddingLeft: padding }}
            className="interactive flex h-7 w-full items-center gap-1.5 pr-2 text-left text-meta text-text-muted hover:text-text-base"
          >
            {isOpen ? <FolderOpen className="size-3.5 shrink-0 text-text-faint" /> : <FolderClosed className="size-3.5 shrink-0 text-text-faint" />}
            <span className="truncate">{entry.name}</span>
          </button>,
        );
        if (isOpen) renderDir(entry.path, depth + 1);
      } else {
        rows.push(
          <button
            key={entry.path}
            type="button"
            onClick={() => open(entry.path)}
            style={{ paddingLeft: padding }}
            className="interactive flex h-7 w-full items-center gap-1.5 pr-2 text-left text-meta text-text-muted hover:text-text-base"
          >
            <FileText className="size-3.5 shrink-0 text-text-faint" />
            <span className="truncate" title={entry.path}>
              {entry.name}
            </span>
          </button>,
        );
      }
    }
  };
  renderDir("", 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border-base px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-text-faint">{tr("workspaceFiles")}</span>
          <button
            type="button"
            aria-label={tr("reloadFiles")}
            disabled={loading}
            onClick={() => {
              setChildren({});
              setExpanded({});
              setLoading(true);
              loadDir("")
                .catch((cause) => setError(messageOf(cause)))
                .finally(() => setLoading(false));
            }}
            className="interactive grid size-6 place-items-center rounded-md text-text-faint hover:text-text-base disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "motion-safe:animate-spin" : ""}`} />
          </button>
        </div>
        <div className="relative flex h-7 items-center">
          <Search className="pointer-events-none absolute left-1.5 size-3.5 text-text-faint" />
          <input
            value={query}
            aria-label={tr("searchWorkspaceFiles")}
            placeholder={tr("searchFiles")}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            className="h-full w-full rounded-md bg-transparent pr-7 pl-6 text-meta text-text-base outline-none placeholder:text-text-faint"
          />
          {query && (
            <button
              type="button"
              aria-label={tr("clearFileSearch")}
              onClick={() => setQuery("")}
              className="interactive absolute right-1 grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="m-3 rounded-md border border-state-border-danger bg-state-bg-danger px-3 py-2 text-meta text-state-fg-danger">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {query.trim() ? (
          searching && hits.length === 0 ? (
            <p className="px-2 py-3 text-meta text-text-faint">{tr("searching")}</p>
          ) : hits.length === 0 ? (
            <p className="px-2 py-3 text-meta text-text-faint">{tr("noMatchingFiles")}</p>
          ) : (
            <>
              {hits.map((hit) => (
                <button
                  key={hit.path}
                  type="button"
                  onClick={() => open(hit.path)}
                  className="interactive flex h-7 w-full items-center gap-1.5 px-2 text-left text-meta text-text-muted hover:text-text-base"
                >
                  <FileText className="size-3.5 shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1 truncate" title={hit.path}>
                    {hit.path}
                  </span>
                </button>
              ))}
              {hitsTruncated && (
                <p className="px-2 py-2 text-caption text-text-faint">{tr("firstMatches", { count: 50 })}</p>
              )}
            </>
          )
        ) : (
          rows
        )}
      </div>
    </div>
  );
}

