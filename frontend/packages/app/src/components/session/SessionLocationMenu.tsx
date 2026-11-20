import { useEffect, useState } from "react";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Monitor,
  Settings2,
  Worktree,
} from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { api } from "../../lib/api";
import { t, useLanguage, type MessageKey } from "@lingzhu/ui/i18n";
import { notify } from "../../app/useApp";
import type { VCSInfo } from "@lingzhu/ui/types";
import { ProjectAvatar } from "../workspace/ProjectAvatar";

interface Props {
  /** Project display name. */
  workspace?: string;
  /** Project avatar artwork and color keys. */
  workspaceIcon?: string;
  workspaceColor?: string;
  /** Directory the session runs in. */
  directory?: string;
  /** Worktree checkout path when the session runs outside the project root. */
  worktree?: string;
  /** Trigger label: project and worktree, joined with a slash. */
  label?: string;
  onOpenProject?: () => void;
  onOpenSettings?: () => void;
}

function revealKey(): MessageKey {
  const platform = navigator.userAgent;
  if (/Mac/i.test(platform)) return "revealInFinder";
  if (/Win/i.test(platform)) return "revealInFileExplorer";
  return "openInFileManager";
}

function baseName(path: string) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(index + 1) || path;
}

function splitPath(path: string) {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (index < 0) return ["", path];
  return [path.slice(0, index), path.slice(index)];
}

/** The location card behind the session header's project trigger. */
export function SessionLocationMenu({
  workspace,
  workspaceIcon,
  workspaceColor,
  directory,
  worktree,
  label,
  onOpenProject,
  onOpenSettings,
}: Props) {
  useLanguage();
  const [vcs, setVcs] = useState<VCSInfo | null>(null);

  useEffect(() => {
    setVcs(null);
  }, [directory]);

  const loadBranch = async () => {
    if (!directory) return;
    try {
      setVcs(await api.vcsInfo(directory));
    } catch {
      setVcs(null);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("copiedToClipboard"), "info");
    } catch {
      notify(t("copyFailed"));
    }
  };

  const reveal = async (path: string) => {
    try {
      await api.revealPath(path);
    } catch {
      notify(t("revealFailed"));
    }
  };

  const branch = vcs?.branch?.current;
  const baseBranch = vcs?.branch?.default;
  const [parentPath, leafPath] = directory ? splitPath(directory) : ["", ""];

  return (
    <DropdownMenu onOpenChange={(open) => open && void loadBranch()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label || t("project")}
              className="interactive flex h-7 min-w-0 max-w-full shrink items-center gap-2 overflow-hidden rounded-[6px] px-1.5 text-[13px] leading-4 tracking-[-0.04px] text-text-muted hover:text-text-base data-[state=open]:text-text-base"
            >
              <ProjectAvatar name={workspace} icon={workspaceIcon} color={workspaceColor} />
              {label && <span className="min-w-0 max-w-44 shrink-0 truncate">{label}</span>}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label || t("project")}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-[320px] max-w-[calc(100vw-16px)]"
        aria-label={workspace}
      >
        <DropdownMenuItem className="min-w-0" disabled={!workspace} onSelect={onOpenProject}>
          <ProjectAvatar name={workspace} icon={workspaceIcon} color={workspaceColor} />
          <bdi dir="auto" className="min-w-0 truncate font-[530]">
            {workspace}
          </bdi>
        </DropdownMenuItem>

        <div className="flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base">
          {worktree ? (
            <Worktree className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
          ) : (
            <Monitor className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{worktree ? baseName(worktree) : t("localWorkspace")}</span>
        </div>

        {vcs && branch && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <GitBranch className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
              <bdi dir="auto" className="min-w-0 truncate">
                {branch}
              </bdi>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-max min-w-[172px]">
              <DropdownMenuItem onSelect={() => void copy(branch)}>
                <Copy className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                {t("copyBranch")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {vcs && !branch && (
          <div className="flex h-7 min-w-0 items-center gap-2 rounded-xs px-3 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base">
            <GitBranch className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 whitespace-nowrap">{t("noBranch")}</span>
              {baseBranch && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="truncate text-text-faint">{t("basedOn", { branch: baseBranch })}</span>
                </>
              )}
            </span>
          </div>
        )}

        {directory && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-slot="session-location-path" aria-label={directory}>
                <FolderOpen className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                <bdi dir="ltr" className="flex min-w-0 select-text whitespace-nowrap">
                  <span className="min-w-0 truncate">{parentPath}</span>
                  <span className="max-w-full shrink-0 truncate">{leafPath}</span>
                </bdi>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-max max-w-[calc(100vw-32px)]">
                <DropdownMenuItem onSelect={() => void copy(directory)}>
                  <Copy className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                  {t("copyPath")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void reveal(directory)}>
                  <ExternalLink className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
                  {t(revealKey())}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!workspace} onSelect={onOpenSettings}>
          <Settings2 className="size-4 shrink-0 text-icon-base" aria-hidden="true" />
          {t("projectSettings")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
