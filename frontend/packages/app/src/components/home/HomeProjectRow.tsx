import { useState } from "react";
import { Ellipsis, ExternalLink, Pencil, Settings2 } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { t, type MessageKey } from "@lingzhu/ui/i18n";
import type { WorkspaceInfo } from "@lingzhu/ui/types";
import { api } from "../../lib/api";
import { notify } from "../../app/useApp";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

interface Props {
  workspace: WorkspaceInfo;
  selected: boolean;
  onSelect: () => void;
  onNewSession: () => void;
  onOpen: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}

function revealKey(): MessageKey {
  const platform = navigator.userAgent;
  if (/Mac/i.test(platform)) return "revealInFinder";
  if (/Win/i.test(platform)) return "revealInFileExplorer";
  return "openInFileManager";
}

/**
 * One project in the home projects column. Hovering reveals the same pair of
 * actions the reference home uses: a row menu plus a direct new-session entry.
 */
export function HomeProjectRow({ workspace, selected, onSelect, onNewSession, onOpen, onEdit, onRemove }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const reveal = async () => {
    try {
      await api.revealPath(workspace.path);
    } catch {
      notify(t("revealFailed"));
    }
  };

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
        className="pointer-events-none absolute inset-y-0 end-0 flex items-center gap-0.5 rounded-e-[6px] pe-1 opacity-0 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 group-data-[menu=true]/project:pointer-events-auto group-data-[menu=true]/project:opacity-100"
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
          <DropdownMenuContent align="end" sideOffset={4} className="w-48">
            <DropdownMenuItem onSelect={onNewSession}>{t("newSession")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpen}>{t("open")}</DropdownMenuItem>
            {onEdit && (
              <DropdownMenuItem onSelect={onEdit}>
                <Settings2 className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                {t("projectSettings")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void reveal()}>
              <ExternalLink className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
              {t(revealKey())}
            </DropdownMenuItem>
            {onRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onRemove}>
                  {t("removeProject")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-label={t("newSession")}
          title={t("newSession")}
          onClick={onNewSession}
          className="interactive grid size-5 shrink-0 place-items-center rounded-xs text-text-faint hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))] hover:text-text-base"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
