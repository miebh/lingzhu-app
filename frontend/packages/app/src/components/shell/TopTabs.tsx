import { memo, useEffect, useRef, useState } from "react";
import { layoutPropsEqual } from "@/lib/layoutMemo";
import { MessageSquare, Pencil, Plus, Settings2, X } from "@lingzhu/ui/icons";
import { Keybind } from "@lingzhu/ui/keybind";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { t, useT } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import { formatKeybind } from "../../lib/slash";
import { reorderPanelTabs } from "../../lib/panelTabs";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
import type { ClosedSideTab, SideTab } from "../../lib/sessionTabs";
import { useDismissOnOutside, useTabRename, TabRenameInput, TabStatusMark } from "../../lib/tabStrip";

interface Props {
  tabs: SideTab[];
  activeKey?: string;
  onSelect: (tab: SideTab) => void;
  onClose: (tab: SideTab) => void;
  onCloseOthers?: (tab: SideTab) => void;
  onCloseAfter?: (tab: SideTab) => void;
  onDeleteTab?: (tab: SideTab) => void;
  onRename?: (tab: SideTab, title: string) => void;
  onReorder?: (keys: string[]) => void;
  onNew: () => void;
  newKeybind?: string;
  /** Recently closed tabs, listed from the plus button's context menu. */
  closedTabs?: ClosedSideTab[];
  onReopenClosed?: (key?: string) => void;
}

const icons: Record<SideTab["kind"], typeof MessageSquare> = {
  chat: MessageSquare,
  settings: Settings2,
};

/**
 * Horizontal tab strip for the top-tabs layout. Sessions and pages share one
 * row; the active row uses the same translucent overlay as the side rail.
 */
