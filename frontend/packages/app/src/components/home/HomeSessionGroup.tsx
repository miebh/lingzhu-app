import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";
import { HomeSessionRow } from "./HomeSessionRow";

/** Section labels are muted regular weight, not the row's medium weight. */
const SECTION_LABEL = "text-text-muted font-[440]";

export interface HomeSessionGroupData {
  id: string;
  title: string;
  rows: HomeSessionRowData[];
}

interface Props {
  group: HomeSessionGroupData;
  openKeys?: ReadonlySet<string>;
  hideProjectName: boolean;
  onOpenSession: (path: string, sessionID: string) => void;
  onRowContextMenu?: (row: HomeSessionRowData, x: number, y: number) => void;
}

/** A date bucket: a sticky section header followed by its session rows. */
export function HomeSessionGroup({ group, openKeys, hideProjectName, onOpenSession, onRowContextMenu }: Props) {
  return (
    <div className="flex min-w-0 flex-col pt-1 md:pt-3">
      <div
        data-component="home-session-group-header"
        className="pointer-events-none sticky top-[68px] z-10 flex h-7 min-w-0 items-center justify-between bg-bg-base ps-1.5 md:top-[84px] md:ps-3 lg:top-[108px]"
      >
        <div className={SECTION_LABEL}>{group.title}</div>
      </div>
      {group.rows.map((row) => (
        <HomeSessionRow
          key={row.key}
          row={row}
          open={openKeys?.has(row.key) ?? false}
          hideProjectName={hideProjectName}
          onOpen={() => onOpenSession(row.path, row.sessionID)}
          onRowContextMenu={onRowContextMenu}
        />
      ))}
    </div>
  );
}