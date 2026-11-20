import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { layoutPropsEqual } from "@/lib/layoutMemo";
import { Copy, Grid2x2Plus, Pencil, Search, X } from "@lingzhu/ui/icons";
import { formatKeybind } from "../../lib/slash";
import { t, useT } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import { reorderPanelTabs } from "../../lib/panelTabs";
import type { ClosedSideTab, SideTab } from "../../lib/sessionTabs";
import { useDismissOnOutside, useTabRename, TabRenameInput, TabStatusMark } from "../../lib/tabStrip";
import { Keybind } from "@lingzhu/ui/keybind";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

interface Props {
  tabs: SideTab[];
  activeKey?: string;
  onSelect: (tab: SideTab) => void;
  onClose: (tab: SideTab) => void;
  onCloseOthers?: (tab: SideTab) => void;
  /** Closes every tab below the picked one. */
  onCloseAfter?: (tab: SideTab) => void;
  /** Opens the delete-session confirmation for the picked tab. */
  onDeleteTab?: (tab: SideTab) => void;
  onRename?: (tab: SideTab, title: string) => void;
  onReorder?: (keys: string[]) => void;
  onNew: () => void;
  onSearch: () => void;
  /** Opens the home dashboard; without it the Home row starts a new session. */
  onHome?: () => void;
  /** Highlights the home/new-session action row. */
  homeActive?: boolean;
  /** False while the organized Projects row owns the active highlight. */
  highlightActive?: boolean;
  /** Keybind hints shown on the action rows while hovered. */
  homeKeybind?: string;
  newKeybind?: string;
  searchKeybind?: string;
  /** Recently closed session tabs, oldest first. */
  closedTabs?: ClosedSideTab[];
  onReopenClosed?: (key?: string) => void;
  /** Controlled rail width; the parent persists it alongside the title bar. */
  width?: number;
  onWidthChange?: (width: number) => void;
  /** Horizontal renders only the embedded workspace sidebar, for the top-tabs layout. */
  orientation?: "vertical" | "horizontal" | "inbox";
  /** Top inset under the window chrome: 1px on Windows, 8px on macOS. */
  topInset?: number;
  /** Replaces the tab list with the session inbox. */
  inbox?: ReactNode;
  children?: ReactNode;
}

const MIN_WIDTH = 136;
const MAX_WIDTH = 640;

