import { useEffect, useState } from "react";
import { ChevronDown, History, Menu, MoreHorizontal, Plus, Search, Settings2, X } from "@lingzhu/ui/icons";
import type { SideTab } from "../lib/sessionTabs";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "./ProjectAvatar";
import { t, useT } from "@lingzhu/ui/i18n";

interface Props {
  tabs: SideTab[];
  activeKey?: string;
  workspaces?: WorkspaceInfo[];
  activePath?: string;
  onSelectWorkspace?: (path: string) => void;
  onNewForWorkspace?: (path: string) => void;
  onRenameTab?: (tab: SideTab) => void;
  onForkTab?: (tab: SideTab) => void;
  onDeleteTab?: (tab: SideTab) => void;
  closedCount?: number;
  onReopenClosed?: () => void;
  onSelect: (tab: SideTab) => void;
  onNew: () => void;
  onSearch: () => void;
  onOpenSettings: () => void;
  onCloseTab?: (tab: SideTab) => void;
  onClose: () => void;
}

/** Narrow-screen session drawer: a rail overlay with tab switching and primary actions. */
export function MobileDrawer({ tabs, activeKey, workspaces = [], activePath, onSelectWorkspace, onNewForWorkspace, onRenameTab, onForkTab, onDeleteTab, closedCount = 0, onReopenClosed, onSelect, onNew, onSearch, onOpenSettings, onCloseTab, onClose }: Props) {
  const tr = useT();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [actionsKey, setActionsKey] = useState<string>();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-overlay-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("sessions")}
        className="relative z-10 flex max-h-[min(75dvh,calc(100dvh-16px))] flex-col rounded-t-2xl bg-bg-deep px-3 pb-3 shadow-elevation-overlay"
      >
        <div aria-hidden="true" className="flex h-7 shrink-0 items-center justify-center">
          <span className="h-1 w-8 rounded-full bg-border-strong" />
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2">
          <Menu className="size-4 text-text-faint" />
          <span className="min-w-0 flex-1 text-body font-[530] text-text-base">lingzhu</span>
          <button
            type="button"
            aria-label={t("closeSidebar")}
            onClick={onClose}
            className="interactive grid size-7 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5 py-1">
          <button type="button" onClick={onNew} className="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base">
            <Plus className="size-4" />
            {t("newSession")}
          </button>
          <button type="button" onClick={onSearch} className="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base">
            <Search className="size-4" />
            {t("searchSessions")}
          </button>
          {closedCount > 0 && onReopenClosed && (
            <button
              type="button"
              onClick={onReopenClosed}
              className="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
            >
              <History className="size-4" />
              <span className="min-w-0 flex-1 truncate text-left">{t("recentlyClosed")}</span>
              <span className="text-caption tabular-nums">{closedCount}</span>
            </button>
          )}
        </div>
        <div role="tablist" aria-label={tr("openTabs")} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1">
          {tabs.filter((tab) => tab.kind === "chat").map((tab) => (
            <div key={tab.key} className="flex flex-col">
              <div className="flex h-7 min-w-0 items-center rounded-md">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab.key === activeKey}
                  onClick={() => onSelect(tab)}
                  className={`interactive flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left ${
                    tab.key === activeKey ? "text-text-base" : "text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-[3px] bg-bg-layer-03 text-[10px] font-[530]">
                    {(Array.from((tab.subtitle ?? tab.label).trim())[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body font-[530]">{tab.label}</span>
                  {tab.subtitle && (
                    <span className="min-w-0 shrink-0 truncate text-caption text-text-faint">{tab.subtitle}</span>
                  )}
                </button>
                {onCloseTab && tab.closable && (
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={() => onCloseTab(tab)}
                    className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                {(onRenameTab || onForkTab || onDeleteTab) && (
                  <button
                    type="button"
                    aria-label={`More actions for ${tab.label}`}
                    aria-expanded={actionsKey === tab.key}
                    onClick={() => setActionsKey((current) => (current === tab.key ? undefined : tab.key))}
                    className="interactive mr-1 grid size-6 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                )}
              </div>
              {actionsKey === tab.key && (
                <div className="flex flex-wrap gap-1 pb-1 pl-8">
                  {onRenameTab && (
                    <button type="button" onClick={() => onRenameTab(tab)} className="interactive h-6 rounded-md px-2 text-caption text-text-muted hover:text-text-base">
                      {t("rename")}
                    </button>
                  )}
                  {onForkTab && (
                    <button type="button" onClick={() => onForkTab(tab)} className="interactive h-6 rounded-md px-2 text-caption text-text-muted hover:text-text-base">
                      {t("fork")}
                    </button>
                  )}
                  {onDeleteTab && (
                    <button type="button" onClick={() => onDeleteTab(tab)} className="interactive h-6 rounded-md px-2 text-caption text-state-fg-danger">
                      {t("deleteSession")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {workspaces.length > 0 && (
          <div className="flex shrink-0 flex-col gap-1 border-t border-border-base p-2">
            <button
              type="button"
              aria-expanded={projectsOpen}
              onClick={() => setProjectsOpen((value) => !value)}
              className="interactive flex h-6 items-center gap-1.5 rounded-md px-2 text-caption text-text-faint hover:text-text-base"
            >
              <ChevronDown className={`size-3.5 transition-transform ${projectsOpen ? "" : "-rotate-90"}`} />
              {t("projects")}
            </button>
            {projectsOpen &&
              workspaces.map((workspace) => (
                <div key={workspace.path} className="flex h-8 min-w-0 items-center rounded-md">
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace?.(workspace.path)}
                    className={`interactive flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-body ${
                      workspace.path === activePath ? "text-text-base" : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <ProjectAvatar name={workspace.name} icon={workspace.icon} color={workspace.color} />
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  </button>
                  {onNewForWorkspace && (
                    <button
                      type="button"
                      aria-label={`New session in ${workspace.name}`}
                      onClick={() => onNewForWorkspace(workspace.path)}
                      className="interactive grid size-6 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
        >
          <Settings2 className="size-4" />
          {t("settings")}
        </button>
      </div>
    </div>
  );
}
