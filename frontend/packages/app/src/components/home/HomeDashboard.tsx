import { createMemo, createSignal, Show } from "solid-js";
import type { HomeSessionRow, WorkspaceInfo } from "@lingzhu/ui/types";
import { HomeProjectsColumn } from "./HomeProjectsColumn";
import { HomeSessionMenu } from "./HomeSessionMenu";
import { HomeSessionsList } from "./HomeSessionsList";
import { HomeSettingsFooter } from "./HomeSettingsFooter";

interface Props {
  workspaces: WorkspaceInfo[];
  /** Side tabs already own workspace identity; hide the duplicate Projects column. */
  hideProjects?: boolean;
  activePath?: string;
  /** Project row selected while the list is filtered; falls back to activePath when unset. */
  selectedPath?: string;
  /** Hide the repeated project name when the list already belongs to one project. */
  hideProjectName?: boolean;
  rows: HomeSessionRow[];
  /** Rows whose session is already open in a tab, marked like the reference. */
  openKeys?: ReadonlySet<string>;
  /** First load: the list renders skeletons until the rows arrive. */
  loading?: boolean;
  onOpenSession: (path: string, sessionID: string) => void;
  /** Selects a project for the home filter without leaving home. */
  onSelectWorkspace: (path: string) => void;
  /** Opens a project's conversation from its menu. */
  onOpenWorkspace?: (path: string) => void;
  /** Opens the project settings section for a project's menu. */
  onEditWorkspace?: (path: string) => void;
  /** Opens the remove-project confirmation from a project's menu. */
  onRemoveWorkspace?: (path: string) => void;
  onNewSession: (path: string) => void;
  onRename?: (row: HomeSessionRow) => void;
  onExport?: (row: HomeSessionRow) => void;
  onDelete?: (row: HomeSessionRow) => void;
  /** Projects column actions, matching the reference home utility nav. */
  onAddWorkspace?: () => void;
  onOpenSettings?: () => void;
}

/** The reference caps home at the newest 64 root sessions. */
const HOME_SESSION_LIMIT = 64;

/**
 * Home dashboard: a 1080px centred grid inside the session panel, a 280px
 * projects column and a sessions list whose rows are 40px, like the reference
 * home surface.
 */
export function HomeDashboard(props: Props) {
  const [menu, setMenu] = createSignal<{ row: HomeSessionRow; x: number; y: number }>();
  const closeMenu = () => setMenu(undefined);

  const sortedRows = createMemo(() =>
    [...props.rows]
      .sort((left, right) => right.updated.localeCompare(left.updated))
      .slice(0, HOME_SESSION_LIMIT),
  );

  // The row only opens a menu when it has something to offer.
  const openRowMenu = createMemo(() => {
    if (!(props.onRename || props.onExport || props.onDelete)) return undefined;
    return (row: HomeSessionRow, x: number, y: number) => setMenu({ row, x, y });
  });

  return (
    <div data-slot="home-panel" class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div
          class={`mx-auto grid min-h-full w-full gap-4 px-3 lg:grid-rows-1 lg:gap-8 lg:px-6 ${
            props.hideProjects
              ? "max-w-[720px] grid-rows-[minmax(0,1fr)]"
              : "max-w-[1080px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,720px)]"
          }`}
        >
          <Show when={!props.hideProjects}>
            <HomeProjectsColumn
              workspaces={props.workspaces}
              selectedPath={props.selectedPath ?? props.activePath}
              onSelectWorkspace={props.onSelectWorkspace}
              onOpenWorkspace={props.onOpenWorkspace}
              onEditWorkspace={props.onEditWorkspace}
              onRemoveWorkspace={props.onRemoveWorkspace}
              onNewSession={props.onNewSession}
              onAddWorkspace={props.onAddWorkspace}
              onOpenSettings={props.onOpenSettings}
            />
          </Show>

          <HomeSessionsList
            rows={sortedRows()}
            openKeys={props.openKeys}
            hideProjectName={props.hideProjectName ?? false}
            loading={props.loading ?? false}
            activePath={props.activePath}
            workspaces={props.workspaces}
            onOpenSession={props.onOpenSession}
            onNewSession={props.onNewSession}
            onRowContextMenu={openRowMenu()}
          />
        </div>
      </div>

      {/* Below the wide layout the projects column is stacked and its utility
          nav collapses to the panel footer, like the reference home. */}
      <Show when={props.onOpenSettings}>
        <HomeSettingsFooter onOpenSettings={() => props.onOpenSettings?.()} />
      </Show>

      <Show when={menu()}>
        {(current) => (
          <HomeSessionMenu
            row={current().row}
            x={current().x}
            y={current().y}
            onRename={props.onRename}
            onExport={props.onExport}
            onDelete={props.onDelete}
            onClose={closeMenu}
          />
        )}
      </Show>
    </div>
  );
}
