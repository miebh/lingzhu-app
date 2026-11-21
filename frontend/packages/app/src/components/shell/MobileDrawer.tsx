import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { ChevronDown, History, Menu, MoreHorizontal, Plus, Search, Settings2, X } from "@lingzhu/ui/icons";
import type { SideTab } from "../../lib/sessionTabs";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";
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
export function MobileDrawer(props: Props) {
  const tr = useT();
  const [projectsOpen, setProjectsOpen] = createSignal(true);
  const [actionsKey, setActionsKey] = createSignal<string>();
  const workspaces = () => props.workspaces ?? [];
  const closedCount = () => props.closedCount ?? 0;

  createEffect(() => {
    const close = props.onClose;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div class="fixed inset-0 z-50 flex flex-col justify-end">
      <div aria-hidden="true" onClick={() => props.onClose()} class="absolute inset-0 bg-overlay-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("sessions")}
        class="relative z-10 flex max-h-[min(75dvh,calc(100dvh-16px))] flex-col rounded-t-2xl bg-bg-deep px-3 pb-3 shadow-elevation-overlay"
      >
        <div aria-hidden="true" class="flex h-7 shrink-0 items-center justify-center">
          <span class="h-1 w-8 rounded-full bg-border-strong" />
        </div>
        <div class="flex h-9 shrink-0 items-center gap-2">
          <Menu class="size-4 text-text-faint" />
          <span class="min-w-0 flex-1 text-body font-[530] text-text-base">lingzhu</span>
          <button
            type="button"
            aria-label={t("closeSidebar")}
            onClick={() => props.onClose()}
            class="interactive grid size-7 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <X class="size-4" />
          </button>
        </div>
        <div class="flex shrink-0 flex-col gap-0.5 py-1">
          <button
            type="button"
            onClick={() => props.onNew()}
            class="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
          >
            <Plus class="size-4" />
            {t("newSession")}
          </button>
          <button
            type="button"
            onClick={() => props.onSearch()}
            class="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
          >
            <Search class="size-4" />
            {t("searchSessions")}
          </button>
          <Show when={closedCount() > 0 && props.onReopenClosed}>
            <button
              type="button"
              onClick={() => props.onReopenClosed?.()}
              class="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
            >
              <History class="size-4" />
              <span class="min-w-0 flex-1 truncate text-left">{t("recentlyClosed")}</span>
              <span class="text-caption tabular-nums">{closedCount()}</span>
            </button>
          </Show>
        </div>
        <div
          role="tablist"
          aria-label={tr("openTabs")}
          class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-1"
        >
          <For each={props.tabs.filter((tab) => tab.kind === "chat")}>
            {(tab) => (
              <div class="flex flex-col">
                <div class="flex h-7 min-w-0 items-center rounded-md">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab.key === props.activeKey}
                    onClick={() => props.onSelect(tab)}
                    class={`interactive flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left ${
                      tab.key === props.activeKey ? "text-text-base" : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <span class="grid size-4 shrink-0 place-items-center rounded-[3px] bg-bg-layer-03 text-[10px] font-[530]">
                      {(Array.from((tab.subtitle ?? tab.label).trim())[0] ?? "?").toUpperCase()}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-body font-[530]">{tab.label}</span>
                    <Show when={tab.subtitle}>
                      {(subtitle) => (
                        <span class="min-w-0 shrink-0 truncate text-caption text-text-faint">{subtitle()}</span>
                      )}
                    </Show>
                  </button>
                  <Show when={props.onCloseTab && tab.closable}>
                    <button
                      type="button"
                      aria-label={`Close ${tab.label}`}
                      onClick={() => props.onCloseTab?.(tab)}
                      class="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      <X class="size-3.5" />
                    </button>
                  </Show>
                  <Show when={props.onRenameTab || props.onForkTab || props.onDeleteTab}>
                    <button
                      type="button"
                      aria-label={`More actions for ${tab.label}`}
                      aria-expanded={actionsKey() === tab.key}
                      onClick={() =>
                        update(setActionsKey, actionsKey, (current) => (current === tab.key ? undefined : tab.key))
                      }
                      class="interactive mr-1 grid size-6 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                    >
                      <MoreHorizontal class="size-3.5" />
                    </button>
                  </Show>
                </div>
                <Show when={actionsKey() === tab.key}>
                  <div class="flex flex-wrap gap-1 pb-1 pl-8">
                    <Show when={props.onRenameTab}>
                      <button
                        type="button"
                        onClick={() => props.onRenameTab?.(tab)}
                        class="interactive h-6 rounded-md px-2 text-caption text-text-muted hover:text-text-base"
                      >
                        {t("rename")}
                      </button>
                    </Show>
                    <Show when={props.onForkTab}>
                      <button
                        type="button"
                        onClick={() => props.onForkTab?.(tab)}
                        class="interactive h-6 rounded-md px-2 text-caption text-text-muted hover:text-text-base"
                      >
                        {t("fork")}
                      </button>
                    </Show>
                    <Show when={props.onDeleteTab}>
                      <button
                        type="button"
                        onClick={() => props.onDeleteTab?.(tab)}
                        class="interactive h-6 rounded-md px-2 text-caption text-state-fg-danger"
                      >
                        {t("deleteSession")}
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={workspaces().length > 0}>
          <div class="flex shrink-0 flex-col gap-1 border-t border-border-base p-2">
            <button
              type="button"
              aria-expanded={projectsOpen()}
              onClick={() => update(setProjectsOpen, projectsOpen, (value) => !value)}
              class="interactive flex h-6 items-center gap-1.5 rounded-md px-2 text-caption text-text-faint hover:text-text-base"
            >
              <ChevronDown class={`size-3.5 transition-transform ${projectsOpen() ? "" : "-rotate-90"}`} />
              {t("projects")}
            </button>
            <Show when={projectsOpen()}>
              <For each={workspaces()}>
                {(workspace) => (
                  <div class="flex h-8 min-w-0 items-center rounded-md">
                    <button
                      type="button"
                      onClick={() => props.onSelectWorkspace?.(workspace.path)}
                      class={`interactive flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-body ${
                        workspace.path === props.activePath ? "text-text-base" : "text-text-muted hover:text-text-base"
                      }`}
                    >
                      <ProjectAvatar name={workspace.name} icon={workspace.icon} color={workspace.color} />
                      <span class="min-w-0 flex-1 truncate">{workspace.name}</span>
                    </button>
                    <Show when={props.onNewForWorkspace}>
                      <button
                        type="button"
                        aria-label={`New session in ${workspace.name}`}
                        onClick={() => props.onNewForWorkspace?.(workspace.path)}
                        class="interactive grid size-6 shrink-0 place-items-center rounded-xs text-text-faint hover:text-text-base"
                      >
                        <Plus class="size-3.5" />
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
        <button
          type="button"
          onClick={() => props.onOpenSettings()}
          class="interactive flex h-7 items-center gap-2 rounded-md px-2 text-body text-text-faint hover:text-text-base"
        >
          <Settings2 class="size-4" />
          {t("settings")}
        </button>
      </div>
    </div>
  );
}