function TopTabsView({ tabs: allTabs, activeKey, onSelect, onClose, onCloseOthers, onCloseAfter, onDeleteTab, onRename, onReorder, onNew, newKeybind, closedTabs = [], onReopenClosed }: Props) {
  const tr = useT();
  // The vertical rail keeps Settings in its footer; the horizontal strip leaves
  // the page to the sidebar menu instead of a tab that can never close.
  const tabs = allTabs.filter((tab) => tab.kind !== "settings");
  const [menu, setMenu] = useState<{ tab: SideTab; x: number; y: number }>();
  const [dragKey, setDragKey] = useState<string>();
  const [closedOpen, setClosedOpen] = useState(false);
  const [stripOverflow, setStripOverflow] = useState({ start: false, end: false });
  const { editing, begin: beginRename, cancel: cancelRename, change: changeRename, commit: commitRename } = useTabRename(onRename);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const strip = useRef<HTMLDivElement>(null);

  // The reference only feathers an edge when tabs are hidden behind it.
  // Resizes call this per frame, so an unchanged result keeps the old state
  // instead of re-rendering the strip.
  const measureStrip = () => {
    const element = strip.current;
    if (!element) return;
    const start = element.scrollLeft > 0;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setStripOverflow((current) => (current.start === start && current.end === end ? current : { start, end }));
  };

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    measureStrip();
    const observer = new ResizeObserver(measureStrip);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target || !onReorder) return;
    const keys = tabs.map((tab) => tab.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(target);
    if (from < 0 || to < 0) return;
    onReorder(reorderPanelTabs(keys, from, to));
  };

  useDismissOnOutside(Boolean(menu), () => setMenu(undefined));
  useDismissOnOutside(closedOpen, () => setClosedOpen(false));

  const move = (current: string, direction: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.key === current);
    if (index === -1) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    onSelect(next);
    buttons.current[next.key]?.focus();
  };

  return (
    <div className="window-control relative flex h-full min-w-0 flex-1 items-center gap-1.5">
      <div className="relative flex min-w-0 flex-1 items-center">
      <div
        ref={strip}
        role="tablist"
        aria-label={tr("openTabs")}
        aria-orientation="horizontal"
        onScroll={measureStrip}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          const current = tabs.find((tab) => tab.key === activeKey);
          if (!current) return;
          event.preventDefault();
          move(current.key, event.key === "ArrowRight" ? 1 : -1);
        }}
        className="top-tabs-scroll flex min-w-0 items-center gap-1.5 overflow-x-auto"
      >
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        const Icon = icons[tab.kind];
        const rename = editing?.key === tab.key;
        return (          <div
            key={tab.key}
            data-active={selected ? "true" : undefined}
            data-status={tab.status ?? undefined}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ tab, x: event.clientX, y: event.clientY });
            }}
            onAuxClick={(event) => {
              if (event.button !== 1 || !tab.closable) return;
              event.preventDefault();
              onClose(tab);
            }}
            draggable={!!onReorder && tab.closable && !rename}
            data-dragging={dragKey === tab.key ? "true" : undefined}
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
            className={`side-tab interactive group/tab relative flex h-7 w-56 min-w-7 max-w-56 shrink items-center rounded-md px-1.5 [container-type:inline-size] ${
              selected ? "text-text-base" : "text-text-faint hover:text-text-base"
            }`}
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
              onDoubleClick={() => onRename && tab.closable && beginRename(tab)}
              className="top-tab-link flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              {tab.kind === "settings" ? (
                <Icon className="size-4 shrink-0" />
              ) : tab.draft ? (
                <span className="grid size-4 shrink-0 place-items-center rounded-[3px] border border-border-base text-text-faint">
                  <Pencil className="size-2.5" />
                </span>
              ) : (
                <ProjectAvatar name={tab.subtitle ?? tab.label} />
              )}
              {editing?.key === tab.key ? (
                <TabRenameInput
                  tab={tab}
                  value={editing.value}
                  className="w-full min-w-0 flex-1 bg-transparent text-body font-medium text-text-base outline-none"
                  onChange={(value) => changeRename(tab, value)}
                  onCommit={() => commitRename(tab)}
                  onCancel={cancelRename}
                />
              ) : (
                <span className="top-tab-title min-w-0 overflow-hidden whitespace-nowrap text-body font-medium">{tab.label}</span>
              )}
            </button>
            {tab.status && (
              <span className="pointer-events-none absolute end-0 top-1/2 grid size-5 -translate-y-1/2 place-items-center opacity-100 transition-opacity group-hover/tab:opacity-0 group-focus-within/tab:opacity-0">
                <TabStatusMark status={tab.status} />
              </span>
            )}
            {tab.closable && (
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={() => onClose(tab)}
                className="top-tab-close absolute end-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-xs text-text-faint opacity-0 hover:text-text-base group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        );
      })}
      </div>

      {stripOverflow.start && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-[linear-gradient(to_right,var(--bg-deep),transparent)]"
        />
      )}
      {stripOverflow.end && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-[linear-gradient(to_left,var(--bg-deep),transparent)]"
        />
      )}
      </div>

      <div className="relative flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onNew}
              onContextMenu={(event) => {
                if (closedTabs.length === 0 || !onReopenClosed) return;
                event.preventDefault();
                setClosedOpen(true);
              }}
              aria-expanded={closedOpen}
              aria-haspopup="menu"
              aria-label={tr("paletteNewSession")}
              className="interactive grid size-7 place-items-center rounded-md text-text-faint hover:text-text-base"
            >
              <Plus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="flex items-center gap-1.5">
              {tr("newSession")}
              {newKeybind && <Keybind keys={(formatKeybind(newKeybind) ?? "").split("+")} />}
            </span>
          </TooltipContent>
        </Tooltip>
        {closedOpen && closedTabs.length > 0 && onReopenClosed && (
          <div
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
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

      {menu && (
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          className="fixed z-50 flex w-44 flex-col gap-0.5 rounded-lg border border-border-base bg-bg-base p-1 elevation-raised"
        >
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
            className="interactive flex h-7 items-center rounded-xs px-1.5 text-left text-body text-text-muted hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("copySessionID")}
          </button>
          <div className="my-1 h-px bg-border-base" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-1.5 text-left text-body text-text-muted hover:text-text-base"
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
            className="interactive flex h-7 items-center rounded-xs px-1.5 text-left text-body text-text-muted hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
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
            className="interactive flex h-7 items-center rounded-xs px-1.5 text-left text-body text-text-muted hover:text-text-base disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tr("dialogCloseTabsAfter")}
          </button>
          <div className="my-1 h-px bg-border-base" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!onDeleteTab}
            onClick={() => {
              onDeleteTab?.(menu.tab);
              setMenu(undefined);
            }}
            className="interactive flex h-7 items-center rounded-xs px-1.5 text-left text-body text-state-fg-danger hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete session…          </button>
        </div>
      )}
    </div>
  );
}

export const TopTabs = memo(TopTabsView, layoutPropsEqual);
