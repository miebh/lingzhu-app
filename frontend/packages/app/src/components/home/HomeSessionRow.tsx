import { useState } from "react";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { t } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../ProjectAvatar";

interface Props {
  row: HomeSessionRowData;
  /** The session is already open in a tab, marked beside its avatar. */
  open: boolean;
  hideProjectName: boolean;
  onOpen: () => void;
  onRowContextMenu?: (row: HomeSessionRowData, x: number, y: number) => void;
}

/** One recent session in the home list. */
export function HomeSessionRow({ row, open, hideProjectName, onOpen, onRowContextMenu }: Props) {
  const [hovered, setHovered] = useState(false);
  // Hover swaps the project name for the session's path, like the reference.
  const showingLocation = hovered;

  return (
    <div
      data-component="home-session-row-container"
      data-session-id={row.sessionID}
      data-project-name="true"
      className="group/session relative flex h-10 min-w-0 items-center rounded-[6px] outline-none focus:outline-none focus-visible:outline-none"
      onContextMenu={(event) => {
        if (!onRowContextMenu) return;
        event.preventDefault();
        onRowContextMenu(row, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        data-component="home-session-row"
        aria-haspopup="menu"
        onClick={onOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex h-10 min-w-0 w-full flex-1 shrink-0 items-center gap-1.5 rounded-[6px] border-0 bg-transparent py-3 ps-1.5 pe-3 text-start text-text-muted font-[530] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] focus-visible:outline-none md:ps-3"
      >
        <span className="relative flex shrink-0 items-center">
          {open && (
            <span
              aria-label={t("openInTab")}
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-[2px] bg-bg-layer-04"
              style={{ right: "calc(100% + 4px)" }}
            />
          )}
          <ProjectAvatar name={row.workspaceName} icon={row.icon} color={row.color} />
        </span>
        <span data-slot="home-session-labels" className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            data-component="home-session-title"
            dir="auto"
            className="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[530] tracking-[-0.04px] text-text-base"
          >
            {row.title}
          </span>
          {!hideProjectName && (
            <span
              data-component="home-session-project-name"
              dir="auto"
              aria-hidden={showingLocation || undefined}
              className={`min-w-0 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
                showingLocation ? "max-w-0 opacity-0" : "max-w-[60%] opacity-100"
              }`}
            >
              {row.workspaceName}
            </span>
          )}
          <span
            data-slot="home-session-location"
            dir="ltr"
            aria-hidden={!showingLocation || undefined}
            className={`flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-body leading-4 font-[440] tracking-[-0.04px] text-text-muted transition-[max-width,opacity] duration-[120ms] ease-out ${
              showingLocation ? "max-w-[60%] opacity-100" : "-ms-1.5 max-w-0 opacity-0"
            }`}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis">{row.path}</span>
          </span>
        </span>
        {row.running && <ActivityRing />}
      </button>
    </div>
  );
}