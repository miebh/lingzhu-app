import { useCallback, useMemo, useState } from "react";
import type { HomeSessionRow, WorkspaceInfo } from "@lingzhu/ui/types";
import { HomeProjectsColumn } from "./home/HomeProjectsColumn";
import { HomeSessionMenu } from "./home/HomeSessionMenu";
import { HomeSessionsList } from "./home/HomeSessionsList";
import { HomeSettingsFooter } from "./home/HomeSettingsFooter";

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
export function HomeDashboard({
  workspaces,
  hideProjects = false,
  activePath,
  selectedPath,
  hideProjectName = false,
  rows,
  openKeys,
  loading = false,
  onOpenSession,
  onSelectWorkspace,
  onOpenWorkspace,
  onNewSession,
  onRename,
  onExport,
  onDelete,
  onAddWorkspace,
  onOpenSettings,
}: Props) {
  const [menu, setMenu] = useState<{ row: HomeSessionRow; x: number; y: number }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);

  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => right.updated.localeCompare(left.updated)).slice(0, HOME_SESSION_LIMIT),
    [rows],
  );

  // The row only opens a menu when it has something to offer.
  const openRowMenu =
    onRename || onExport || onDelete
      ? (row: HomeSessionRow, x: number, y: number) => setMenu({ row, x, y })
      : undefined;

  return (
    <div data-slot="home-panel" className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div
          className={`mx-auto grid min-h-full w-full gap-4 px-3 lg:grid-rows-1 lg:gap-8 lg:px-6 ${
            hideProjects
              ? "max-w-[720px] grid-rows-[minmax(0,1fr)]"
              : "max-w-[1080px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,720px)]"
          }`}
        >
          {!hideProjects && (
            <HomeProjectsColumn
              workspaces={workspaces}
              selectedPath={selectedPath ?? activePath}
              onSelectWorkspace={onSelectWorkspace}
              onOpenWorkspace={onOpenWorkspace}
              onNewSession={onNewSession}
              onAddWorkspace={onAddWorkspace}
              onOpenSettings={onOpenSettings}
            />
          )}

          <HomeSessionsList
            rows={sortedRows}
            openKeys={openKeys}
            hideProjectName={hideProjectName}
            loading={loading}
            activePath={activePath}
            workspaces={workspaces}
            onOpenSession={onOpenSession}
            onNewSession={onNewSession}
            onRowContextMenu={openRowMenu}
          />
        </div>
      </div>

      {/* Below the wide layout the projects column is stacked and its utility
          nav collapses to the panel footer, like the reference home. */}
      {onOpenSettings && <HomeSettingsFooter onOpenSettings={onOpenSettings} />}

      {menu && (
        <HomeSessionMenu
          row={menu.row}
          x={menu.x}
          y={menu.y}
          onRename={onRename}
          onExport={onExport}
          onDelete={onDelete}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}