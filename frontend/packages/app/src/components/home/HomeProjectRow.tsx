import { useState } from "react";
import { Ellipsis } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { t } from "@lingzhu/ui/i18n";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../ProjectAvatar";

interface Props {
  workspace: WorkspaceInfo;
  selected: boolean;
  onSelect: () => void;
  onNewSession: () => void;
  onOpen: () => void;
}

/** One project in the home projects column, with its hover actions menu. */
export function HomeProjectRow({ workspace, selected, onSelect, onNewSession, onOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      data-home-row
      data-component="home-project-row"
      data-selected={selected ? "true" : undefined}
      data-menu={menuOpen ? "true" : undefined}
      className="group/project relative flex h-7 min-w-0 items-center rounded-[6px]"
    >
      <button
        type="button"
        aria-current={selected ? "page" : undefined}
        onClick={onSelect}
        className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1.5 text-left text-body font-[440] text-text-muted group-hover/project:text-text-base group-data-[selected=true]/project:text-text-base focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--border-muted)]"
      >
        <ProjectAvatar name={workspace.name} icon={workspace.icon} color={workspace.color} />
        <span data-slot="home-row-label" className="min-w-0 flex-1 truncate">
          {workspace.name}
        </span>
      </button>
      <span
        data-slot="home-row-actions"
        className="pointer-events-none absolute inset-y-0 end-0 flex items-center rounded-e-[6px] pe-1 opacity-0 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 group-data-[menu=true]/project:pointer-events-auto group-data-[menu=true]/project:opacity-100"
      >
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("projectActions", { name: workspace.name })}
              className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-text-base"
            >
              <Ellipsis className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="w-40">
            <DropdownMenuItem onSelect={onNewSession}>{t("newSession")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpen}>{t("open")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}