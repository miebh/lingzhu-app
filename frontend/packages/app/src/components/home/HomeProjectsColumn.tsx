import { For, Show } from "solid-js";
import { FolderPlus, Settings2 } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { HomeProjectRow } from "./HomeProjectRow";

interface Props {
  workspaces: WorkspaceInfo[];
  /** Project row selected while the list is filtered; the active project otherwise. */
  selectedPath?: string;
  onSelectWorkspace: (path: string) => void;
  onOpenWorkspace?: (path: string) => void;
  onEditWorkspace?: (path: string) => void;
  onRemoveWorkspace?: (path: string) => void;
  onNewSession: (path: string) => void;
  onAddWorkspace?: () => void;
  onOpenSettings?: () => void;
}

/** The home projects column: add action, project rows and the settings entry. */
export function HomeProjectsColumn(props: Props) {
  return (
    <section aria-label={t("projects")} class="flex min-w-0 flex-col lg:sticky lg:top-14 lg:self-start lg:pt-[52px]">
      <div class="flex h-7 min-w-0 shrink-0 items-center justify-between ps-1.5 pe-3">
        <span class="min-w-0 truncate text-body leading-4 font-[530] text-text-muted">{t("projects")}</span>
        <Show when={props.onAddWorkspace}>
          <button
            type="button"
            aria-label={t("addProject")}
            title={t("addProject")}
            onClick={() => props.onAddWorkspace?.()}
            class="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-faint hover:text-text-base"
          >
            <FolderPlus class="size-4" />
          </button>
        </Show>
      </div>
      <div class="mt-2.5 flex min-h-0 flex-col gap-0.5 pb-2 lg:pr-3">
        <For each={props.workspaces}>
          {(workspace) => (
            <HomeProjectRow
              workspace={workspace}
              selected={workspace.path === props.selectedPath}
              onSelect={() => props.onSelectWorkspace(workspace.path)}
              onNewSession={() => props.onNewSession(workspace.path)}
              onOpen={() => (props.onOpenWorkspace ?? props.onSelectWorkspace)(workspace.path)}
              onEdit={props.onEditWorkspace && (() => props.onEditWorkspace?.(workspace.path))}
              onRemove={props.onRemoveWorkspace && (() => props.onRemoveWorkspace?.(workspace.path))}
            />
          )}
        </For>
        <Show when={props.workspaces.length === 0}>
          <button
            type="button"
            data-action="home-add-project-row"
            onClick={() => props.onAddWorkspace?.()}
            disabled={!props.onAddWorkspace}
            class="flex h-7 w-full items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-muted hover:bg-bg-layer-01 hover:text-text-base focus-visible:bg-bg-layer-01 focus-visible:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FolderPlus class="size-4 shrink-0 text-text-muted" />
            <span class="min-w-0 truncate">{t("addProject")}</span>
          </button>
        </Show>
      </div>

      <Show when={props.onOpenSettings}>
        <div class="mb-8 mt-4 hidden shrink-0 flex-col gap-1 lg:flex">
          <button
            type="button"
            onClick={() => props.onOpenSettings?.()}
            class="interactive flex h-7 w-full items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-faint hover:text-text-base focus-visible:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)]"
          >
            <Settings2 class="size-4 shrink-0 text-text-faint" />
            <span class="min-w-0 flex-1 truncate text-left">{t("settings")}</span>
          </button>
        </div>
      </Show>
    </section>
  );
}
