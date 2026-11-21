import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Accessor,
  type JSX,
} from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { update } from "@lingzhu/ui/solid";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { Copy, Grid2x2Plus, Pencil, Search, X } from "@lingzhu/ui/icons";
import { formatKeybind } from "../../lib/slash";
import { t, useT } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import { reorderPanelTabs } from "../../lib/panelTabs";
import type { ClosedSideTab, SideTab } from "../../lib/sessionTabs";
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
  /** Top inset under the window chrome: 1px on Windows, 8px on macOS. */
  topInset?: number;
  children?: JSX.Element;
}

const MIN_WIDTH = 136;
const MAX_WIDTH = 640;

/** One row being renamed inline in the tab strip. */
interface TabEditing {
  key: string;
  value: string;
}

function clampWidth(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

/** Closes a popup when the pointer lands elsewhere or the window loses focus or resizes. */
function dismissOnOutside(isOpen: Accessor<boolean>, close: () => void) {
  createEffect(() => {
    if (!isOpen()) return;
    const dismiss = () => close();
    const clear = [
      makeEventListener(window, "pointerdown", dismiss),
      makeEventListener(window, "blur", dismiss),
      makeEventListener(window, "resize", dismiss),
    ];
    onCleanup(() => {
      for (const remove of clear) remove();
    });
  });
}

/**
 * The status mark a tab shows while a session runs or failed: an activity ring
 * while it works, then a warning or danger dot.
 */
function TabStatusMark(props: { status: NonNullable<SideTab["status"]> }) {
  return (
    <Show
      when={props.status === "ongoing"}
      fallback={
        <span
          aria-hidden="true"
          class={`size-[7px] shrink-0 rounded-full ${
            props.status === "warning" ? "bg-state-fg-warning" : "bg-state-fg-danger"
          }`}
        />
      }
    >
      <ActivityRing class="text-icon-base" />
    </Show>
  );
}

/**
 * Vertical side tabs for the main area, laid out like the reference rail:
 * 28px single-line rows with a 16px project avatar, Home/Search/Recently
 * closed action rows above them, a translucent pressed overlay on the active
 * row, and a close button revealed on hover or keyboard focus.
 */
export function SideTabs(props: Props) {
  const buttons: Record<string, HTMLButtonElement | null> = {};
  const titleRefs: Record<string, HTMLSpanElement | null> = {};
  let listElement: HTMLDivElement | undefined;
  let thumbElement: HTMLDivElement | undefined;
  let thumbIdle: number | undefined;
  let thumbDrag: { pointerId: number; grabOffset: number } | null = null;
  const [titleOverflow, setTitleOverflow] = createSignal<Record<string, boolean>>({});
  const tr = useT();
  const [thumb, setThumb] = createSignal({ size: 0, start: 0, overflow: false });
  const [thumbHover, setThumbHover] = createSignal(false);
  const [thumbScrolling, setThumbScrolling] = createSignal(false);
  const [thumbDragging, setThumbDragging] = createSignal(false);
  const thumbVisible = createMemo(() => thumb().overflow && (thumbHover() || thumbScrolling() || thumbDragging()));
  const [menu, setMenu] = createSignal<{ tab: SideTab; x: number; y: number }>();
  const [dragKey, setDragKey] = createSignal<string>();
  const [closedOpen, setClosedOpen] = createSignal(false);
  const [preview, setPreview] = createSignal<{ tab: SideTab; left: number; top: number }>();
  let previewTimer: number | undefined;
  const [editing, setEditing] = createSignal<TabEditing>();
  let committing = false;
  const [innerWidth, setInnerWidth] = createSignal<number>((() => {
    const saved = Number(localStorage.getItem("lingzhu.sideTabsWidth"));
    return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : 240;
  })());
  const width = createMemo(() => clampWidth(props.width ?? innerWidth()));
  const highlightActive = createMemo(() => props.highlightActive ?? true);
  const topInset = createMemo(() => props.topInset ?? 8);
  const closedTabs = createMemo(() => props.closedTabs ?? []);
  const applyWidth = (next: number) => {
    const clamped = clampWidth(next);
    if (props.onWidthChange) props.onWidthChange(clamped);
    else setInnerWidth(clamped);
  };

  const beginRename = (tab: SideTab) => setEditing({ key: tab.key, value: tab.label });
  const cancelRename = () => setEditing(undefined);
  const changeRename = (value: string) => {
    update(setEditing, editing, (current) => (current ? { key: current.key, value } : current));
  };
  const commitRename = (tab: SideTab) => {
    if (committing) return;
    committing = true;
    const value = editing()?.value.trim();
    setEditing(undefined);
    if (value && value !== tab.label) props.onRename?.(tab, value);
    window.setTimeout(() => {
      committing = false;
    }, 0);
  };

  // The rail feathers each edge by as much as there is left to scroll past it.
  const measureFade = () => {
    const element = listElement;
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
    const element = listElement;
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
    update(setThumb, thumb, (previous) =>
      previous.size === size && previous.overflow === overflow && Math.abs(previous.start - start) < 0.5
        ? previous
        : { size, start, overflow },
    );
  };

  // Every tab keeps the order the user arranged.
  const displayTabs = createMemo(() => props.tabs.filter((tab) => tab.kind !== "settings"));
  const titleSignature = createMemo(() => displayTabs().map((tab) => `${tab.key}\u0000${tab.label}`).join("\u0001"));
  const hasChildren = createMemo(() => Boolean(props.children));

  createEffect(() => {
    width();
    displayTabs();
    measureThumb();
    measureFade();
  });

  createEffect(() => {
    hasChildren();
    const element = listElement;
    if (!element) return;
    const { observe, unobserve } = makeResizeObserver<Element>(() => {
      measureThumb();
      measureFade();
    });
    const targets = [element, ...Array.from(element.children)];
    for (const target of targets) observe(target);
    onCleanup(() => {
      for (const target of targets) unobserve(target);
    });
  });

  onMount(() => {
    onCleanup(() => window.clearTimeout(thumbIdle));
  });

  const onListScroll = () => {
    measureFade();
    measureThumb();
    setThumbScrolling(true);
    window.clearTimeout(thumbIdle);
    thumbIdle = window.setTimeout(() => setThumbScrolling(false), 800);
  };

  const onThumbPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const element = listElement;
    const handle = thumbElement;
    if (!element || !handle) return;
    const rect = handle.getBoundingClientRect();
    thumbDrag = { pointerId: event.pointerId, grabOffset: event.clientY - rect.top };
    setThumbDragging(true);
    handle.setPointerCapture(event.pointerId);
  };

  const onThumbPointerMove = (event: PointerEvent) => {
    const drag = thumbDrag;
    const element = listElement;
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

  const endThumbDrag = (event: PointerEvent) => {
    const drag = thumbDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    thumbDrag = null;
    setThumbDragging(false);
    if (thumbElement?.hasPointerCapture(event.pointerId)) {
      thumbElement.releasePointerCapture(event.pointerId);
    }
  };

  const reorder = (target: string) => {
    const key = dragKey();
    if (!key || key === target || !props.onReorder) return;
    const keys = displayTabs().map((tab) => tab.key);
    const from = keys.indexOf(key);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    props.onReorder(reorderPanelTabs(keys, from, to));
  };

  // The title fades under the trailing controls only when it actually
  // overflows, and only while a row is hovered, focused, active or showing a
  // status mark, as in the reference rail. Idle titles that fit stay solid.
  createEffect(() => {
    titleSignature();
    editing()?.key;
    width();
    const measure = () => {
      const next: Record<string, boolean> = {};
      for (const [key, element] of Object.entries(titleRefs)) {
        if (element) next[key] = element.scrollWidth > element.clientWidth + 0.5;
      }
      update(setTitleOverflow, titleOverflow, (previous) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(previous).length && keys.every((key) => previous[key] === next[key])) {
          return previous;
        }
        return next;
      });
    };

    measure();
    const { observe, unobserve } = makeResizeObserver<Element>(() => measure());
    const targets = [listElement, ...Object.values(titleRefs)].filter((element): element is HTMLElement =>
      Boolean(element),
    );
    for (const target of targets) observe(target);
    makeEventListener(window, "resize", measure);
    onCleanup(() => {
      for (const target of targets) unobserve(target);
    });
  });

  dismissOnOutside(() => Boolean(menu()), () => setMenu(undefined));
  dismissOnOutside(closedOpen, () => setClosedOpen(false));

  onMount(() => {
    const clear = () => {
      window.clearTimeout(previewTimer);
      setPreview(undefined);
    };
    makeEventListener(window, "scroll", clear, true);
    onCleanup(() => window.clearTimeout(previewTimer));
  });

  // The context menu opens over the row, so the pointer never leaves it to
  // dismiss the preview; drop the card as soon as the menu takes over.
  createEffect(() => {
    if (!menu()) return;
    window.clearTimeout(previewTimer);
    setPreview(undefined);
  });

  // A tab can be deleted or closed while the pointer still sits on its row,
  // which unmounts the row without a mouseleave. A preview must not outlive
  // the tab it describes.
  createEffect(() => {
    const current = preview();
    if (!current) return;
    if (displayTabs().some((tab) => tab.key === current.tab.key)) return;
    window.clearTimeout(previewTimer);
    setPreview(undefined);
  });

  let drag: { startX: number; startWidth: number } | null = null;

  onMount(() => {
    const move = (event: PointerEvent) => {
      const current = drag;
      if (!current) return;
      applyWidth(current.startWidth + event.clientX - current.startX);
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      if (!props.onWidthChange) {
        localStorage.setItem("lingzhu.sideTabsWidth", String(innerWidth()));
      }
    };
    makeEventListener(window, "pointermove", move);
    makeEventListener(window, "pointerup", up);
  });

  const moveFocus = (current: string, direction: 1 | -1) => {
    const tabs = displayTabs();
    const index = tabs.findIndex((tab) => tab.key === current);
    if (index === -1) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    props.onSelect(next);
    buttons[next.key]?.focus();
  };

  // Selecting a tab scrolls it into the visible part of the rail.
  createEffect(() => {
    const key = props.activeKey;
    if (!key) return;
    buttons[key]?.scrollIntoView({ block: "nearest" });
  });

  const renderTab = (tab: SideTab) => {
    const selected = () => tab.key === props.activeKey && highlightActive();
    const rename = () => editing()?.key === tab.key;
    return (
      <div
        data-active={selected() ? "true" : undefined}
        data-kind={tab.kind}
        data-dragging={dragKey() === tab.key ? "true" : undefined}
        data-status={tab.status}
        data-editing={rename() ? "true" : undefined}
        data-title-overflow={titleOverflow()[tab.key] ? "true" : undefined}
        onContextMenu={(event) => {
          event.preventDefault();
          if (tab.kind === "chat") setMenu({ tab, x: event.clientX, y: event.clientY });
        }}
        onAuxClick={(event) => {
          if (event.button !== 1 || !tab.closable) return;
          event.preventDefault();
          props.onClose(tab);
        }}
        onMouseDown={(event) => {
          // A middle press would otherwise start Chromium's autoscroll and pan
          // the rail sideways, carrying every row out of the window.
          if (event.button === 1) event.preventDefault();
        }}
        draggable={Boolean(props.onReorder) && tab.closable && !rename()}
        onDragStart={(event) => {
          if (!tab.closable || rename()) return;
          setDragKey(tab.key);
          if (!event.dataTransfer) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tab.key);
        }}
        onDragOver={(event) => {
          if (!dragKey()) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          reorder(tab.key);
          setDragKey(undefined);
        }}
        onDragEnd={() => setDragKey(undefined)}
        onMouseEnter={(event) => {
          if (tab.kind !== "chat" || dragKey() || editing() || menu()) return;
          window.clearTimeout(previewTimer);
          const rect = event.currentTarget.getBoundingClientRect();
          previewTimer = window.setTimeout(() => {
            setPreview({
              tab,
              left: rect.right + 8,
              top: Math.max(8, Math.min(rect.top, window.innerHeight - 148)),
            });
          }, 450);
        }}
        onMouseLeave={() => {
          window.clearTimeout(previewTimer);
          setPreview(undefined);
        }}
        class={`side-tab interactive group/tab relative flex w-full min-w-0 shrink-0 items-center rounded-md ${rename() ? "" : "select-none"}`}
      >
        <button
          ref={(element) => {
            buttons[tab.key] = element;
          }}
          type="button"
          role="tab"
          aria-selected={selected()}
          tabIndex={selected() ? 0 : -1}
          onClick={() => props.onSelect(tab)}
          onDblClick={() => {
            if (props.onRename && tab.closable && tab.kind === "chat") {
              beginRename(tab);
            }
          }}
          class="side-tab-link flex h-full min-w-0 flex-1 items-center rounded-md text-left"
        >
          <span class="side-tab-avatar flex size-4 shrink-0 items-center justify-center">
            <Show
              when={tab.draft}
              fallback={<ProjectAvatar name={tab.subtitle ?? tab.label} />}
            >
              <Pencil
                aria-hidden="true"
                class="size-4 shrink-0 text-icon-muted group-data-[active=true]/tab:text-icon-base"
              />
            </Show>
          </span>
          <span class="side-tab-copy min-w-0 flex-1">
            <Show
              when={rename()}
              fallback={
                <span
                  ref={(element) => {
                    titleRefs[tab.key] = element;
                  }}
                  dir="auto"
                  class="side-tab-title block overflow-hidden whitespace-nowrap text-clip"
                >
                  {tab.label}
                </span>
              }
            >
              <input
                autofocus
                value={editing()?.value ?? ""}
                aria-label={`Rename ${tab.label}`}
                onInput={(event) => changeRename(event.currentTarget.value)}
                onClick={(event) => event.stopPropagation()}
                onDblClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename(tab);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                onBlur={() => commitRename(tab)}
                class="side-tab-title w-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-text-base outline-none"
              />
            </Show>
          </span>
        </button>

        <span class="side-tab-actions">
          <Show
            when={tab.status}
            fallback={
              <Show when={tab.unread && !selected()}>
                <span class="side-tab-status">
                  <span aria-hidden="true" class="size-[7px] shrink-0 rounded-full bg-bg-accent" />
                </span>
              </Show>
            }
          >
            {(status) => (
              <span class="side-tab-status">
                <TabStatusMark status={status()} />
              </span>
            )}
          </Show>
          <Show when={tab.closable && tab.kind === "chat"}>
            <button
              type="button"
              aria-label={`Close ${tab.label}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onClose(tab);
              }}
              class="side-tab-close interactive grid size-5 shrink-0 place-items-center rounded-xs text-icon-muted active:text-icon-base"
            >
              <X class="size-4" />
            </button>
          </Show>
        </span>
      </div>
    );
  };

  const actionClass =
    "side-rail-action group group/action interactive flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-body leading-4 text-text-faint hover:text-text-base";

  const tabKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const current = displayTabs().find((tab) => tab.key === props.activeKey);
    if (!current) return;
    event.preventDefault();
    moveFocus(current.key, event.key === "ArrowDown" ? 1 : -1);
  };

  const renderThumb = () => (
    <Show when={thumb().overflow}>
      <div class="side-tabs-thumb-track" aria-hidden="true">
        <div
          ref={(element) => {
            thumbElement = element;
          }}
          class="side-tabs-thumb"
          data-visible={thumbVisible() ? "true" : undefined}
          data-dragging={thumbDragging() ? "true" : undefined}
          style={{ height: `${thumb().size}px`, transform: `translateY(${thumb().start}px)` }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={endThumbDrag}
          onPointerCancel={endThumbDrag}
          onLostPointerCapture={endThumbDrag}
        />
      </div>
    </Show>
  );

  return (
    <aside
      aria-label={tr("sideTabsLabel")}
      style={{ width: `${width()}px`, "padding-top": `${topInset()}px` }}
      class="relative flex shrink-0 flex-col bg-bg-deep pb-2.5 ps-[11px] pe-[3px]"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={tr("resizeTabs")}
        onPointerDown={(event) => {
          event.preventDefault();
          drag = { startX: event.clientX, startWidth: width() };
        }}
        class="resize-handle-h absolute inset-y-0 -right-2 z-10 w-[calc(3px+8px)] cursor-col-resize"
      />
      <div class="relative flex shrink-0 flex-col gap-[3px]">
        <button
          type="button"
          onClick={() => (props.onHome ?? props.onNew)()}
          aria-pressed={props.onHome ? Boolean(props.homeActive) : undefined}
          data-state={props.homeActive ? "pressed" : undefined}
          class={`${actionClass} ${props.homeActive ? "text-text-base" : ""}`}
        >
          <Grid2x2Plus class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate text-left">{t("home")}</span>
          <Show when={props.homeKeybind}>
            {(keybind) => (
              <span class="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
                <Keybind keys={(formatKeybind(keybind()) ?? "").split("+")} />
              </span>
            )}
          </Show>
        </button>
        <button type="button" onClick={props.onSearch} class={actionClass}>
          <Search class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate text-left">{t("searchSessions")}</span>
          <Show when={props.searchKeybind}>
            {(keybind) => (
              <span class="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
                <Keybind keys={(formatKeybind(keybind()) ?? "").split("+")} />
              </span>
            )}
          </Show>
        </button>
        <div class="relative">
          <button
            type="button"
            aria-expanded={closedOpen()}
            aria-haspopup="menu"
            onClick={props.onNew}
            onContextMenu={(event) => {
              if (closedTabs().length === 0 || !props.onReopenClosed) return;
              event.preventDefault();
              setClosedOpen(true);
            }}
            class={actionClass}
          >
            <Pencil class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-left">{t("newSession")}</span>
            <Show when={props.newKeybind}>
              {(keybind) => (
                <span class="ms-auto hidden shrink-0 group-hover/action:block group-focus-visible/action:block">
                  <Keybind keys={(formatKeybind(keybind()) ?? "").split("+")} />
                </span>
              )}
            </Show>
          </button>
          <Show when={closedOpen() && closedTabs().length > 0 && props.onReopenClosed}>
            <div
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              class="absolute inset-x-0 top-full z-50 mt-1 flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
            >
              <For each={[...closedTabs()].reverse()}>
                {(tab) => (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setClosedOpen(false);
                      props.onReopenClosed?.(tab.key);
                    }}
                    class="interactive flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-left text-body text-text-base"
                  >
                    <span class="min-w-0 flex-1 truncate">{tab.label}</span>
                    <Show when={tab.subtitle}>
                      <span class="shrink-0 truncate text-caption text-text-faint">{tab.subtitle}</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <div class="h-4 shrink-0" aria-hidden="true" />

      <Show
        when={props.children}
        fallback={
          <Show when={displayTabs().length > 0}>
            <div
              class="relative flex min-h-0 min-w-0 flex-1"
              onPointerEnter={() => setThumbHover(true)}
              onPointerLeave={() => setThumbHover(false)}
            >
              <div
                ref={(element) => {
                  listElement = element;
                }}
                role="tablist"
                aria-label={tr("openTabs")}
                aria-orientation="vertical"
                onScroll={onListScroll}
                onKeyDown={tabKeyboard}
                class="side-tabs-list flex min-h-0 min-w-0 flex-1 flex-col gap-[3px] overflow-x-hidden overflow-y-auto no-scrollbar"
              >
                <For each={displayTabs()}>{(tab) => renderTab(tab)}</For>
              </div>
              {renderThumb()}
            </div>
          </Show>
        }
      >
        {(children) => (
          // Projects and the tab strip share one scroll column, as in the
          // reference organized sidebar; the strip follows the project rows
          // instead of being pinned to the rail's bottom edge.
          <div
            class="relative flex min-h-0 min-w-0 flex-1"
            onPointerEnter={() => setThumbHover(true)}
            onPointerLeave={() => setThumbHover(false)}
          >
            <div
              ref={(element) => {
                listElement = element;
              }}
              onScroll={onListScroll}
              onKeyDown={tabKeyboard}
              class="side-tabs-list flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto no-scrollbar"
            >
              <div class="flex shrink-0 flex-col">{children()}</div>
              <Show when={displayTabs().length > 0}>
                <div class="flex shrink-0 flex-col gap-3">
                  <div
                    role="separator"
                    aria-hidden="true"
                    class="side-tabs-divider mx-2 h-px shrink-0 bg-border-muted"
                  />
                  <div
                    role="tablist"
                    aria-label={tr("openTabs")}
                    aria-orientation="vertical"
                    class="flex flex-col gap-[3px]"
                  >
                    <For each={displayTabs()}>{(tab) => renderTab(tab)}</For>
                  </div>
                </div>
              </Show>
            </div>
            {renderThumb()}
          </div>
        )}
      </Show>

      <Show when={preview()}>
        {(current) => (
          <div
            role="tooltip"
            style={{ left: `${current().left}px`, top: `${current().top}px` }}
            class="pointer-events-none fixed z-50 flex w-64 max-w-[calc(100dvw-24px)] flex-col gap-1 rounded-md bg-bg-base p-3 elevation-floating"
          >
            <span class="min-w-0 text-body leading-normal font-[440] tracking-[-0.04px] text-text-muted">
              {current().tab.subtitle ?? "Session"}
            </span>
            <span class="min-w-0 text-body leading-normal font-[530] tracking-[-0.04px] text-text-base [overflow-wrap:anywhere]">
              {current().tab.label}
            </span>
            <Show when={current().tab.directory}>
              {(directory) => (
                <span class="min-w-0 text-body leading-normal font-[440] tracking-[-0.04px] text-text-muted [overflow-wrap:anywhere]">
                  {directory()}
                </span>
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={menu()}>
        {(current) => (
          <div
            role="menu"
            style={{ left: `${current().x}px`, top: `${current().y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
            class="fixed z-50 flex w-40 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!props.onRename}
              onClick={() => {
                beginRename(current().tab);
                setMenu(undefined);
              }}
              class="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!current().tab.sessionID}
              onClick={() => {
                const id = current().tab.sessionID;
                setMenu(undefined);
                if (!id) return;
                void navigator.clipboard
                  .writeText(id)
                  .then(() => notify(t("copiedToClipboard"), "info"))
                  .catch(() => notify(t("copyFailed")));
              }}
              class="interactive flex h-7 items-center gap-2 rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy class="size-3.5 shrink-0" />
              {t("copySessionID")}
            </button>
            <div class="my-0.5 h-px bg-border-weak" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                props.onClose(current().tab);
                setMenu(undefined);
              }}
              class="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base"
            >
              {tr("shortcutCloseTab")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!props.onCloseOthers}
              onClick={() => {
                props.onCloseOthers?.(current().tab);
                setMenu(undefined);
              }}
              class="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tr("dialogCloseOthers")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!props.onCloseAfter}
              onClick={() => {
                props.onCloseAfter?.(current().tab);
                setMenu(undefined);
              }}
              class="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-text-base hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tr("dialogCloseTabsBelow")}
            </button>
            <div class="my-0.5 h-px bg-border-weak" role="separator" />
            <button
              type="button"
              role="menuitem"
              disabled={!props.onDeleteTab}
              onClick={() => {
                props.onDeleteTab?.(current().tab);
                setMenu(undefined);
              }}
              class="interactive flex h-7 items-center rounded-xs px-3 pe-1.5 text-left text-body font-[440] text-state-fg-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete session…
            </button>
          </div>
        )}
      </Show>
    </aside>
  );
}