function clampWidth(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

/**
 * Vertical side tabs for the main area, laid out like the reference rail:
 * 28px single-line rows with a 16px project avatar, Home/Search/Recently
 * closed action rows above them, a translucent pressed overlay on the active
 * row, and a close button revealed on hover or keyboard focus.
 */
function SideTabsView({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseAfter,
  onDeleteTab,
  onRename,
  onReorder,
  onNew,
  onSearch,
  onHome,
  homeActive,
  highlightActive = true,
  homeKeybind,
  newKeybind,
  searchKeybind,
  closedTabs = [],
  onReopenClosed,
  width: controlledWidth,
  onWidthChange,
  orientation = "vertical",
  topInset = 8,
  inbox,
  children,
}: Props) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const titleRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const thumbIdle = useRef<number | undefined>(undefined);
  const thumbDrag = useRef<{ pointerId: number; grabOffset: number } | null>(null);
  const [titleOverflow, setTitleOverflow] = useState<Record<string, boolean>>({});
  const tr = useT();
  const [thumb, setThumb] = useState({ size: 0, start: 0, overflow: false });
  const [thumbHover, setThumbHover] = useState(false);
  const [thumbScrolling, setThumbScrolling] = useState(false);
  const [thumbDragging, setThumbDragging] = useState(false);
  const thumbVisible = thumb.overflow && (thumbHover || thumbScrolling || thumbDragging);
  const [menu, setMenu] = useState<{ tab: SideTab; x: number; y: number }>();
  const [dragKey, setDragKey] = useState<string>();
  const [closedOpen, setClosedOpen] = useState(false);
  const [preview, setPreview] = useState<{ tab: SideTab; left: number; top: number }>();
  const previewTimer = useRef<number | undefined>(undefined);
  const { editing, begin: beginRename, cancel: cancelRename, change: changeRename, commit: commitRename } = useTabRename(onRename);
  const [innerWidth, setInnerWidth] = useState(() => {
    const saved = Number(localStorage.getItem("lingzhu.sideTabsWidth"));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : 240;
  });
  const width = clampWidth(controlledWidth ?? innerWidth);
  const applyWidth = (next: number) => {
    const clamped = clampWidth(next);
    if (onWidthChange) onWidthChange(clamped);
    else setInnerWidth(clamped);
  };

  // The rail feathers each edge by as much as there is left to scroll past it.
  const measureFade = () => {
    const element = listRef.current;
    if (!element) return;
    element.style.setProperty("--side-tabs-fade-top", `${Math.min(16, Math.round(element.scrollTop))}px`);
    element.style.setProperty(
      "--side-tabs-fade-bottom",
      `${Math.min(16, Math.max(0, Math.round(element.scrollHeight - element.clientHeight - element.scrollTop)))}px`,
    );
  };

  // The reference rail draws its own scroll thumb in the 12px track that sits
  // in the shell inset beside the projects/tabs column. The track pads 8px top
  // and bottom and the thumb never shrinks below 32px.
  const measureThumb = () => {
    const element = listRef.current;
    if (!element) return;
    const padding = 8;
    const minimum = 32;
    const track = Math.max(0, element.clientHeight - padding * 2);
    const scrollHeight = element.scrollHeight;
    const overflow = scrollHeight > element.clientHeight;
    const size = track && overflow
      ? Math.min(track, Math.max((element.clientHeight / scrollHeight) * track, minimum))
      : 0;
    const maxScroll = Math.max(0, scrollHeight - element.clientHeight);
    const maxStart = track - size;
    const start = padding + (maxScroll > 0 ? (element.scrollTop / maxScroll) * maxStart : 0);
    setThumb((previous) =>
      previous.size === size && previous.overflow === overflow && Math.abs(previous.start - start) < 0.5
        ? previous
        : { size, start, overflow },
    );
  };

  useLayoutEffect(() => {
    measureThumb();
  });

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      measureThumb();
      measureFade();
    });
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [Boolean(children), Boolean(inbox)]);

  useEffect(() => {
    return () => window.clearTimeout(thumbIdle.current);
  }, []);

  const onListScroll = () => {
    measureFade();
    measureThumb();
    setThumbScrolling(true);
    window.clearTimeout(thumbIdle.current);
    thumbIdle.current = window.setTimeout(() => setThumbScrolling(false), 800);
  };

  const onThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = listRef.current;
    const handle = thumbRef.current;
    if (!element || !handle) return;
    const rect = handle.getBoundingClientRect();
    thumbDrag.current = { pointerId: event.pointerId, grabOffset: event.clientY - rect.top };
    setThumbDragging(true);
    handle.setPointerCapture(event.pointerId);
  };

  const onThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = thumbDrag.current;
    const element = listRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !element) return;
    const padding = 8;
    const minimum = 32;
    const rect = element.getBoundingClientRect();
    const track = Math.max(0, element.clientHeight - padding * 2);
    const scrollHeight = element.scrollHeight;
    const size = Math.min(track, Math.max((element.clientHeight / scrollHeight) * track, minimum));
    const maxStart = track - size;
    const pointer = event.clientY - rect.top - drag.grabOffset;
    const start = Math.max(0, Math.min(pointer - padding, maxStart));
    const progress = maxStart > 0 ? start / maxStart : 0;
    element.scrollTop = progress * Math.max(0, scrollHeight - element.clientHeight);
  };

  const endThumbDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = thumbDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    thumbDrag.current = null;
    setThumbDragging(false);
    if (thumbRef.current?.hasPointerCapture(event.pointerId)) {
      thumbRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target || !onReorder) return;
    const keys = displayTabs.map((tab) => tab.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    onReorder(reorderPanelTabs(keys, from, to));
  };

  // Every tab keeps the order the user arranged.
  const displayTabs = useMemo(() => tabs.filter((tab) => tab.kind !== "settings"), [tabs]);
  const titleSignature = displayTabs.map((tab) => `${tab.key}\u0000${tab.label}`).join("\u0001");

  // The title fades under the trailing controls only when it actually
  // overflows, and only while a row is hovered, focused, active or showing a
  // status mark, as in the reference rail. Idle titles that fit stay solid.
  useEffect(() => {
    const measure = () => {
      const next: Record<string, boolean> = {};
      for (const [key, element] of Object.entries(titleRefs.current)) {
        if (element) next[key] = element.scrollWidth > element.clientWidth + 0.5;
      }
      setTitleOverflow((previous) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(previous).length && keys.every((key) => previous[key] === next[key])) {
          return previous;
        }
        return next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (listRef.current) observer.observe(listRef.current);
    for (const element of Object.values(titleRefs.current)) {
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [titleSignature, editing?.key, width]);

  useDismissOnOutside(Boolean(menu), () => setMenu(undefined));
  useDismissOnOutside(closedOpen, () => setClosedOpen(false));

  useEffect(() => {
    const clear = () => {
      window.clearTimeout(previewTimer.current);
      setPreview(undefined);
    };
    window.addEventListener("scroll", clear, true);
    return () => {
      window.clearTimeout(previewTimer.current);
      window.removeEventListener("scroll", clear, true);
    };
  }, []);

  // The context menu opens over the row, so the pointer never leaves it to
  // dismiss the preview; drop the card as soon as the menu takes over.
  useEffect(() => {
    if (!menu) return;
    window.clearTimeout(previewTimer.current);
    setPreview(undefined);
  }, [menu]);

  // A tab can be deleted or closed while the pointer still sits on its row,
  // which unmounts the row without a mouseleave. A preview must not outlive
  // the tab it describes.
  useEffect(() => {
    if (!preview) return;
    if (displayTabs.some((tab) => tab.key === preview.tab.key)) return;
    window.clearTimeout(previewTimer.current);
    setPreview(undefined);
  }, [displayTabs, preview]);

  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      applyWidth(current.startWidth + event.clientX - current.startX);
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      if (!onWidthChange) {
        setInnerWidth((value) => {
          localStorage.setItem("lingzhu.sideTabsWidth", String(value));
          return value;
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const moveFocus = (current: string, direction: 1 | -1) => {
    const index = displayTabs.findIndex((tab) => tab.key === current);
    if (index === -1) return;
    const next = displayTabs[(index + direction + displayTabs.length) % displayTabs.length];
    onSelect(next);
    buttons.current[next.key]?.focus();
  };

  // Selecting a tab scrolls it into the visible part of the rail.
  useEffect(() => {
    if (!activeKey) return;
    buttons.current[activeKey]?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  if (orientation === "horizontal") return <>{children}</>;

  const renderTab = (tab: SideTab) => {
    const selected = tab.key === activeKey && highlightActive;
    const rename = editing?.key === tab.key;
    return (
      <div
        key={tab.key}
        data-active={selected ? "true" : undefined}
        data-kind={tab.kind}
        data-orientation="vertical"
        data-dragging={dragKey === tab.key ? "true" : undefined}
        data-status={tab.status}
        data-editing={rename ? "true" : undefined}
        data-title-overflow={titleOverflow[tab.key] ? "true" : undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          if (tab.kind === "chat") setMenu({ tab, x: event.clientX, y: event.clientY });
        }}
        onAuxClick={(event) => {
          if (event.button !== 1 || !tab.closable) return;
          event.preventDefault();
          onClose(tab);
        }}
        onMouseDown={(event) => {
          // A middle press would otherwise start Chromium's autoscroll and pan
          // the rail sideways, carrying every row out of the window.
          if (event.button === 1) event.preventDefault();
        }}
        draggable={!!onReorder && tab.closable && !rename}
        onDragStart={(event) => {
          if (!tab.closable || rename) return;
          setDragKey(tab.key);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tab.key);
        }}
        onDragOver={(event) => {
          if (!dragKey) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          reorder(tab.key);
          setDragKey(undefined);
        }}
        onDragEnd={() => setDragKey(undefined)}
        onMouseEnter={(event) => {
          if (tab.kind !== "chat" || dragKey || editing || menu) return;
          window.clearTimeout(previewTimer.current);
          const rect = event.currentTarget.getBoundingClientRect();
          previewTimer.current = window.setTimeout(() => {
            setPreview({
              tab,
              left: rect.right + 8,
              top: Math.max(8, Math.min(rect.top, window.innerHeight - 148)),
            });
          }, 450);
        }}
        onMouseLeave={() => {
          window.clearTimeout(previewTimer.current);
          setPreview(undefined);
        }}
        className={`side-tab interactive group/tab relative flex w-full min-w-0 shrink-0 items-center rounded-md ${rename ? "" : "select-none"}`}
      >
        <button
          ref={(element) => {
            buttons.current[tab.key] = element;
          }}
          type="button"
          role="tab"
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          onClick={() => onSelect(tab)}
          onDoubleClick={() => {
            if (onRename && tab.closable && tab.kind === "chat") {
              beginRename(tab);
            }
          }}
          className="side-tab-link flex h-full min-w-0 flex-1 items-center rounded-md text-left"
        >
          <span className="side-tab-avatar flex size-4 shrink-0 items-center justify-center">
            {tab.draft ? (
              <Pencil
                aria-hidden="true"
                className="size-4 shrink-0 text-icon-muted group-data-[active=true]/tab:text-icon-base"
              />
            ) : (
              <ProjectAvatar name={tab.subtitle ?? tab.label} />
            )}
          </span>
          <span className="side-tab-copy min-w-0 flex-1">
            {rename ? (
              <TabRenameInput
                tab={tab}
                value={editing.value}
                className="side-tab-title w-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-text-base outline-none"
                onChange={(value) => changeRename(tab, value)}
                onCommit={() => commitRename(tab)}
                onCancel={cancelRename}
              />
            ) : (
              <span
                ref={(element) => {
                  titleRefs.current[tab.key] = element;
                }}
                dir="auto"
                className="side-tab-title block overflow-hidden whitespace-nowrap text-clip"
              >
                {tab.label}
              </span>
            )}
          </span>
        </button>

        <span className="side-tab-actions">
          {tab.status ? (
            <span className="side-tab-status">
              <TabStatusMark status={tab.status} />
            </span>
          ) : tab.unread && !selected ? (
            <span className="side-tab-status">
              <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-bg-accent" />
            </span>
          ) : null}
          {tab.closable && tab.kind === "chat" && (
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab);
              }}
              className="side-tab-close interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
            >
              <X className="size-4" />
            </button>
          )}
        </span>
      </div>
    );
  };

  const actionClass =
    "side-rail-action group group/action interactive flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-body leading-4 text-text-faint hover:text-text-base";

  const tabRows = displayTabs.map((tab) => renderTab(tab));

  const tabKeyboard = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const current = displayTabs.find((tab) => tab.key === activeKey);
    if (!current) return;
    event.preventDefault();
    moveFocus(current.key, event.key === "ArrowDown" ? 1 : -1);
  };

  const renderThumb = () =>
    thumb.overflow ? (
      <div className="side-tabs-thumb-track" aria-hidden="true">
        <div
          ref={thumbRef}
          className="side-tabs-thumb"
          data-visible={thumbVisible ? "true" : undefined}
          data-dragging={thumbDragging ? "true" : undefined}
          style={{ height: thumb.size, transform: `translateY(${thumb.start}px)` }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={endThumbDrag}
          onPointerCancel={endThumbDrag}
          onLostPointerCapture={endThumbDrag}
        />
      </div>
    ) : null;

  return (
    <aside
      aria-label={tr("sideTabsLabel")}
      style={{ width, paddingTop: topInset }}
      className="relative flex shrink-0 flex-col bg-bg-deep pb-2.5 ps-[11px] pe-[3px]"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={tr("resizeTabs")}
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { startX: event.clientX, startWidth: width };
        }}
        className="resize-handle-h absolute inset-y-0 -right-2 z-10 w-[calc(3px+8px)] cursor-col-resize"
      />
      <div className="relative flex shrink-0 flex-col gap-[3px]">
        <button
          type="button"
          onClick={onHome ?? onNew}
          aria-pressed={onHome ? Boolean(homeActive) : undefined}
          data-state={homeActive ? "pressed" : undefined}
          className={`${actionClass} ${homeActive ? "text-text-base" : ""}`}
        >
          <Grid2x2Plus className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t("home")}</span>
          {homeKeybind && (
            <span className="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
              <Keybind keys={(formatKeybind(homeKeybind) ?? "").split("+")} />
            </span>
          )}
        </button>
        <button type="button" onClick={onSearch} className={actionClass}>
          <Search className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t("searchSessions")}</span>
          {searchKeybind && (
            <span className="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
              <Keybind keys={(formatKeybind(searchKeybind) ?? "").split("+")} />
            </span>
          )}
        </button>
        <div className="relative">
          <button
            type="button"
            aria-expanded={closedOpen}
            aria-haspopup="menu"
            onClick={onNew}
            onContextMenu={(event) => {
              if (closedTabs.length === 0 || !onReopenClosed) return;
              event.preventDefault();
              setClosedOpen(true);
            }}
            className={actionClass}
          >
            <Pencil className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t("newSession")}</span>
            {newKeybind && (
              <span className="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
                <Keybind keys={(formatKeybind(newKeybind) ?? "").split("+")} />
              </span>
            )}
          </button>
          {closedOpen && closedTabs.length > 0 && onReopenClosed && (
            <div
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute inset-x-0 top-full z-50 mt-1 flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
            >
              {[...closedTabs].reverse().map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setClosedOpen(false);
                    onReopenClosed(tab.key);
                  }}
                  className="interactive flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-left text-body text-text-base"
                >
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  {tab.subtitle && <span className="shrink-0 truncate text-caption text-text-faint">{tab.subtitle}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="h-4 shrink-0" aria-hidden="true" />

      {inbox ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{inbox}</div>
      ) : children ? (
        // Projects and the tab strip share one scroll column, as in the
        // reference organized sidebar; the strip follows the project rows
        // instead of being pinned to the rail's bottom edge.
        <div
          className="relative flex min-h-0 min-w-0 flex-1"
          onPointerEnter={() => setThumbHover(true)}
          onPointerLeave={() => setThumbHover(false)}
        >
          <div
            ref={listRef}
            onScroll={onListScroll}
            onKeyDown={tabKeyboard}
            className="side-tabs-list flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto no-scrollbar"
          >
            <div className="flex shrink-0 flex-col">{children}</div>
            {displayTabs.length > 0 && (
              <div className="flex shrink-0 flex-col gap-3">
                <div
                  role="separator"
                  aria-hidden="true"
                  className="side-tabs-divider mx-2 h-px shrink-0 bg-border-muted"
                />
                <div
                  role="tablist"
                  aria-label={tr("openTabs")}
                  aria-orientation="vertical"
                  className="flex flex-col gap-[3px]"
                >
                  {tabRows}
                </div>
              </div>
            )}
          </div>
          {renderThumb()}
        </div>
      ) : displayTabs.length > 0 ? (
        <div
          className="relative flex min-h-0 min-w-0 flex-1"
          onPointerEnter={() => setThumbHover(true)}
          onPointerLeave={() => setThumbHover(false)}
        >
          <div
            ref={listRef}
            role="tablist"
            aria-label={tr("openTabs")}
            aria-orientation="vertical"
            onScroll={onListScroll}
            onKeyDown={tabKeyboard}
            className="side-tabs-list flex min-h-0 min-w-0 flex-1 flex-col gap-[3px] overflow-x-hidden overflow-y-auto no-scrollbar"
          >
            {tabRows}
          </div>
          {renderThumb()}
        </div>
      ) : null}

      {preview && (
        <div
          role="tooltip"
          style={{ left: preview.left, top: preview.top }}
          className="pointer-events-none fixed z-50 flex w-64 max-w-[calc(100dvw-24px)] flex-col gap-1 rounded-md bg-bg-base p-3 elevation-floating"
        >
          <span className="min-w-0 text-body leading-normal font-[440] tracking-[-0.04px] text-text-muted">
            {preview.tab.subtitle ?? "Session"}
          </span>
          <span className="min-w-0 text-body leading-normal font-[530] tracking-[-0.04px] text-text-base [overflow-wrap:anywhere]">
            {preview.tab.label}
          </span>
          {preview.tab.directory && (
            <span className="min-w-0 text-body leading-normal font-[440] tracking-[-0.04px] text-text-muted [overflow-wrap:anywhere]">
              {preview.tab.directory}
            </span>
          )}
        </div>
      )}

      {menu && (
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed z-50 flex w-40 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!onRename}
            onClick={() => {
              beginRename(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!menu.tab.sessionID}
            onClick={() => {
              const id = menu.tab.sessionID;
              setMenu(undefined);
              if (!id) return;
              void navigator.clipboard
                .writeText(id)
                .then(() => notify(t("copiedToClipboard"), "info"))
                .catch(() => notify(t("copyFailed")));
            }}
            className="interactive flex h-7 items-center gap-2 rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="size-3.5 shrink-0" />
            {t("copySessionID")}
          </button>
          <div className="my-0.5 h-px bg-border-weak" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base"
          >
            {tr("shortcutCloseTab")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!onCloseOthers}
            onClick={() => {
              onCloseOthers?.(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr("dialogCloseOthers")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!onCloseAfter}
            onClick={() => {
              onCloseAfter?.(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr("dialogCloseTabsBelow")}
          </button>
          <div className="my-0.5 h-px bg-border-weak" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!onDeleteTab}
            onClick={() => {
              onDeleteTab?.(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-state-fg-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete session…
          </button>
        </div>
      )}
    </aside>
  );
}

export const SideTabs = memo(SideTabsView, layoutPropsEqual);
